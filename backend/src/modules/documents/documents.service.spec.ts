import {
  DeliveryDocumentType,
  DocumentAccessChannel,
  DocumentAccessType,
  UserRole,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { FileStorageService } from '../file-storage/file-storage.service';
import { DocumentGenerationService } from './document-generation.service';
import { DocumentsService } from './documents.service';
import { ProposalPdfService } from './proposal-pdf.service';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: {
    user: { findUnique: jest.Mock };
    companySettings: { findFirst: jest.Mock };
    proposal: { findUnique: jest.Mock };
    documentDelivery: { create: jest.Mock; findFirst: jest.Mock };
    documentAccessLog: { create: jest.Mock };
  };
  let proposalPdfService: { generate: jest.Mock; renderHtml: jest.Mock };
  let documentGenerationService: {
    generateDocx: jest.Mock;
    generatePdfFromDocx: jest.Mock;
    pdfFromDocxStatus: jest.Mock;
  };
  let fileStorage: { saveDocumentPdf: jest.Mock; saveDocumentFile: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      companySettings: { findFirst: jest.fn() },
      proposal: { findUnique: jest.fn() },
      documentDelivery: { create: jest.fn(), findFirst: jest.fn() },
      documentAccessLog: { create: jest.fn() },
    };
    proposalPdfService = {
      generate: jest.fn(),
      renderHtml: jest.fn(),
    };
    documentGenerationService = {
      generateDocx: jest.fn(),
      generatePdfFromDocx: jest.fn(),
      pdfFromDocxStatus: jest.fn().mockReturnValue({
        available: false,
        reason: 'Conversao DOCX para PDF indisponivel.',
      }),
    };
    fileStorage = {
      saveDocumentPdf: jest.fn(),
      saveDocumentFile: jest.fn(),
    };
    service = new DocumentsService(
      prisma as unknown as DatabaseService,
      proposalPdfService as unknown as ProposalPdfService,
      documentGenerationService as unknown as DocumentGenerationService,
      fileStorage as unknown as FileStorageService,
    );

    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      role: UserRole.ADMIN,
      isSystemMaster: false,
      accessPolicy: null,
      linkedClientId: null,
    });
    prisma.companySettings.findFirst.mockResolvedValue({
      companyName: 'MANITEC',
      tradeName: 'MANITEC',
      cnpj: '00.000.000/0001-00',
      phone: null,
      email: 'contato@manitec.test',
      billingEmail: null,
      address: null,
      addressNumber: null,
      district: null,
      city: null,
      state: null,
      zipCode: null,
      logoUrl: null,
      website: null,
      primaryColor: null,
      secondaryColor: null,
    });
    prisma.proposal.findUnique.mockResolvedValue(makeProposal());
    prisma.documentDelivery.findFirst.mockResolvedValue(null);
    proposalPdfService.generate.mockReturnValue({
      buffer: Buffer.from('%PDF-1.4\nProposta Comercial PROP-1\n%%EOF'),
      html: '<main><h1>Proposta Comercial PROP-1</h1></main>',
      templateKey: 'proposal/manitec-default-v1',
      templateVersion: 'manitec-default-v1',
      templateSchema: {},
      fileName: 'proposta-PROP-1.pdf',
    });
    fileStorage.saveDocumentPdf.mockResolvedValue({
      storageKey: 'documents/proposal-pdfs/2026/07/file.pdf',
      fileName: 'proposta-PROP-1.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 40,
      checksumSha256: 'hash-proposal-pdf',
    });
    prisma.documentDelivery.create.mockResolvedValue({ id: 'delivery-1' });
    prisma.documentAccessLog.create.mockResolvedValue({ id: 'access-1' });
    documentGenerationService.generateDocx.mockReturnValue({
      buffer: Buffer.from('PK\u0003\u0004Proposta Comercial PROP-1', 'utf8'),
      fileName: 'proposal-PROP-1.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      checksumSha256: 'docx-hash-1',
      templateKey: 'proposal/manitec-default-v1',
      templateVersion: 'manitec-default-v1',
      context: {},
      template: {},
    });
    documentGenerationService.generatePdfFromDocx.mockResolvedValue({
      buffer: Buffer.from('%PDF-1.4\nProposta Comercial PROP-1\n%%EOF'),
      fileName: 'proposal-PROP-1.pdf',
      mimeType: 'application/pdf',
      checksumSha256: 'institutional-pdf-hash-1',
      templateKey: 'proposal/manitec-default-v1',
      templateVersion: 'manitec-default-v1',
      sourceDocxChecksumSha256: 'docx-hash-1',
      context: {},
      template: {},
    });
    fileStorage.saveDocumentFile.mockResolvedValue({
      storageKey: 'documents/proposal-docx/2026/07/file.docx',
      fileName: 'proposal-PROP-1.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: 64,
      checksumSha256: 'docx-hash-1',
    });
  });

  it('stores generated proposal PDF with template metadata and audit trail', async () => {
    const file = await service.downloadProposalPdf('proposal-1', 'user-1');

    expect(file.buffer.toString('latin1')).toContain('%PDF-1.4');
    expect(file.documentDeliveryId).toBe('delivery-1');
    expect(file.templateKey).toBe('proposal/manitec-default-v1');
    expect(fileStorage.saveDocumentPdf).toHaveBeenCalledWith(
      'proposal-pdfs',
      'proposta-PROP-1.pdf',
      expect.any(Buffer),
    );
    expect(prisma.documentDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentType: DeliveryDocumentType.PROPOSAL,
        documentId: 'proposal-1',
        fileStorageKey: 'documents/proposal-pdfs/2026/07/file.pdf',
        checksumSha256: 'hash-proposal-pdf',
        payloadSnapshot: expect.objectContaining({
          template: {
            key: 'proposal/manitec-default-v1',
            version: 'manitec-default-v1',
          },
        }),
      }),
    });
    expect(prisma.documentAccessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentType: DeliveryDocumentType.PROPOSAL,
        documentId: 'proposal-1',
        documentDeliveryId: 'delivery-1',
        accessType: DocumentAccessType.PDF_DOWNLOAD,
        channel: DocumentAccessChannel.INTERNAL,
      }),
    });
  });

  it('stores generated proposal DOCX with institutional template metadata', async () => {
    const file = await service.downloadProposalDocx('proposal-1', 'user-1');

    expect(file.buffer.toString('utf8')).toContain('Proposta Comercial PROP-1');
    expect(file.documentDeliveryId).toBe('delivery-1');
    expect(file.templateKey).toBe('proposal/manitec-default-v1');
    expect(documentGenerationService.generateDocx).toHaveBeenCalledWith(
      'proposal',
      expect.objectContaining({
        kind: 'proposal',
        document: expect.objectContaining({ id: 'proposal-1', code: 'PROP-1' }),
      }),
    );
    expect(fileStorage.saveDocumentFile).toHaveBeenCalledWith(
      'proposal-docx',
      'proposal-PROP-1.docx',
      expect.any(Buffer),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(prisma.documentDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentType: DeliveryDocumentType.PROPOSAL,
        documentId: 'proposal-1',
        fileStorageKey: 'documents/proposal-docx/2026/07/file.docx',
        checksumSha256: 'docx-hash-1',
        provider: 'manitec-institutional-docx',
        payloadSnapshot: expect.objectContaining({
          template: {
            key: 'proposal/manitec-default-v1',
            version: 'manitec-default-v1',
          },
          format: 'DOCX',
        }),
      }),
    });
    expect(prisma.documentAccessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentType: DeliveryDocumentType.PROPOSAL,
        documentId: 'proposal-1',
        documentDeliveryId: 'delivery-1',
        accessType: DocumentAccessType.PDF_DOWNLOAD,
        channel: DocumentAccessChannel.INTERNAL,
      }),
    });
  });

  it('stores generated proposal institutional PDF from DOCX with traceability', async () => {
    fileStorage.saveDocumentPdf.mockResolvedValueOnce({
      storageKey: 'documents/proposal-institutional-pdfs/2026/07/file.pdf',
      fileName: 'proposal-PROP-1.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 48,
      checksumSha256: 'institutional-pdf-hash-1',
    });

    const file = await service.downloadProposalInstitutionalPdf(
      'proposal-1',
      'user-1',
    );

    expect(file.buffer.toString('latin1')).toContain('%PDF-1.4');
    expect(file.documentDeliveryId).toBe('delivery-1');
    expect(file.templateKey).toBe('proposal/manitec-default-v1');
    expect(documentGenerationService.generatePdfFromDocx).toHaveBeenCalledWith(
      'proposal',
      expect.objectContaining({
        kind: 'proposal',
        document: expect.objectContaining({ id: 'proposal-1', code: 'PROP-1' }),
      }),
    );
    expect(fileStorage.saveDocumentPdf).toHaveBeenCalledWith(
      'proposal-institutional-pdfs',
      'proposal-PROP-1.pdf',
      expect.any(Buffer),
    );
    expect(prisma.documentDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentType: DeliveryDocumentType.PROPOSAL,
        documentId: 'proposal-1',
        fileStorageKey:
          'documents/proposal-institutional-pdfs/2026/07/file.pdf',
        checksumSha256: 'institutional-pdf-hash-1',
        provider: 'manitec-institutional-docx-pdf',
        payloadSnapshot: expect.objectContaining({
          template: {
            key: 'proposal/manitec-default-v1',
            version: 'manitec-default-v1',
          },
          format: 'PDF',
          generatedFrom: 'DOCX',
          sourceDocxChecksumSha256: 'docx-hash-1',
        }),
      }),
    });
    expect(prisma.documentAccessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentType: DeliveryDocumentType.PROPOSAL,
        documentId: 'proposal-1',
        documentDeliveryId: 'delivery-1',
        accessType: DocumentAccessType.PDF_DOWNLOAD,
        channel: DocumentAccessChannel.INTERNAL,
      }),
    });
  });
});

