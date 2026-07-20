/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import { UserRole } from '@prisma/client';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let prisma: any;
  let service: InventoryService;

  beforeEach(() => {
    prisma = {
      inventoryBalance: {
        findMany: jest.fn(),
      },
    };
    service = new InventoryService(prisma);
  });

  it('masks average cost in summary for users without catalog cost permission', async () => {
    prisma.inventoryBalance.findMany.mockResolvedValue([
      {
        id: 'balance-1',
        warehouseId: 'warehouse-1',
        warehouse: { name: 'Matriz' },
        catalogItemId: 'cat-1',
        physicalQty: 10,
        reservedQty: 3,
        minQty: 4,
        maxQty: 20,
        reorderPoint: 5,
        catalogItem: {
          id: 'cat-1',
          sku: 'FLT-001',
          manufacturerPartNumber: 'PN-001',
          name: 'Filtro',
          stockMin: 4,
          stockMax: 20,
          averageCost: 99,
          brand: 'Fleetguard',
          storageLocation: 'A1',
        },
      },
    ]);

    const rows = await service.summary(undefined, {
      role: UserRole.SALES,
      accessPolicy: { catalog: { viewCosts: false } },
    });

    expect(rows[0]).toMatchObject({
      catalogItemId: 'cat-1',
      availableQty: 7,
      reorderPoint: 5,
      avgCost: null,
    });
  });

  it('keeps supplier price hidden in replenishment drafts without cost permission', async () => {
    prisma.inventoryBalance.findMany.mockResolvedValue([
      {
        warehouseId: 'warehouse-1',
        warehouse: { name: 'Matriz' },
        catalogItemId: 'cat-1',
        physicalQty: 2,
        reservedQty: 1,
        minQty: 5,
        maxQty: 15,
        catalogItem: {
          name: 'Filtro',
          supplierItems: [
            {
              supplierId: 'supplier-1',
              supplierPrice: 88,
              leadTimeDays: 4,
              supplier: { companyName: 'Fornecedor Demo' },
            },
          ],
        },
      },
    ]);

    const drafts = await service.replenishmentDrafts(undefined, {
      role: UserRole.TECHNICIAN,
      accessPolicy: { catalog: { viewCosts: false } },
    });

    expect(drafts[0].supplierSuggestion).toMatchObject({
      supplierId: 'supplier-1',
      supplierName: 'Fornecedor Demo',
      leadTimeDays: 4,
      supplierPrice: null,
    });
  });

  it('keeps inventory cost visible for authorized users', async () => {
    prisma.inventoryBalance.findMany.mockResolvedValue([
      {
        id: 'balance-1',
        warehouseId: 'warehouse-1',
        warehouse: { name: 'Matriz' },
        catalogItemId: 'cat-1',
        physicalQty: 10,
        reservedQty: 0,
        minQty: 4,
        maxQty: 20,
        reorderPoint: 5,
        catalogItem: {
          id: 'cat-1',
          sku: 'FLT-001',
          manufacturerPartNumber: 'PN-001',
          name: 'Filtro',
          stockMin: 4,
          stockMax: 20,
          averageCost: 99,
          brand: 'Fleetguard',
          storageLocation: 'A1',
        },
      },
    ]);

    const rows = await service.summary(undefined, { role: UserRole.ADMIN });

    expect(rows[0].avgCost).toBe(99);
  });
});
