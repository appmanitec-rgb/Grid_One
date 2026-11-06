import { DatabaseService } from '../../database/database.service';
import { FinanceService } from './finance.service';
import { BankCollectionService } from './bank-collection.service';
import * as cnab from './santander-cnab240';

describe('BankCollectionService: prévia de retorno', () => {
  it('confere vínculos e tarifas sem alterar títulos ou contas a receber', async () => {
    const content = Buffer.from('retorno de teste');
    const agreement = {
      id: 'agreement-id',
      beneficiaryDocument: '12345678000195',
    };
    const prisma = {
      bankCollectionAgreement: {
        findUnique: jest.fn().mockResolvedValue(agreement),
      },
      bankCollectionReturnImport: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      bankCollectionTitle: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'title-id',
            ourNumber: '0000000000019',
            documentNumber: 'NF-123',
            status: 'REGISTERED',
          },
        ]),
        update: jest.fn(),
      },
      accountsReceivable: { update: jest.fn() },
      financialAuditLog: { create: jest.fn() },
    };
    const parser = jest.spyOn(cnab, 'parseSantanderCollectionReturn');
    parser.mockReturnValueOnce([
      {
        lineNumber: 3,
        movementCode: '06',
        ourNumber: '0000000000019',
        documentNumber: 'NF-123',
        companyReference: '',
        nominalAmount: 100,
        paidAmount: 100,
        netCreditAmount: 98,
        eventDate: new Date('2026-10-02T00:00:00Z'),
        reasonCodes: '',
      },
      {
        lineNumber: 5,
        movementCode: '03',
        ourNumber: '0000000000027',
        documentNumber: 'NF-999',
        companyReference: '',
        nominalAmount: 50,
        paidAmount: 0,
        netCreditAmount: 0,
        eventDate: null,
        reasonCodes: '01',
      },
    ]);
    try {
      const service = new BankCollectionService(
        prisma as unknown as DatabaseService,
        {} as FinanceService,
      );
      const result = await service.previewReturn({
        bankAccountId: 'account-id',
        content,
      });
      expect(result).toMatchObject({
        alreadyImported: false,
        eventCount: 2,
        matchedCount: 1,
        reviewCount: 2,
      });
      expect(result.events[0]).toMatchObject({
        titleId: 'title-id',
        requiresReview: true,
      });
      expect(result.events[1]).toMatchObject({
        titleId: null,
        requiresReview: true,
      });
      expect(prisma.bankCollectionReturnImport.create).not.toHaveBeenCalled();
      expect(prisma.bankCollectionTitle.update).not.toHaveBeenCalled();
      expect(prisma.accountsReceivable.update).not.toHaveBeenCalled();
      expect(prisma.financialAuditLog.create).not.toHaveBeenCalled();
    } finally {
      parser.mockRestore();
    }
  });
});
