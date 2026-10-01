import { BadRequestException } from '@nestjs/common';
import {
  AccountsReceivableStatus,
  FiscalDocumentKind,
  FiscalDocumentStatus,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { FiscalDocumentsService } from './fiscal-documents.service';

describe('FiscalDocumentsService', () => {
  const company = {
    id: 'issuer-id',
    companyName: 'Manitec',
    cnpj: '12.345.678/0001-90',
    stateRegistration: '123',
    municipalRegistration: '456',
    taxRegime: 'Simples Nacional',
    address: 'Rua A',
    addressNumber: '10',
    district: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    zipCode: '01001-000',
  };
  const client = {
    companyName: 'Cliente',
    cnpj: '11.222.333/0001-44',
    stateRegistration: null,
    municipalRegistration: null,
    address: 'Rua B',
    city: 'São Paulo',
    state: 'SP',
    addresses: [],
  };

  function setup(
    status: AccountsReceivableStatus = AccountsReceivableStatus.OPEN,
  ) {
    const tx = {
      accountsReceivable: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'receivable-id', status, client }),
      },
      companySettings: { findUnique: jest.fn().mockResolvedValue(company) },
      fiscalDocument: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'document-id',
            status: FiscalDocumentStatus.DRAFT,
            ...data,
          }),
        ),
      },
      financialAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-id' }),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((callback: (transaction: typeof tx) => unknown) =>
          callback(tx),
        ),
    } as unknown as DatabaseService;
    return { service: new FiscalDocumentsService(prisma), tx };
  }

  it('creates a non-authorized fiscal draft with an independent item total and audit record', async () => {
    const { service, tx } = setup();
    const result = await service.createDraft({
      receivableId: 'receivable-id',
      issuerCompanyId: 'issuer-id',
      kind: FiscalDocumentKind.NFE,
      items: [
        {
          description: 'Filtro',
          quantity: 2,
          unitAmount: 10.25,
          ncm: '84212300',
          cfop: '5102',
        },
        {
          description: 'Junta',
          quantity: 1,
          unitAmount: 3.5,
          ncm: '40169300',
          cfop: '5102',
        },
      ],
    });
    expect(result.status).toBe(FiscalDocumentStatus.DRAFT);
    expect(result.issuerCompanyId).toBe('issuer-id');
    expect(result.totalAmount.toString()).toBe('24');
    expect(result.issuerSnapshot).toMatchObject({
      cnpj: '12345678000190',
      state: 'SP',
    });
    expect(result.recipientSnapshot).toMatchObject({
      document: '11222333000144',
    });
    expect(result.checklist).toContain(
      'integração fiscal e credenciais de homologação',
    );
    expect(tx.financialAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CREATE_DRAFT',
          entityId: 'document-id',
        }),
      }),
    );
  });

  it('rejects a cancelled receivable before creating a fiscal draft', async () => {
    const { service, tx } = setup(AccountsReceivableStatus.CANCELED);
    await expect(
      service.createDraft({
        receivableId: 'receivable-id',
        issuerCompanyId: 'issuer-id',
        kind: FiscalDocumentKind.NFSE,
        items: [
          {
            description: 'Serviço',
            quantity: 1,
            unitAmount: 100,
            serviceCode: '14.01',
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.fiscalDocument.create).not.toHaveBeenCalled();
  });

  it('does not accept an issuer that is absent from company settings', async () => {
    const { service, tx } = setup();
    tx.companySettings.findUnique.mockResolvedValue(null);
    await expect(
      service.createDraft({
        receivableId: 'receivable-id',
        issuerCompanyId: 'other-issuer-id',
        kind: FiscalDocumentKind.NFSE,
        items: [{ description: 'Serviço', quantity: 1, unitAmount: 100 }],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.fiscalDocument.create).not.toHaveBeenCalled();
  });
});
