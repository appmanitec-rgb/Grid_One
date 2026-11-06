/* Integration check. Refuses every database except the isolated flow QA copy. */
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { SalesOrdersService } = require('../dist/src/modules/sales-orders/sales-orders.service');
const { FinanceService } = require('../dist/src/modules/finance/finance.service');
const { AuditLogsService } = require('../dist/src/modules/audit-logs/audit-logs.service');
const { createApprovedProposalOrder } = require('../dist/src/modules/proposals/proposal-work-order');

const databaseName = new URL(process.env.DATABASE_URL || 'postgres://invalid/invalid').pathname.slice(1);
if (!/^gridone_flow_qa_/.test(databaseName)) {
  throw new Error('Este teste so pode usar a copia gridone_flow_qa_.');
}

const db = new PrismaClient();
const service = new SalesOrdersService(db);
const finance = new FinanceService(db, new AuditLogsService(db));
const actor = { role: 'ADMIN', sub: 'qa-sales-orders' };
const closePartial = process.env.QA_CLOSE_PARTIAL === '1';

async function main() {
  const candidates = await db.proposal.findMany({
    where: { type: 'PARTS', status: 'WON', salesOrder: { is: null } },
    include: { items: { where: { kind: 'PART_MATERIAL' } } },
    orderBy: { createdAt: 'asc' },
  });
  const proposal = candidates.find((row) => row.items.length > 0 && row.items.every((item) => item.catalogItemId && item.quantity > 0)
    && (!closePartial || row.items.reduce((sum, item) => sum + item.quantity, 0) > 1));
  assert(proposal, 'Falta proposta ganha de pecas com itens vinculados no banco QA.');

  await db.$transaction((tx) => createApprovedProposalOrder(tx, proposal));
  await db.$transaction((tx) => createApprovedProposalOrder(tx, proposal));
  const orders = await db.salesOrder.findMany({ where: { proposalId: proposal.id }, include: { items: true } });
  assert.equal(orders.length, 1, 'Aceites repetidos nao podem duplicar pedido.');
  const order = orders[0];
  assert.equal(order.items.length, proposal.items.length);
  const warehouseView = await service.get(order.id, { role: 'LOGISTICS', accessPolicy: { inventory: { view: true } } });
  assert.equal(warehouseView.totalValue, null, 'Estoque nao deve ver valores comerciais.');
  assert(warehouseView.items.every((item) => item.unitPrice === null && item.totalPrice === null));
  await assert.rejects(service.get(order.id, { role: 'LOGISTICS', accessPolicy: {} }), /nao possui permissao/);
  const dueDate = new Date(Date.now() + 30 * 86400000).toISOString();
  await assert.rejects(finance.createReceivableFromSalesOrder(order.id, dueDate), /Conclua a entrega/);

  const warehouse = await db.warehouse.upsert({
    where: { code: 'QA-PEDIDOS-20261002' },
    update: { isActive: true },
    create: { code: 'QA-PEDIDOS-20261002', name: 'QA ISOLADO - PEDIDOS', isActive: true },
  });
  for (const item of order.items) {
    await db.inventoryBalance.upsert({
      where: { warehouseId_catalogItemId: { warehouseId: warehouse.id, catalogItemId: item.catalogItemId } },
      update: { physicalQty: 100, reservedQty: 0 },
      create: { warehouseId: warehouse.id, catalogItemId: item.catalogItemId, physicalQty: 100, reservedQty: 0 },
    });
  }

  const first = order.items[0];
  const firstStock = { itemId: first.id, warehouseId: warehouse.id, quantity: 1 };
  await service.reserve(order.id, firstStock, actor);
  await service.pick(order.id, firstStock, actor);
  const firstDelivery = await service.deliver(order.id, {
    receivedByName: 'Recebedor QA', items: [firstStock],
  }, actor);
  const afterFirst = await db.salesOrder.findUnique({ where: { id: order.id } });
  assert.equal(afterFirst.status, first.quantity === 1 && order.items.length === 1 ? 'DELIVERED' : 'PARTIALLY_DELIVERED');
  assert(firstDelivery.deliveryId);

  if (closePartial) {
    assert.equal(afterFirst.status, 'PARTIALLY_DELIVERED');
    await service.close(order.id, 'QA: saldo cancelado apos entrega parcial', actor);
  } else if (afterFirst.status !== 'DELIVERED') {
    await assert.rejects(
      service.deliver(order.id, { receivedByName: 'Recebedor QA', items: [firstStock] }, actor),
      /Entrega excede a quantidade separada ou vendida/,
    );
    for (const item of order.items) {
      const quantity = item.quantity - (item.id === first.id ? 1 : 0);
      if (!quantity) continue;
      const stock = { itemId: item.id, warehouseId: warehouse.id, quantity };
      await service.reserve(order.id, stock, actor);
      await service.pick(order.id, stock, actor);
    }
    const ready = await db.salesOrderItem.findMany({ where: { salesOrderId: order.id }, include: { allocations: true } });
    const remaining = ready.flatMap((item) => item.allocations.filter((allocation) => allocation.pickedQty > 0).map((allocation) => ({
      itemId: item.id, warehouseId: allocation.warehouseId, quantity: allocation.pickedQty,
    })));
    await service.deliver(order.id, { receivedByName: 'Recebedor QA', items: remaining }, actor);
  }

  const finished = await db.salesOrder.findUnique({ where: { id: order.id }, include: { items: true, deliveries: true } });
  assert.equal(finished.status, closePartial ? 'CLOSED' : 'DELIVERED');
  assert(finished.items.every((item) => closePartial ? item.deliveredQty <= item.quantity : item.deliveredQty === item.quantity));
  assert(finished.deliveries.length >= 1);
  const allocations = await db.salesOrderAllocation.findMany({ where: { salesOrderItem: { salesOrderId: order.id } } });
  assert(allocations.every((allocation) => allocation.reservedQty === 0 && allocation.pickedQty === 0), 'Pedido concluido nao pode manter reserva.');
  const movementCount = await db.inventoryMovement.count({ where: { referenceType: 'SALES_DELIVERY', referenceId: { in: finished.deliveries.map((row) => row.id) } } });
  assert(movementCount >= finished.items.length);
  const receivable = await finance.createReceivableFromSalesOrder(order.id, dueDate);
  const sameReceivable = await finance.createReceivableFromSalesOrder(order.id, dueDate);
  assert.equal(sameReceivable.id, receivable.id, 'Faturamento repetido nao pode duplicar titulo.');
  const orderedBase = finished.items.reduce((sum, item) => sum + Number(item.totalPrice), 0);
  const deliveredBase = finished.items.reduce((sum, item) => sum + Number(item.totalPrice) * item.deliveredQty / item.quantity, 0);
  const expectedAmount = Math.round(Number(order.totalValue) * deliveredBase / orderedBase * 100) / 100;
  assert.equal(Number(receivable.netAmount), expectedAmount);
  assert.equal(receivable.salesOrderId, order.id);
  assert.equal(await db.accountsReceivable.count({ where: { salesOrderId: order.id } }), 1);
  console.log(JSON.stringify({ result: 'PASS', scenario: closePartial ? 'partial-close' : 'full-delivery', proposal: proposal.code, order: order.code, deliveries: finished.deliveries.length, movementCount, receivable: receivable.id }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
