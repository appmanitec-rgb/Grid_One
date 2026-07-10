import { Test, TestingModule } from '@nestjs/testing';
import { AccountsReceivableStatus } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { FinanceService } from './finance.service';

describe('FinanceService', () => {
  let service: FinanceService;
  let db: FinanceDbMock;
  let auditLogsService: { record: jest.Mock };

  beforeEach(async () => {
    auditLogsService = { record: jest.fn() };
    db = {
      $transaction: jest.fn((cb: (tx: FinanceDbMock) => unknown) => cb(db)),
      maintenanceOrder: {
        findUnique: jest.fn(),
      },
      accountsReceivable: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      costCenterEntry: {
        create: jest.fn(),
      },
      financialAuditLog: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinanceService,
        { provide: DatabaseService, useValue: db },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    service = module.get(FinanceService);
  });

  it('creates traceable receivable from maintenance order', async () => {
    db.maintenanceOrder.findUnique.mockResolvedValue({
      id: 'os-1',
      title: 'OS teste',
      status: 'COMPLETED',
      costCenterId: 'cc-1',
      generator: { clientId: 'client-1' },
    });
    db.accountsReceivable.findFirst.mockResolvedValue(null);
    db.accountsReceivable.create.mockResolvedValue({
      id: 'ar-1',
      status: AccountsReceivableStatus.OPEN,
    });

    await service.createReceivableFromOrder(
      'os-1',
      { amount: 500, dueDate: '2026-02-10T00:00:00.000Z' },
      'user-1',
    );

    expect(db.accountsReceivable.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          maintenanceOrderId: 'os-1',
          costCenterId: 'cc-1',
          grossAmount: 500,
          netAmount: 500,
          status: AccountsReceivableStatus.OPEN,
        }),
      }),
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE_FROM_MAINTENANCE_ORDER',
        entityType: 'ACCOUNTS_RECEIVABLE',
      }),
      db,
    );
  });

  it('does not duplicate receivable from the same maintenance order', async () => {
    db.maintenanceOrder.findUnique.mockResolvedValue({
      id: 'os-1',
      title: 'OS teste',
      status: 'COMPLETED',
      costCenterId: null,
      generator: { clientId: 'client-1' },
    });
    db.accountsReceivable.findFirst.mockResolvedValue({ id: 'ar-existing' });
    db.accountsReceivable.findUnique.mockResolvedValue({ id: 'ar-existing' });

    const result = await service.createReceivableFromOrder(
      'os-1',
      { amount: 500, dueDate: '2026-02-10T00:00:00.000Z' },
      'user-1',
    );

    expect(result).toEqual({ id: 'ar-existing' });
    expect(db.accountsReceivable.create).not.toHaveBeenCalled();
  });
});

type FinanceDbMock = {
  $transaction: jest.Mock;
  maintenanceOrder: {
    findUnique: jest.Mock;
  };
  accountsReceivable: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  costCenterEntry: {
    create: jest.Mock;
  };
  financialAuditLog: {
    create: jest.Mock;
  };
};
