const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
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

function verifyEmptyTarget(databaseUrl, connectedDb) {
  const query =
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';";
  const container = process.env.RESTORE_DOCKER_CONTAINER;
  if (container) {
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container) ||
      !/(stage|staging|restore|scratch|disposable)/i.test(container)
    ) {
      throw new Error('Restore blocked. Docker container must be a named staging/restore container.');
    }
    const username = decodeURIComponent(new URL(databaseUrl).username);
    if (!username) {
      throw new Error('Restore blocked. Database user is missing.');
    }
    const result = spawnSync(
      'docker',
      [
        'exec',
        container,
        'psql',
        '--no-psqlrc',
        '--tuples-only',
        '--no-align',
        '--set=ON_ERROR_STOP=1',
        `--username=${username}`,
        `--dbname=${connectedDb}`,
        `--command=${query}`,
      ],
      { encoding: 'utf8', shell: false },
    );
    return result.status === 0 && result.stdout?.trim() === '0';
  }
  const result = spawnSync(
    'psql',
    [
      '--no-psqlrc',
      '--tuples-only',
      '--no-align',
      '--set=ON_ERROR_STOP=1',
      `--dbname=${databaseUrl}`,
      `--command=${query}`,
    ],
    { encoding: 'utf8', shell: false },
  );
  return result.status === 0 && result.stdout?.trim() === '0';
}

function restoreArchive(databaseUrl, connectedDb, backupPath) {
  const commonArgs = [
    '--exit-on-error',
    '--single-transaction',
    '--no-owner',
    '--no-privileges',
  ];
  const container = process.env.RESTORE_DOCKER_CONTAINER;
  if (container) {
    const username = decodeURIComponent(new URL(databaseUrl).username);
    const input = fs.openSync(backupPath, 'r');
    try {
      return spawnSync(
        'docker',
        [
          'exec',
          '-i',
          container,
          'pg_restore',
          ...commonArgs,
          `--username=${username}`,
          `--dbname=${connectedDb}`,
        ],
        { stdio: [input, 'inherit', 'inherit'], shell: false },
      );
    } finally {
      fs.closeSync(input);
    }
  }
  return spawnSync(
    'pg_restore',
    [...commonArgs, `--dbname=${databaseUrl}`, backupPath],
    { stdio: 'inherit', shell: false },
  );
}

function main() {
  loadEnvFile();

  if (process.env.ALLOW_DB_RESTORE !== 'yes') {
    throw new Error(
      'Restore blocked. Set ALLOW_DB_RESTORE=yes for explicit confirmation.',
    );
  }

  if (process.env.RESTORE_TARGET_DISPOSABLE !== 'yes') {
    throw new Error(
      'Restore blocked. Set RESTORE_TARGET_DISPOSABLE=yes only for an isolated disposable database.',
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
  const restoreTargetDb = process.env.RESTORE_TARGET_DB_NAME;
  if (
    !restoreTargetDb ||
    !/(^|[_-])(restore|scratch|disposable)([_-]|$)/i.test(restoreTargetDb) ||
    restoreTargetDb !== connectedDb
  ) {
    throw new Error(
      'Restore blocked. RESTORE_TARGET_DB_NAME must name the connected disposable restore database.',
    );
  }
  if (expectedDb && expectedDb !== connectedDb) {
    throw new Error(
      `Connected DB "${connectedDb}" differs from expected "${expectedDb}".`,
    );
  }

  const descriptor = fs.openSync(backupPath, 'r');
  const header = Buffer.alloc(5);
  try {
    fs.readSync(descriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  if (header.toString('ascii') !== 'PGDMP') {
    throw new Error('Restore blocked. Backup is not a PostgreSQL custom archive.');
  }

  const manifestPath = `${backupPath}.manifest.json`;
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const hash = createHash('sha256');
    const input = fs.openSync(backupPath, 'r');
    try {
      const chunk = Buffer.alloc(1024 * 1024);
      let bytesRead;
      while ((bytesRead = fs.readSync(input, chunk, 0, chunk.length, null)) > 0) {
        hash.update(chunk.subarray(0, bytesRead));
      }
    } finally {
      fs.closeSync(input);
    }
    if (
      manifest.file !== path.basename(backupPath) ||
      manifest.bytes !== fs.statSync(backupPath).size ||
      manifest.sha256 !== hash.digest('hex')
    ) {
      throw new Error('Restore blocked. Backup manifest checksum/size mismatch.');
    }
  }

  if (!verifyEmptyTarget(databaseUrl, connectedDb)) {
    throw new Error(
      'Restore blocked. Target must be reachable and contain no public tables.',
    );
  }

  const run = restoreArchive(databaseUrl, connectedDb, backupPath);

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

