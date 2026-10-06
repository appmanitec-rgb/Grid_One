/* Add twelve fictional clients to a disposable, local stage-3 database. */
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');

const url = new URL(process.env.DATABASE_URL || 'postgres://localhost/invalid');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '5545');
assert.equal(url.pathname, '/gridone_stage3_stage');
assert.equal(process.env.STAGE3_CONFIRM_FICTIONAL_SEED, 'yes');

const prisma = new PrismaClient();

async function main() {
  const [sales, firstPart, service] = await Promise.all([
    prisma.user.findUnique({ where: { email: 'vendas.demo@manitec.local' } }),
    prisma.catalogItem.findUnique({ where: { sku: 'DEMO-FILTRO-001' } }),
    prisma.catalogItem.findUnique({ where: { sku: 'DEMO-SERV-PM-001' } }),
  ]);
  assert.ok(sales && firstPart && service, 'Execute seed:flow antes deste roteiro.');
  const secondPart = await prisma.catalogItem.upsert({
    where: { sku: 'QA-STAGE3-FILTRO-002' },
    create: {
      sku: 'QA-STAGE3-FILTRO-002',
      name: 'Filtro secundario ficticio QA',
      type: 'PART',
      basePrice: 89.5,
      costPrice: 40,
      manufacturerPartNumber: 'QA-PN-002',
      isActive: true,
    },
    update: { isActive: true, basePrice: 89.5 },
  });

  for (let index = 1; index <= 12; index += 1) {
    const number = String(index).padStart(2, '0');
    const existing = await prisma.client.findFirst({
      where: { email: `cliente${number}@stage3.invalid` },
    });
    const client = existing
      ? await prisma.client.update({
          where: { id: existing.id },
          data: { isActive: true, proposalCreationBlocked: false, isDelinquent: false },
        })
      : await prisma.client.create({
          data: {
            companyName: `Cliente Ficticio QA ${number}`,
            email: `cliente${number}@stage3.invalid`,
            phone: '11999990000',
            city: 'Indaiatuba',
            state: 'SP',
            salesOwnerId: sales.id,
            paymentTermDefault: 'Mensal',
          },
        });
    const generator = await prisma.generator.upsert({
      where: { serialNumber: `QA-STAGE3-GMG-${number}` },
      create: {
        name: `Gerador ficticio QA ${number}`,
        brand: 'QA',
        serialNumber: `QA-STAGE3-GMG-${number}`,
        power: 100 + index * 10,
        clientId: client.id,
      },
      update: { clientId: client.id },
    });
    for (const part of [firstPart, secondPart]) {
      await prisma.generatorBaseItem.upsert({
        where: {
          generatorId_catalogItemId_serviceGroup: {
            generatorId: generator.id,
            catalogItemId: part.id,
            serviceGroup: 'TM',
          },
        },
        create: {
          generatorId: generator.id,
          catalogItemId: part.id,
          serviceGroup: 'TM',
          quantity: 2,
        },
        update: { quantity: 2 },
      });
    }
  }
  const count = await prisma.client.count({ where: { email: { endsWith: '@stage3.invalid' } } });
  assert.equal(count, 12);
  console.log(`[stage3-seed] ${count} clientes ficticios com geradores e pecas.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
