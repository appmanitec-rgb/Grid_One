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

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

function parseDbName(databaseUrl) {
  const parsed = new URL(databaseUrl);
  return parsed.pathname.replace(/^\//, '') || 'database';
}

function main() {
  loadEnvFile();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }

  const backupsDir = path.resolve(__dirname, '..', 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });

  const fileName = `${timestamp()}_${parseDbName(databaseUrl)}.dump`;
  const filePath = path.join(backupsDir, fileName);

  const run = spawnSync(
    'pg_dump',
    ['--format=custom', `--file=${filePath}`, `--dbname=${databaseUrl}`],
    { stdio: 'inherit', shell: true },
  );

  if (run.status !== 0) {
    throw new Error('pg_dump failed. Verify PostgreSQL tools are installed.');
  }

  console.log(`[db:backup] OK. file=${filePath}`);
}

try {
  main();
} catch (error) {
  console.error(`[db:backup] FAILED: ${error.message}`);
  process.exit(1);
}
