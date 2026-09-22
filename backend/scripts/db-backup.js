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
    const value = trimmed
      .slice(eqIndex + 1)
      .trim()
      .replace(/^"|"$/g, '');
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

function isValidCustomDump(filePath) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0)
    return false;
  const descriptor = fs.openSync(filePath, 'r');
  const header = Buffer.alloc(5);
  try {
    fs.readSync(descriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return header.toString('ascii') === 'PGDMP';
}

function runLocalBackup(databaseUrl, filePath) {
  return spawnSync(
    'pg_dump',
    ['--format=custom', `--file=${filePath}`, `--dbname=${databaseUrl}`],
    { stdio: 'inherit', shell: false },
  );
}

function runDockerBackup(databaseUrl, filePath) {
  const parsed = new URL(databaseUrl);
  const container = process.env.DB_CONTAINER || 'gridone_db';
  const database = parseDbName(databaseUrl);
  const username = decodeURIComponent(
    parsed.username || process.env.DB_USER || 'postgres',
  );
  const output = fs.openSync(filePath, 'w');
  try {
    return spawnSync(
      'docker',
      [
        'exec',
        container,
        'pg_dump',
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        `--username=${username}`,
        `--dbname=${database}`,
      ],
      { stdio: ['ignore', output, 'inherit'], shell: false },
    );
  } finally {
    fs.closeSync(output);
  }
}

function verifyDockerBackup(filePath) {
  const container = process.env.DB_CONTAINER || 'gridone_db';
  const input = fs.openSync(filePath, 'r');
  try {
    return spawnSync(
      'docker',
      ['exec', '-i', container, 'pg_restore', '--list'],
      {
        stdio: [input, 'ignore', 'inherit'],
        shell: false,
      },
    );
  } finally {
    fs.closeSync(input);
  }
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

  let run = runLocalBackup(databaseUrl, filePath);
  let source = 'local';
  if (run.status !== 0 || !isValidCustomDump(filePath)) {
    console.log(
      '[db:backup] pg_dump local indisponivel; tentando o PostgreSQL do container Docker.',
    );
    run = runDockerBackup(databaseUrl, filePath);
    source = 'docker';
  }

  if (run.status !== 0 || !isValidCustomDump(filePath)) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    throw new Error(
      'pg_dump failed locally and in Docker. Verify PostgreSQL tools/container.',
    );
  }

  if (source === 'docker') {
    const verification = verifyDockerBackup(filePath);
    if (verification.status !== 0) {
      fs.unlinkSync(filePath);
      throw new Error('pg_restore could not read the generated Docker dump.');
    }
  }

  console.log(
    `[db:backup] OK. file=${filePath}; bytes=${fs.statSync(filePath).size}; source=${source}`,
  );
}

try {
  main();
} catch (error) {
  console.error(`[db:backup] FAILED: ${error.message}`);
  process.exit(1);
}
