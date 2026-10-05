const fs = require('fs');
const path = require('path');
const { createHash, randomBytes } = require('crypto');
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

function dockerContainerFor(databaseUrl) {
  if (process.env.DB_CONTAINER) return process.env.DB_CONTAINER;
  const parsed = new URL(databaseUrl);
  if (
    ['localhost', '127.0.0.1'].includes(parsed.hostname) &&
    parsed.port === '5433' &&
    parseDbName(databaseUrl) === 'gridone_db'
  ) {
    return 'gridone_db';
  }
  throw new Error(
    'DB_CONTAINER must be set explicitly when backing up a database outside the local gridone_db container.',
  );
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
  const container = dockerContainerFor(databaseUrl);
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

function verifyDockerBackup(databaseUrl, filePath) {
  const container = dockerContainerFor(databaseUrl);
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
  const startedAt = Date.now();
  loadEnvFile();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }

  const backupsDir = path.resolve(__dirname, '..', 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });

  const fileName = `${timestamp()}_${parseDbName(databaseUrl)}_${randomBytes(4).toString('hex')}.dump`;
  const filePath = path.join(backupsDir, fileName);

  let run = runLocalBackup(databaseUrl, filePath);
  let source = 'local';
  if (run.status !== 0 || !isValidCustomDump(filePath)) {
    console.log(
      '[db:backup] pg_dump local indisponivel; tentando o PostgreSQL do container Docker.',
    );
    try {
      run = runDockerBackup(databaseUrl, filePath);
    } catch (error) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      throw error;
    }
    source = 'docker';
  }

  if (run.status !== 0 || !isValidCustomDump(filePath)) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    throw new Error(
      'pg_dump failed locally and in Docker. Verify PostgreSQL tools/container.',
    );
  }

  if (source === 'docker') {
    const verification = verifyDockerBackup(databaseUrl, filePath);
    if (verification.status !== 0) {
      fs.unlinkSync(filePath);
      throw new Error('pg_restore could not read the generated Docker dump.');
    }
  }

  const hash = createHash('sha256');
  const input = fs.openSync(filePath, 'r');
  try {
    const chunk = Buffer.alloc(1024 * 1024);
    let bytesRead;
    while ((bytesRead = fs.readSync(input, chunk, 0, chunk.length, null)) > 0) {
      hash.update(chunk.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(input);
  }
  const manifest = {
    createdAt: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: parseDbName(databaseUrl),
    file: fileName,
    bytes: fs.statSync(filePath).size,
    sha256: hash.digest('hex'),
    source,
    durationMs: Date.now() - startedAt,
    migrations: fs.readdirSync(path.resolve(__dirname, '..', 'prisma', 'migrations'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).length,
  };
  fs.writeFileSync(
    `${filePath}.manifest.json`,
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: 'wx', mode: 0o600 },
  );

  console.log(
    `[db:backup] OK. file=${filePath}; bytes=${manifest.bytes}; sha256=${manifest.sha256}; source=${source}`,
  );
}

try {
  main();
} catch (error) {
  console.error(`[db:backup] FAILED: ${error.message}`);
  process.exit(1);
}
