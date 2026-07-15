import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AccountsReceivableStatus,
  CommissionStatus,
  ContractInvoiceStatus,
  PaymentMethod,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import type { PayAccountsReceivableDto } from './dto/finance.dto';
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
        update: jest.fn(),
        aggregate: jest.fn(),
      },
      accountsReceivablePayment: {
        findFirst: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
      },
      accountsPayable: {
        aggregate: jest.fn(),
      },
      accountsPayablePayment: {
        aggregate: jest.fn(),
      },
      bankAccount: {
        findUnique: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
      },
      contractInvoice: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      commissionEntry: {
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      costCenterEntry: {
        create: jest.fn(),
        findMany: jest.fn(),
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

  it('requires an active bank account to pay receivable', async () => {
    db.accountsReceivable.findUnique.mockResolvedValue(
      receivableFixture({ status: AccountsReceivableStatus.OPEN }),
    );

    await expect(
      service.payReceivable('ar-1', {
        amount: 100,
        method: PaymentMethod.PIX,
      } as PayAccountsReceivableDto),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.accountsReceivablePayment.create).not.toHaveBeenCalled();
  });

  it('pays receivable, moves bank balance, releases commission and audits action', async () => {
    db.accountsReceivable.findUnique.mockResolvedValue(
      receivableFixture({ contractId: 'contract-1' }),
    );
    db.bankAccount.findUnique.mockResolvedValue({
      id: 'bank-1',
      isActive: true,
    });
    db.accountsReceivablePayment.create.mockResolvedValue({ id: 'pay-1' });
    db.accountsReceivable.update.mockResolvedValue({
      id: 'ar-1',
      paidAmount: 1000,
      status: AccountsReceivableStatus.PAID,
    });
    db.contractInvoice.findFirst.mockResolvedValue({
      id: 'invoice-1',
      status: ContractInvoiceStatus.PENDING,
    });
    db.contractInvoice.update.mockResolvedValue({ id: 'invoice-1' });
    db.commissionEntry.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.payReceivable(
      'ar-1',
      {
        amount: 1000,
        method: PaymentMethod.TRANSFER,
        bankAccountId: 'bank-1',
      },
      'finance-user',
    );

    expect(result).toEqual(
      expect.objectContaining({ status: AccountsReceivableStatus.PAID }),
    );
    expect(db.accountsReceivablePayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          receivableId: 'ar-1',
          bankAccountId: 'bank-1',
          amount: 1000,
        }),
      }),
    );
    expect(db.bankAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bank-1' },
        data: { currentBalance: { increment: 1000 } },
      }),
    );
    expect(db.accountsReceivable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AccountsReceivableStatus.PAID,
          commissionReleased: true,
        }),
      }),
    );
    expect(db.commissionEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          receivableId: 'ar-1',
          status: CommissionStatus.PENDING,
        },
      }),
    );
    expect(db.financialAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: 'ACCOUNTS_RECEIVABLE',
          entityId: 'ar-1',
          action: 'PAY',
        }),
      }),
    );
  });

  it('blocks overpayment to receivable', async () => {
    db.accountsReceivable.findUnique.mockResolvedValue(
      receivableFixture({ paidAmount: 250 }),
    );
    db.bankAccount.findUnique.mockResolvedValue({
      id: 'bank-1',
      isActive: true,
    });

    await expect(
      service.payReceivable('ar-1', {
        amount: 900,
        method: PaymentMethod.TRANSFER,
        bankAccountId: 'bank-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.accountsReceivablePayment.create).not.toHaveBeenCalled();
  });

  it('reverses receivable payment with bank movement and commission rollback', async () => {
    db.accountsReceivablePayment.findFirst
      .mockResolvedValueOnce({
        id: 'pay-1',
        receivableId: 'ar-1',
        bankAccountId: 'bank-1',
        amount: 1000,
        method: PaymentMethod.TRANSFER,
      })
      .mockResolvedValueOnce(null);
    db.accountsReceivable.findUnique.mockResolvedValue(
      receivableFixture({
        status: AccountsReceivableStatus.PAID,
        paidAmount: 1000,
        contractId: 'contract-1',
      }),
    );
    db.accountsReceivablePayment.create.mockResolvedValue({
      id: 'reversal-1',
      amount: -1000,
    });
    db.accountsReceivable.update.mockResolvedValue({
      id: 'ar-1',
      paidAmount: 0,
      status: AccountsReceivableStatus.OPEN,
    });
    db.contractInvoice.findFirst.mockResolvedValue({
      id: 'invoice-1',
      dueDate: new Date('2026-12-10T00:00:00.000Z'),
    });
    db.contractInvoice.update.mockResolvedValue({ id: 'invoice-1' });
    db.commissionEntry.updateMany.mockResolvedValue({ count: 1 });

    await service.reverseReceivablePayment(
      'ar-1',
      'pay-1',
      { reason: 'Erro de conciliacao' },
      'finance-user',
    );

    expect(db.accountsReceivablePayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          receivableId: 'ar-1',
          bankAccountId: 'bank-1',
          amount: -1000,
          notes: expect.stringContaining('Estorno da baixa pay-1'),
        }),
      }),
    );
    expect(db.bankAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bank-1' },
        data: { currentBalance: { decrement: 1000 } },
      }),
    );
    expect(db.commissionEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          receivableId: 'ar-1',
          status: CommissionStatus.RELEASED,
          paidAt: null,
        },
        data: {
          status: CommissionStatus.PENDING,
          releasedAt: null,
        },
      }),
    );
  });

  it('does not reverse the same payment twice', async () => {
    db.accountsReceivablePayment.findFirst
      .mockResolvedValueOnce({
        id: 'pay-1',
        receivableId: 'ar-1',
        bankAccountId: 'bank-1',
        amount: 1000,
        method: PaymentMethod.TRANSFER,
      })
      .mockResolvedValueOnce({ id: 'reversal-1' });

    await expect(
      service.reverseReceivablePayment('ar-1', 'pay-1', {
        reason: 'Duplicado',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.accountsReceivable.update).not.toHaveBeenCalled();
  });
});

