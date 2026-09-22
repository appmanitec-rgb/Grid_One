/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ItemType, UserRole } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { CatalogsService } from './catalogs.service';

describe('CatalogsService', () => {
  let service: CatalogsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      catalogItem: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      catalogItemIdentifier: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      catalogPricingPolicy: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'policy-service',
          salesTaxPercent: 10,
          icmsPercent: 5,
          pisPercent: 2,
          cofinsPercent: 3,
          ipiPercent: 0,
          issPercent: 0,
          irpjPercent: 0,
          csllPercent: 0,
          cppPercent: 0,
          commissionPercent: 2,
          profitMarginPercent: 20,
          operationalCostPercent: 3,
        }),
      },
      inventoryBalance: {
        updateMany: jest.fn(),
      },
      inventoryMovement: {
        findMany: jest.fn(),
      },
      purchaseOrderItem: {
        findMany: jest.fn(),
      },
      maintenanceOrderMaterial: {
        findMany: jest.fn(),
      },
      supplierCatalogItem: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((callback: any) => callback(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogsService,
        { provide: DatabaseService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CatalogsService>(CatalogsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('fills a new product with the active pricing policy and purchase price', async () => {
    prisma.catalogItem.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'cat-new', ...data }),
    );

    await service.create({
      name: 'Servico de teste',
      type: ItemType.SERVICE,
      costPrice: 100,
      basePrice: 999,
    });

    expect(prisma.catalogItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        pricingPolicyId: 'policy-service',
        acquisitionOrigin: 'Comprado',
        itemClassification: 'Servico',
        costPrice: 100,
        lastCost: 100,
        icmsPercent: 5,
        pisPercent: 2,
        cofinsPercent: 3,
        commissionPercent: 2,
        profitMargin: 20,
        operationalCostPercent: 3,
        basePrice: 135,
      }),
    });
  });

  it('composes automatic SKUs from zero without numeric padding', () => {
    expect((service as any).composeSku(0, 'CFT')).toBe('0CFT');
    expect((service as any).composeSku(1, 'CFT')).toBe('1CFT');
  });

  it('returns operational detail with balances and masks cost data without permission', async () => {
    prisma.catalogItem.findUnique.mockResolvedValue(
      catalogItemFixture({
        costPrice: 120,
        averageCost: 110,
        lastCost: 115,
        taxPercentage: 12,
        profitMargin: 30,
        supplierItems: [
          {
            id: 'supplier-item-1',
            supplierId: 'supplier-1',
            supplierSku: 'SUP-001',
            supplierPrice: 99,
            leadTimeDays: 3,
            isPrimary: true,
            supplier: {
              id: 'supplier-1',
              companyName: 'Fornecedor Demo',
            },
          },
        ],
        inventoryBalances: [
          {
            id: 'balance-1',
            physicalQty: 10,
            reservedQty: 2,
            minQty: 5,
            maxQty: 20,
            reorderPoint: 6,
            warehouse: { id: 'wh-1', code: 'MAT', name: 'Matriz' },
          },
        ],
        inventoryMovements: [
          {
            id: 'mov-1',
            unitCost: 100,
            quantity: 1,
            movementType: 'PURCHASE_RECEIPT',
            warehouse: { id: 'wh-1', code: 'MAT', name: 'Matriz' },
          },
        ],
      }),
    );

    const result = await service.findOne('cat-1', {
      role: UserRole.SALES,
      accessPolicy: { catalog: { viewCosts: false } },
    });

    expect(result.operationalSummary.availableQty).toBe(8);
    expect(result.operationalSummary.isLowStock).toBe(false);
    expect(result.costPrice).toBeNull();
    expect(result.averageCost).toBeNull();
    expect(result.lastCost).toBeNull();
    expect(result.supplierItems[0].supplierPrice).toBeNull();
    expect(result.inventoryMovements[0].unitCost).toBeNull();
    expect(result.operationalSummary.primarySupplier.supplierPrice).toBeNull();
  });

  it('keeps cost data visible for authorized users', async () => {
    prisma.catalogItem.findUnique.mockResolvedValue(
      catalogItemFixture({
        costPrice: 120,
        averageCost: 110,
        lastCost: 115,
      }),
    );

    const result = await service.findOne('cat-1', {
      role: UserRole.ADMIN,
      accessPolicy: { catalog: { viewCosts: true } },
    });

    expect(result.costPrice).toBe(120);
    expect(result.averageCost).toBe(110);
    expect(result.lastCost).toBe(115);
  });

  it('returns a compact catalog list with an accurate stock summary', async () => {
    prisma.catalogItem.findMany.mockResolvedValue([
      catalogItemFixture({
        stockMin: 5,
        inventoryBalances: [
          {
            physicalQty: 4,
            reservedQty: 1,
            minQty: 5,
            maxQty: 20,
            reorderPoint: 5,
          },
        ],
      }),
    ]);

    const result = await service.findAll({
      role: UserRole.ADMIN,
      accessPolicy: { catalog: { viewCosts: true } },
    });

    const listQuery = prisma.catalogItem.findMany.mock.calls[0][0];
    expect(listQuery).not.toHaveProperty('include');
    expect(listQuery).toMatchObject({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        inventoryBalances: {
          select: {
            physicalQty: true,
            reservedQty: true,
            minQty: true,
            reorderPoint: true,
          },
        },
      },
    });
    expect(Object.keys(listQuery.select).sort()).toEqual(
      [
        'id',
        'sku',
        'legacyCode',
        'legacySequence',
        'radarCode',
        'name',
        'description',
        'commercialDescription',
        'type',
        'itemClassification',
        'acquisitionOrigin',
        'category',
        'subcategory',
        'unit',
        'manufacturerPartNumber',
        'brand',
        'ncm',
        'basePrice',
        'costPrice',
        'averageCost',
        'profitMargin',
        'stockCurrent',
        'stockMin',
        'stockMax',
        'storageLocation',
        'isActive',
        'inventoryBalances',
      ].sort(),
    );
    expect(listQuery.select).not.toHaveProperty('technicalSpecs');
    expect(listQuery.select).not.toHaveProperty('taxProfile');
    expect(result[0]).not.toHaveProperty('inventoryBalances');
    expect(result[0].operationalSummary).toMatchObject({
      physicalQty: 4,
      reservedQty: 1,
      availableQty: 3,
      isLowStock: true,
    });
  });

  it('masks list cost fields while keeping the suggested sale price', async () => {
    prisma.catalogItem.findMany.mockResolvedValue([
      catalogItemFixture({
        basePrice: 250,
        costPrice: 120,
        averageCost: 110,
        profitMargin: 30,
      }),
    ]);

    const result = await service.findAll({
      role: UserRole.SALES,
      accessPolicy: { catalog: { viewCosts: false } },
    });

    expect(result[0].basePrice).toBe(250);
    expect(result[0].costPrice).toBeNull();
    expect(result[0].averageCost).toBeNull();
    expect(result[0].profitMargin).toBeNull();
  });

  it('blocks direct stock balance mutation through catalog update', async () => {
    await expect(
      service.update('cat-1', { stockCurrent: 50 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.catalogItem.update).not.toHaveBeenCalled();
  });

  it('blocks direct price mutation through the generic catalog update', async () => {
    await expect(
      service.update('cat-1', { basePrice: 999 } as any),
    ).rejects.toThrow('aprovacao do Financeiro');

    expect(prisma.catalogItem.update).not.toHaveBeenCalled();
  });

  it('updates cadastral data and stock targets without changing direct balance', async () => {
    prisma.catalogItem.findUnique.mockResolvedValue(catalogItemFixture());
    prisma.catalogItem.update.mockResolvedValue(catalogItemFixture());
    prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });

    await service.update(
      'cat-1',
      {
        name: 'Filtro atualizado',
        stockMin: 4,
        stockMax: 18,
        reorderPoint: 6,
      },
      { role: UserRole.ADMIN },
    );

    expect(prisma.catalogItem.update).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      data: {
        name: 'Filtro atualizado',
        stockMin: 4,
        stockMax: 18,
      },
    });
    expect(prisma.inventoryBalance.updateMany).toHaveBeenCalledWith({
      where: { catalogItemId: 'cat-1' },
      data: { minQty: 4, maxQty: 18, reorderPoint: 6 },
    });
  });

  it('keeps legacy sequence and Radar code searchable after editing', async () => {
    const current = catalogItemFixture({
      legacySequence: '10',
      radarCode: 'RAD-10',
    });
    prisma.catalogItem.findUnique.mockResolvedValue(current);
    prisma.catalogItem.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...current, ...data }),
    );

    await service.update(
      'cat-1',
      { legacySequence: '11', radarCode: 'RAD-11' },
      { role: UserRole.ADMIN },
    );

    expect(prisma.catalogItemIdentifier.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        catalogItemId: 'cat-1',
        code: '11',
        source: 'sequencia_legada',
      }),
    });
    expect(prisma.catalogItemIdentifier.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        catalogItemId: 'cat-1',
        code: 'RAD-11',
        source: 'codigo_radar',
      }),
    });
  });
});

function catalogItemFixture(overrides: Record<string, any> = {}) {
  return {
    id: 'cat-1',
    sku: 'FLT-001',
    legacyCode: null,
    legacySequence: null,
    radarCode: null,
    name: 'Filtro de oleo',
    description: 'Filtro tecnico',
    type: ItemType.PART,
    basePrice: 250,
    costPrice: null,
    averageCost: null,
    lastCost: null,
    taxPercentage: null,
    profitMargin: null,
    stockMin: 5,
    stockMax: 20,
    isActive: true,
    supplierItems: [],
    inventoryBalances: [],
    inventoryMovements: [],
    purchaseOrderItems: [],
    maintenanceOrderMaterials: [],
    generatorBaseItems: [],
    ...overrides,
  };
}
