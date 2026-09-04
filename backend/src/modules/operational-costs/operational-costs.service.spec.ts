import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { OperationalCostsService } from './operational-costs.service';

describe('OperationalCostsService', () => {
  let service: OperationalCostsService;
  let database: {
    maintenanceOrder: { findMany: jest.Mock };
    costCenter: { findMany: jest.Mock };
    commissionEntry: { findMany: jest.Mock };
    accountsReceivable: { findMany: jest.Mock };
    purchaseOrder: { aggregate: jest.Mock };
  };

  beforeEach(async () => {
    database = {
      maintenanceOrder: { findMany: jest.fn() },
      costCenter: { findMany: jest.fn() },
      commissionEntry: { findMany: jest.fn() },
      accountsReceivable: { findMany: jest.fn() },
      purchaseOrder: { aggregate: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperationalCostsService,
        { provide: DatabaseService, useValue: database },
      ],
    }).compile();
    service = module.get(OperationalCostsService);
  });

  it('consolidates cost-center values without duplicating direct order costs', async () => {
    database.maintenanceOrder.findMany.mockResolvedValue([
      {
        id: 'order-1',
        title: 'OS integrada',
        status: 'COMPLETED',
        type: 'CORRECTIVE',
        openedAt: new Date('2026-08-10T10:00:00.000Z'),
        finishedAt: new Date('2026-08-10T12:00:00.000Z'),
        laborHours: 1,
        costCenterId: 'center-1',
        contractId: 'contract-1',
        generator: {
          id: 'generator-1',
          name: 'Gerador principal',
          client: {
            id: 'client-1',
            companyName: 'Cliente Teste',
            tradeName: null,
          },
        },
        contract: {
          id: 'contract-1',
          code: 'CTR-1',
          title: null,
          costCenterId: 'center-1',
        },
        technician: {
          user: { id: 'user-1', name: 'Tecnico', hourCost: 100 },
        },
        materials: [
          {
            id: 'material-1',
            quantity: 2,
            unitCost: 50,
            appliedAt: new Date(),
            catalogItem: { id: 'item-1', name: 'Filtro', sku: 'SKU-1' },
          },
        ],
        timeEntries: [
          {
            id: 'time-1',
            transitMinutes: 30,
            workMinutes: 60,
            extraMinutes: 0,
            nightMinutes: 0,
            user: { id: 'user-1', name: 'Tecnico', hourCost: 100 },
          },
        ],
        receivableEntries: [{ id: 'ar-1', netAmount: 500, paidAmount: 300 }],
        commissions: [{ id: 'commission-1', amount: 25 }],
      },
    ]);
    database.costCenter.findMany.mockResolvedValue([
      {
        id: 'center-1',
        code: 'CC-1',
        name: 'Contrato CTR-1',
        client: null,
        contract: {
          id: 'contract-1',
          code: 'CTR-1',
          title: null,
          client: {
            id: 'client-1',
            companyName: 'Cliente Teste',
            tradeName: null,
          },
        },
        generator: null,
        entries: [
          { entryType: 'REVENUE', sourceType: 'ACCOUNTS_RECEIVABLE', sourceId: 'ar-1', amount: 500 },
          { entryType: 'COST', sourceType: 'TIME_ENTRY', sourceId: 'time-1', amount: 100 },
          { entryType: 'COST', sourceType: 'MAINTENANCE_ORDER_MATERIAL', sourceId: 'material-1', amount: 100 },
          { entryType: 'EXPENSE', sourceType: 'ACCOUNTS_PAYABLE', sourceId: 'ap-1', amount: 50 },
          { entryType: 'EXPENSE', sourceType: 'MANUAL', sourceId: 'manual-1', amount: 25 },
        ],
      },
    ]);
    database.commissionEntry.findMany.mockResolvedValue([
      {
        id: 'commission-1', amount: 25, contractId: 'contract-1',
        maintenanceOrderId: 'order-1',
        maintenanceOrder: { costCenterId: 'center-1' },
        contract: { costCenterId: 'center-1' },
      },
    ]);
    database.accountsReceivable.findMany.mockResolvedValue([
      { id: 'ar-1', costCenterId: 'center-1', maintenanceOrderId: 'order-1', netAmount: 500, paidAmount: 300 },
    ]);
    database.purchaseOrder.aggregate.mockResolvedValue({
      _count: { _all: 2 },
      _sum: { totalAmount: 1000 },
    });

    const result = await service.overview({
      from: '2026-08-01',
      to: '2026-08-31',
    });

    expect(result.summary).toEqual(
      expect.objectContaining({
        orders: 1,
        hours: 1,
        transitHours: 0.5,
        revenue: 500,
        receivedRevenue: 300,
        laborCost: 100,
        materialCost: 100,
        purchaseCost: 50,
        commissionCost: 25,
        otherCost: 25,
        totalCost: 300,
        result: 200,
        marginPercent: 40,
      }),
    );
    expect(result.orders[0]).toEqual(
      expect.objectContaining({ laborCost: 150, materialCost: 100 }),
    );
    expect(result.clients[0]).toEqual(
      expect.objectContaining({ id: 'client-1', result: 200 }),
    );
    expect(result.purchases).toEqual({
      count: 2,
      total: 1000,
      allocatedToCostCenters: 50,
    });
  });

  it('rejects an inverted period', async () => {
    await expect(
      service.overview({ from: '2026-09-02', to: '2026-09-01' }),
    ).rejects.toThrow('data inicial');
  });
});
