const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

function parseDbName(databaseUrl) {
  const parsed = new URL(databaseUrl);
  return parsed.pathname.replace(/^\//, '');
}

function main() {
  loadEnvFile();

  if (process.env.ALLOW_DB_RESTORE !== 'yes') {
    throw new Error(
      'Restore blocked. Set ALLOW_DB_RESTORE=yes for explicit confirmation.',
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }

  const backupPathArg = process.argv[2];
  if (!backupPathArg) {
    throw new Error('Backup file path is required. Example: npm run db:restore -- backups/file.dump');
  }

  const backupPath = path.resolve(process.cwd(), backupPathArg);
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  const expectedDb = process.env.DB_NAME || process.env.EXPECTED_DB_NAME;
  const connectedDb = parseDbName(databaseUrl);
  if (expectedDb && expectedDb !== connectedDb) {
    throw new Error(
      `Connected DB "${connectedDb}" differs from expected "${expectedDb}".`,
    );
  }

  const run = spawnSync(
    'pg_restore',
    [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      `--dbname=${databaseUrl}`,
      backupPath,
    ],
    { stdio: 'inherit', shell: true },
  );

  if (run.status !== 0) {
    throw new Error(
      'pg_restore failed. Verify PostgreSQL tools are installed and backup file is valid.',
    );
  }

  console.log(`[db:restore] OK. file=${backupPath}; database=${connectedDb}`);
}

try {
  main();
} catch (error) {
  console.error(`[db:restore] FAILED: ${error.message}`);
  process.exit(1);
}

