const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
require('dotenv').config({
  path: path.resolve(__dirname, '../.env'),
  quiet: true,
});
const uri = new URL(process.env.DATABASE_URL);
if (!['/gridone_db', '/gridone_e2e'].includes(uri.pathname))
  throw new Error('Banco de origem inesperado.');
uri.pathname = '/gridone_e2e';
process.env.DATABASE_URL = uri.toString();
const { PrismaClient } = require('../runtime-prp/client');
const db = new PrismaClient();
async function snapshot() {
  const rows = await db.purchaseOrder.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      code: true,
      supplierId: true,
      status: true,
      totalAmount: true,
      paymentTerm: true,
      items: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          catalogItemId: true,
          quantity: true,
          receivedQty: true,
          unitPrice: true,
        },
      },
      receipts: {
        orderBy: { id: 'asc' },
        select: { id: true, warehouseId: true, receivedAt: true, notes: true },
      },
    },
  });
  const balances = await db.inventoryBalance.findMany({
    orderBy: { id: 'asc' },
  });
  const ledger = await db.inventoryMovement.findMany({
    orderBy: { id: 'asc' },
  });
  const payables = await db.accountsPayable.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      purchaseOrderId: true,
      amount: true,
      status: true,
      paidAmount: true,
      dueDate: true,
    },
  });
  const body = JSON.stringify({ rows, balances, ledger, payables });
  return {
    orders: rows.length,
    balances: balances.length,
    movements: ledger.length,
    payables: payables.length,
    hash: crypto.createHash('sha256').update(body).digest('hex'),
  };
}
(async () => {
  const actual = await db.$queryRawUnsafe('SELECT current_database() AS name');
  if (actual[0].name !== 'gridone_e2e')
    throw new Error('Migração permitida apenas em gridone_e2e.');
  const present = await db.$queryRawUnsafe(
    "SELECT to_regclass('public.procurement_settings')::text AS name",
  );
  if (present[0].name) {
    const before = await snapshot();
    for (const statement of [
      'ALTER TABLE "procurement_allocations" ADD COLUMN IF NOT EXISTS "fulfilledQty" DECIMAL(20,6) NOT NULL DEFAULT 0',
      'ALTER TABLE "procurement_allocations" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE "procurement_quote_sources" ADD COLUMN IF NOT EXISTS "fulfilledQty" DECIMAL(20,6) NOT NULL DEFAULT 0',
      'ALTER TABLE "procurement_receipt_items" ADD COLUMN IF NOT EXISTS "allocations" JSONB NOT NULL DEFAULT \'[]\'',
    ])
      await db.$executeRawUnsafe(statement);
    const after = await snapshot();
    if (before.hash !== after.hash)
      throw new Error('Registros operacionais de teste foram alterados.');
    console.log(
      'Colunas aditivas conferidas em gridone_e2e; registros existentes preservados.',
    );
    return;
  }

  const before = await snapshot();
  const result = cp.spawnSync(
    process.execPath,
    [
      path.resolve(__dirname, '../node_modules/prisma/build/index.js'),
      'db',
      'execute',
      '--file',
      path.resolve(
        __dirname,
        '../prisma/migrations/20261020170000_procurement_workflow_v2/migration.sql',
      ),
      '--schema',
      path.resolve(__dirname, '../prisma/schema.prisma'),
    ],
    { env: process.env, encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const after = await snapshot();
  const preserved = before.hash === after.hash;
  fs.writeFileSync(
    path.resolve(
      __dirname,
      '../../runtime-logs/procurement-migration-integrity.json',
    ),
    JSON.stringify(
      { database: 'gridone_e2e', before, after, preserved },
      null,
      2,
    ),
  );
  if (!preserved)
    throw new Error('Falha na conferência dos registros legados.');
  console.log(
    'Migração aditiva validada em gridone_e2e. Registros legados preservados.',
  );
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
