import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

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

function assertDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set.');
  }
  return url;
}

function validateExpectedDatabase(url: string) {
  const expectedName = process.env.DB_NAME || process.env.EXPECTED_DB_NAME;
  if (!expectedName) return;

  const parsed = new URL(url);
  const currentDb = parsed.pathname.replace(/^\//, '');
  if (currentDb !== expectedName) {
    throw new Error(
      `Connected DB "${currentDb}" differs from expected "${expectedName}".`,
    );
  }
}

async function assertRequiredColumns(
  prisma: PrismaClient,
  tableName: string,
  requiredColumns: string[],
) {
  const existingColumns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = '${tableName}'
      AND column_name IN (${requiredColumns.map((column) => `'${column}'`).join(', ')});
    `,
  );

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

export async function runDatabaseSafetyChecks() {
  loadEnvFile();
  const databaseUrl = assertDatabaseUrl();
  validateExpectedDatabase(databaseUrl);

  const prisma = new PrismaClient();

  try {
    const migrationsTable = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = '_prisma_migrations'
      ) AS exists;
      `,
    );

    if (!migrationsTable?.[0]?.exists) {
      throw new Error('Table "_prisma_migrations" not found.');
    }

    await assertRequiredColumns(prisma, 'service_contracts', [
      'includesFuelManagement',
      'costCenterId',
    ]);
  } finally {
    await prisma.$disconnect();
  }
}
