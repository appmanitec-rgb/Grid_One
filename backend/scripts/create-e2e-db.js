const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

function sourceDatabaseUrl() {
  const line = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL ausente no backend/.env.');
  const url = new URL(line.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
  if (url.pathname !== '/gridone_db') throw new Error('Banco de origem inesperado.');
  return url.toString();
}

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: sourceDatabaseUrl() } } });
  try {
    const current = await prisma.$queryRawUnsafe('SELECT current_database() AS name');
    if (current[0]?.name !== 'gridone_db') throw new Error('Conexao de origem invalida.');
    const existing = await prisma.$queryRawUnsafe(
      'SELECT datname FROM pg_database WHERE datname = $1',
      'gridone_e2e',
    );
    if (existing.length) {
      console.log('Banco gridone_e2e ja existe.');
      return;
    }
    await prisma.$executeRawUnsafe('CREATE DATABASE "gridone_e2e"');
    console.log('Banco gridone_e2e criado.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
