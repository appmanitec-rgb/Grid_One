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

function readClientBundle() {
  const clientPath = path.resolve(
    __dirname,
    '..',
    'node_modules',
    '.prisma',
    'client',
    'index.js',
  );

  if (!fs.existsSync(clientPath)) {
    return null;
  }

  return fs.readFileSync(clientPath, 'utf8');
}

function readGeneratedSchemaStat() {
  const schemaPath = path.resolve(
    __dirname,
    '..',
    'node_modules',
    '.prisma',
    'client',
    'schema.prisma',
  );

  if (!fs.existsSync(schemaPath)) {
    return null;
  }

  return fs.statSync(schemaPath);
}

function readSourceSchemaStat() {
  const schemaPath = path.resolve(__dirname, '..', 'prisma', 'schema.prisma');
  if (!fs.existsSync(schemaPath)) {
    return null;
  }

  return fs.statSync(schemaPath);
}

function isAccelerateUrl(url) {
  return (
    url.startsWith('prisma://') || url.startsWith('prisma+postgres://')
  );
}

function shouldRegenerateClient() {
  if (process.env.PRISMA_SKIP_LOCAL_GENERATE === 'true') {
    return false;
  }

  loadEnvFile();

  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (databaseUrl && isAccelerateUrl(databaseUrl)) {
    return false;
  }

  const bundle = readClientBundle();
  if (!bundle) {
    return true;
  }

  if (!bundle.includes('"copyEngine": true')) {
    return true;
  }

  const generatedSchemaStat = readGeneratedSchemaStat();
  const sourceSchemaStat = readSourceSchemaStat();
  if (!generatedSchemaStat || !sourceSchemaStat) {
    return true;
  }

  return generatedSchemaStat.mtimeMs < sourceSchemaStat.mtimeMs;
}

function main() {
  if (!shouldRegenerateClient()) {
    return;
  }

  console.warn(
    '[prisma:ensure:local] Prisma Client local is stale or was generated with --no-engine. Regenerating with native engine...',
  );

  const result = spawnSync('npm run prisma:generate:safe', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
  });

  process.exit(result.status ?? 1);
}

main();
