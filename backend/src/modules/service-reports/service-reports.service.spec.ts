/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditDomain,
  ChecklistResult,
  DeliveryDocumentType,
  EvidenceType,
  OrderStatus,
  ReportStatus,
  UserRole,
} from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ServiceReportsService } from './service-reports.service';

describe('ServiceReportsService', () => {
  let service: ServiceReportsService;
  let db: any;
  let auditLogsService: { record: jest.Mock };
  let fileStorageService: {
    saveServiceReportFile: jest.Mock;
    load: jest.Mock;
  };

  beforeEach(() => {
    db = createDbMock();
    db.$transaction.mockImplementation((cb: (tx: any) => unknown) => cb(db));
    db.user.findUnique.mockResolvedValue(makeInternalUser());
    db.serviceReportVersion.findUnique.mockResolvedValue(null);
    auditLogsService = { record: jest.fn() };
    fileStorageService = {
      saveServiceReportFile: jest.fn().mockResolvedValue({
        storageKey: 'service-reports/2026/07/evidence.jpg',
        fileName: 'evidence.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 128,
        checksumSha256: 'hash-1',
      }),
      load: jest.fn().mockResolvedValue({
        storageKey: 'service-reports/2026/07/evidence.jpg',
        fileName: 'evidence.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 128,
        checksumSha256: 'hash-1',
        buffer: Buffer.from('file'),
      }),
    };
    service = new ServiceReportsService(
      db,
      auditLogsService as unknown as AuditLogsService,
      fileStorageService as never,
    );
  });

  it('cria relatorio para OS valida herdando cliente/equipamento da OS', async () => {
    db.maintenanceOrder.findUnique.mockResolvedValue(makeOrder());
    db.serviceReport.count.mockResolvedValue(0);
    db.serviceReport.create.mockResolvedValue(makeReport());

    const result = await service.create(
      {
        maintenanceOrderId: 'order-1',
        diagnosis: 'Bateria com baixa tensao.',
        performedServices: 'Teste, limpeza e partida assistida.',
      },
      'user-1',
    );

    expect(result.id).toBe('report-1');
    expect(db.serviceReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'LDT-000001',
          maintenanceOrderId: 'order-1',
          clientId: 'client-1',
          generatorId: 'generator-1',
          createdByUserId: 'user-1',
        }),
      }),
    );
  });

  it('pagina laudos internos com limite seguro', async () => {
    db.serviceReport.findMany.mockResolvedValue([]);

    await service.findAll(
      { page: 3, pageSize: 20, search: 'gerador' },
      'user-1',
    );

    expect(db.serviceReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 40,
        take: 20,
        where: expect.objectContaining({
          OR: expect.any(Array),
        }),
      }),
    );
  });

  it('nao cria relatorio para OS inexistente', async () => {
    db.maintenanceOrder.findUnique.mockResolvedValue(null);

    await expect(
      service.create(
        {
          maintenanceOrderId: 'missing',
          diagnosis: 'Nao encontrado.',
          performedServices: 'Nao executado.',
        },
        'user-1',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('tecnico nao cria relatorio para OS atribuida a outro tecnico', async () => {
    db.user.findUnique.mockResolvedValue(
      makeInternalUser({
        role: UserRole.TECHNICIAN,
        technicianProfile: { id: 'tech-2' },
      }),
    );
    db.maintenanceOrder.findUnique.mockResolvedValue(makeOrder());

    await expect(
      service.create(
        {
          maintenanceOrderId: 'order-1',
          diagnosis: 'Escopo tecnico.',
          performedServices: 'Tentativa bloqueada.',
        },
        'user-tech',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('checklist obrigatorio pendente bloqueia aprovacao', async () => {
    db.serviceReport.findUnique.mockResolvedValue(
      makeReport({
        status: ReportStatus.DRAFT,
        checklistItems: [
          {
            id: 'check-1',
            required: true,
            result: ChecklistResult.PENDING,
            notes: null,
          },
        ],
      }),
    );

    await expect(service.approve('report-1', 'user-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('item NOT_OK exige observacao no checklist', async () => {
    db.serviceReport.findUnique.mockResolvedValue(makeReport());

    await expect(
      service.updateChecklist(
        'report-1',
        {
          items: [
            {
              label: 'Tensao de bateria',
              result: ChecklistResult.NOT_OK,
              required: true,
              sortOrder: 0,
            },
          ],
        },
        'user-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('consulta do portal filtra evidencias visiveis ao cliente', async () => {
    db.user.findUnique.mockResolvedValue(makeClientUser());
    db.serviceReport.findMany.mockResolvedValue([makeReleasedReport()]);

    await service.listCustomerReports('customer-user-1');

    expect(db.serviceReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          evidences: expect.objectContaining({
            where: { customerVisible: true },
          }),
        }),
      }),
    );
  });

  it('evidencia visivel aparece no portal quando relatorio esta liberado', async () => {
    db.user.findUnique.mockResolvedValue(makeClientUser());
    db.serviceReport.findMany.mockResolvedValue([
      makeReleasedReport({
        evidences: [
          makeEvidence({
            id: 'e-visible',
            customerVisible: true,
            storageKey: 'service-reports/2026/07/evidence.jpg',
          }),
        ],
      }),
    ]);

    const reports = await service.listCustomerReports('customer-user-1');

    expect(reports[0].evidences).toHaveLength(1);
    expect(reports[0].evidences[0].id).toBe('e-visible');
    expect(reports[0].evidences[0].hasStoredFile).toBe(true);
    expect(reports[0].evidences[0]).not.toHaveProperty('storageKey');
  });

  it('cliente lista apenas relatorios do proprio clientId', async () => {
    db.user.findUnique.mockResolvedValue(makeClientUser());
    db.serviceReport.findMany.mockResolvedValue([]);

    await service.listCustomerReports('customer-user-1');

    expect(db.serviceReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clientId: 'client-1' }),
      }),
    );
  });

  it('cliente nao acessa relatorio de outro cliente', async () => {
    db.user.findUnique.mockResolvedValue(makeClientUser());
    db.serviceReport.findFirst.mockResolvedValue(null);

    await expect(
      service.getCustomerReport('customer-user-1', 'report-other'),
    ).rejects.toThrow(NotFoundException);
  });

  it('cliente nao acessa relatorio nao liberado', async () => {
    db.user.findUnique.mockResolvedValue(makeClientUser());
    db.serviceReport.findFirst.mockResolvedValue(null);

    await expect(
      service.getCustomerReport('customer-user-1', 'draft-report'),
    ).rejects.toThrow(NotFoundException);

    expect(db.serviceReport.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customerVisible: true,
          status: ReportStatus.RELEASED_TO_CUSTOMER,
        }),
      }),
    );
  });

  it('aprovacao gera AuditLog', async () => {
    db.serviceReport.findUnique.mockResolvedValue(
      makeReport({
        status: ReportStatus.DRAFT,
        checklistItems: [
          {
            id: 'check-1',
            required: true,
            result: ChecklistResult.OK,
            notes: 'Conferido.',
          },
        ],
      }),
    );
    db.serviceReport.update.mockResolvedValue(
      makeReport({ status: ReportStatus.APPROVED }),
    );

    await service.approve('report-1', 'user-1');

    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: AuditDomain.SERVICE_REPORTS,
        action: 'APPROVE',
      }),
      db,
    );
    expect(db.serviceReportVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportId: 'report-1',
          versionNumber: 1,
        }),
      }),
    );
  });

  it('liberacao ao cliente gera documento e AuditLog', async () => {
    db.serviceReport.findUnique.mockResolvedValue(
      makeReport({ status: ReportStatus.APPROVED }),
    );
    db.documentDelivery.create.mockResolvedValue({
      id: 'delivery-1',
      documentType: DeliveryDocumentType.SERVICE_REPORT,
    });
    db.serviceReport.update
      .mockResolvedValueOnce(
        makeReport({
          status: ReportStatus.APPROVED,
          validationToken: 'token-1',
          documentHash: 'hash-1',
        }),
      )
      .mockResolvedValueOnce(makeReleasedReport());

    await service.releaseToCustomer('report-1', 'user-1');

    expect(db.documentDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentType: DeliveryDocumentType.SERVICE_REPORT,
          documentId: 'report-1',
          clientId: 'client-1',
        }),
      }),
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RELEASE_TO_CUSTOMER' }),
      db,
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DOCUMENT_REGISTERED' }),
      db,
    );
  });

  it('upload fisico de evidencia salva metadados e AuditLog', async () => {
    db.serviceReport.findUnique.mockResolvedValue(makeReport());
    db.serviceReport.findUniqueOrThrow.mockResolvedValue(
      makeReport({
        evidences: [
          makeEvidence({
            storageKey: 'service-reports/2026/07/evidence.jpg',
            checksumSha256: 'hash-1',
          }),
        ],
      }),
    );

    await service.uploadEvidence(
      'report-1',
      { type: EvidenceType.PHOTO, title: 'Foto do quadro' },
      {
        originalname: 'evidence.jpg',
        mimetype: 'image/jpeg',
        size: 128,
        buffer: Buffer.from([0xff, 0xd8, 0xff]),
      },
      'user-1',
    );

    expect(fileStorageService.saveServiceReportFile).toHaveBeenCalled();
    expect(db.serviceReportEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storageKey: 'service-reports/2026/07/evidence.jpg',
          checksumSha256: 'hash-1',
        }),
      }),
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EVIDENCE_UPLOADED' }),
      db,
    );
  });

  it('cliente nao baixa evidencia interna', async () => {
    db.user.findUnique.mockResolvedValue(makeClientUser());
    db.serviceReport.findFirst.mockResolvedValue({
      id: 'report-1',
      evidences: [],
    });

    await expect(
      service.downloadCustomerEvidence(
        'customer-user-1',
        'report-1',
        'evidence-internal',
      ),
    ).rejects.toThrow(NotFoundException);

    expect(db.serviceReport.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          evidences: expect.objectContaining({
            where: expect.objectContaining({ customerVisible: true }),
          }),
        }),
      }),
    );
  });

  it('cliente nao baixa evidencia de outro cliente', async () => {
    db.user.findUnique.mockResolvedValue(makeClientUser());
    db.serviceReport.findFirst.mockResolvedValue(null);

    await expect(
      service.downloadCustomerEvidence(
        'customer-user-1',
        'report-other-client',
        'evidence-1',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('link publico expirado nao funciona', async () => {
    db.serviceReportShareLink.findUnique.mockResolvedValue({
      id: 'link-1',
      reportId: 'report-1',
      revokedAt: null,
      expiresAt: new Date('2026-07-01T00:00:00.000Z'),
      report: makeReleasedReport({ validationToken: 'token-1' }),
    });

    await expect(service.getPublicSharedReport('raw-token')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('link publico revogado nao funciona', async () => {
    db.serviceReportShareLink.findUnique.mockResolvedValue({
      id: 'link-1',
      reportId: 'report-1',
      revokedAt: new Date('2026-07-10T00:00:00.000Z'),
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      report: makeReleasedReport({ validationToken: 'token-1' }),
    });

    await expect(service.getPublicSharedReport('raw-token')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('token publico invalido nao valida laudo', async () => {
    db.serviceReport.findUnique.mockResolvedValue(null);

    await expect(service.verifyPublicReport('invalid')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('HTML do portal nao expoe notas internas', async () => {
    db.user.findUnique.mockResolvedValue(makeClientUser());
    db.serviceReport.findFirst.mockResolvedValue(
      makeReleasedReport({
        safetyNotes: 'Segredo operacional',
        observations: 'Observacao interna sensivel',
        validationToken: 'token-1',
      }),
    );

    const html = await service.getCustomerPrintableHtml(
      'customer-user-1',
      'report-1',
    );

    expect(html).not.toContain('Segredo operacional');
    expect(html).not.toContain('Observacao interna sensivel');
  });

  it('geracao de documento vincula DocumentDelivery ao laudo', async () => {
    db.serviceReport.findUnique.mockResolvedValue(
      makeReport({ status: ReportStatus.APPROVED }),
    );
    db.serviceReport.update
      .mockResolvedValueOnce(
        makeReport({
          status: ReportStatus.APPROVED,
          validationToken: 'token-1',
          documentHash: 'hash-1',
        }),
      )
      .mockResolvedValueOnce(
        makeReport({
          status: ReportStatus.APPROVED,
          generatedDocumentId: 'delivery-1',
          validationToken: 'token-1',
          documentHash: 'hash-1',
        }),
      );
    db.documentDelivery.create.mockResolvedValue({
      id: 'delivery-1',
      documentType: DeliveryDocumentType.SERVICE_REPORT,
    });

    const result = await service.generateDocument('report-1', 'user-1');

    expect(result.documentDeliveryId).toBe('delivery-1');
    expect(db.serviceReport.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ generatedDocumentId: 'delivery-1' }),
      }),
    );
  });

  it('relatorio liberado aparece no portal', async () => {
    db.user.findUnique.mockResolvedValue(makeClientUser());
    db.serviceReport.findMany.mockResolvedValue([makeReleasedReport()]);

    const reports = await service.listCustomerReports('customer-user-1');

    expect(reports).toHaveLength(1);
    expect(reports[0].status).toBe(ReportStatus.RELEASED_TO_CUSTOMER);
  });

  it('relatorio cancelado deixa de ficar visivel ao cliente', async () => {
    db.serviceReport.findUnique.mockResolvedValue(
      makeReport({ status: ReportStatus.RELEASED_TO_CUSTOMER }),
    );
    db.serviceReport.update.mockResolvedValue(
      makeReport({ status: ReportStatus.CANCELED, customerVisible: false }),
    );

    const result = await service.cancel(
      'report-1',
      { reason: 'Revisao tecnica.' },
      'user-1',
    );

    expect(result.customerVisible).toBe(false);
    expect(db.serviceReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ReportStatus.CANCELED,
          customerVisible: false,
        }),
      }),
    );
  });

  it('documento interno nao aparece no portal sem customerVisible', async () => {
    db.user.findUnique.mockResolvedValue(makeClientUser());
    db.serviceReport.findMany.mockResolvedValue([]);

    await service.listCustomerReports('customer-user-1');

    expect(db.serviceReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customerVisible: true,
          status: ReportStatus.RELEASED_TO_CUSTOMER,
        }),
      }),
    );
  });

  it('assinatura registra signedAt e AuditLog', async () => {
    const signed = makeReport({
      signedAt: new Date('2026-07-10T12:00:00.000Z'),
      signedByName: 'Ana Cliente',
    });
    db.serviceReport.findUnique.mockResolvedValue(makeReport());
    db.serviceReport.update.mockResolvedValue(signed);

    await service.sign(
      'report-1',
      { signedByName: 'Ana Cliente', signedByDocument: '123' },
      'user-1',
      { ip: '127.0.0.1', userAgent: 'jest' },
    );

    expect(db.serviceReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          signedAt: expect.any(Date),
          signedByName: 'Ana Cliente',
        }),
      }),
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SIGNED' }),
      db,
    );
  });
});

