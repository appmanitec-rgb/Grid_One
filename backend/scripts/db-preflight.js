const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

function loadEnvFile() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^"|"$/g, '');
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function readLocalMigrationNames() {
  const migrationsDir = path.resolve(__dirname, '..', 'prisma', 'migrations');
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function parseDbName(databaseUrl) {
  const parsed = new URL(databaseUrl);
  return parsed.pathname.replace(/^\//, '');
}

async function assertRequiredColumns(prisma, tableName, requiredColumns) {
  const existingColumns = await prisma.$queryRawUnsafe(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = '${tableName}'
      AND column_name IN (${requiredColumns.map((column) => `'${column}'`).join(', ')});
  `);

  const existingNames = new Set(existingColumns.map((column) => column.column_name));
  const missingColumns = requiredColumns.filter(
    (column) => !existingNames.has(column),
  );

  if (missingColumns.length > 0) {
    throw new Error(
      `Schema drift detected on table "${tableName}". Missing columns: ${missingColumns.join(', ')}. Run "npm run db:migrate" to repair the local database schema.`,
    );
  }
}

async function main() {
  loadEnvFile();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }

  const expectedDb = process.env.DB_NAME || process.env.EXPECTED_DB_NAME;
  const connectedDb = parseDbName(databaseUrl);
  if (expectedDb && connectedDb !== expectedDb) {
    throw new Error(
      `Connected DB "${connectedDb}" differs from expected "${expectedDb}".`,
    );
  }

  const prisma = new PrismaClient();
  try {
    const migrationsTable = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = '_prisma_migrations'
      ) AS present;
    `);

    if (!migrationsTable?.[0]?.present) {
      throw new Error('Table "_prisma_migrations" was not found.');
    }

    const dbMigrations = await prisma.$queryRawUnsafe(`
      SELECT migration_name
      FROM "_prisma_migrations"
      ORDER BY migration_name ASC;
    `);

    const applied = new Set(dbMigrations.map((m) => m.migration_name));
    const local = readLocalMigrationNames();
    const missingInDb = local.filter((name) => !applied.has(name));

    if (missingInDb.length > 0) {
      throw new Error(
        `Pending migrations found: ${missingInDb.join(', ')}. Apply migrations before running the app.`,
      );
    }

    await assertRequiredColumns(prisma, 'service_contracts', [
      'includesFuelManagement',
      'costCenterId',
    ]);

    console.log(
      `[db:preflight] OK. database=${connectedDb}; migrations=${local.length}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`[db:preflight] FAILED: ${error.message}`);
  process.exit(1);
});
