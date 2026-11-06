import { BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { FinanceService } from './finance.service';
import { BankCollectionService } from './bank-collection.service';

describe('BankCollectionService: homologação Santander', () => {
  const batchId = '14001b2c-0c8a-4fb9-9124-a99d7f5c9346';
  const agreementId = '02d6ed7e-12fb-46c6-b004-ff236a52e582';
  const batch = {
    agreementId,
    fileName: 'COB033_000001.REM',
    checksumSha256: 'a'.repeat(64),
    createdAt: new Date('2026-10-02T16:00:00Z'),
  };
  const agreement = {
    id: agreementId,
    issuerCompanyId: 'issuer-id',
    updatedAt: new Date('2026-10-02T15:59:00Z'),
  };
  const prisma = {
    bankAccount: { findUnique: jest.fn() },
    companySettings: { findUnique: jest.fn() },
    bankCollectionBatch: { findUnique: jest.fn() },
    bankCollectionAgreement: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      upsert: jest.fn(),
    },
    financialAuditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new BankCollectionService(
    prisma as unknown as DatabaseService,
    {} as FinanceService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.bankCollectionBatch.findUnique.mockResolvedValue(batch);
    prisma.bankAccount.findUnique.mockResolvedValue({
      isActive: true,
      bankName: 'Santander',
      agency: '1234-5',
      accountNumber: '123456789-0',
    });
    prisma.companySettings.findUnique.mockResolvedValue({
      cnpj: '12345678000195',
    });
    prisma.bankCollectionAgreement.findUnique.mockResolvedValue(agreement);
    prisma.bankCollectionAgreement.updateMany.mockResolvedValue({ count: 1 });
    prisma.bankCollectionAgreement.findUniqueOrThrow.mockResolvedValue({
      ...agreement,
      homologated: true,
    });
    prisma.financialAuditLog.create.mockResolvedValue({});
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
  });

  it('exige uma remessa atual do mesmo convênio antes de registrar o teste do banco', async () => {
    prisma.bankCollectionBatch.findUnique.mockResolvedValue({
      ...batch,
      agreementId: 'another',
    });
    await expect(
      service.registerHomologation(agreementId, {
        batchId,
        bankTestReference: 'TESTE-12345',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.bankCollectionAgreement.updateMany).not.toHaveBeenCalled();

    prisma.bankCollectionBatch.findUnique.mockResolvedValue(batch);
    prisma.bankCollectionAgreement.findUnique.mockResolvedValue({
      ...agreement,
      updatedAt: new Date('2026-10-02T17:00:00Z'),
    });
    await expect(
      service.registerHomologation(agreementId, {
        batchId,
        bankTestReference: 'TESTE-12345',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('guarda referência, responsável e hash da remessa testada em auditoria', async () => {
    await service.registerHomologation(
      agreementId,
      {
        batchId,
        bankTestReference: '  TESTE-12345  ',
      },
      'user-id',
    );
    expect(prisma.bankCollectionAgreement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          homologated: true,
          homologationReference: 'TESTE-12345',
          homologatedById: 'user-id',
        }),
      }),
    );
    expect(prisma.financialAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'BANK_TEST_RECORDED',
          payload: expect.objectContaining({
            checksumSha256: batch.checksumSha256,
          }),
        }),
      }),
    );
  });

  it('não registra auditoria de aprovação se o convênio mudar durante a gravação', async () => {
    prisma.bankCollectionAgreement.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.registerHomologation(agreementId, {
        batchId,
        bankTestReference: 'TESTE-12345',
      }),
    ).rejects.toThrow('O convênio mudou durante o registro');
    expect(prisma.financialAuditLog.create).not.toHaveBeenCalled();
  });

  it('recusa convênio que aponta para conta diferente do cadastro bancário', async () => {
    await expect(
      service.saveAgreement({
        bankAccountId: 'account-id',
        issuerCompanyId: 'issuer-id',
        transmissionCode: '123456789012345',
        beneficiaryName: 'MANITEC',
        beneficiaryDocument: '12345678000195',
        agency: '1234',
        agencyDigit: '5',
        accountNumber: '999999999',
        accountDigit: '0',
      }),
    ).rejects.toThrow('Agência e conta do convênio');
    expect(prisma.bankCollectionAgreement.upsert).not.toHaveBeenCalled();
  });
});
