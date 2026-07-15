import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AccountsReceivableStatus,
  BankReconciliationClosingStatus,
  BankReconciliationIssueStatus,
  BankReconciliationIssueType,
  BankMovementOriginType,
  BankMovementType,
  BankStatementEntryMatchStatus,
  BankStatementFileType,
  BankStatementImportStatus,
  CommissionStatus,
  ContractInvoiceStatus,
  FinancialPaymentStatus,
  FinancialPeriodStatus,
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
        update: jest.fn(),
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
        findMany: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
      },
      bankMovement: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      bankStatementImport: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      bankImportProfile: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      bankStatementEntry: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      bankReconciliationIssue: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      bankReconciliationClosing: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      financialPeriodClosing: {
        findUnique: jest.fn(),
      },
      commissionRule: {
        findFirst: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
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
    db.bankReconciliationIssue.findMany.mockResolvedValue([]);
    db.bankReconciliationIssue.count.mockResolvedValue(0);
    db.bankReconciliationClosing.findUnique.mockResolvedValue(null);
    db.bankReconciliationClosing.findFirst.mockResolvedValue(null);

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
    db.financialPeriodClosing.findUnique.mockResolvedValue(null);
    db.bankMovement.findUnique.mockResolvedValue(null);
    db.bankMovement.create.mockResolvedValue({
      id: 'movement-1',
      type: BankMovementType.CREDIT,
      amount: 1000,
    });
    db.accountsReceivablePayment.create.mockResolvedValue({ id: 'pay-1' });
    db.accountsReceivablePayment.update.mockResolvedValue({ id: 'pay-1' });
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
    expect(db.bankMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bankAccountId: 'bank-1',
          type: BankMovementType.CREDIT,
          amount: 1000,
          originType: BankMovementOriginType.ACCOUNTS_RECEIVABLE_PAYMENT,
          originId: 'pay-1',
          receivableId: 'ar-1',
          receivablePaymentId: 'pay-1',
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
        paidAt: new Date('2026-02-10T12:00:00.000Z'),
        status: FinancialPaymentStatus.POSTED,
        originalMovementId: 'movement-1',
      })
      .mockResolvedValueOnce(null);
    db.financialPeriodClosing.findUnique.mockResolvedValue(null);
    db.bankMovement.findFirst.mockResolvedValue({
      id: 'movement-1',
      reconciledAt: null,
    });
    db.bankMovement.findUnique.mockResolvedValue(null);
    db.bankMovement.create.mockResolvedValue({
      id: 'reversal-movement-1',
      type: BankMovementType.DEBIT,
      amount: 1000,
    });
    db.bankMovement.update.mockResolvedValue({ id: 'movement-1' });
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
    db.accountsReceivablePayment.update.mockResolvedValue({ id: 'pay-1' });
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
          status: FinancialPaymentStatus.REVERSAL,
          originalPaymentId: 'pay-1',
          originalMovementId: 'movement-1',
          notes: expect.stringContaining('Estorno da baixa pay-1'),
        }),
      }),
    );
    expect(db.bankMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bankAccountId: 'bank-1',
          type: BankMovementType.DEBIT,
          amount: 1000,
          originType: BankMovementOriginType.REVERSAL,
          originId: 'reversal-1',
          receivableId: 'ar-1',
          receivablePaymentId: 'reversal-1',
          reversalOfMovementId: 'movement-1',
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
        paidAt: new Date('2026-02-10T12:00:00.000Z'),
        status: FinancialPaymentStatus.POSTED,
      })
      .mockResolvedValueOnce({ id: 'reversal-1' });

    await expect(
      service.reverseReceivablePayment('ar-1', 'pay-1', {
        reason: 'Duplicado',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.accountsReceivable.update).not.toHaveBeenCalled();
  });

  it('blocks receivable payment when financial period is closed', async () => {
    db.accountsReceivable.findUnique.mockResolvedValue(
      receivableFixture({ status: AccountsReceivableStatus.OPEN }),
    );
    db.bankAccount.findUnique.mockResolvedValue({
      id: 'bank-1',
      isActive: true,
    });
    db.financialPeriodClosing.findUnique.mockResolvedValue({
      id: 'period-1',
      status: FinancialPeriodStatus.CLOSED,
    });

    await expect(
      service.payReceivable('ar-1', {
        amount: 100,
        method: PaymentMethod.TRANSFER,
        bankAccountId: 'bank-1',
        paidAt: '2026-02-10T12:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.accountsReceivablePayment.create).not.toHaveBeenCalled();
    expect(db.bankMovement.create).not.toHaveBeenCalled();
  });

  it('reconciles and unreconciles bank movement with audit trail', async () => {
    db.bankMovement.findUnique
      .mockResolvedValueOnce({
        id: 'movement-1',
        bankAccountId: 'bank-1',
        movementDate: new Date('2026-02-10T12:00:00.000Z'),
        reconciledAt: null,
      })
      .mockResolvedValueOnce({
        id: 'movement-1',
        bankAccountId: 'bank-1',
        movementDate: new Date('2026-02-10T12:00:00.000Z'),
        reconciledAt: new Date('2026-02-10T12:00:00.000Z'),
      });
    db.bankMovement.update
      .mockResolvedValueOnce({
        id: 'movement-1',
        reconciledAt: new Date('2026-02-10T12:00:00.000Z'),
      })
      .mockResolvedValueOnce({ id: 'movement-1', reconciledAt: null });

    await service.reconcileBankMovement(
      'movement-1',
      { reconciliationReference: 'OFX-123' },
      'finance-user',
    );
    await service.unreconcileBankMovement(
      'movement-1',
      { reason: 'Divergencia no extrato' },
      'finance-user',
    );

    expect(db.bankMovement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'movement-1' },
        data: expect.objectContaining({
          reconciliationReference: 'OFX-123',
          reconciledById: 'finance-user',
        }),
      }),
    );
    expect(db.financialAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: 'BANK_MOVEMENT',
          action: 'UNRECONCILE',
          reason: 'Divergencia no extrato',
        }),
      }),
    );
  });

  it('blocks direct update of posted bank movement', async () => {
    db.bankMovement.findUnique.mockResolvedValue({ id: 'movement-1' });

    await expect(
      service.updateBankMovement('movement-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns bank statement with opening balance and running balance', async () => {
    db.bankAccount.findMany.mockResolvedValue([
      { id: 'bank-1', initialBalance: 100 },
    ]);
    db.bankMovement.findMany.mockResolvedValue([
      {
        id: 'movement-1',
        type: BankMovementType.CREDIT,
        amount: 250,
        movementDate: new Date('2026-02-10T12:00:00.000Z'),
        createdAt: new Date('2026-02-10T12:00:00.000Z'),
      },
      {
        id: 'movement-2',
        type: BankMovementType.DEBIT,
        amount: 40,
        movementDate: new Date('2026-02-11T12:00:00.000Z'),
        createdAt: new Date('2026-02-11T12:00:00.000Z'),
      },
    ]);

    const result = await service.listBankMovements({ bankAccountId: 'bank-1' });

    expect(result.openingBalance).toBe(100);
    expect(result.finalBalance).toBe(310);
    expect(result.entries.at(-1)).toEqual(
      expect.objectContaining({ runningBalance: 310 }),
    );
  });

  it('imports valid CSV bank statement entries and audits import', async () => {
    db.bankAccount.findUnique.mockResolvedValue({
      id: 'bank-1',
      isActive: true,
    });
    db.bankStatementImport.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'import-1',
        entries: [{ id: 'entry-1' }],
      });
    db.bankStatementImport.create.mockResolvedValue({ id: 'import-1' });
    db.bankStatementEntry.create.mockResolvedValue({ id: 'entry-1' });

    await service.importBankStatement(
      'bank-1',
      {
        fileName: 'extrato.csv',
        fileType: BankStatementFileType.CSV,
        content:
          'data;descricao;valor;referencia\n10/02/2026;PIX Cliente;100,00;FIT-1',
      },
      'finance-user',
    );

    expect(db.bankStatementEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          importId: 'import-1',
          bankAccountId: 'bank-1',
          amount: 100,
          type: BankMovementType.CREDIT,
          externalId: 'FIT-1',
        }),
      }),
    );
    expect(db.financialAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: 'BANK_STATEMENT_IMPORT',
          action: 'IMPORT_STATEMENT',
        }),
      }),
    );
  });

  it('rejects duplicated bank statement import by checksum', async () => {
    db.bankAccount.findUnique.mockResolvedValue({
      id: 'bank-1',
      isActive: true,
    });
    db.bankStatementImport.findUnique.mockResolvedValue({ id: 'import-1' });

    await expect(
      service.importBankStatement('bank-1', {
        fileName: 'extrato.csv',
        fileType: BankStatementFileType.CSV,
        content: 'data;descricao;valor\n10/02/2026;PIX Cliente;100,00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.bankStatementEntry.create).not.toHaveBeenCalled();
  });

  it('imports comma CSV with ISO date and decimal point', async () => {
    db.bankAccount.findUnique.mockResolvedValue({
      id: 'bank-1',
      isActive: true,
    });
    db.bankStatementImport.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'import-1', entries: [{ id: 'entry-1' }] });
    db.bankStatementImport.create.mockResolvedValue({ id: 'import-1' });
    db.bankStatementEntry.create.mockResolvedValue({ id: 'entry-1' });

    await service.importBankStatement('bank-1', {
      fileName: 'extrato.csv',
      fileType: BankStatementFileType.CSV,
      content:
        'data,descricao,valor,referencia\n2026-02-10,PIX Cliente,100.50,FIT-2',
    });

    expect(db.bankStatementEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 100.5,
          type: BankMovementType.CREDIT,
          normalizedDescription: 'pix cliente',
          normalizedReference: 'fit2',
        }),
      }),
    );
  });

  it('imports CSV with configured bank import profile column mapping', async () => {
    db.bankImportProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      name: 'Itau CSV perfil alternativo',
      fileType: BankStatementFileType.CSV,
      active: true,
      dateFormat: 'YYYY-MM-DD',
      decimalSeparator: '.',
      amountMode: 'SIGNED',
      columnMapping: {
        date: 'posted_on',
        description: 'history',
        amount: 'transaction_value',
        type: 'nature',
        documentNumber: 'doc_id',
        reference: 'bank_id',
      },
      matchingConfig: null,
    });
    db.bankAccount.findUnique.mockResolvedValue({
      id: 'bank-1',
      isActive: true,
    });
    db.bankStatementImport.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'import-1', entries: [{ id: 'entry-1' }] });
    db.bankStatementImport.create.mockResolvedValue({ id: 'import-1' });
    db.bankStatementEntry.create.mockResolvedValue({ id: 'entry-1' });

    await service.importBankStatement('bank-1', {
      fileName: 'itau.csv',
      fileType: BankStatementFileType.CSV,
      profileId: 'profile-1',
      content:
        'posted_on,history,transaction_value,nature,doc_id,bank_id\n2026-07-12,RECEBIMENTO CLIENTE,2200.50,CREDIT,NF2048,ITAU-2048',
    });

    expect(db.bankStatementImport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ profileId: 'profile-1' }),
      }),
    );
    expect(db.bankStatementEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 2200.5,
          type: BankMovementType.CREDIT,
          documentNumber: 'NF2048',
          externalId: 'ITAU-2048',
        }),
      }),
    );
  });

  it('imports CSV negative amount as debit and rejects invalid date', async () => {
    db.bankAccount.findUnique.mockResolvedValue({
      id: 'bank-1',
      isActive: true,
    });
    db.bankStatementImport.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'import-1', entries: [{ id: 'entry-1' }] });
    db.bankStatementImport.create.mockResolvedValue({ id: 'import-1' });
    db.bankStatementEntry.create.mockResolvedValue({ id: 'entry-1' });

    await service.importBankStatement('bank-1', {
      fileName: 'extrato.csv',
      fileType: BankStatementFileType.CSV,
      content:
        'data;descricao;valor;documento\n10/02/2026;Tarifa bancaria;-17,89;TAR-1',
    });

    expect(db.bankStatementEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 17.89,
          type: BankMovementType.DEBIT,
          normalizedDocumentNumber: 'TAR1',
        }),
      }),
    );

    await expect(
      service.importBankStatement('bank-1', {
        fileName: 'extrato.csv',
        fileType: BankStatementFileType.CSV,
        content: 'data;descricao;valor\n31/02/2026;PIX Cliente;100,00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('imports OFX without FITID using safe fallback and debit sign', async () => {
    db.bankAccount.findUnique.mockResolvedValue({
      id: 'bank-1',
      isActive: true,
    });
    db.bankStatementImport.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'import-1', entries: [{ id: 'entry-1' }] });
    db.bankStatementImport.create.mockResolvedValue({ id: 'import-1' });
    db.bankStatementEntry.create.mockResolvedValue({ id: 'entry-1' });

    await service.importBankStatement('bank-1', {
      fileName: 'extrato.ofx',
      fileType: BankStatementFileType.OFX,
      content:
        '<OFX><BANKTRANLIST><STMTTRN><TRNAMT>-25.12<DTPOSTED>20260210<MEMO>Tarifa Banco</BANKTRANLIST></OFX>',
    });

    expect(db.bankStatementEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 25.12,
          type: BankMovementType.DEBIT,
          description: 'Tarifa Banco',
          externalId: expect.any(String),
        }),
      }),
    );
  });

  it('imports initial limited CNAB detail fixture', async () => {
    db.bankAccount.findUnique.mockResolvedValue({
      id: 'bank-1',
      isActive: true,
    });
    db.bankStatementImport.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'import-1', entries: [{ id: 'entry-1' }] });
    db.bankStatementImport.create.mockResolvedValue({ id: 'import-1' });
    db.bankStatementEntry.create.mockResolvedValue({ id: 'entry-1' });

    await service.importBankStatement('bank-1', {
      fileName: 'extrato.rem',
      fileType: BankStatementFileType.CNAB,
      content: cnabFixtureLine(),
    });

    expect(db.bankStatementEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 123.45,
          type: BankMovementType.CREDIT,
        }),
      }),
    );
  });

  it('auto-matches exact statement entry with unreconciled bank movement', async () => {
    db.bankStatementImport.findUnique.mockResolvedValue({
      id: 'import-1',
      fileName: 'extrato.csv',
      entries: [
        {
          id: 'entry-1',
          importId: 'import-1',
          bankAccountId: 'bank-1',
          postedDate: new Date('2026-02-10T00:00:00.000Z'),
          amount: 100,
          type: BankMovementType.CREDIT,
          bankReference: 'FIT-1',
          externalId: 'FIT-1',
        },
      ],
    });
    db.bankMovement.findMany.mockResolvedValueOnce([
      {
        id: 'movement-1',
        bankAccountId: 'bank-1',
        movementDate: new Date('2026-02-10T12:00:00.000Z'),
        amount: 100,
        type: BankMovementType.CREDIT,
        description: 'PIX Cliente',
        originType: BankMovementOriginType.ACCOUNTS_RECEIVABLE_PAYMENT,
        originId: 'FIT-1',
      },
    ]);
    db.bankStatementEntry.update.mockResolvedValue({ id: 'entry-1' });
    db.bankMovement.update.mockResolvedValue({ id: 'movement-1' });
    db.bankStatementEntry.findMany.mockResolvedValue([
      { matchStatus: BankStatementEntryMatchStatus.AUTO_MATCHED },
    ]);
    db.bankStatementImport.update.mockResolvedValue({
      id: 'import-1',
      status: BankStatementImportStatus.RECONCILED,
    });

    const result = await service.autoMatchBankStatement(
      'import-1',
      { dateWindowDays: 1 },
      'finance-user',
    );

    expect(result.autoMatched).toBe(1);
    expect(db.bankStatementEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-1' },
        data: expect.objectContaining({
          matchedMovementId: 'movement-1',
          matchStatus: BankStatementEntryMatchStatus.AUTO_MATCHED,
        }),
      }),
    );
    expect(db.bankMovement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'movement-1' },
        data: expect.objectContaining({
          reconciledById: 'finance-user',
        }),
      }),
    );
  });

  it('blocks ambiguous auto-match without reconciling automatically', async () => {
    db.bankStatementImport.findUnique.mockResolvedValue({
      id: 'import-1',
      fileName: 'extrato.csv',
      entries: [
        {
          id: 'entry-1',
          importId: 'import-1',
          bankAccountId: 'bank-1',
          postedDate: new Date('2026-02-10T00:00:00.000Z'),
          amount: 100,
          type: BankMovementType.CREDIT,
          description: 'PIX Cliente',
          normalizedDescription: 'pix cliente',
        },
      ],
    });
    db.bankMovement.findMany.mockResolvedValueOnce([
      {
        id: 'movement-1',
        bankAccountId: 'bank-1',
        type: BankMovementType.CREDIT,
        amount: 100,
        description: 'PIX Cliente',
        originType: BankMovementOriginType.ACCOUNTS_RECEIVABLE_PAYMENT,
        originId: 'pay-1',
        movementDate: new Date('2026-02-10T09:00:00.000Z'),
      },
      {
        id: 'movement-2',
        bankAccountId: 'bank-1',
        type: BankMovementType.CREDIT,
        amount: 100,
        description: 'PIX Cliente',
        originType: BankMovementOriginType.ACCOUNTS_RECEIVABLE_PAYMENT,
        originId: 'pay-2',
        movementDate: new Date('2026-02-10T10:00:00.000Z'),
      },
    ]);
    db.bankReconciliationIssue.create.mockResolvedValue({ id: 'issue-1' });
    db.bankStatementEntry.findMany.mockResolvedValue([
      { matchStatus: BankStatementEntryMatchStatus.UNMATCHED },
    ]);
    db.bankStatementImport.update.mockResolvedValue({
      id: 'import-1',
      status: BankStatementImportStatus.IMPORTED,
    });

    const result = await service.autoMatchBankStatement('import-1');

    expect(result.ambiguous).toBe(1);
    expect(db.bankStatementEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-1' },
        data: expect.objectContaining({
          suggestedMovementId: 'movement-1',
        }),
      }),
    );
    expect(db.bankStatementEntry.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          matchStatus: BankStatementEntryMatchStatus.AUTO_MATCHED,
        }),
      }),
    );
    expect(db.bankReconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: BankReconciliationIssueType.POSSIBLE_MATCH_AMBIGUOUS,
        }),
      }),
    );
  });

  it('returns scored suggestions for unmatched statement entry', async () => {
    db.bankStatementEntry.findUnique.mockResolvedValue({
      id: 'entry-1',
      importId: 'import-1',
      bankAccountId: 'bank-1',
      postedDate: new Date('2026-02-10T00:00:00.000Z'),
      amount: 100,
      type: BankMovementType.CREDIT,
      description: 'PIX Cliente Demo',
      normalizedDescription: 'pix cliente demo',
      normalizedReference: 'fit1',
      matchStatus: BankStatementEntryMatchStatus.UNMATCHED,
      import: { fileType: BankStatementFileType.CSV, profile: null },
    });
    db.bankMovement.findMany.mockResolvedValue([
      {
        id: 'movement-1',
        bankAccountId: 'bank-1',
        type: BankMovementType.CREDIT,
        amount: 100,
        movementDate: new Date('2026-02-10T12:00:00.000Z'),
        description: 'PIX Cliente Demo',
        originType: BankMovementOriginType.ACCOUNTS_RECEIVABLE_PAYMENT,
        originId: 'FIT-1',
        reconciledAt: null,
      },
    ]);

    const result = await service.suggestBankStatementEntryMatches('entry-1');

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toEqual(
      expect.objectContaining({
        score: expect.any(Number),
        reason: expect.stringContaining('score'),
        canAutoMatch: true,
      }),
    );
    expect(db.bankStatementEntry.update).not.toHaveBeenCalled();
  });

  it('manually matches and unmatches statement entry with audit trail', async () => {
    db.bankStatementEntry.findUnique
      .mockResolvedValueOnce({
        id: 'entry-1',
        importId: 'import-1',
        bankAccountId: 'bank-1',
        postedDate: new Date('2026-02-10T00:00:00.000Z'),
        amount: 100,
        type: BankMovementType.CREDIT,
        matchStatus: BankStatementEntryMatchStatus.UNMATCHED,
        matchedMovementId: null,
      })
      .mockResolvedValueOnce({
        id: 'entry-1',
        matchedMovement: { id: 'movement-1' },
      })
      .mockResolvedValueOnce({
        id: 'entry-1',
        importId: 'import-1',
        bankAccountId: 'bank-1',
        postedDate: new Date('2026-02-10T00:00:00.000Z'),
        matchedMovementId: 'movement-1',
      });
    db.bankMovement.findUnique.mockResolvedValue({
      id: 'movement-1',
      bankAccountId: 'bank-1',
      type: BankMovementType.CREDIT,
      amount: 100,
      reconciledAt: null,
    });
    db.financialPeriodClosing.findUnique.mockResolvedValue(null);
    db.bankStatementEntry.findFirst.mockResolvedValue(null);
    db.bankStatementEntry.update.mockResolvedValue({ id: 'entry-1' });
    db.bankMovement.update.mockResolvedValue({ id: 'movement-1' });
    db.bankStatementEntry.findMany.mockResolvedValue([
      { matchStatus: BankStatementEntryMatchStatus.MANUAL_MATCHED },
    ]);
    db.bankStatementImport.update.mockResolvedValue({ id: 'import-1' });
    db.bankReconciliationIssue.create.mockResolvedValue({ id: 'issue-1' });

    await service.matchBankStatementEntry(
      'entry-1',
      { movementId: 'movement-1' },
      'finance-user',
    );
    await service.unmatchBankStatementEntry(
      'entry-1',
      { reason: 'Divergencia revisada' },
      'finance-user',
    );

    expect(db.bankStatementEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          matchStatus: BankStatementEntryMatchStatus.MANUAL_MATCHED,
        }),
      }),
    );
    expect(db.bankReconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: 'Divergencia revisada',
        }),
      }),
    );
  });

  it('ignores statement entry with reason and creates ignored issue', async () => {
    db.bankStatementEntry.findUnique.mockResolvedValue({
      id: 'entry-1',
      importId: 'import-1',
      bankAccountId: 'bank-1',
      postedDate: new Date('2026-02-10T00:00:00.000Z'),
      matchedMovementId: null,
    });
    db.bankStatementEntry.update.mockResolvedValue({
      id: 'entry-1',
      matchStatus: BankStatementEntryMatchStatus.IGNORED,
    });
    db.bankReconciliationIssue.create.mockResolvedValue({ id: 'issue-1' });
    db.bankStatementEntry.findMany.mockResolvedValue([
      { matchStatus: BankStatementEntryMatchStatus.IGNORED },
    ]);
    db.bankStatementImport.update.mockResolvedValue({ id: 'import-1' });

    await service.ignoreBankStatementEntry(
      'entry-1',
      { reason: 'Tarifa bancaria ja contabilizada fora do periodo' },
      'finance-user',
    );

    expect(db.bankReconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: BankReconciliationIssueType.IGNORED_ENTRY,
          status: BankReconciliationIssueStatus.IGNORED,
        }),
      }),
    );
  });

  it('creates controlled manual adjustment from unmatched statement entry', async () => {
    db.bankStatementEntry.findUnique.mockResolvedValue({
      id: 'entry-1',
      importId: 'import-1',
      bankAccountId: 'bank-1',
      postedDate: new Date('2026-02-10T00:00:00.000Z'),
      amount: 25,
      type: BankMovementType.DEBIT,
      bankReference: 'TAR-1',
      externalId: 'TAR-1',
      matchedMovementId: null,
    });
    db.financialPeriodClosing.findUnique.mockResolvedValue(null);
    db.bankMovement.findUnique.mockResolvedValue(null);
    db.bankMovement.create.mockResolvedValue({ id: 'movement-adjustment-1' });
    db.bankAccount.update.mockResolvedValue({ id: 'bank-1' });
    db.bankStatementEntry.update.mockResolvedValue({ id: 'entry-1' });
    db.bankMovement.update.mockResolvedValue({ id: 'movement-adjustment-1' });
    db.bankReconciliationIssue.create.mockResolvedValue({ id: 'issue-1' });
    db.bankStatementEntry.findMany.mockResolvedValue([
      { matchStatus: BankStatementEntryMatchStatus.MANUAL_MATCHED },
    ]);
    db.bankStatementImport.update.mockResolvedValue({ id: 'import-1' });

    const result = await service.createBankAdjustmentFromStatementEntry(
      'entry-1',
      {
        amount: 25,
        type: BankMovementType.DEBIT,
        description: 'Tarifa bancaria importada',
        postedDate: '2026-02-10T00:00:00.000Z',
        reason: 'Tarifa sem titulo interno',
      },
      'finance-user',
    );

    expect(result).toEqual({
      movementId: 'movement-adjustment-1',
      matched: true,
    });
    expect(db.bankMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          originType: BankMovementOriginType.MANUAL_ADJUSTMENT,
          originId: 'entry-1',
        }),
      }),
    );
  });

  it('blocks bank reconciliation closing when period still has open issues', async () => {
    db.bankAccount.findUnique.mockResolvedValue({
      id: 'bank-1',
      name: 'Conta teste',
      initialBalance: 100,
      currentBalance: 200,
    });
    db.bankMovement.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'movement-1',
        type: BankMovementType.CREDIT,
        amount: 100,
        reconciledAt: null,
      },
    ]);
    db.bankStatementEntry.findMany.mockResolvedValue([
      {
        id: 'entry-1',
        type: BankMovementType.CREDIT,
        amount: 100,
        matchStatus: BankStatementEntryMatchStatus.UNMATCHED,
      },
    ]);
    db.bankReconciliationIssue.count.mockResolvedValue(1);

    await expect(
      service.closeBankReconciliation('bank-1', {
        year: 2026,
        month: 2,
        reason: 'Fechamento mensal',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.bankReconciliationClosing.create).not.toHaveBeenCalled();
  });

  it('closes and reopens bank reconciliation period with audit trail', async () => {
    db.bankAccount.findUnique.mockResolvedValue({
      id: 'bank-1',
      name: 'Conta teste',
      initialBalance: 100,
      currentBalance: 200,
    });
    db.bankMovement.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'movement-1',
        type: BankMovementType.CREDIT,
        amount: 100,
        reconciledAt: new Date(),
      },
    ]);
    db.bankStatementEntry.findMany.mockResolvedValue([
      {
        id: 'entry-1',
        type: BankMovementType.CREDIT,
        amount: 100,
        matchStatus: BankStatementEntryMatchStatus.AUTO_MATCHED,
      },
    ]);
    db.bankReconciliationIssue.count.mockResolvedValue(0);
    db.bankReconciliationClosing.create.mockResolvedValue({
      id: 'closing-1',
      bankAccountId: 'bank-1',
      year: 2026,
      month: 2,
      status: BankReconciliationClosingStatus.CLOSED,
    });
    db.bankReconciliationClosing.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'closing-1',
        bankAccountId: 'bank-1',
        year: 2026,
        month: 2,
        status: BankReconciliationClosingStatus.CLOSED,
      });
    db.bankReconciliationClosing.update.mockResolvedValue({
      id: 'closing-1',
      status: BankReconciliationClosingStatus.REOPENED,
    });

    const closing = await service.closeBankReconciliation(
      'bank-1',
      {
        year: 2026,
        month: 2,
        reason: 'Fechamento mensal conferido',
      },
      'finance-user',
    );
    await service.reopenBankReconciliationClosing(
      'closing-1',
      { reason: 'Revisao solicitada' },
      'finance-user',
    );

    expect(closing.id).toBe('closing-1');
    expect(db.bankReconciliationClosing.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bankAccountId: 'bank-1',
          status: BankReconciliationClosingStatus.CLOSED,
          ledgerClosingBalance: 200,
        }),
      }),
    );
    expect(db.bankReconciliationClosing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: BankReconciliationClosingStatus.REOPENED,
          reopenReason: 'Revisao solicitada',
        }),
      }),
    );
  });

  it('blocks statement match when bank reconciliation period is closed', async () => {
    db.bankStatementEntry.findUnique.mockResolvedValue({
      id: 'entry-1',
      importId: 'import-1',
      bankAccountId: 'bank-1',
      postedDate: new Date('2026-02-10T00:00:00.000Z'),
      amount: 100,
      type: BankMovementType.CREDIT,
      matchStatus: BankStatementEntryMatchStatus.UNMATCHED,
      matchedMovementId: null,
    });
    db.bankMovement.findUnique.mockResolvedValue({
      id: 'movement-1',
      bankAccountId: 'bank-1',
      type: BankMovementType.CREDIT,
      amount: 100,
      reconciledAt: null,
      status: 'POSTED',
    });
    db.bankStatementEntry.findFirst.mockResolvedValue(null);
    db.financialPeriodClosing.findUnique.mockResolvedValue(null);
    db.bankReconciliationClosing.findUnique.mockResolvedValue({
      id: 'closing-1',
      status: BankReconciliationClosingStatus.CLOSED,
    });

    await expect(
      service.matchBankStatementEntry('entry-1', { movementId: 'movement-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.bankStatementEntry.update).not.toHaveBeenCalled();
  });

  it('audits materialized bank balance against posted ledger', async () => {
    db.bankAccount.findUnique.mockResolvedValue({
      id: 'bank-1',
      name: 'Conta teste',
      bankName: 'Banco teste',
      initialBalance: 100,
      currentBalance: 350,
    });
    db.bankMovement.findMany.mockResolvedValue([
      {
        type: BankMovementType.CREDIT,
        amount: 300,
        movementDate: new Date('2026-02-10T00:00:00.000Z'),
      },
      {
        type: BankMovementType.DEBIT,
        amount: 50,
        movementDate: new Date('2026-02-11T00:00:00.000Z'),
      },
    ]);
    db.bankMovement.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    const audit = await service.auditBankAccountBalance('bank-1');

    expect(audit.ledgerCalculatedBalance).toBe(350);
    expect(audit.difference).toBe(0);
    expect(audit.status).toBe('OK');
    expect(audit.reversedMovements).toBe(1);
    expect(audit.unreconciledMovements).toBe(2);
  });

  it('returns reconciliation report totals and issue counters', async () => {
    db.bankAccount.findUnique.mockResolvedValue({
      id: 'bank-1',
      name: 'Conta teste',
      initialBalance: 100,
      currentBalance: 225,
    });
    db.bankMovement.findMany
      .mockResolvedValueOnce([{ type: BankMovementType.CREDIT, amount: 50 }])
      .mockResolvedValueOnce([
        {
          id: 'movement-1',
          type: BankMovementType.CREDIT,
          amount: 100,
          reconciledAt: new Date(),
        },
        {
          id: 'movement-2',
          type: BankMovementType.DEBIT,
          amount: 25,
          reconciledAt: null,
        },
      ])
      .mockResolvedValueOnce([
        { type: BankMovementType.CREDIT, amount: 150 },
        { type: BankMovementType.DEBIT, amount: 25 },
      ]);
    db.bankMovement.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    db.bankStatementEntry.findMany.mockResolvedValue([
      {
        id: 'entry-1',
        matchStatus: BankStatementEntryMatchStatus.AUTO_MATCHED,
      },
      { id: 'entry-2', matchStatus: BankStatementEntryMatchStatus.UNMATCHED },
    ]);
    db.bankReconciliationIssue.findMany.mockResolvedValue([
      { id: 'issue-1', status: BankReconciliationIssueStatus.OPEN },
      { id: 'issue-2', status: BankReconciliationIssueStatus.RESOLVED },
    ]);
    db.bankReconciliationClosing.findUnique.mockResolvedValue({
      id: 'bank-closing-1',
      status: 'CLOSED',
      closedAt: new Date(),
      difference: 0,
      unreconciledMovementsCount: 0,
      unreconciledEntriesCount: 0,
      openIssuesCount: 0,
    });

    const report = await service.reconciliationReport({
      bankAccountId: 'bank-1',
      from: '2026-02-01T00:00:00.000Z',
      to: '2026-02-28T23:59:59.999Z',
    });

    expect(report.totals.openingBalance).toBe(150);
    expect(report.totals.finalBalance).toBe(225);
    expect(report.totals.unmatchedStatementEntries).toBe(1);
    expect(report.totals.openIssues).toBe(1);
    expect(report.balanceAudit.status).toBe('OK');
  });
});

function cnabFixtureLine() {
  const chars = Array.from('0'.repeat(240));
  chars[13] = '2';
  writeAt(chars, 37, '12345678900000000000');
  writeAt(chars, 93, '10022026');
  writeAt(chars, 119, '000000000012345');
  return chars.join('');
}

function writeAt(chars: string[], start: number, value: string) {
  [...value].forEach((char, index) => {
    chars[start + index] = char;
  });
}

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
    update: jest.Mock;
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
    findMany: jest.Mock;
    update: jest.Mock;
    aggregate: jest.Mock;
  };
  bankMovement: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    aggregate: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  bankStatementImport: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  bankImportProfile: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  bankStatementEntry: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  bankReconciliationIssue: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  bankReconciliationClosing: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  financialPeriodClosing: {
    findUnique: jest.Mock;
  };
  commissionRule: {
    findFirst: jest.Mock;
  };
  user: {
    findUnique: jest.Mock;
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
