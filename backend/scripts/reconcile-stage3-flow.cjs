/* Read-only reconciliation of the twelve fictional stage-3 audit cases. */
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const url = new URL(process.env.DATABASE_URL || 'postgres://localhost/invalid');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '5545');
assert.equal(url.pathname, '/gridone_stage3_stage');
assert.equal(process.env.STAGE3_CONFIRM_FICTIONAL_SEED, 'yes');

const prisma = new PrismaClient();
const source = path.resolve(__dirname, '../../docs/etapa-03-auditoria-resultados.json');
const destination = path.resolve(__dirname, '../../docs/etapa-03-reconciliacao-resultados.json');
const cents = (value) => Math.round(Number(value) * 100);

async function main() {
  const audit = JSON.parse(readFileSync(source, 'utf8'));
  assert.equal(audit.results.length, 12);
  assert.equal(audit.failures.length, 0);
  const rows = [];
  let proposalCents = 0;
  let billedCents = 0;
  for (const result of audit.results) {
    const proposal = await prisma.proposal.findUnique({
      where: { id: result.proposalId },
      include: {
        salesOpportunity: { include: { crmActivities: true } },
        movements: true,
        salesOrder: { include: { items: true, deliveries: true } },
        executionOrder: true,
        generatedContract: true,
      },
    });
    assert.ok(proposal, result.case);
    assert.equal(proposal.status, 'WON', result.case);
    assert.equal(proposal.clientId, result.clientId, result.case);
    assert.equal(proposal.salesOpportunity.stage, 'WON', result.case);
    assert.ok(proposal.salesOpportunity.crmActivities.length > 0, result.case);
    assert.ok(proposal.movements.length >= 4, result.case);
    assert.equal(cents(proposal.totalValue), cents(result.total), result.case);
    let receivables;
    if (result.type === 'PARTS') {
      assert.equal(proposal.salesOrder?.status, 'DELIVERED', result.case);
      assert.equal(proposal.salesOrder.id, result.salesOrderId, result.case);
      assert.ok(proposal.salesOrder.deliveries.length > 0, result.case);
      assert.ok(proposal.salesOrder.items.every((item) => item.deliveredQty === item.quantity), result.case);
      receivables = await prisma.accountsReceivable.findMany({ where: { salesOrderId: result.salesOrderId } });
    } else if (result.type === 'CONTRACT') {
      assert.equal(proposal.generatedContract?.id, result.contractId, result.case);
      receivables = await prisma.accountsReceivable.findMany({ where: { contractId: result.contractId } });
    } else {
      assert.equal(proposal.executionOrder?.status, 'COMPLETED', result.case);
      assert.equal(proposal.executionOrder?.id, result.orderId, result.case);
      receivables = await prisma.accountsReceivable.findMany({ where: { maintenanceOrderId: result.orderId } });
      assert.ok(receivables.every((row) => row.executionBillingKey), result.case);
    }
    assert.equal(receivables.length, result.receivableIds.length, result.case);
    assert.ok(receivables.every((row) => row.clientId === result.clientId && row.netAmount > 0), result.case);
    assert.deepEqual(
      receivables.map((row) => row.id).sort(),
      [...result.receivableIds].sort(),
      result.case,
    );
    const rowBilledCents = receivables.reduce((sum, row) => sum + cents(row.netAmount), 0);
    if (result.type !== 'CONTRACT') {
      assert.equal(rowBilledCents, cents(proposal.totalValue), result.case);
      billedCents += rowBilledCents;
    }
    proposalCents += cents(proposal.totalValue);
    rows.push({
      case: result.case,
      type: result.type,
      proposalAmount: proposal.totalValue,
      receivableCount: receivables.length,
      receivableAmount: rowBilledCents / 100,
      status: 'PASS',
    });
  }
  const report = {
    databaseName: 'gridone_stage3_stage',
    cases: rows,
    proposalAmountTotal: proposalCents / 100,
    nonContractReceivableAmountTotal: billedCents / 100,
    result: 'PASS',
  };
  writeFileSync(destination, JSON.stringify(report, null, 2));
  console.log(`[stage3-reconcile] PASS ${rows.length} casos; propostas R$ ${report.proposalAmountTotal}; titulos avulsos R$ ${report.nonContractReceivableAmountTotal}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
