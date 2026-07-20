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

  it('blocks direct stock balance mutation through catalog update', async () => {
    await expect(
      service.update('cat-1', { stockCurrent: 50 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

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
});

function catalogItemFixture(overrides: Record<string, any> = {}) {
  return {
    id: 'cat-1',
    sku: 'FLT-001',
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
