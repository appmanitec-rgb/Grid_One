const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

const backendDir = path.resolve(__dirname, '..');
const prismaCli = path.join(backendDir, 'node_modules', 'prisma', 'build', 'index.js');
const migrationsDir = path.join(backendDir, 'prisma', 'migrations');

function runPrisma(args) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: backendDir,
    env: process.env,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `prisma ${args.slice(0, 2).join(' ')} failed: ${result.stderr || result.stdout || result.error?.message || 'unknown error'}`,
    );
  }
}

async function main() {
  if (
    process.env.NODE_ENV !== 'staging' ||
    process.env.BOOTSTRAP_FRESH_STAGING_DB !== 'yes'
  ) {
    throw new Error(
      'Bootstrap blocked. Set NODE_ENV=staging and BOOTSTRAP_FRESH_STAGING_DB=yes.',
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Bootstrap blocked. DATABASE_URL must be set explicitly.');
  }
  const parsed = new URL(databaseUrl);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (
    !['postgresql:', 'postgres:'].includes(parsed.protocol) ||
    !database ||
    !/(^|[_-])(stage|staging)([_-]|$)/i.test(database) ||
    database !== process.env.BOOTSTRAP_TARGET_DB_NAME ||
    (process.env.DB_NAME && process.env.DB_NAME !== database) ||
    (process.env.EXPECTED_DB_NAME && process.env.EXPECTED_DB_NAME !== database)
  ) {
    throw new Error(
      'Bootstrap blocked. Target must be an explicitly named, separate staging database.',
    );
  }

  const prisma = new PrismaClient();
  try {
    const tables = await prisma.$queryRawUnsafe(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';",
    );
    if (tables.length > 0) {
      throw new Error('Bootstrap blocked. Target database is not empty.');
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`[staging-bootstrap] Creating schema in empty database ${database}.`);
  runPrisma(['db', 'push', '--skip-generate']);

  const extensionClient = new PrismaClient();
  try {
    await extensionClient.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  } finally {
    await extensionClient.$disconnect();
  }

  const migrations = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const [index, migration] of migrations.entries()) {
    runPrisma(['migrate', 'resolve', '--applied', migration]);
    if ((index + 1) % 10 === 0 || index + 1 === migrations.length) {
      console.log(
        `[staging-bootstrap] Recorded ${index + 1}/${migrations.length} historical migrations.`,
      );
    }
  }
  runPrisma(['migrate', 'status']);
  console.log(
    `[staging-bootstrap] OK. database=${database}; migrations=${migrations.length}`,
  );
}

main().catch((error) => {
  console.error(`[staging-bootstrap] FAILED: ${error.message}`);
  process.exitCode = 1;
});