function createDbMock() {
  return {
    $transaction: jest.fn(),
    user: { findUnique: jest.fn() },
    maintenanceOrder: { findUnique: jest.fn() },
    serviceReport: {
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    serviceReportChecklistItem: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    serviceReportEvidence: {
      create: jest.fn(),
    },
    serviceReportVersion: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    serviceReportShareLink: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    documentDelivery: {
      create: jest.fn(),
    },
  };
}

function makeInternalUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    role: UserRole.MANAGER,
    isActive: true,
    technicianProfile: null,
    ...overrides,
  };
}

function makeClientUser() {
  return {
    id: 'customer-user-1',
    role: UserRole.CLIENT,
    isActive: true,
    linkedClientId: 'client-1',
    linkedClient: { id: 'client-1' },
  };
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    title: 'OS preventiva',
    status: OrderStatus.IN_PROGRESS,
    generatorId: 'generator-1',
    generator: {
      id: 'generator-1',
      name: 'GMG 500',
      clientId: 'client-1',
      currentSiteId: 'site-1',
    },
    siteId: 'site-1',
    contractId: 'contract-1',
    technicianId: 'tech-1',
    contract: { id: 'contract-1', clientId: 'client-1' },
    technician: { id: 'tech-1' },
    serviceReport: null,
    ...overrides,
  };
}

