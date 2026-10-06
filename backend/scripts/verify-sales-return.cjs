/* Isolated integration check. Requires a disposable database named gridone_stage_returns. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient, ItemType, ProposalType, ProposalStatus, SalesOrderStatus,
  AccountsReceivableStatus, InventoryMovementType } = require('@prisma/client');
require('ts-node/register');
const { SalesOrdersService } = require('../src/modules/sales-orders/sales-orders.service.ts');

const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (process.env.RETURN_TEST_CONFIRM !== 'yes' ||
    url.hostname !== '127.0.0.1' || url.port !== '5546' ||
    url.pathname !== '/gridone_stage_returns') {
  throw new Error('Use somente o banco descartavel gridone_stage_returns em 127.0.0.1:5546.');
}

const prisma = new PrismaClient();
const service = new SalesOrdersService(prisma);
const suffix = randomUUID().slice(0, 8);
const actor = { sub: undefined, role: 'ADMIN' };

async function main() {
  const user = await prisma.user.create({ data: {
    code: `RET-U-${suffix}`, name: 'Operador ficticio', email: `return-${suffix}@example.test`, passwordHash: 'test', role: 'ADMIN',
  } });
  const client = await prisma.client.create({ data: {
    code: `RET-C-${suffix}`, companyName: 'Cliente ficticio devolucao', phone: '0000000000', city: 'Indaiatuba', state: 'SP',
  } });
  const catalog = await prisma.catalogItem.create({ data: {
    sku: `RET-${suffix}`, name: 'Peca ficticia devolucao', type: ItemType.PART, basePrice: 100, stockCurrent: 8,
  } });
  const warehouse = await prisma.warehouse.create({ data: { code: `RET-W-${suffix}`, name: 'Almoxarifado ficticio' } });
  const proposal = await prisma.proposal.create({ data: {
    code: `RET-P-${suffix}`, type: ProposalType.PARTS, status: ProposalStatus.WON,
    totalValue: 200, clientId: client.id, userId: user.id,
  } });
  const proposalItem = await prisma.proposalItem.create({ data: {
    proposalId: proposal.id, catalogItemId: catalog.id, description: catalog.name,
    quantity: 2, unitPrice: 100, totalPrice: 200,
  } });
  const order = await prisma.salesOrder.create({ data: {
    code: `RET-O-${suffix}`, proposalId: proposal.id, clientId: client.id,
    status: SalesOrderStatus.DELIVERED, totalValue: 200,
  } });
  const item = await prisma.salesOrderItem.create({ data: {
    salesOrderId: order.id, proposalItemId: proposalItem.id, catalogItemId: catalog.id,
    description: catalog.name, quantity: 2, deliveredQty: 2, unitPrice: 100, totalPrice: 200,
  } });
  const delivery = await prisma.salesDelivery.create({ data: {
    code: `RET-D-${suffix}`, salesOrderId: order.id, receivedByName: 'Cliente ficticio',
  } });
  const line = await prisma.salesDeliveryItem.create({ data: {
    salesDeliveryId: delivery.id, salesOrderItemId: item.id, warehouseId: warehouse.id, quantity: 2,
  } });
  await prisma.inventoryBalance.create({ data: {
    warehouseId: warehouse.id, catalogItemId: catalog.id, physicalQty: 8,
  } });
  const title = await prisma.accountsReceivable.create({ data: {
    clientId: client.id, salesOrderId: order.id, description: 'Venda ficticia',
    competenceDate: new Date(), dueDate: new Date(Date.now() + 86400000),
    grossAmount: 200, netAmount: 200, status: AccountsReceivableStatus.OPEN,
  } });

  const first = { requestId: randomUUID(), salesDeliveryItemId: line.id, quantity: 1, reason: 'Devolucao ficticia', restockApproved: true };
  await assert.rejects(service.receiveReturn(order.id, { ...first, restockApproved: false }, actor), /confirme/i);
  const result = await service.receiveReturn(order.id, first, actor);
  assert.equal(result.quantity, 1);
  const repeat = await service.receiveReturn(order.id, first, actor);
  assert.equal(repeat.id, result.id);
  assert.equal(repeat.repeated, true);
  let [lineAfter, itemAfter, balanceAfter, titleAfter] = await Promise.all([
    prisma.salesDeliveryItem.findUniqueOrThrow({ where: { id: line.id } }),
    prisma.salesOrderItem.findUniqueOrThrow({ where: { id: item.id } }),
    prisma.inventoryBalance.findUniqueOrThrow({ where: { warehouseId_catalogItemId: { warehouseId: warehouse.id, catalogItemId: catalog.id } } }),
    prisma.accountsReceivable.findUniqueOrThrow({ where: { id: title.id } }),
  ]);
  assert.equal(lineAfter.returnedQty, 1);
  assert.equal(itemAfter.deliveredQty, 1);
  assert.equal(balanceAfter.physicalQty, 9);
  assert.equal(titleAfter.netAmount, 100);

  await prisma.accountsReceivable.update({ where: { id: title.id }, data: { paidAmount: 1 } });
  await assert.rejects(service.receiveReturn(order.id,
    { ...first, requestId: randomUUID() }, actor), /pagamento, boleto, nota/i);
  assert.equal((await prisma.salesDeliveryItem.findUniqueOrThrow({ where: { id: line.id } })).returnedQty, 1);
  await prisma.accountsReceivable.update({ where: { id: title.id }, data: { paidAmount: 0 } });

  const second = await service.receiveReturn(order.id,
    { ...first, requestId: randomUUID() }, actor);
  assert.notEqual(second.id, result.id);
  [lineAfter, itemAfter, balanceAfter, titleAfter] = await Promise.all([
    prisma.salesDeliveryItem.findUniqueOrThrow({ where: { id: line.id } }),
    prisma.salesOrderItem.findUniqueOrThrow({ where: { id: item.id } }),
    prisma.inventoryBalance.findUniqueOrThrow({ where: { warehouseId_catalogItemId: { warehouseId: warehouse.id, catalogItemId: catalog.id } } }),
    prisma.accountsReceivable.findUniqueOrThrow({ where: { id: title.id } }),
  ]);
  assert.equal(lineAfter.returnedQty, 2);
  assert.equal(itemAfter.deliveredQty, 0);
  assert.equal(balanceAfter.physicalQty, 10);
  assert.equal(titleAfter.netAmount, 0);
  assert.equal(titleAfter.status, AccountsReceivableStatus.CANCELED);
  assert.equal(await prisma.inventoryMovement.count({ where: {
    referenceType: 'SALES_RETURN', catalogItemId: catalog.id, movementType: InventoryMovementType.SALES_RETURN,
  } }), 2);
  assert.equal(await prisma.salesReturn.count({ where: { salesOrderId: order.id } }), 2);
  console.log(JSON.stringify({ result: 'PASS', cases: ['restock-confirmation', 'partial', 'idempotent-repeat', 'paid-title-block', 'full', 'stock', 'receivable'] }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