function receivableFixture(
  patch: Partial<{
    status: AccountsReceivableStatus;
    paidAmount: number;
    contractId: string | null;
  }> = {},
) {
  return {
    id: 'ar-1',
    clientId: 'client-1',
    contractId: patch.contractId ?? null,
    maintenanceOrderId: null,
    costCenterId: 'cc-1',
    description: 'Titulo de teste',
    competenceDate: new Date('2026-01-01T00:00:00.000Z'),
    dueDate: new Date('2026-02-10T00:00:00.000Z'),
    grossAmount: 1000,
    discountAmount: 0,
    interestAmount: 0,
    penaltyAmount: 0,
    netAmount: 1000,
    paidAmount: patch.paidAmount ?? 0,
    status: patch.status ?? AccountsReceivableStatus.OPEN,
    lastChargeEmailAt: null,
    canceledAt: null,
    cancelReason: null,
    commissionReleased: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

type FinanceDbMock = {
  $transaction: jest.Mock;
  maintenanceOrder: {
    findUnique: jest.Mock;
  };
  accountsReceivable: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    aggregate: jest.Mock;
  };
  accountsReceivablePayment: {
    findFirst: jest.Mock;
    create: jest.Mock;
    aggregate: jest.Mock;
  };
  accountsPayable: {
    aggregate: jest.Mock;
  };
  accountsPayablePayment: {
    aggregate: jest.Mock;
  };
  bankAccount: {
    findUnique: jest.Mock;
    update: jest.Mock;
    aggregate: jest.Mock;
  };
  contractInvoice: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  commissionEntry: {
    findFirst: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  costCenterEntry: {
    create: jest.Mock;
    findMany: jest.Mock;
  };
  financialAuditLog: {
    create: jest.Mock;
  };
};
