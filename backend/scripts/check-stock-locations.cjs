// Real PostgreSQL checks. Refuses the principal database and never resets a database.
// Set NODE_ENV=test, DATABASE_URL and EXPECTED_DB_NAME=gridone_warehouse_<test name>.
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module'),
  { randomUUID } = require('node:crypto');
const backend = path.resolve(__dirname, '..'),
  url = new URL(process.env.DATABASE_URL || 'http://missing');
assert.equal(process.env.NODE_ENV, 'test');
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
assert.match(url.pathname, /^\/gridone_warehouse_[a-z0-9_]+$/);
assert.equal(url.pathname.slice(1), process.env.EXPECTED_DB_NAME);
const dist = process.env.MANITEC_BACKEND_DIST || 'dist',
  client = process.env.MANITEC_PRISMA_CLIENT;
assert.match(dist, /^dist(?:-release-[a-zA-Z0-9-]+)?$/);
if (client) assert.match(client, /^runtime-release-[a-zA-Z0-9-]+\/client$/);
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(
    this,
    request === '@prisma/client' && client
      ? path.join(backend, client)
      : request.startsWith('src/')
        ? path.join(backend, dist, request)
        : request,
    ...args,
  );
};
const { PrismaClient } = require(
  client
    ? path.join(backend, client)
    : path.join(backend, 'node_modules/@prisma/client'),
);
const { StockLocationsService } = require(
  path.join(backend, dist, 'src/modules/inventory/stock-locations.service'),
);
const { InventoryService } = require(
  path.join(backend, dist, 'src/modules/inventory/inventory.service'),
);
const { SalesOrdersService } = require(
  path.join(backend, dist, 'src/modules/sales-orders/sales-orders.service'),
);
const db = new PrismaClient(),
  service = new StockLocationsService(db),
  inventory = new InventoryService(db),
  sales = new SalesOrdersService(db),
  passed = [];
const fresh = () => ({ requestKey: randomUUID() }),
  page = { page: 1, q: '', status: 'ACTIVE' };