function makeReport(overrides: Record<string, unknown> = {}) {
  return {
    id: 'report-1',
    code: 'LDT-000001',
    maintenanceOrderId: 'order-1',
    clientId: 'client-1',
    generatorId: 'generator-1',
    siteId: 'site-1',
    contractId: 'contract-1',
    technicianId: 'tech-1',
    status: ReportStatus.DRAFT,
    title: 'Laudo tecnico',
    diagnosis: 'Diagnostico tecnico.',
    performedServices: 'Servico realizado.',
    recommendations: 'Recomendacao.',
    observations: 'Observacao interna.',
    safetyNotes: 'Nota interna.',
    customerNotes: 'Observacao ao cliente.',
    signedAt: null,
    signedByName: null,
    signedByDocument: null,
    signatureData: null,
    customerVisible: false,
    releasedToCustomerAt: null,
    generatedDocumentId: null,
    maintenanceOrder: {
      id: 'order-1',
      title: 'OS preventiva',
      status: OrderStatus.IN_PROGRESS,
    },
    client: {
      id: 'client-1',
      companyName: 'Cliente Um Ltda',
      tradeName: 'Cliente Um',
    },
    generator: { id: 'generator-1', name: 'GMG 500' },
    site: { id: 'site-1', name: 'Base A' },
    contract: { id: 'contract-1', code: 'CTR-1', title: 'Contrato' },
    technician: { id: 'tech-1', user: { id: 'tech-user', name: 'Tecnico' } },
    generatedDocument: null,
    checklistItems: [],
    evidences: [],
    createdAt: new Date('2026-07-10T10:00:00.000Z'),
    updatedAt: new Date('2026-07-10T10:00:00.000Z'),
    ...overrides,
  };
}

function makeReleasedReport(overrides: Record<string, unknown> = {}) {
  return makeReport({
    status: ReportStatus.RELEASED_TO_CUSTOMER,
    customerVisible: true,
    releasedToCustomerAt: new Date('2026-07-10T11:00:00.000Z'),
    generatedDocumentId: 'delivery-1',
    generatedDocument: {
      id: 'delivery-1',
      documentType: DeliveryDocumentType.SERVICE_REPORT,
      documentCode: 'LDT-000001',
      documentTitle: 'Laudo tecnico',
      createdAt: new Date('2026-07-10T11:00:00.000Z'),
    },
    ...overrides,
  });
}

function makeEvidence(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evidence-1',
    type: EvidenceType.PHOTO,
    title: 'Foto do painel',
    description: 'Painel apos manutencao.',
    fileUrl: 'https://example.com/evidence.jpg',
    fileName: 'evidence.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 123,
    customerVisible: false,
    createdAt: new Date('2026-07-10T10:30:00.000Z'),
    ...overrides,
  };
}
