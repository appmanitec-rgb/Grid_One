import { Test, TestingModule } from '@nestjs/testing';
import { AccountsPayableStatus, PurchaseOrderStatus } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PurchaseOrdersService } from './purchase-orders.service';

describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;
  let db: PurchaseOrdersDbMock;
  let auditLogsService: { record: jest.Mock };

  const approvedOrder = {
    id: 'po-1',
    code: 'PO-00001',
    supplierId: 'sup-1',
    status: PurchaseOrderStatus.APPROVED,
    paymentTerm: '30 dias',
    totalAmount: 250,
    items: [
      {
        id: 'poi-1',
        catalogItemId: 'cat-1',
        quantity: 2,
        receivedQty: 0,
        unitPrice: 100,
      },
    ],
    supplier: { id: 'sup-1' },
  };

  beforeEach(async () => {
    auditLogsService = { record: jest.fn() };
    db = {
      $transaction: jest.fn((cb: (tx: PurchaseOrdersDbMock) => unknown) =>
        cb(db),
      ),
      purchaseOrder: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      purchaseOrderItem: {
        update: jest.fn(),
        findMany: jest.fn(),
      },
      purchaseOrderReceipt: {
        create: jest.fn(),
      },
      warehouse: {
        findUnique: jest.fn(),
      },
      inventoryBalance: {
        upsert: jest.fn(),
        update: jest.fn(),
      },
      inventoryMovement: {
        create: jest.fn(),
      },
      catalogItem: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      accountsPayable: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      supplier: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
        { provide: DatabaseService, useValue: db },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    service = module.get(PurchaseOrdersService);
  });

  function mockSuccessfulReceive(existingPayable?: { id: string }) {
    db.purchaseOrder.findUnique
      .mockResolvedValueOnce(approvedOrder)
      .mockResolvedValueOnce({ ...approvedOrder, payableEntries: [] });
    db.warehouse.findUnique.mockResolvedValue({ id: 'wh-1' });
    db.purchaseOrderItem.update.mockResolvedValue({});
    db.inventoryBalance.upsert.mockResolvedValue({
      id: 'bal-1',
      minQty: 0,
      maxQty: 0,
    });
    db.catalogItem.findUnique.mockResolvedValue({
      averageCost: 50,
      stockCurrent: 1,
    });
    db.catalogItem.update.mockResolvedValue({});
    db.inventoryMovement.create.mockResolvedValue({});
    db.purchaseOrderReceipt.create.mockResolvedValue({ id: 'rec-1' });
    db.purchaseOrderItem.findMany.mockResolvedValue([
      { quantity: 2, receivedQty: 2 },
    ]);
    db.purchaseOrder.update.mockResolvedValue({});
    db.accountsPayable.findFirst.mockResolvedValue(existingPayable ?? null);
    db.accountsPayable.create.mockResolvedValue({
      id: 'ap-1',
      status: AccountsPayableStatus.OPEN,
      amount: 250,
      dueDate: new Date('2026-02-01T00:00:00.000Z'),
    });
  }

  it('creates accounts payable when an approved purchase order is received', async () => {
    mockSuccessfulReceive();

    await service.receive(
      'po-1',
      {
        warehouseId: 'wh-1',
        items: [{ purchaseOrderItemId: 'poi-1', quantity: 2 }],
      },
      'user-1',
    );

    expect(db.accountsPayable.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          purchaseOrderId: 'po-1',
          supplierId: 'sup-1',
          amount: 250,
          status: AccountsPayableStatus.OPEN,
        }),
      }),
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE_FROM_PURCHASE_ORDER',
        entityType: 'ACCOUNTS_PAYABLE',
      }),
      db,
    );
  });

  it('does not duplicate accounts payable when purchase order already has one', async () => {
    mockSuccessfulReceive({ id: 'ap-existing' });

    await service.receive(
      'po-1',
      {
        warehouseId: 'wh-1',
        items: [{ purchaseOrderItemId: 'poi-1', quantity: 2 }],
      },
      'user-1',
    );

    expect(db.accountsPayable.create).not.toHaveBeenCalled();
  });

  it('does not generate accounts payable for canceled purchase order', async () => {
    db.purchaseOrder.findUnique.mockResolvedValue({
      ...approvedOrder,
      status: PurchaseOrderStatus.CANCELED,
    });

    await expect(
      service.receive(
        'po-1',
        {
          warehouseId: 'wh-1',
          items: [{ purchaseOrderItemId: 'poi-1', quantity: 1 }],
        },
        'user-1',
      ),
    ).rejects.toThrow('Pedido cancelado');

    expect(db.accountsPayable.create).not.toHaveBeenCalled();
  });
});

type PurchaseOrdersDbMock = {
  $transaction: jest.Mock;
  purchaseOrder: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  purchaseOrderItem: {
    update: jest.Mock;
    findMany: jest.Mock;
  };
  purchaseOrderReceipt: {
    create: jest.Mock;
  };
  warehouse: {
    findUnique: jest.Mock;
  };
  inventoryBalance: {
    upsert: jest.Mock;
    update: jest.Mock;
  };
  inventoryMovement: {
    create: jest.Mock;
  };
  catalogItem: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  accountsPayable: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  supplier: {
    findUnique: jest.Mock;
  };
};
