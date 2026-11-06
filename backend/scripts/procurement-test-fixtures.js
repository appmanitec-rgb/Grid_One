const fs = require('fs'),
  path = require('path'),
  crypto = require('crypto');
require('dotenv').config({
  path: path.resolve(__dirname, '../.env'),
  quiet: true,
});
const uri = new URL(process.env.DATABASE_URL);
if (!['/gridone_db', '/gridone_e2e'].includes(uri.pathname))
  throw new Error('Banco inesperado.');
uri.pathname = '/gridone_e2e';
process.env.DATABASE_URL = uri.toString();
const { PrismaClient, Prisma } = require('../runtime-prp/client');
const db = new PrismaClient();
(async () => {
  const actual = await db.$queryRawUnsafe('SELECT current_database() AS name');
  if (actual[0].name !== 'gridone_e2e') throw new Error('Exige banco E2E.');
  await db.$transaction((tx) =>
    tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('procurement-fixture-probe'))`,
    ),
  );
  const suffix = crypto.randomBytes(4).toString('hex');
  const supplierA = await db.supplier.create({
    data: {
      companyName: 'PRP A ' + suffix,
      legacyCode: 'PRPA-' + suffix,
      paymentTerm: '30 dias',
    },
  });
  const supplierB = await db.supplier.create({
    data: {
      companyName: 'PRP B ' + suffix,
      legacyCode: 'PRPB-' + suffix,
      paymentTerm: '30 dias',
    },
  });
  const warehouse = await db.warehouse.create({
    data: { code: 'PRP-' + suffix, name: 'PRP Almoxarifado ' + suffix },
  });
  const warehouse2 = await db.warehouse.create({
    data: { code: 'PRP2-' + suffix, name: 'PRP Outro almoxarifado ' + suffix },
  });
  const items = [];
  for (let n = 0; n < 4; n++)
    items.push(
      await db.catalogItem.create({
        data: {
          name: 'PRP Material ' + suffix + ' ' + n,
          sku: 'PRP-' + suffix + '-' + n,
          type: 'PART',
          unit: 'UN',
          stockCurrent: n === 0 ? 10 : 0,
          averageCost: n === 0 ? 100 : 0,
          basePrice: 200,
        },
      }),
    );
  const service = await db.catalogItem.create({
    data: {
      name: 'PRP Servico ' + suffix,
      sku: 'PRP-S-' + suffix,
      type: 'SERVICE',
      unit: 'SV',
      basePrice: 500,
      stockCurrent: 0,
    },
  });
  await db.inventoryBalance.create({
    data: {
      warehouseId: warehouse.id,
      catalogItemId: items[0].id,
      physicalQty: 10,
      reservedQty: 0,
      minQty: 15,
      maxQty: 20,
    },
  });
  const order = await db.maintenanceOrder.findFirst({
    include: {
      generator: { select: { clientId: true } },
      technician: { select: { userId: true } },
    },
  });
  const warranty =
    (await db.warrantyCase.findFirst()) ??
    (await db.warrantyCase.create({
      data: {
        code: 'WPRP-' + suffix,
        generatorId: order.generatorId,
        clientId: order.generator.clientId,
        owner: Object.values(require('../runtime-prp/client').WarrantyOwner)[0],
        title: 'Garantia simulada PRP',
        defectDescription: 'Defeito controlado para teste de compras.',
      },
    }));
  const result = {
    suffix,
    supplierA,
    supplierB,
    warehouse,
    warehouse2,
    items,
    service,
    order,
    warranty,
  };
  fs.writeFileSync(
    path.resolve(__dirname, '../../runtime-logs/procurement-fixtures.json'),
    JSON.stringify(result, null, 2),
  );
  console.log('Fixtures de compras criadas somente em gridone_e2e.');
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
