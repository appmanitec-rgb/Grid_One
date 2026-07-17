const fs = require('fs');
const path = require('path');

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

function required(name) {
  if (!process.env[name]?.trim()) return name;
  return null;
}

function main() {
  loadEnvFile();

  const isProduction = process.env.NODE_ENV === 'production';
  const missing = ['DATABASE_URL', 'JWT_SECRET']
    .map(required)
    .filter(Boolean);

  if (isProduction) {
    for (const name of ['CORS_ORIGINS', 'APP_BASE_URL', 'FRONTEND_BASE_URL']) {
      const miss = required(name);
      if (miss) missing.push(miss);
    }
  }

  if (missing.length) {
    throw new Error(`Variaveis obrigatorias ausentes: ${missing.join(', ')}`);
  }

  if (
    isProduction &&
    ['change_me', 'change_me_local_only'].includes(process.env.JWT_SECRET)
  ) {
    throw new Error('JWT_SECRET precisa ser trocado em producao.');
  }

  const storageDriver = (process.env.FILE_STORAGE_DRIVER || 'local').toLowerCase();
  if (['s3', 'minio', 'supabase'].includes(storageDriver)) {
    const storageMissing = [
      'S3_ENDPOINT',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    ]
      .map(required)
      .filter(Boolean);
    if (storageMissing.length) {
      throw new Error(
        `Storage externo sem configuracao: ${storageMissing.join(', ')}`,
      );
    }
  }

  console.log(
    `[env:check] OK. environment=${process.env.NODE_ENV || 'development'}; storage=${storageDriver}`,
  );
}

try {
  main();
} catch (error) {
  console.error(`[env:check] FAILED: ${error.message}`);
  process.exit(1);
}
