import { Test, TestingModule } from '@nestjs/testing';
import {
  AccountsReceivableStatus,
  BillingAdjustmentIndex,
  ContractStatus,
  GeneratorLifecycleStatus,
  PartsCoverageType,
  PreventiveRecurrence,
  UserRole,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ContractsService } from './contracts.service';

describe('ContractsService', () => {
  let service: ContractsService;
  let db: ContractDbMock;
  let auditLogsService: { record: jest.Mock };

  const startDate = new Date('2026-01-01T00:00:00.000Z');
  const endDate = new Date('2026-01-02T00:00:00.000Z');

  beforeEach(async () => {
    auditLogsService = { record: jest.fn() };
    db = {
      $transaction: jest.fn((cb: (tx: ContractDbMock) => unknown) => cb(db)),
      user: {
        findUnique: jest.fn(),
      },
      serviceContract: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
      generator: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      client: {
        update: jest.fn(),
      },
      contractInvoice: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      contractPreventiveSchedule: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      accountsReceivable: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      commissionEntry: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      costCenterEntry: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: DatabaseService, useValue: db },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    service = module.get(ContractsService);
  });

  function arrangeActiveContract() {
    const contract = {
      id: 'contract-1',
      code: 'CTR-00001',
      clientId: 'client-1',
      createdByUserId: 'sales-1',
      sourceProposal: { userId: 'sales-1' },
      costCenterId: 'cc-1',
      status: ContractStatus.ACTIVE,
      startDate,
      endDate,
      dueDay: 10,
      recurringAmount: 1500,
      preventiveRecurrence: PreventiveRecurrence.MONTHLY,
      equipments: [{ generatorId: 'generator-1' }],
    };

    db.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      role: UserRole.ADMIN,
      linkedClientId: null,
    });
    db.serviceContract.findMany.mockResolvedValue([]);
    db.generator.findMany.mockResolvedValue([
      {
        id: 'generator-1',
        clientId: 'client-1',
        lifecycleStatus: GeneratorLifecycleStatus.AVAILABLE,
      },
    ]);
    db.serviceContract.create.mockResolvedValue(contract);
    db.serviceContract.findUnique
      .mockResolvedValueOnce(contract)
      .mockResolvedValueOnce({ ...contract, invoices: [], schedules: [] });
    db.contractInvoice.createMany.mockResolvedValue({ count: 1 });
    db.contractPreventiveSchedule.createMany.mockResolvedValue({ count: 1 });
    db.accountsReceivable.create.mockResolvedValue({
      id: 'ar-1',
      status: AccountsReceivableStatus.OPEN,
    });
    db.commissionEntry.findFirst.mockResolvedValue(null);
    db.commissionEntry.create.mockResolvedValue({
      id: 'commission-1',
      amount: 30,
    });

    return contract;
  }

  it('creates traceable receivable and preventive schedule when contract is created', async () => {
    arrangeActiveContract();
    db.accountsReceivable.findFirst.mockResolvedValue(null);

    await service.create(
      {
        title: 'Contrato E2E',
        clientId: 'client-1',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        preventiveRecurrence: PreventiveRecurrence.MONTHLY,
        recurringAmount: 1500,
        dueDay: 10,
        adjustmentIndex: BillingAdjustmentIndex.IPCA,
        partsCoverage: PartsCoverageType.BILLED_SEPARATELY,
        equipments: [{ generatorId: 'generator-1' }],
      },
      'admin-1',
    );

    expect(db.contractInvoice.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(db.contractPreventiveSchedule.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(db.accountsReceivable.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          contractId: 'contract-1',
          costCenterId: 'cc-1',
          grossAmount: 1500,
          netAmount: 1500,
          status: AccountsReceivableStatus.OPEN,
        }),
      }),
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE_FROM_CONTRACT',
        entityType: 'ACCOUNTS_RECEIVABLE',
      }),
      db,
    );
    expect(db.commissionEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'sales-1',
          receivableId: 'ar-1',
          contractId: 'contract-1',
          baseAmount: 1500,
          percent: 2,
          amount: 30,
        }),
      }),
    );
  });

  it('updates open receivable instead of duplicating it when contract automation re-runs', async () => {
    arrangeActiveContract();
    db.accountsReceivable.findFirst.mockResolvedValue({
      id: 'ar-existing',
      status: AccountsReceivableStatus.OPEN,
    });

    await service.create(
      {
        title: 'Contrato E2E',
        clientId: 'client-1',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        preventiveRecurrence: PreventiveRecurrence.MONTHLY,
        recurringAmount: 1500,
        dueDay: 10,
        adjustmentIndex: BillingAdjustmentIndex.IPCA,
        partsCoverage: PartsCoverageType.BILLED_SEPARATELY,
        equipments: [{ generatorId: 'generator-1' }],
      },
      'admin-1',
    );

    expect(db.accountsReceivable.create).not.toHaveBeenCalled();
    expect(db.accountsReceivable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ar-existing' },
        data: expect.objectContaining({
          clientId: 'client-1',
          contractId: 'contract-1',
          netAmount: 1500,
        }),
      }),
    );
  });
});

type ContractDbMock = {
  $transaction: jest.Mock;
  user: { findUnique: jest.Mock };
  serviceContract: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
  };
  generator: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  client: { update: jest.Mock };
  contractInvoice: {
    deleteMany: jest.Mock;
    createMany: jest.Mock;
  };
  contractPreventiveSchedule: {
    deleteMany: jest.Mock;
    createMany: jest.Mock;
  };
  accountsReceivable: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  commissionEntry: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  costCenterEntry: {
    create: jest.Mock;
    updateMany: jest.Mock;
  };
};
