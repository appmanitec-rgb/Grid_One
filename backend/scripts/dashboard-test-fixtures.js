const fs = require('fs'),
  path = require('path'),
  crypto = require('crypto');
require('dotenv').config({
  path: path.resolve(__dirname, '../.env'),
  quiet: true,
});
const uri = new URL(process.env.DATABASE_URL);
if (!['/gridone_db', '/gridone_e2e'].includes(uri.pathname))
  throw Error('Base inesperada');
uri.pathname = '/gridone_e2e';
process.env.DATABASE_URL = uri.toString();
const { PrismaClient } = require('../runtime-prp/client');
const db = new PrismaClient();
(async () => {
  const actual = await db.$queryRawUnsafe('SELECT current_database() AS name');
  if (actual[0].name !== 'gridone_e2e') throw Error('Somente gridone_e2e');
  await db.$executeRawUnsafe(
    'ALTER TABLE "maintenance_order_materials" ADD COLUMN IF NOT EXISTS "separatedAt" TIMESTAMP(3)',
  );
  const suffix = crypto.randomBytes(4).toString('hex'),
    operator = await db.user.findFirst({
      where: { role: 'ADMIN', isActive: true },
    }),
    generator = await db.generator.findFirst();
  if (!operator || !generator)
    throw Error('Fixtures operacionais E2E ausentes');
  const warehouse = await db.warehouse.create({
      data: {
        code: 'DASH-' + suffix,
        name: 'Almoxarifado Dashboard ' + suffix,
      },
    }),
    product = await db.catalogItem.create({
      data: {
        sku: 'DASH-' + suffix,
        name: 'Produto Dashboard ' + suffix,
        type: 'PART',
        basePrice: 20,
        stockCurrent: 10,
        stockMin: 20,
      },
    }),
    service = await db.catalogItem.create({
      data: {
        sku: 'DASHS-' + suffix,
        name: 'Servico Dashboard ' + suffix,
        type: 'SERVICE',
        basePrice: 20,
      },
    });
  await db.inventoryBalance.create({
    data: {
      warehouseId: warehouse.id,
      catalogItemId: product.id,
      physicalQty: 10,
      reservedQty: 2,
      minQty: 20,
    },
  });
  const order = await db.maintenanceOrder.create({
    data: {
      title: 'Separacao Dashboard ' + suffix,
      generatorId: generator.id,
      status: 'OPEN',
      materials: {
        create: [
          {
            catalogItemId: product.id,
            quantity: 2,
            reservedAt: new Date(),
            warehouseId: warehouse.id,
          },
          { catalogItemId: product.id, quantity: 1, warehouseId: warehouse.id },
          { catalogItemId: service.id, quantity: 1 },
        ],
      },
    },
    include: { materials: true },
  });
  const epi = await db.hrAssetAssignment.create({
    data: {
      userId: operator.id,
      assetType: 'EPI',
      title: 'Capacete Dashboard ' + suffix,
      deliveredAt: new Date('2020-01-01'),
      expiresAt: new Date('2020-12-31'),
      status: 'ACTIVE',
    },
  });
  const output = {
    suffix,
    warehouse,
    product,
    orderId: order.id,
    reservedMaterialId: order.materials.find((m) => m.reservedAt).id,
    unreservedMaterialId: order.materials.find(
      (m) => m.catalogItemId === product.id && !m.reservedAt,
    ).id,
    serviceMaterialId: order.materials.find(
      (m) => m.catalogItemId === service.id,
    ).id,
    epiId: epi.id,
  };
  fs.mkdirSync(path.resolve(__dirname, '../../runtime-logs'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.resolve(__dirname, '../../runtime-logs/dashboard-area-fixtures.json'),
    JSON.stringify(output, null, 2),
  );
  console.log('Fixtures do painel criadas somente em gridone_e2e.');
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