async function check(name, fn) {
  await fn();
  passed.push(name);
  console.log('OK ' + name);
}
async function run() {
  const tag = Date.now().toString(36),
    user = await db.user.create({
      data: {
        name: 'Validador do almoxarifado',
        email: 'qa-qr-' + tag + '@example.invalid',
        passwordHash: 'not-a-login-password',
        role: 'ADMIN',
      },
    }),
    actor = { sub: user.id, name: user.name, role: 'ADMIN' };
  const clientRecord = await db.client.create({
    data: {
      companyName: 'Cliente de validação QR ' + tag,
      tradeName: 'Cliente de validação',
      phone: '00000000000',
      city: 'Validação',
      state: 'SP',
    },
  });
  const warehouse = await db.warehouse.create({
      data: {
        code: 'QA-QR-' + tag,
        name: 'Almoxarifado de validação',
        type: 'MAIN',
      },
    }),
    other = await db.warehouse.create({
      data: {
        code: 'QA-OUTRO-' + tag,
        name: 'Outro almoxarifado de validação',
        type: 'MAIN',
      },
    });
  const viewer = await db.user.create({
    data: {
      name: 'Consulta do almoxarifado',
      email: 'qa-qr-view-' + tag + '@example.invalid',
      passwordHash: 'not-a-login-password',
      role: 'NORMAL',
      accessPolicy: {
        pages: { dashboard: true, inventory: true },
        inventory: {
          view: true,
          create: false,
          update: false,
          reserve: false,
          adjust: false,
          consume: false,
        },
      },
      accessRules: { screens: { stockLocations: { view: true, actions: {} } } },
    },
  });
  const item = await db.catalogItem.create({
    data: {
      name: 'Filtro de óleo — validação QR',
      sku: 'QA-' + tag + '-FILTRO',
      type: 'PART',
      unit: 'UN',
      basePrice: 10,
      stockCurrent: 25,
      averageCost: 123.45,
      storageLocation: 'LOCAL-LEGADO',
    },
  });
  const balance = await db.inventoryBalance.create({
    data: {
      warehouseId: warehouse.id,
      catalogItemId: item.id,
      physicalQty: 20,
      reservedQty: 2,
    },
  });
  await db.inventoryBalance.create({
    data: { warehouseId: other.id, catalogItemId: item.id, physicalQty: 5 },
  });
  const make = async (code, wh = warehouse.id) =>
    service.create(
      {
        ...fresh(),
        warehouseId: wh,
        code,
        name: 'Filtros e óleo',
        aisle: 'A',
        shelf: '01',
        level: '02',
        compartment: code.endsWith('1') ? '01' : '02',
      },
      actor,
    );
  let a, b, c, holdId, sale;
  const read = async (locationId = a.id) =>
    (await service.items(locationId, page, actor)).items.find(
      (x) => x.id === balance.id,
    );
  await check(
    'create and replay are idempotent even with reordered keys',
    async () => {
      const dto = {
        ...fresh(),
        warehouseId: warehouse.id,
        code: 'A-01-01',
        name: 'Filtros e óleo',
        aisle: 'A',
        shelf: '01',
        level: '01',
        compartment: '01',
      };
      a = await service.create(dto, actor);
      const replay = await service.create(
        Object.fromEntries(Object.entries(dto).reverse()),
        actor,
      );
      assert.equal(replay.id, a.id);
      assert.equal(
        await db.warehouseLocation.count({
          where: { warehouseId: warehouse.id, code: 'A-01-01' },
        }),
        1,
      );
      b = await make('A-01-02');
      c = await make('Z-01-01', other.id);
    },
  );
  await check(
    'duplicate codes and ungranted screens cannot mutate stock',
    async () => {
      await assert.rejects(make('A-01-01'));
      assert.throws(() =>
        service.capabilities({
          sub: user.id,
          role: 'SUPPLIES',
          accessPolicy: {
            pages: { inventory: true },
            inventory: { view: true },
          },
          accessRules: { screens: { inventory: { view: true, actions: {} } } },
        }),
      );
    },
  );
  await check(
    'placing keeps warehouse stock and legacy address unchanged',
    async () => {
      const options = await service.options(
        { kind: 'ITEMS', q: item.sku, warehouseId: warehouse.id },
        actor,
      );
      await service.place(
        a.id,
        {
          ...fresh(),
          catalogItemId: item.id,
          expectedState: options[0].expectedState,
        },
        actor,
      );
      assert.equal((await read()).physicalQty, 20);
      assert.equal(
        (await db.catalogItem.findUnique({ where: { id: item.id } }))
          .storageLocation,
        'LOCAL-LEGADO',
      );
      await assert.rejects(
        service.place(
          b.id,
          {
            ...fresh(),
            catalogItemId: item.id,
            expectedState: (await read()).expectedState,
          },
          actor,
        ),
      );
    },
  );
  await check(
    'a count reconciles only this warehouse and synchronizes the catalog total',
    async () => {
      const snapshot = await read();
      await service.count(
        a.id,
        {
          ...fresh(),
          balanceId: balance.id,
          expectedState: snapshot.expectedState,
          countedQty: 18,
          reason: 'Divergência física de validação',
        },
        actor,
      );
      assert.equal((await read()).physicalQty, 18);
      assert.equal(
        (await db.catalogItem.findUnique({ where: { id: item.id } }))
          .stockCurrent,
        23,
      );
      assert.equal(
        (
          await db.inventoryBalance.findUnique({
            where: {
              warehouseId_catalogItemId: {
                warehouseId: other.id,
                catalogItemId: item.id,
              },
            },
          })
        ).physicalQty,
        5,
      );
      await assert.rejects(
        service.count(
          a.id,
          {
            ...fresh(),
            balanceId: balance.id,
            expectedState: snapshot.expectedState,
            countedQty: 17,
            reason: 'Contagem desatualizada',
          },
          actor,
        ),
      );
    },
  );
  await check(
    'counts below reservations, missing reasons and fractional pieces are rejected',
    async () => {
      const state = (await read()).expectedState;
      for (const dto of [
        { countedQty: 1, reason: 'Abaixo do reservado' },
        { countedQty: 17 },
        { countedQty: 17.5, reason: 'Fracionado' },
      ])
        await assert.rejects(
          service.count(
            a.id,
            { ...fresh(), balanceId: balance.id, expectedState: state, ...dto },
            actor,
          ),
        );
      assert.equal((await read()).physicalQty, 18);
    },
  );
  await check(
    'an equal count records verification without a stock movement',
    async () => {
      const before = await db.inventoryMovement.count({
        where: { catalogItemId: item.id },
      });
      await service.count(
        a.id,
        {
          ...fresh(),
          balanceId: balance.id,
          expectedState: (await read()).expectedState,
          countedQty: 18,
        },
        actor,
      );
      assert.ok((await read()).lastVerifiedAt);
      assert.equal(
        await db.inventoryMovement.count({ where: { catalogItemId: item.id } }),
        before,
      );
    },
  );
  await check(
    'client reservation and replay change the official counter only once',
    async () => {
      const dto = {
        ...fresh(),
        balanceId: balance.id,
        expectedState: (await read()).expectedState,
        clientId: clientRecord.id,
        quantity: 5,
        reason: 'Separação futura',
        neededAt: '2026-11-20T15:00:00.000Z',
      };
      const result = await service.reserve(a.id, dto, actor);
      holdId = result.reservationId;
      await service.reserve(a.id, dto, actor);
      assert.equal((await read()).reservedQty, 7);
      await assert.rejects(
        service.reserve(a.id, { ...dto, quantity: 6 }, actor),
      );
    },
  );
  await check(
    'two simultaneous reservations cannot oversell or silently replace the snapshot',
    async () => {
      const expectedState = (await read()).expectedState;
      const results = await Promise.allSettled(
        [1, 2].map(() =>
          service.reserve(
            a.id,
            {
              ...fresh(),
              balanceId: balance.id,
              expectedState,
              clientId: clientRecord.id,
              quantity: 9,
            },
            actor,
          ),
        ),
      );
      assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
      assert.equal((await read()).reservedQty, 16);
      const extra = await db.inventoryClientReservation.findFirst({
        where: { balanceId: balance.id, quantity: 9 },
      });
      await service.release(
        a.id,
        extra.id,
        {
          ...fresh(),
          expectedState: (await read()).expectedState,
          quantity: 9,
          reason: 'Encerramento da concorrência de teste',
        },
        actor,
      );
    },
  );
  await check(
    'legacy releases and database constraints preserve customer holds',
    async () => {
      await assert.rejects(
        inventory.release({ catalogItemId: item.id, quantity: 3 }),
      );
      assert.equal((await read()).reservedQty, 7);
      await assert.rejects(
        inventory.adjustStock({
          warehouseId: warehouse.id,
          reason: 'Ajuste inválido de teste',
          items: [{ catalogItemId: item.id, delta: -12 }],
        }),
        (e) => typeof e.getStatus === 'function' && e.getStatus() === 400,
      );
      await assert.rejects(
        db.inventoryBalance.update({
          where: { id: balance.id },
          data: { reservedQty: 0 },
        }),
      );
      await assert.rejects(
        db.inventoryBalance.update({
          where: { id: balance.id },
          data: { physicalQty: 6 },
        }),
      );
      assert.equal((await read()).physicalQty, 18);
    },
  );
  await check(
    'legacy adjustments and transfers retain the position and customer allocations',
    async () => {
      for (const delta of [1, -1])
        await inventory.adjustStock({
          warehouseId: warehouse.id,
          reason: 'Validação do ajuste legado',
          items: [{ catalogItemId: item.id, delta }],
        });
      await inventory.transfer({
        fromWarehouseId: warehouse.id,
        toWarehouseId: other.id,
        catalogItemId: item.id,
        quantity: 1,
        reason: 'Validação da transferência legada',
      });
      await inventory.transfer({
        fromWarehouseId: other.id,
        toWarehouseId: warehouse.id,
        catalogItemId: item.id,
        quantity: 1,
        reason: 'Retorno da transferência de teste',
      });
      assert.equal((await read()).physicalQty, 18);
      assert.equal((await read()).reservedQty, 7);
      assert.equal(
        (await db.catalogItem.findUnique({ where: { id: item.id } }))
          .stockCurrent,
        23,
      );
    },
  );
  await check(
    'partial release cannot release more than this customer owns',
    async () => {
      await service.release(
        a.id,
        holdId,
        {
          ...fresh(),
          expectedState: (await read()).expectedState,
          quantity: 2,
          reason: 'Parte não será utilizada',
        },
        actor,
      );
      await assert.rejects(
        service.release(
          a.id,
          holdId,
          {
            ...fresh(),
            expectedState: (await read()).expectedState,
            quantity: 4,
            reason: 'Excesso',
          },
          actor,
        ),
      );
      assert.equal((await read()).reservedQty, 5);
    },
  );
  const proposal = await db.proposal.create({
      data: {
        code: 'QA-QR-' + tag,
        type: 'PARTS',
        status: 'APPROVED',
        clientId: clientRecord.id,
        userId: user.id,
      },
    }),
    proposalItem = await db.proposalItem.create({
      data: {
        proposalId: proposal.id,
        catalogItemId: item.id,
        quantity: 10,
        unitPrice: 10,
        totalPrice: 100,
      },
    });
  sale = await db.salesOrder.create({
    data: {
      code: 'QA-PED-' + tag,
      proposalId: proposal.id,
      clientId: clientRecord.id,
      totalValue: 100,
    },
  });
  const saleItem = await db.salesOrderItem.create({
    data: {
      salesOrderId: sale.id,
      proposalItemId: proposalItem.id,
      catalogItemId: item.id,
      description: item.name,
      quantity: 10,
      unitPrice: 10,
      totalPrice: 100,
    },
  });
  await check(
    'handoff respects financial release and never duplicates the reservation',
    async () => {
      await db.proposal.update({
        where: { id: proposal.id },
        data: { hasDownPayment: true, downPaymentAmount: 20 },
      });
      await assert.rejects(
        service.transferReservation(
          a.id,
          holdId,
          {
            ...fresh(),
            expectedState: (await read()).expectedState,
            quantity: 2,
            salesOrderItemId: saleItem.id,
          },
          actor,
        ),
      );
      assert.equal(
        (
          await db.inventoryClientReservation.findUnique({
            where: { id: holdId },
          })
        ).remainingQty,
        3,
      );
      await db.proposal.update({
        where: { id: proposal.id },
        data: { downPaymentConfirmedAt: new Date() },
      });
      const dto = {
        ...fresh(),
        expectedState: (await read()).expectedState,
        quantity: 2,
        salesOrderItemId: saleItem.id,
      };
      await service.transferReservation(a.id, holdId, dto, actor);
      await service.transferReservation(a.id, holdId, dto, actor);
      assert.equal((await read()).reservedQty, 5);
      assert.equal(
        (
          await db.salesOrderAllocation.findFirst({
            where: { salesOrderItemId: saleItem.id },
          })
        ).reservedQty,
        2,
      );
    },
  );
  const generator = await db.generator.create({
      data: {
        name: 'Gerador de validação QR',
        brand: 'Validação',
        power: 80,
        clientId: clientRecord.id,
      },
    }),
    order = await db.maintenanceOrder.create({
      data: { title: 'Atendimento de validação QR', generatorId: generator.id },
    });
  await db.maintenanceOrderMaterial.create({
    data: {
      orderId: order.id,
      catalogItemId: item.id,
      warehouseId: warehouse.id,
      quantity: 2,
      reservedAt: new Date(),
    },
  });
  const request = await db.procurementRequest.create({
    data: {
      code: 'QA-SOL-' + tag,
      requestKey: randomUUID(),
      requesterId: user.id,
      department: 'Almoxarifado',
      origin: 'STOCK',
      justification: 'Validação de demanda',
      status: 'AWAITING_ANALYSIS',
    },
  });
  await db.procurementRequestItem.create({
    data: {
      requestId: request.id,
      catalogItemId: item.id,
      description: item.name,
      quantity: 3,
      unit: 'UN',
    },
  });
  await check(
    'sales, work orders and procurement demands use real pending quantities without prices',
    async () => {
      for (const source of ['SALES', 'WORK', 'PROCUREMENT']) {
        const result = await service.demands(a.id, { ...page, source }, actor);
        assert.equal(result.total, 1);
        assert.equal(result.items.length, 1);
        assert.ok(
          !/unitPrice|totalPrice|averageCost|basePrice|paymentTerm/.test(
            JSON.stringify(result),
          ),
        );
      }
    },
  );
  await check(
    'new positions are reflected by the existing stock screen',
    async () => {
      const summary = await inventory.summary(warehouse.id, actor);
      assert.equal(
        summary.find((x) => x.catalogItemId === item.id).storageLocation,
        'A-01-01',
      );
    },
  );
  await check(
    'moving follows all stock and reservations without moving to another warehouse',
    async () => {
      await assert.rejects(
        service.move(
          a.id,
          {
            ...fresh(),
            balanceId: balance.id,
            expectedState: (await read()).expectedState,
            toLocationId: c.id,
            reason: 'Outro depósito',
          },
          actor,
        ),
      );
      await service.move(
        a.id,
        {
          ...fresh(),
          balanceId: balance.id,
          expectedState: (await read()).expectedState,
          toLocationId: b.id,
          reason: 'Organização da prateleira',
        },
        actor,
      );
      assert.equal((await read(b.id)).physicalQty, 18);
      assert.equal((await read(b.id)).reservedQty, 5);
      assert.equal(
        (await service.reservations(b.id, page, actor)).items[0].id,
        holdId,
      );
      assert.ok(
        (await service.history(b.id, page, actor)).items.some(
          (x) => x.action === 'MOVE',
        ),
      );
    },
  );
  await check(
    'occupied positions cannot be deactivated and labels remain tied to stable IDs',
    async () => {
      const loc = await service.detail(b.id, actor);
      await assert.rejects(
        service.update(
          b.id,
          { ...fresh(), version: loc.version, code: loc.code, isActive: false },
          actor,
        ),
      );
      const labels = await service.labels(
        { locationIds: [a.id, b.id], baseUrl: 'http://127.0.0.1:3004' },
        actor,
      );
      assert.equal(labels.length, 2);
      assert.ok(labels[1].url.endsWith('/' + b.id));
      assert.ok(labels[1].qrDataUrl.startsWith('data:image/png;base64,'));
      await assert.rejects(
        service.labels(
          { locationIds: [b.id], baseUrl: 'https://user:password@example.com' },
          actor,
        ),
      );
    },
  );
  await check('label address settings use optimistic concurrency', async () => {
    await service.qrAccess(
      b.id,
      { ...fresh(), baseUrl: 'http://127.0.0.1:3004', expectedBaseUrl: '' },
      actor,
    );
    await assert.rejects(
      service.qrAccess(
        a.id,
        { ...fresh(), baseUrl: 'https://invalid.example', expectedBaseUrl: '' },
        actor,
      ),
    );
  });
  await sales.release(
    sale.id,
    { itemId: saleItem.id, warehouseId: warehouse.id, quantity: 2 },
    actor,
  );
  await service.release(
    b.id,
    holdId,
    {
      ...fresh(),
      expectedState: (await read(b.id)).expectedState,
      quantity: 1,
      reason: 'Reserva de teste concluída',
    },
    actor,
  );
  await inventory.release({ catalogItemId: item.id, quantity: 2 });
  await db.maintenanceOrderMaterial.updateMany({
    where: { orderId: order.id },
    data: { reservedAt: null },
  });
  await check(
    'unlink requires zero stock, retains history, and does not delete the balance',
    async () => {
      await assert.rejects(
        service.unplace(
          b.id,
          {
            ...fresh(),
            balanceId: balance.id,
            expectedState: (await read(b.id)).expectedState,
            reason: 'Teste com saldo',
          },
          actor,
        ),
      );
      await service.count(
        b.id,
        {
          ...fresh(),
          balanceId: balance.id,
          expectedState: (await read(b.id)).expectedState,
          countedQty: 0,
          reason: 'Esvaziamento de teste',
        },
        actor,
      );
      await service.unplace(
        b.id,
        {
          ...fresh(),
          balanceId: balance.id,
          expectedState: (await read(b.id)).expectedState,
          reason: 'Conferência de desvinculação',
        },
        actor,
      );
      assert.ok(
        await db.inventoryBalance.findUnique({ where: { id: balance.id } }),
      );
      assert.ok((await service.history(b.id, page, actor)).total > 0);
    },
  );
  const option = (
    await service.options(
      { kind: 'ITEMS', q: item.sku, warehouseId: warehouse.id },
      actor,
    )
  )[0];
  await service.place(
    b.id,
    { ...fresh(), catalogItemId: item.id, expectedState: option.expectedState },
    actor,
  );
  await service.count(
    b.id,
    {
      ...fresh(),
      balanceId: balance.id,
      expectedState: (await read(b.id)).expectedState,
      countedQty: 18,
      reason: 'Preparação da ficha de validação',
    },
    actor,
  );
  const oil = await db.catalogItem.create({
    data: {
      name: 'Óleo lubrificante 15W40 — validação QR',
      sku: 'QA-' + tag + '-OLEO',
      type: 'PART',
      unit: 'L',
      basePrice: 10,
      stockCurrent: 12.5,
    },
  });
  const oilBalance = await db.inventoryBalance.create({
    data: {
      warehouseId: warehouse.id,
      catalogItemId: oil.id,
      physicalQty: 12.5,
    },
  });
  await service.place(
    b.id,
    {
      ...fresh(),
      catalogItemId: oil.id,
      expectedState: (
        await service.options(
          { kind: 'ITEMS', q: oil.sku, warehouseId: warehouse.id },
          actor,
        )
      )[0].expectedState,
    },
    actor,
  );
  const browserHold = await service.reserve(
    b.id,
    {
      ...fresh(),
      balanceId: balance.id,
      expectedState: (await read(b.id)).expectedState,
      clientId: clientRecord.id,
      quantity: 2,
      reason: 'Material previsto para atendimento',
    },
    actor,
  );
  const output = path.resolve(backend, '../runtime-logs/warehouse-qr-20261106');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(output, 'fixture.json'),
    JSON.stringify(
      {
        userId: user.id,
        viewerUserId: viewer.id,
        warehouse,
        otherWarehouseId: other.id,
        locationId: b.id,
        emptyLocationId: a.id,
        foreignLocationId: c.id,
        balanceId: balance.id,
        oilBalanceId: oilBalance.id,
        itemId: item.id,
        oilItemId: oil.id,
        clientId: clientRecord.id,
        reservationId: browserHold.reservationId,
        salesOrderId: sale.id,
        salesOrderItemId: saleItem.id,
        orderId: order.id,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(output, 'integration-result.json'),
    JSON.stringify(
      { database: url.pathname.slice(1), passed, at: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log(passed.length + ' PostgreSQL scenarios passed.');
}
run()
  .catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
