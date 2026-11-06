/* Integration check. Writes only to the isolated flow QA database. */
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { MaintenanceOrdersService } = require('../dist/src/modules/maintenance-orders/maintenance-orders.service');
const { FinanceService } = require('../dist/src/modules/finance/finance.service');
const { AuditLogsService } = require('../dist/src/modules/audit-logs/audit-logs.service');

const url = new URL(process.env.DATABASE_URL || 'postgres://localhost/invalid');
if (!/^gridone_flow_qa_/.test(url.pathname.slice(1)) || !['localhost', '127.0.0.1'].includes(url.hostname)) {
  throw new Error('Teste permitido somente no banco QA local gridone_flow_qa_.');
}

const db = new PrismaClient();
const audit = new AuditLogsService(db);
const orders = new MaintenanceOrdersService(db, {}, audit);
const finance = new FinanceService(db, audit);
const dueDate = new Date(Date.now() + 15 * 86400000);

async function fixture(input, clientId, generatorId, userId) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const proposal = await db.proposal.create({ data: {
    code: `QA-BILL-${suffix}`,
    status: 'WON', type: input.type, totalValue: input.total,
    clientId, generatorId, userId,
    hasDownPayment: Boolean(input.downPayment), downPaymentAmount: input.downPayment || null,
    firstDueDate: input.firstDueDate || null,
    installmentCount: input.installments || 1,
    installmentIntervalDays: 30,
    items: { create: input.lines.map((line) => ({
      kind: line.kind, description: line.kind === 'PART_MATERIAL' ? 'Peca QA' : 'Servico QA',
      quantity: 1, unitPrice: line.amount, totalPrice: line.amount,
    })) },
  } });
  const order = await db.maintenanceOrder.create({ data: {
    title: `OS QA ${suffix}`, generatorId, sourceProposalId: proposal.id, status: 'OPEN',
  } });
  return { proposal, order };
}

async function main() {
  const generator = await db.generator.findFirst({ select: { id: true, clientId: true } });
  const user = await db.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  assert(generator && user, 'Banco QA precisa de gerador e usuario administrador.');

  const automatic = await fixture({
    type: 'PARTS_AND_SERVICES', total: 1000, firstDueDate: dueDate, installments: 2,
    lines: [{ kind: 'PART_MATERIAL', amount: 400 }, { kind: 'CATALOG_SERVICE', amount: 600 }],
  }, generator.clientId, generator.id, user.id);
  await orders.update(automatic.order.id, { status: 'COMPLETED' }, user.id);
  const automaticTitles = await db.accountsReceivable.findMany({ where: { maintenanceOrderId: automatic.order.id }, orderBy: [{ executionBillingCategory: 'asc' }, { installmentNumber: 'asc' }] });
  assert.equal(automaticTitles.length, 4, 'Conclusao deve gerar pecas e servicos em duas parcelas.');
  assert.equal(automaticTitles.reduce((sum, row) => sum + Math.round(row.netAmount * 100), 0), 100000);
  assert.deepEqual(automaticTitles.filter((row) => row.executionBillingCategory === 'PARTS').map((row) => row.netAmount), [200, 200]);
  assert.deepEqual(automaticTitles.filter((row) => row.executionBillingCategory === 'SERVICES').map((row) => row.netAmount), [300, 300]);
  const repeated = await finance.createReceivablesFromExecutionProposal(automatic.order.id, dueDate.toISOString(), user.id);
  assert.equal(repeated.status, 'ALREADY_BILLED');
  assert.equal(await db.accountsReceivable.count({ where: { maintenanceOrderId: automatic.order.id } }), 4);

  const reviewed = await fixture({
    type: 'SERVICES', total: 725, lines: [{ kind: 'HOURLY_SERVICE', amount: 725 }],
  }, generator.clientId, generator.id, user.id);
  await orders.update(reviewed.order.id, { status: 'COMPLETED' }, user.id);
  assert.equal(await db.accountsReceivable.count({ where: { maintenanceOrderId: reviewed.order.id } }), 0);
  const queue = await finance.listExecutionBillingQueue();
  const pending = queue.find((row) => row.id === reviewed.order.id);
  assert(pending && pending.billingMode === 'PROPOSAL');
  assert.match(pending.reviewReason, /vencimento/i);
  const confirmed = await finance.createReceivablesFromExecutionProposal(reviewed.order.id, dueDate.toISOString(), user.id);
  assert.equal(confirmed.status, 'CREATED');
  const reviewedTitles = await db.accountsReceivable.findMany({ where: { maintenanceOrderId: reviewed.order.id } });
  assert.equal(reviewedTitles.length, 1);
  assert.equal(reviewedTitles[0].netAmount, 725);
  assert.equal(reviewedTitles[0].executionBillingCategory, 'SERVICES');
  assert(!((await finance.listExecutionBillingQueue()).some((row) => row.id === reviewed.order.id)));

  const withEntry = await fixture({
    type: 'SERVICES', total: 900, firstDueDate: dueDate, downPayment: 200,
    lines: [{ kind: 'CATALOG_SERVICE', amount: 900 }],
  }, generator.clientId, generator.id, user.id);
  await orders.update(withEntry.order.id, { status: 'COMPLETED' }, user.id);
  assert.equal(await db.accountsReceivable.count({ where: { maintenanceOrderId: withEntry.order.id } }), 0,
    'Entrada anterior nao pode gerar cobranca automatica em duplicidade.');
  const entryQueue = (await finance.listExecutionBillingQueue()).find((row) => row.id === withEntry.order.id);
  assert(entryQueue && entryQueue.billingMode === 'MANUAL');
  assert.match(entryQueue.reviewReason, /Entrada/i);
  console.log(JSON.stringify({ result: 'PASS', automaticTitles: automaticTitles.length, reviewedTitles: reviewedTitles.length, downPaymentHeldForReview: true }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