function makeProposal() {
  return {
    id: 'proposal-1',
    code: 'PROP-1',
    status: 'CLIENT_REVIEW',
    type: 'SALE',
    totalValue: 1000,
    validUntil: new Date('2026-08-17T00:00:00.000Z'),
    revision: 0,
    updatedAt: new Date('2026-07-17T12:00:00.000Z'),
    scope: 'Escopo externo',
    freight: 'Incluso',
    paymentTerm: '30 dias',
    deliveryLeadTimeDays: 10,
    paymentDetails: 'Boleto',
    hasDownPayment: false,
    downPaymentAmount: null,
    installmentCount: null,
    installmentIntervalDays: null,
    firstDueDate: null,
    externalNotes: 'Observacao visivel',
    discount: 100,
    generatedContract: null,
    clientId: 'client-1',
    client: {
      id: 'client-1',
      companyName: 'Cliente Exemplo',
      tradeName: null,
      cnpj: '11.111.111/0001-11',
      contactName: 'Cliente',
      phone: null,
      email: 'cliente@example.test',
      address: null,
      city: 'Sao Paulo',
      state: 'SP',
    },
    generator: null,
    user: {
      id: 'seller-1',
      name: 'Vendas MANITEC',
      email: 'vendas@manitec.test',
    },
    salesOpportunity: null,
    parentProposal: null,
    revisions: [],
    items: [
      {
        id: 'item-1',
        kind: 'HOURLY_SERVICE',
        description: 'Manutencao especializada em campo',
        quantity: 1,
        hours: 4,
        unitPrice: 1000,
        discountPercent: 10,
        hourType: 'ONE_OFF',
        technicianType: 'MID_LEVEL_TECHNICIAN',
        totalPrice: 1000,
        catalogItem: {
          id: 'catalog-1',
          name: 'Servico de manutencao',
          sku: 'SERV-1',
          unit: 'UN',
        },
      },
    ],
  };
}
