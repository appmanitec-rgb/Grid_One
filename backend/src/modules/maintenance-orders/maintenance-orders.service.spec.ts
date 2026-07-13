import { Test, TestingModule } from '@nestjs/testing';
import { InventoryMovementType, OrderStatus, UserRole } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { MaintenanceOrdersService } from './maintenance-orders.service';

describe('MaintenanceOrdersService', () => {
  let service: MaintenanceOrdersService;
  let db: MaintenanceOrdersDbMock;
  let internals: MaintenanceOrdersServiceInternals;
  let auditLogsService: { record: jest.Mock };

  beforeEach(async () => {
    auditLogsService = { record: jest.fn() };
    db = {
      maintenanceOrder: {
        findUnique: jest.fn(),
      },
      inventoryBalance: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      catalogItem: {
        update: jest.fn(),
      },
      inventoryMovement: {
        create: jest.fn(),
      },
      maintenanceOrderMaterial: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      costCenterEntry: {
        create: jest.fn(),
      },
      timeEntry: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      technicianWorkSession: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceOrdersService,
        { provide: DatabaseService, useValue: db },
        {
          provide: ApprovalsService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: AuditLogsService,
          useValue: auditLogsService,
        },
      ],
    }).compile();

    service = module.get<MaintenanceOrdersService>(MaintenanceOrdersService);
    internals = service as unknown as MaintenanceOrdersServiceInternals;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('consumes stock when finished order has unapplied material', async () => {
    db.maintenanceOrder.findUnique
      .mockResolvedValueOnce({
        id: 'os-1',
        title: 'OS teste',
        status: OrderStatus.COMPLETED,
        costCenterId: 'cc-1',
        materials: [
          {
            id: 'mat-1',
            catalogItemId: 'cat-1',
            warehouseId: 'wh-1',
            quantity: 2,
            unitCost: 10,
            catalogItem: {
              id: 'cat-1',
              name: 'Filtro',
              stockCurrent: 5,
              averageCost: 9,
              costPrice: 8,
              lastCost: 10,
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        id: 'os-1',
        status: OrderStatus.COMPLETED,
        technician: null,
      });
    db.inventoryBalance.findUnique.mockResolvedValue({
      id: 'bal-1',
      physicalQty: 5,
      reservedQty: 2,
    });

    await internals.finalizeCompletedOrder(db, 'os-1', 'user-1');

    expect(db.inventoryBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bal-1' },
        data: expect.objectContaining({
          physicalQty: { decrement: 2 },
          reservedQty: { decrement: 2 },
        }),
      }),
    );
    expect(db.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: InventoryMovementType.OS_CONSUMPTION,
          referenceType: 'MAINTENANCE_ORDER',
          referenceId: 'os-1',
        }),
      }),
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'OS_STOCK_CONSUMED' }),
      db,
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'FINALIZE' }),
      db,
    );
  });

  it('does not consume stock twice when materials are already applied', async () => {
    db.maintenanceOrder.findUnique
      .mockResolvedValueOnce({
        id: 'os-1',
        title: 'OS teste',
        status: OrderStatus.COMPLETED,
        costCenterId: null,
        materials: [],
      })
      .mockResolvedValueOnce({
        id: 'os-1',
        status: OrderStatus.COMPLETED,
        technician: null,
      });

    await internals.finalizeCompletedOrder(db, 'os-1', 'user-1');

    expect(db.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('does not consume stock from canceled order', async () => {
    db.maintenanceOrder.findUnique.mockResolvedValue({
      id: 'os-1',
      title: 'OS cancelada',
      status: OrderStatus.CANCELED,
      costCenterId: null,
      materials: [
        {
          id: 'mat-1',
          catalogItemId: 'cat-1',
          warehouseId: 'wh-1',
          quantity: 1,
          catalogItem: { stockCurrent: 1 },
        },
      ],
    });

    await expect(
      internals.consumeOrderMaterials(db, 'os-1', 'user-1'),
    ).rejects.toThrow('OS cancelada');

    expect(db.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('releases reserved material without making reserved balance negative', async () => {
    db.maintenanceOrderMaterial.findMany.mockResolvedValue([
      {
        id: 'mat-1',
        warehouseId: 'wh-1',
        catalogItemId: 'cat-1',
        quantity: 5,
      },
    ]);
    db.inventoryBalance.findUnique.mockResolvedValue({
      id: 'bal-1',
      reservedQty: 3,
    });

    await internals.releaseMaterialsByOrder(db, 'os-1');

    expect(db.inventoryBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bal-1' },
        data: { reservedQty: { decrement: 3 } },
      }),
    );
    expect(db.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: InventoryMovementType.RELEASE,
          quantity: 3,
          referenceId: 'os-1',
        }),
      }),
    );
  });

  it('blocks technician from finishing OS with open check-in', async () => {
    db.technicianWorkSession.findFirst.mockResolvedValue({ id: 'session-1' });

    await expect(
      internals.assertTechnicianOrderUpdateScope(
        {
          role: UserRole.TECHNICIAN,
          technicianProfile: { id: 'tech-1' },
        },
        { id: 'os-1', technicianId: 'tech-1' },
        { status: OrderStatus.COMPLETED },
      ),
    ).rejects.toThrow('Finalize o check-out');
  });

  it('does not block manager override when OS has open check-in', async () => {
    await expect(
      internals.assertTechnicianOrderUpdateScope(
        {
          role: UserRole.MANAGER,
          technicianProfile: null,
        },
        { id: 'os-1', technicianId: 'tech-1' },
        { status: OrderStatus.COMPLETED },
      ),
    ).resolves.toBeUndefined();

    expect(db.technicianWorkSession.findFirst).not.toHaveBeenCalled();
  });
});

type MaintenanceOrdersDbMock = {
  maintenanceOrder: {
    findUnique: jest.Mock;
  };
  inventoryBalance: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  catalogItem: {
    update: jest.Mock;
  };
  inventoryMovement: {
    create: jest.Mock;
  };
  maintenanceOrderMaterial: {
    findMany: jest.Mock;
    update: jest.Mock;
  };
  costCenterEntry: {
    create: jest.Mock;
  };
  timeEntry: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  technicianWorkSession: {
    findFirst: jest.Mock;
  };
};

type MaintenanceOrdersServiceInternals = {
  finalizeCompletedOrder(
    tx: MaintenanceOrdersDbMock,
    orderId: string,
    actorUserId?: string,
  ): Promise<void>;
  consumeOrderMaterials(
    tx: MaintenanceOrdersDbMock,
    orderId: string,
    actorUserId?: string,
  ): Promise<void>;
  releaseMaterialsByOrder(
    tx: MaintenanceOrdersDbMock,
    orderId: string,
  ): Promise<void>;
  assertTechnicianOrderUpdateScope(
    actor: {
      role: UserRole;
      technicianProfile?: { id: string } | null;
    } | null,
    current: { id: string; technicianId: string | null },
    dto: { status?: OrderStatus },
  ): Promise<void>;
};
