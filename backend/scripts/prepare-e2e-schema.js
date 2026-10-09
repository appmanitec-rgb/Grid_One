const { PrismaClient } = require('@prisma/client');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || new URL(databaseUrl).pathname !== '/gridone_e2e') {
    throw new Error('Este preparo so pode ser executado no banco gridone_e2e.');
  }

  const prisma = new PrismaClient();
  try {
    const actual = await prisma.$queryRawUnsafe('SELECT current_database() AS name');
    if (actual[0]?.name !== 'gridone_e2e') {
      throw new Error('Conexao nao aponta para gridone_e2e.');
    }
    const codeDefaults = [
      ['agent_code_number_seq', 'users', 'AGT'],
      ['client_code_number_seq', 'clients', 'CLI'],
      ['equipment_code_number_seq', 'generators', 'EQP'],
    ];
    for (const [sequence, table, suffix] of codeDefaults) {
      await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS "${sequence}"`);
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "${table}" ALTER COLUMN "code" SET DEFAULT (nextval('${sequence}'::regclass)::text || '${suffix}')`,
      );
    }
    console.log('Defaults de codigo do banco E2E preparados.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
