import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import {
  AuditDomain,
  ChecklistResult,
  DeliveryChannel,
  DeliveryDocumentType,
  DeliveryStatus,
  DocumentAccessChannel,
  DocumentAccessResult,
  DocumentAccessType,
  OrderStatus,
  Prisma,
  ReportStatus,
  UserRole,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  FileStorageService,
  LoadedFile,
  StoredFile,
} from '../file-storage/file-storage.service';
import {
  AddServiceReportEvidenceDto,
  AcceptServiceReportDto,
  ArchiveServiceReportDocumentDto,
  CancelServiceReportDto,
  CreateServiceReportShareLinkDto,
  CreateServiceReportDto,
  ListServiceReportsQueryDto,
  RevokeServiceReportDocumentDto,
  RevokeServiceReportShareLinkDto,
  ReviseReleasedServiceReportDto,
  SignServiceReportDto,
  UpdateServiceReportRetentionDto,
  UpdateServiceReportChecklistDto,
  UpdateServiceReportDto,
  UploadServiceReportEvidenceDto,
} from './dto/service-report.dto';
import {
  PdfTemplateSection,
  ServiceReportPdfService,
} from './service-report-pdf.service';

type RequestMetadata = {
  ip?: string;
  userAgent?: string | string[];
};

type UploadFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

type CustomerScope = {
  userId: string;
  clientId: string;
};

type InternalActor = {
  id: string;
  role: UserRole;
  technicianId?: string | null;
};

type DocumentAccessInput = {
  documentId?: string | null;
  documentDeliveryId?: string | null;
  serviceReportId?: string | null;
  evidenceId?: string | null;
  userId?: string | null;
  clientId?: string | null;
  shareLinkId?: string | null;
  accessType: DocumentAccessType;
  channel: DocumentAccessChannel;
  result: DocumentAccessResult;
  metadata?: RequestMetadata;
};

type ReportMap = Record<string, unknown> & {
  evidences?: Array<Record<string, unknown> & { customerVisible?: boolean }>;
  generatedDocument?:
    | (Record<string, unknown> & {
        id?: unknown;
        documentType?: unknown;
        documentCode?: unknown;
        documentTitle?: unknown;
        fileName?: unknown;
        mimeType?: unknown;
        sizeBytes?: unknown;
        checksumSha256?: unknown;
        storedAt?: unknown;
        fileStorageKey?: unknown;
        createdAt?: unknown;
      })
    | null;
};

const EDITABLE_REPORT_STATUSES: ReportStatus[] = [
  ReportStatus.DRAFT,
  ReportStatus.IN_REVIEW,
];

@Injectable()
export class ServiceReportsService {
  constructor(
    private readonly prisma: DatabaseService,
    private readonly auditLogsService: AuditLogsService,
    @Optional()
    private readonly fileStorageService?: FileStorageService,
    @Optional()
    private readonly serviceReportPdfService?: ServiceReportPdfService,
  ) {}

  async findAll(query: ListServiceReportsQueryDto, actorUserId?: string) {
    const actor = await this.assertInternalActor(actorUserId);
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 100)));
    const search = query.search?.trim();
    const where: Prisma.ServiceReportWhereInput = {
      status: query.status,
      clientId: query.clientId,
      maintenanceOrderId: query.maintenanceOrderId,
      generatorId: query.generatorId,
      technicianId:
        actor.role === UserRole.TECHNICIAN
          ? this.requireActorTechnicianId(actor)
          : query.technicianId,
      customerVisible:
        query.customerVisible === undefined
          ? undefined
          : query.customerVisible === 'true',
      createdAt:
        query.dateFrom || query.dateTo
          ? {
              gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
              lte: query.dateTo ? new Date(query.dateTo) : undefined,
            }
          : undefined,
      OR: search
        ? [
            { code: { contains: search, mode: 'insensitive' } },
            { title: { contains: search, mode: 'insensitive' } },
            { diagnosis: { contains: search, mode: 'insensitive' } },
            { performedServices: { contains: search, mode: 'insensitive' } },
            {
              client: {
                companyName: { contains: search, mode: 'insensitive' },
              },
            },
            {
              generator: {
                name: { contains: search, mode: 'insensitive' },
              },
            },
          ]
        : undefined,
    };

    return this.prisma.serviceReport.findMany({
      where,
      include: this.internalInclude(),
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  async findOne(id: string, actorUserId?: string) {
    const actor = await this.assertInternalActor(actorUserId);
    const report = await this.prisma.serviceReport.findUnique({
      where: { id },
      include: this.internalInclude(),
    });
    if (!report) {
      throw new NotFoundException('Relatorio tecnico nao encontrado.');
    }
    this.assertActorReportScope(actor, report);
    return this.withStorageInfo(report);
  }

  async create(dto: CreateServiceReportDto, actorUserId?: string) {
    const actor = await this.assertInternalActor(actorUserId);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.maintenanceOrder.findUnique({
        where: { id: dto.maintenanceOrderId },
        include: {
          generator: {
            select: {
              id: true,
              name: true,
              clientId: true,
              currentSiteId: true,
            },
          },
          site: { select: { id: true } },
          contract: { select: { id: true, clientId: true } },
          technician: { select: { id: true } },
          serviceReport: { select: { id: true } },
        },
      });

      if (!order) {
        throw new NotFoundException('OS nao encontrada.');
      }
      if (
        actor.role === UserRole.TECHNICIAN &&
        order.technicianId !== this.requireActorTechnicianId(actor)
      ) {
        throw new ForbiddenException(
          'Tecnico so pode criar laudo para OS atribuida a ele.',
        );
      }
      if (order.status === OrderStatus.CANCELED) {
        throw new BadRequestException(
          'Nao e possivel criar laudo para OS cancelada.',
        );
      }
      if (order.serviceReport) {
        throw new BadRequestException('Esta OS ja possui relatorio tecnico.');
      }
      if (!order.generator?.clientId) {
        throw new BadRequestException(
          'OS sem cliente vinculado ao equipamento.',
        );
      }
      if (
        order.contract &&
        order.contract.clientId !== order.generator.clientId
      ) {
        throw new BadRequestException(
          'Contrato da OS nao pertence ao mesmo cliente do equipamento.',
        );
      }

      const code = await this.generateCode(tx);
      const report = await tx.serviceReport.create({
        data: {
          code,
          maintenanceOrderId: order.id,
          clientId: order.generator.clientId,
          generatorId: order.generator.id,
          siteId: order.siteId ?? order.generator.currentSiteId ?? null,
          contractId: order.contractId,
          technicianId: order.technicianId,
          title:
            dto.title?.trim() ||
            `Laudo tecnico - ${order.title || order.generator.name}`,
          diagnosis: dto.diagnosis,
          performedServices: dto.performedServices,
          recommendations: dto.recommendations,
          observations: dto.observations,
          safetyNotes: dto.safetyNotes,
          customerNotes: dto.customerNotes,
          startedAt: this.parseDate(dto.startedAt),
          finishedAt: this.parseDate(dto.finishedAt),
          createdByUserId: actor.id,
          updatedByUserId: actor.id,
          checklistItems:
            dto.checklistItems && dto.checklistItems.length > 0
              ? {
                  create: dto.checklistItems.map((item, index) => ({
                    label: item.label,
                    result: item.result,
                    required: item.required ?? false,
                    notes: item.notes,
                    sortOrder: item.sortOrder ?? index,
                  })),
                }
              : undefined,
        },
        include: this.internalInclude(),
      });

      await this.recordAudit(tx, 'CREATE', report.id, actor.id, undefined, {
        code: report.code,
        maintenanceOrderId: report.maintenanceOrderId,
        clientId: report.clientId,
        generatorId: report.generatorId,
      });

      return report;
    });
  }

  async update(id: string, dto: UpdateServiceReportDto, actorUserId?: string) {
    const actor = await this.assertInternalActor(actorUserId);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.getReportForMutation(tx, id);
      this.assertActorReportScope(actor, current);
      this.assertEditable(current.status);

      const updated = await tx.serviceReport.update({
        where: { id },
        data: {
          title: dto.title,
          diagnosis: dto.diagnosis,
          performedServices: dto.performedServices,
          recommendations: dto.recommendations,
          observations: dto.observations,
          safetyNotes: dto.safetyNotes,
          customerNotes: dto.customerNotes,
          startedAt:
            dto.startedAt === undefined
              ? undefined
              : this.parseDate(dto.startedAt),
          finishedAt:
            dto.finishedAt === undefined
              ? undefined
              : this.parseDate(dto.finishedAt),
          updatedByUserId: actor.id,
        },
        include: this.internalInclude(),
      });

      await this.recordAudit(
        tx,
        current.signedAt ? 'UPDATE_SIGNED_REPORT' : 'UPDATE',
        id,
        actor.id,
        this.auditSnapshot(current),
        this.auditSnapshot(updated),
      );

      return updated;
    });
  }

  async updateChecklist(
    id: string,
    dto: UpdateServiceReportChecklistDto,
    actorUserId?: string,
  ) {
    const actor = await this.assertInternalActor(actorUserId);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.getReportForMutation(tx, id);
      this.assertActorReportScope(actor, current);
      this.assertEditable(current.status);
      this.validateChecklistItems(dto.items);

      await tx.serviceReportChecklistItem.deleteMany({
        where: { reportId: id },
      });
      await tx.serviceReportChecklistItem.createMany({
        data: dto.items.map((item, index) => ({
          reportId: id,
          label: item.label,
          result: item.result,
          required: item.required ?? false,
          notes: item.notes,
          sortOrder: item.sortOrder ?? index,
        })),
      });
      const updated = await tx.serviceReport.findUniqueOrThrow({
        where: { id },
        include: this.internalInclude(),
      });

      await this.recordAudit(
        tx,
        'CHECKLIST_UPDATED',
        id,
        actor.id,
        { checklistItems: current.checklistItems },
        { checklistItems: updated.checklistItems },
      );

      return updated;
    });
  }

  async addEvidence(
    id: string,
    dto: AddServiceReportEvidenceDto,
    actorUserId?: string,
  ) {
    const actor = await this.assertInternalActor(actorUserId);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.getReportForMutation(tx, id);
      this.assertActorReportScope(actor, current);
      this.assertEditable(current.status);

      await tx.serviceReportEvidence.create({
        data: {
          reportId: id,
          type: dto.type,
          title: dto.title,
          description: dto.description,
          fileUrl: dto.fileUrl,
          fileName: dto.fileName,
          mimeType: dto.mimeType,
          sizeBytes: dto.sizeBytes,
          customerVisible: dto.customerVisible ?? false,
          uploadedByUserId: actor.id,
        },
      });

      const updated = await tx.serviceReport.findUniqueOrThrow({
        where: { id },
        include: this.internalInclude(),
      });

      await this.recordAudit(tx, 'EVIDENCE_ADDED', id, actor.id, undefined, {
        title: dto.title,
        type: dto.type,
        customerVisible: dto.customerVisible ?? false,
        hasFileUrl: Boolean(dto.fileUrl),
      });

      return updated;
    });
  }

  async uploadEvidence(
    id: string,
    dto: UploadServiceReportEvidenceDto,
    file: UploadFile | undefined,
    actorUserId?: string,
  ) {
    const actor = await this.assertInternalActor(actorUserId);
    const storage = this.requireStorage();
    const existing = await this.prisma.serviceReport.findUnique({
      where: { id },
      include: this.internalInclude(),
    });
    if (!existing) {
      throw new NotFoundException('Relatorio tecnico nao encontrado.');
    }
    this.assertActorReportScope(actor, existing);
    this.assertEditable(existing.status);
    const stored = await storage.saveServiceReportFile(file ?? {});

    return this.prisma.$transaction(async (tx) => {
      const current = await this.getReportForMutation(tx, id);
      this.assertActorReportScope(actor, current);
      this.assertEditable(current.status);

      await tx.serviceReportEvidence.create({
        data: {
          reportId: id,
          type: dto.type,
          title: dto.title,
          description: dto.description,
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          storageKey: stored.storageKey,
          checksumSha256: stored.checksumSha256,
          storedAt: new Date(),
          customerVisible: dto.customerVisible ?? false,
          uploadedByUserId: actor.id,
        },
      });

      const updated = await tx.serviceReport.findUniqueOrThrow({
        where: { id },
        include: this.internalInclude(),
      });

      await this.recordAudit(tx, 'EVIDENCE_UPLOADED', id, actor.id, undefined, {
        title: dto.title,
        type: dto.type,
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        checksumSha256: stored.checksumSha256,
        customerVisible: dto.customerVisible ?? false,
      });

      return updated;
    });
  }

  async downloadEvidence(
    reportId: string,
    evidenceId: string,
    actorUserId?: string,
    metadata?: RequestMetadata,
  ) {
    const actor = await this.assertInternalActor(actorUserId);
    const report = await this.prisma.serviceReport.findUnique({
      where: { id: reportId },
      include: {
        ...this.internalInclude(),
        evidences: {
          where: { id: evidenceId, deletedAt: null },
          take: 1,
        },
      },
    });
    if (!report) {
      await this.recordDocumentAccess({
        documentId: reportId,
        serviceReportId: reportId,
        evidenceId,
        userId: actor.id,
        accessType: DocumentAccessType.EVIDENCE_DOWNLOAD,
        channel: DocumentAccessChannel.INTERNAL,
        result: DocumentAccessResult.NOT_FOUND,
        metadata,
      });
      throw new NotFoundException('Relatorio tecnico nao encontrado.');
    }
    try {
      this.assertActorReportScope(actor, report);
    } catch (error) {
      await this.recordDocumentAccess({
        documentId: reportId,
        serviceReportId: reportId,
        evidenceId,
        userId: actor.id,
        clientId: report.clientId,
        accessType: DocumentAccessType.EVIDENCE_DOWNLOAD,
        channel: DocumentAccessChannel.INTERNAL,
        result: DocumentAccessResult.DENIED,
        metadata,
      });
      throw error;
    }
    const evidence = report.evidences[0];
    if (!evidence) {
      await this.recordDocumentAccess({
        documentId: reportId,
        serviceReportId: reportId,
        evidenceId,
        userId: actor.id,
        clientId: report.clientId,
        accessType: DocumentAccessType.EVIDENCE_DOWNLOAD,
        channel: DocumentAccessChannel.INTERNAL,
        result: DocumentAccessResult.NOT_FOUND,
        metadata,
      });
      throw new NotFoundException('Evidencia nao encontrada.');
    }
    try {
      const file = await this.loadEvidenceFile(evidence);
      await this.recordDocumentAccess({
        documentId: reportId,
        serviceReportId: reportId,
        evidenceId,
        userId: actor.id,
        clientId: report.clientId,
        accessType: DocumentAccessType.EVIDENCE_DOWNLOAD,
        channel: DocumentAccessChannel.INTERNAL,
        result: DocumentAccessResult.SUCCESS,
        metadata,
      });
      return file;
    } catch (error) {
      await this.recordDocumentAccess({
        documentId: reportId,
        serviceReportId: reportId,
        evidenceId,
        userId: actor.id,
        clientId: report.clientId,
        accessType: DocumentAccessType.EVIDENCE_DOWNLOAD,
        channel: DocumentAccessChannel.INTERNAL,
        result: DocumentAccessResult.NOT_FOUND,
        metadata,
      });
      throw error;
    }
  }

  async downloadCustomerEvidence(
    userId: string | undefined,
    reportId: string,
    evidenceId: string,
    metadata?: RequestMetadata,
  ) {
    const scope = await this.requireCustomerScope(userId);
    const report = await this.prisma.serviceReport.findFirst({
      where: {
        id: reportId,
        ...this.customerVisibleWhere(scope.clientId),
      },
      include: {
        evidences: {
          where: {
            id: evidenceId,
            customerVisible: true,
            deletedAt: null,
          },
          take: 1,
        },
      },
    });
    if (!report) {
      await this.recordDocumentAccess({
        documentId: reportId,
        serviceReportId: reportId,
        evidenceId,
        userId: scope.userId,
        clientId: scope.clientId,
        accessType: DocumentAccessType.EVIDENCE_DOWNLOAD,
        channel: DocumentAccessChannel.CUSTOMER_PORTAL,
        result: await this.resolveCustomerAccessFailure(reportId, scope),
        metadata,
      });
      throw new NotFoundException('Laudo nao encontrado.');
    }
    const evidence = report.evidences[0];
    if (!evidence) {
      await this.recordDocumentAccess({
        documentId: reportId,
        serviceReportId: reportId,
        evidenceId,
        userId: scope.userId,
        clientId: scope.clientId,
        accessType: DocumentAccessType.EVIDENCE_DOWNLOAD,
        channel: DocumentAccessChannel.CUSTOMER_PORTAL,
        result: DocumentAccessResult.NOT_FOUND,
        metadata,
      });
      throw new NotFoundException('Evidencia nao encontrada.');
    }
    try {
      const file = await this.loadEvidenceFile(evidence);
      await this.recordDocumentAccess({
        documentId: reportId,
        serviceReportId: reportId,
        evidenceId,
        userId: scope.userId,
        clientId: scope.clientId,
        accessType: DocumentAccessType.EVIDENCE_DOWNLOAD,
        channel: DocumentAccessChannel.CUSTOMER_PORTAL,
        result: DocumentAccessResult.SUCCESS,
        metadata,
      });
      return file;
    } catch (error) {
      await this.recordDocumentAccess({
        documentId: reportId,
        serviceReportId: reportId,
        evidenceId,
        userId: scope.userId,
        clientId: scope.clientId,
        accessType: DocumentAccessType.EVIDENCE_DOWNLOAD,
        channel: DocumentAccessChannel.CUSTOMER_PORTAL,
        result: DocumentAccessResult.NOT_FOUND,
        metadata,
      });
      throw error;
    }
  }

  async sign(
    id: string,
    dto: SignServiceReportDto,
    actorUserId: string | undefined,
    metadata: RequestMetadata,
  ) {
    const actor = await this.assertInternalActor(actorUserId);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.getReportForMutation(tx, id);
      this.assertActorReportScope(actor, current);
      if (current.status === ReportStatus.CANCELED) {
        throw new BadRequestException(
          'Relatorio cancelado nao pode ser assinado.',
        );
      }
      if (current.status === ReportStatus.RELEASED_TO_CUSTOMER) {
        throw new BadRequestException(
          'Relatorio liberado nao pode ser assinado.',
        );
      }

      const signedAt = new Date();
      const evidenceHash = this.buildEvidenceHash(current);
      const documentHash =
        typeof current.documentHash === 'string' && current.documentHash
          ? current.documentHash
          : this.buildDocumentHash(current);
      const signatureVersion = 1;
      const signatureHash = this.buildProofHash({
        type: 'service-report-signature',
        reportId: id,
        versionNumber: current.versionNumber ?? 1,
        documentHash,
        evidenceHash,
        signedByName: dto.signedByName,
        signedByDocument: dto.signedByDocument,
        signerRole: dto.signerRole,
        signerEmail: dto.signerEmail,
        acceptanceText: dto.acceptanceText,
        signedAt: signedAt.toISOString(),
        ip: metadata.ip,
        userAgent: this.normalizeUserAgent(metadata.userAgent),
        signatureVersion,
      });

      const updated = await tx.serviceReport.update({
        where: { id },
        data: {
          signedByName: dto.signedByName,
          signedByDocument: dto.signedByDocument,
          signatureData: dto.signatureData,
          signedAt,
          signatureIp: metadata.ip,
          signatureUserAgent: this.normalizeUserAgent(metadata.userAgent),
          signerRole: dto.signerRole,
          signerEmail: dto.signerEmail,
          acceptanceText: dto.acceptanceText,
          evidenceHash,
          signatureHash,
          signatureVersion,
          updatedByUserId: actor.id,
        },
        include: this.internalInclude(),
      });

      await this.recordAudit(
        tx,
        'SIGNED',
        id,
        actor.id,
        {
          signedAt: current.signedAt?.toISOString() ?? null,
          signedByName: current.signedByName,
        },
        {
          signedAt: updated.signedAt?.toISOString() ?? null,
          signedByName: updated.signedByName,
          signedByDocument: updated.signedByDocument,
          signerRole: updated.signerRole,
          signerEmail: updated.signerEmail,
          signatureHash: updated.signatureHash,
          evidenceHash: updated.evidenceHash,
          metadata,
        },
      );

      return updated;
    });
  }

  async approve(id: string, actorUserId?: string) {
    const actor = await this.assertInternalActor(actorUserId);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.getReportForMutation(tx, id);
      this.assertActorReportScope(actor, current);
      if (current.status === ReportStatus.CANCELED) {
        throw new BadRequestException(
          'Relatorio cancelado nao pode ser aprovado.',
        );
      }
      if (current.status === ReportStatus.RELEASED_TO_CUSTOMER) {
        return current;
      }
      if (current.status === ReportStatus.APPROVED) {
        return current;
      }
      this.validateChecklistForApproval(current.checklistItems);

      const updated = await tx.serviceReport.update({
        where: { id },
        data: {
          status: ReportStatus.APPROVED,
          updatedByUserId: actor.id,
        },
        include: this.internalInclude(),
      });
      await this.ensureReportVersion(
        tx,
        updated,
        actor.id,
        'Aprovacao do laudo tecnico.',
      );

      await this.recordAudit(
        tx,
        'APPROVE',
        id,
        actor.id,
        { status: current.status },
        { status: updated.status },
      );

      return updated;
    });
  }

  async releaseToCustomer(id: string, actorUserId?: string) {
    const actor = await this.assertInternalActor(actorUserId);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.getReportForMutation(tx, id);
      this.assertActorReportScope(actor, current);
      if (current.status === ReportStatus.CANCELED) {
        throw new BadRequestException(
          'Relatorio cancelado nao pode ser liberado.',
        );
      }
      if (current.status === ReportStatus.RELEASED_TO_CUSTOMER) {
        return current;
      }
      if (current.status !== ReportStatus.APPROVED) {
        throw new BadRequestException(
          'Apenas relatorios aprovados podem ser liberados ao cliente.',
        );
      }

      const now = new Date();
      const prepared = await this.ensureValidationToken(tx, current, actor.id);
      const existingDocumentId =
        typeof prepared.generatedDocumentId === 'string'
          ? prepared.generatedDocumentId
          : null;
      const document = existingDocumentId
        ? null
        : await this.createGeneratedDocument(tx, prepared, actor.id, now);
      const documentId = document?.id ?? existingDocumentId ?? undefined;
      await this.ensureReportVersion(
        tx,
        prepared,
        actor.id,
        'Liberacao do laudo ao cliente.',
        documentId,
      );

      const updated = await tx.serviceReport.update({
        where: { id },
        data: {
          status: ReportStatus.RELEASED_TO_CUSTOMER,
          customerVisible: true,
          releasedToCustomerAt: now,
          releasedByUserId: actor.id,
          generatedDocumentId: documentId,
          updatedByUserId: actor.id,
        },
        include: this.internalInclude(),
      });

      await this.recordAudit(
        tx,
        'RELEASE_TO_CUSTOMER',
        id,
        actor.id,
        {
          status: current.status,
          customerVisible: current.customerVisible,
          generatedDocumentId: current.generatedDocumentId,
        },
        {
          status: updated.status,
          customerVisible: updated.customerVisible,
          generatedDocumentId: updated.generatedDocumentId,
          documentDeliveryId: documentId,
          validationTokenCreated: Boolean(prepared.validationToken),
        },
      );

      if (document) {
        await this.recordAudit(
          tx,
          'DOCUMENT_REGISTERED',
          id,
          actor.id,
          undefined,
          {
            documentDeliveryId: document.id,
            documentType: document.documentType,
          },
        );
      }

      return updated;
    });
  }

  async cancel(id: string, dto: CancelServiceReportDto, actorUserId?: string) {
    const actor = await this.assertInternalActor(actorUserId);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.getReportForMutation(tx, id);
      this.assertActorReportScope(actor, current);
      if (current.status === ReportStatus.CANCELED) {
        return current;
      }

      const updated = await tx.serviceReport.update({
        where: { id },
        data: {
          status: ReportStatus.CANCELED,
          customerVisible: false,
          updatedByUserId: actor.id,
        },
        include: this.internalInclude(),
      });

      await this.recordAudit(
        tx,
        'CANCEL',
        id,
        actor.id,
        { status: current.status, customerVisible: current.customerVisible },
        { status: updated.status, reason: dto.reason },
        dto.reason,
      );

      return updated;
    });
  }

  async generateDocument(id: string, actorUserId?: string) {
    const actor = await this.assertInternalActor(actorUserId);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.getReportForMutation(tx, id);
      this.assertActorReportScope(actor, current);
      if (
        current.status !== ReportStatus.APPROVED &&
        current.status !== ReportStatus.RELEASED_TO_CUSTOMER
      ) {
        throw new BadRequestException(
          'Apenas laudos aprovados ou liberados podem gerar documento final.',
        );
      }

      const now = new Date();
      const prepared = await this.ensureValidationToken(tx, current, actor.id);
      const existingDocumentId =
        typeof prepared.generatedDocumentId === 'string'
          ? prepared.generatedDocumentId
          : null;
      const document = existingDocumentId
        ? null
        : await this.createGeneratedDocument(tx, prepared, actor.id, now);
      const documentId = document?.id ?? existingDocumentId ?? undefined;

      const updated = await tx.serviceReport.update({
        where: { id },
        data: {
          generatedDocumentId: documentId,
          updatedByUserId: actor.id,
        },
        include: this.internalInclude(),
      });

      await this.ensureReportVersion(
        tx,
        updated,
        actor.id,
        'Geracao de documento imprimivel.',
        documentId ?? updated.generatedDocumentId ?? undefined,
      );

      await this.recordAudit(tx, 'GENERATE_DOCUMENT', id, actor.id, undefined, {
        documentDeliveryId: documentId ?? updated.generatedDocumentId,
        documentHash: updated.documentHash,
        versionNumber: updated.versionNumber,
      });

      return {
        report: updated,
        documentDeliveryId: documentId ?? updated.generatedDocumentId,
        printUrl: `/service-reports/${id}/print`,
        validationUrl: this.getValidationUrl(updated.validationToken),
      };
    });
  }

  async generatePdf(id: string, actorUserId?: string) {
    const actor = await this.assertInternalActor(actorUserId);
    const storage = this.requireStorage();
    const pdfService = this.requirePdfService();

    return this.prisma.$transaction(async (tx) => {
      const current = await this.getReportForMutation(tx, id);
      this.assertActorReportScope(actor, current);
      if (
        current.status !== ReportStatus.APPROVED &&
        current.status !== ReportStatus.RELEASED_TO_CUSTOMER
      ) {
        throw new BadRequestException(
          'Apenas laudos aprovados ou liberados podem gerar PDF.',
        );
      }

      const prepared = await this.ensureValidationToken(tx, current, actor.id);
      const template = await this.resolveTemplate(prepared, tx);
      const pdfBuffer = pdfService.generate(
        this.buildPdfInput(prepared, template),
      );
      const versionNumber =
        typeof prepared.versionNumber === 'number' ? prepared.versionNumber : 1;
      const fileName = `${this.safeFileSegment(prepared.code)}-v${versionNumber}.pdf`;
      const stored = await storage.saveServiceReportPdf(fileName, pdfBuffer);
      const now = new Date();
      const document = await this.upsertGeneratedPdfDocument(
        tx,
        prepared,
        stored,
        actor.id,
        now,
      );

      const updated = await tx.serviceReport.update({
        where: { id },
        data: {
          generatedDocumentId: document.id,
          documentHash: stored.checksumSha256,
          updatedByUserId: actor.id,
        },
        include: this.internalInclude(),
      });

      await this.ensureReportVersion(
        tx,
        updated,
        actor.id,
        'Geracao de PDF final.',
        document.id,
      );

      await this.recordAudit(tx, 'GENERATE_PDF', id, actor.id, undefined, {
        documentDeliveryId: document.id,
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        checksumSha256: stored.checksumSha256,
        templateId: template?.id ?? null,
        versionNumber: updated.versionNumber,
      });

      return {
        report: updated,
        documentDeliveryId: document.id,
        fileName: stored.fileName,
        sizeBytes: stored.sizeBytes,
        checksumSha256: stored.checksumSha256,
      };
    });
  }

  async downloadPdf(
    reportId: string,
    actorUserId?: string,
    metadata?: RequestMetadata,
  ) {
    const actor = await this.assertInternalActor(actorUserId);
    const report = await this.prisma.serviceReport.findUnique({
      where: { id: reportId },
      include: this.internalInclude(),
    });
    if (!report) {
      await this.recordDocumentAccess({
        documentId: reportId,
        serviceReportId: reportId,
        userId: actor.id,
        accessType: DocumentAccessType.PDF_DOWNLOAD,
        channel: DocumentAccessChannel.INTERNAL,
        result: DocumentAccessResult.NOT_FOUND,
        metadata,
      });
      throw new NotFoundException('Relatorio tecnico nao encontrado.');
    }
    try {
      this.assertActorReportScope(actor, report);
    } catch (error) {
      await this.recordDocumentAccess({
        documentId: reportId,
        documentDeliveryId: report.generatedDocumentId,
        serviceReportId: reportId,
        userId: actor.id,
        clientId: report.clientId,
        accessType: DocumentAccessType.PDF_DOWNLOAD,
        channel: DocumentAccessChannel.INTERNAL,
        result: DocumentAccessResult.DENIED,
        metadata,
      });
      throw error;
    }
    try {
      const file = await this.loadDocumentFile(report.generatedDocument);
      await this.recordDocumentAccess({
        documentId: reportId,
        documentDeliveryId: report.generatedDocumentId,
        serviceReportId: reportId,
        userId: actor.id,
        clientId: report.clientId,
        accessType: DocumentAccessType.PDF_DOWNLOAD,
        channel: DocumentAccessChannel.INTERNAL,
        result: DocumentAccessResult.SUCCESS,
        metadata,
      });
      return file;
    } catch (error) {
      await this.recordDocumentAccess({
        documentId: reportId,
        documentDeliveryId: report.generatedDocumentId,
        serviceReportId: reportId,
        userId: actor.id,
        clientId: report.clientId,
        accessType: DocumentAccessType.PDF_DOWNLOAD,
        channel: DocumentAccessChannel.INTERNAL,
        result: DocumentAccessResult.NOT_FOUND,
        metadata,
      });
      throw error;
    }
  }

  async downloadCustomerPdf(
    userId: string | undefined,
    reportId: string,
    metadata?: RequestMetadata,
  ) {
    const scope = await this.requireCustomerScope(userId);
    const report = await this.prisma.serviceReport.findFirst({
      where: {
        id: reportId,
        ...this.customerVisibleWhere(scope.clientId),
      },
      include: this.customerInclude(),
    });
    if (!report) {
      await this.recordDocumentAccess({
        documentId: reportId,
        serviceReportId: reportId,
        userId: scope.userId,
        clientId: scope.clientId,
        accessType: DocumentAccessType.PDF_DOWNLOAD,
        channel: DocumentAccessChannel.CUSTOMER_PORTAL,
        result: await this.resolveCustomerAccessFailure(reportId, scope),
        metadata,
      });
      throw new NotFoundException('Laudo nao encontrado.');
    }
    try {
      const file = await this.loadDocumentFile(report.generatedDocument);
      await this.recordDocumentAccess({
        documentId: reportId,
        documentDeliveryId: report.generatedDocumentId,
        serviceReportId: reportId,
        userId: scope.userId,
        clientId: scope.clientId,
        accessType: DocumentAccessType.PDF_DOWNLOAD,
        channel: DocumentAccessChannel.CUSTOMER_PORTAL,
        result: DocumentAccessResult.SUCCESS,
        metadata,
      });
      return file;
    } catch (error) {
      await this.recordDocumentAccess({
        documentId: reportId,
        documentDeliveryId: report.generatedDocumentId,
        serviceReportId: reportId,
        userId: scope.userId,
        clientId: scope.clientId,
        accessType: DocumentAccessType.PDF_DOWNLOAD,
        channel: DocumentAccessChannel.CUSTOMER_PORTAL,
        result: DocumentAccessResult.NOT_FOUND,
        metadata,
      });
      throw error;
    }
  }

  async downloadPublicSharePdf(token: string, metadata?: RequestMetadata) {
    const tokenHash = this.hashToken(token);
    const link = await this.prisma.serviceReportShareLink.findUnique({
      where: { tokenHash },
      include: {
        report: {
          include: this.customerInclude(),
        },
      },
    });
    if (!link) {
      await this.recordDocumentAccess({
        accessType: DocumentAccessType.PDF_DOWNLOAD,
        channel: DocumentAccessChannel.PUBLIC_LINK,
        result: DocumentAccessResult.NOT_FOUND,
        metadata,
      });
      throw new NotFoundException('Link publico nao encontrado.');
    }
    const blocked = this.getPublicLinkBlock(link);
    if (blocked) {
      await this.recordDocumentAccess({
        documentId: link.reportId,
        documentDeliveryId: link.report.generatedDocumentId,
        serviceReportId: link.reportId,
        clientId: link.report.clientId,
        shareLinkId: link.id,
        accessType: DocumentAccessType.PDF_DOWNLOAD,
        channel: DocumentAccessChannel.PUBLIC_LINK,
        result: blocked.result,
        metadata,
      });
      throw new ForbiddenException(blocked.message);
    }
    if (!link.allowPdfDownload) {
      await this.recordDocumentAccess({
        documentId: link.reportId,
        documentDeliveryId: link.report.generatedDocumentId,
        serviceReportId: link.reportId,
        clientId: link.report.clientId,
        shareLinkId: link.id,
        accessType: DocumentAccessType.PDF_DOWNLOAD,
        channel: DocumentAccessChannel.PUBLIC_LINK,
        result: DocumentAccessResult.DENIED,
        metadata,
      });
      throw new ForbiddenException(
        'Download de PDF nao esta liberado para este link.',
      );
    }
    await this.prisma.serviceReportShareLink.update({
      where: { id: link.id },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });
    await this.auditLogsService.record({
      domain: AuditDomain.SERVICE_REPORTS,
      entityType: 'SERVICE_REPORT',
      entityId: link.reportId,
      action: 'PUBLIC_PDF_DOWNLOADED',
      afterPayload: { linkId: link.id },
    });
    try {
      const file = await this.loadDocumentFile(link.report.generatedDocument);
      await this.recordDocumentAccess({
        documentId: link.reportId,
        documentDeliveryId: link.report.generatedDocumentId,
        serviceReportId: link.reportId,
        clientId: link.report.clientId,
        shareLinkId: link.id,
        accessType: DocumentAccessType.PDF_DOWNLOAD,
        channel: DocumentAccessChannel.PUBLIC_LINK,
        result: DocumentAccessResult.SUCCESS,
        metadata,
      });
      return file;
    } catch (error) {
      await this.recordDocumentAccess({
        documentId: link.reportId,
        documentDeliveryId: link.report.generatedDocumentId,
        serviceReportId: link.reportId,
        clientId: link.report.clientId,
        shareLinkId: link.id,
        accessType: DocumentAccessType.PDF_DOWNLOAD,
        channel: DocumentAccessChannel.PUBLIC_LINK,
        result: DocumentAccessResult.NOT_FOUND,
        metadata,
      });
      throw error;
    }
  }

  async reviseReleasedReport(
    id: string,
    dto: ReviseReleasedServiceReportDto,
    actorUserId?: string,
  ) {
    const actor = await this.assertInternalActor(actorUserId);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.getReportForMutation(tx, id);
      this.assertActorReportScope(actor, current);
      if (current.status !== ReportStatus.RELEASED_TO_CUSTOMER) {
        throw new BadRequestException(
          'Apenas laudos liberados ao cliente exigem revisao versionada.',
        );
      }
      const changeReason = dto.changeReason?.trim();
      if (!changeReason || changeReason.length < 8) {
        throw new BadRequestException('Motivo da revisao e obrigatorio.');
      }

      await this.ensureReportVersion(
        tx,
        current,
        actor.id,
        'Versao preservada antes de revisao.',
        current.generatedDocumentId ?? undefined,
      );

      const revised = await tx.serviceReport.update({
        where: { id },
        data: {
          title: dto.title,
          diagnosis: dto.diagnosis,
          performedServices: dto.performedServices,
          recommendations: dto.recommendations,
          observations: dto.observations,
          safetyNotes: dto.safetyNotes,
          customerNotes: dto.customerNotes,
          startedAt:
            dto.startedAt === undefined
              ? undefined
              : this.parseDate(dto.startedAt),
          finishedAt:
            dto.finishedAt === undefined
              ? undefined
              : this.parseDate(dto.finishedAt),
          versionNumber: { increment: 1 },
          generatedDocumentId: null,
          documentHash: null,
          updatedByUserId: actor.id,
        },
        include: this.internalInclude(),
      });
      const prepared = await this.ensureValidationToken(tx, revised, actor.id);
      await this.ensureReportVersion(tx, prepared, actor.id, changeReason);

      await this.recordAudit(
        tx,
        'REVISE_RELEASED_REPORT',
        id,
        actor.id,
        {
          versionNumber: current.versionNumber,
          generatedDocumentId: current.generatedDocumentId,
          documentHash: current.documentHash,
        },
        {
          versionNumber: prepared.versionNumber,
          generatedDocumentId: prepared.generatedDocumentId,
          documentHash: prepared.documentHash,
        },
        changeReason,
      );

      return prepared;
    });
  }

  async getPrintableHtml(id: string, actorUserId?: string) {
    const actor = await this.assertInternalActor(actorUserId);
    const report = await this.prisma.serviceReport.findUnique({
      where: { id },
      include: this.internalInclude(),
    });
    if (!report) {
      throw new NotFoundException('Relatorio tecnico nao encontrado.');
    }
    this.assertActorReportScope(actor, report);
    if (report.status === ReportStatus.CANCELED) {
      throw new BadRequestException('Laudo cancelado nao pode ser impresso.');
    }
    return this.renderPrintableHtml(report, {
      audience: 'internal',
      evidenceBasePath: `/service-reports/${id}/evidence`,
    });
  }

  async getCustomerPrintableHtml(userId: string | undefined, reportId: string) {
    const scope = await this.requireCustomerScope(userId);
    const report = await this.prisma.serviceReport.findFirst({
      where: {
        id: reportId,
        ...this.customerVisibleWhere(scope.clientId),
      },
      include: this.customerInclude(),
    });
    if (!report) {
      throw new NotFoundException('Laudo nao encontrado.');
    }
    return this.renderPrintableHtml(report, {
      audience: 'customer',
      evidenceBasePath: `/customer-portal/service-reports/${reportId}/evidence`,
    });
  }

  async createShareLink(
    id: string,
    dto: CreateServiceReportShareLinkDto,
    actorUserId?: string,
  ) {
    const actor = await this.assertInternalActor(actorUserId);
    const report = await this.prisma.serviceReport.findUnique({
      where: { id },
      include: this.internalInclude(),
    });
    if (!report) {
      throw new NotFoundException('Relatorio tecnico nao encontrado.');
    }
    this.assertActorReportScope(actor, report);
    if (report.status !== ReportStatus.RELEASED_TO_CUSTOMER) {
      throw new BadRequestException(
        'Apenas laudos liberados ao cliente podem gerar link publico.',
      );
    }
    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Expiracao precisa ser futura.');
    }
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const link = await this.prisma.serviceReportShareLink.create({
      data: {
        reportId: id,
        tokenHash,
        expiresAt,
        allowPdfDownload: dto.allowPdfDownload ?? false,
        allowEvidenceDownload: dto.allowEvidenceDownload ?? false,
        createdByUserId: actor.id,
      },
      select: this.shareLinkSelect(),
    });
    await this.auditLogsService.record({
      domain: AuditDomain.SERVICE_REPORTS,
      entityType: 'SERVICE_REPORT',
      entityId: id,
      action: 'SHARE_LINK_CREATED',
      actorUserId: actor.id,
      afterPayload: {
        linkId: link.id,
        expiresAt: link.expiresAt.toISOString(),
        allowPdfDownload: link.allowPdfDownload,
        allowEvidenceDownload: link.allowEvidenceDownload,
      },
    });
    return {
      ...link,
      shareUrl: `${this.getAppBaseUrl()}/public/service-reports/share/${token}`,
    };
  }

  async listShareLinks(id: string, actorUserId?: string) {
    const actor = await this.assertInternalActor(actorUserId);
    const report = await this.prisma.serviceReport.findUnique({
      where: { id },
      select: { id: true, technicianId: true },
    });
    if (!report) {
      throw new NotFoundException('Relatorio tecnico nao encontrado.');
    }
    this.assertActorReportScope(actor, report);
    return this.prisma.serviceReportShareLink.findMany({
      where: { reportId: id },
      select: this.shareLinkSelect(),
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeShareLink(
    id: string,
    linkId: string,
    dto: RevokeServiceReportShareLinkDto,
    actorUserId?: string,
  ) {
    const actor = await this.assertInternalActor(actorUserId);
    const link = await this.prisma.serviceReportShareLink.findFirst({
      where: { id: linkId, reportId: id },
      include: { report: { select: { technicianId: true } } },
    });
    if (!link) {
      throw new NotFoundException('Link publico nao encontrado.');
    }
    this.assertActorReportScope(actor, link.report);
    const updated = await this.prisma.serviceReportShareLink.update({
      where: { id: linkId },
      data: { revokedAt: link.revokedAt ?? new Date() },
      select: this.shareLinkSelect(),
    });
    await this.auditLogsService.record({
      domain: AuditDomain.SERVICE_REPORTS,
      entityType: 'SERVICE_REPORT',
      entityId: id,
      action: 'SHARE_LINK_REVOKED',
      actorUserId: actor.id,
      reason: dto.reason,
      afterPayload: { linkId },
    });
    return updated;
  }

  async listDocumentAccessLogs(id: string, actorUserId?: string) {
    const actor = await this.assertInternalActor(actorUserId);
    const report = await this.prisma.serviceReport.findUnique({
      where: { id },
      select: { id: true, technicianId: true },
    });
    if (!report) {
      throw new NotFoundException('Relatorio tecnico nao encontrado.');
    }
    this.assertActorReportScope(actor, report);
    return this.prisma.documentAccessLog.findMany({
      where: { serviceReportId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        client: { select: { id: true, companyName: true, tradeName: true } },
      },
    });
  }

  async updateRetentionPolicy(
    id: string,
    dto: UpdateServiceReportRetentionDto,
    actorUserId?: string,
  ) {
    const actor = await this.assertInternalActor(actorUserId);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.getReportForMutation(tx, id);
      this.assertActorReportScope(actor, current);
      const retentionUntil =
        dto.retentionUntil === undefined
          ? undefined
          : this.parseDate(dto.retentionUntil);
      if (retentionUntil && Number.isNaN(retentionUntil.getTime())) {
        throw new BadRequestException('Data de retencao invalida.');
      }
      const updated = await tx.serviceReport.update({
        where: { id },
        data: {
          retentionUntil,
          legalHold: dto.legalHold,
          updatedByUserId: actor.id,
        },
        include: this.internalInclude(),
      });
      await this.recordAudit(
        tx,
        'RETENTION_POLICY_UPDATED',
        id,
        actor.id,
        {
          retentionUntil: current.retentionUntil,
          legalHold: current.legalHold,
        },
        {
          retentionUntil: updated.retentionUntil,
          legalHold: updated.legalHold,
        },
        dto.reason,
      );
      return updated;
    });
  }

  async revokeDocument(
    id: string,
    dto: RevokeServiceReportDocumentDto,
    actorUserId: string | undefined,
    metadata: RequestMetadata,
  ) {
    const actor = await this.assertInternalActor(actorUserId);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.getReportForMutation(tx, id);
      this.assertActorReportScope(actor, current);
      if (dto.destructive && current.legalHold) {
        throw new BadRequestException(
          'Legal hold ativo bloqueia revogacao destrutiva.',
        );
      }
      if (current.revokedAt) {
        return current;
      }
      const now = new Date();
      const updated = await tx.serviceReport.update({
        where: { id },
        data: {
          revokedAt: now,
          revokedById: actor.id,
          revokeReason: dto.reason,
          customerVisible: false,
          validationRevokedAt: current.validationRevokedAt ?? now,
          updatedByUserId: actor.id,
        },
        include: this.internalInclude(),
      });
      await this.recordAudit(
        tx,
        'DOCUMENT_REVOKED',
        id,
        actor.id,
        {
          revokedAt: current.revokedAt,
          validationRevokedAt: current.validationRevokedAt,
          customerVisible: current.customerVisible,
        },
        {
          revokedAt: updated.revokedAt,
          validationRevokedAt: updated.validationRevokedAt,
          customerVisible: updated.customerVisible,
          metadata,
        },
        dto.reason,
      );
      return updated;
    });
  }

  async archiveDocument(
    id: string,
    dto: ArchiveServiceReportDocumentDto,
    actorUserId?: string,
  ) {
    const actor = await this.assertInternalActor(actorUserId);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.getReportForMutation(tx, id);
      this.assertActorReportScope(actor, current);
      if (current.archivedAt) {
        return current;
      }
      const updated = await tx.serviceReport.update({
        where: { id },
        data: {
          archivedAt: new Date(),
          archivedById: actor.id,
          updatedByUserId: actor.id,
        },
        include: this.internalInclude(),
      });
      await this.recordAudit(
        tx,
        'DOCUMENT_ARCHIVED',
        id,
        actor.id,
        { archivedAt: current.archivedAt },
        { archivedAt: updated.archivedAt },
        dto.reason,
      );
      return updated;
    });
  }

  async acceptCustomerReport(
    userId: string | undefined,
    id: string,
    dto: AcceptServiceReportDto,
    metadata: RequestMetadata,
  ) {
    const scope = await this.requireCustomerScope(userId);
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.serviceReport.findFirst({
        where: {
          id,
          ...this.customerVisibleWhere(scope.clientId),
        },
        include: this.customerInclude(),
      });
      if (!report) {
        throw new NotFoundException('Laudo nao encontrado.');
      }
      if (report.customerAcceptedAt) {
        return this.toCustomerReport(report);
      }
      const acceptedAt = new Date();
      const documentHash =
        report.documentHash || this.buildDocumentHash(report as ReportMap);
      const acceptanceText = dto.acceptanceText.trim();
      const acceptanceHash = this.buildProofHash({
        type: 'service-report-customer-acceptance',
        reportId: id,
        versionNumber: report.versionNumber,
        documentHash,
        userId: scope.userId,
        clientId: scope.clientId,
        acceptanceText,
        acceptedAt: acceptedAt.toISOString(),
        ip: metadata.ip,
        userAgent: this.normalizeUserAgent(metadata.userAgent),
      });
      const updated = await tx.serviceReport.update({
        where: { id },
        data: {
          customerAcceptedAt: acceptedAt,
          customerAcceptedByUserId: scope.userId,
          customerAcceptanceText: acceptanceText,
          customerAcceptanceIp: metadata.ip,
          customerAcceptanceUserAgent: this.normalizeUserAgent(
            metadata.userAgent,
          ),
          customerAcceptanceHash: acceptanceHash,
          customerAcceptanceDocumentHash: documentHash,
        },
        include: this.customerInclude(),
      });
      await this.recordAudit(
        tx,
        'CUSTOMER_ACCEPTED',
        id,
        scope.userId,
        undefined,
        {
          customerAcceptedAt: updated.customerAcceptedAt,
          customerAcceptedByUserId: scope.userId,
          customerAcceptanceHash: acceptanceHash,
          customerAcceptanceDocumentHash: documentHash,
          metadata,
        },
      );
      return this.toCustomerReport(updated);
    });
  }

  async verifyPublicReport(token: string, metadata?: RequestMetadata) {
    const report = await this.prisma.serviceReport.findUnique({
      where: { validationToken: token },
      include: this.customerInclude(),
    });
    if (!report) {
      await this.recordDocumentAccess({
        accessType: DocumentAccessType.VERIFY,
        channel: DocumentAccessChannel.VERIFY,
        result: DocumentAccessResult.NOT_FOUND,
        metadata,
      });
      throw new NotFoundException('Validacao nao encontrada.');
    }
    const verificationResult = this.resolveVerificationResult(report);
    await this.recordDocumentAccess({
      documentId: report.id,
      documentDeliveryId: report.generatedDocumentId,
      serviceReportId: report.id,
      clientId: report.clientId,
      accessType: DocumentAccessType.VERIFY,
      channel: DocumentAccessChannel.VERIFY,
      result: verificationResult,
      metadata,
    });
    const valid = verificationResult === DocumentAccessResult.SUCCESS;
    return {
      valid,
      revoked: verificationResult === DocumentAccessResult.REVOKED,
      code: report.code,
      title: report.title,
      status: report.status,
      versionNumber: report.versionNumber,
      documentHash: report.documentHash,
      client: report.client
        ? {
            companyName: report.client.companyName,
            tradeName: report.client.tradeName,
          }
        : null,
      generator: report.generator
        ? {
            name: report.generator.name,
            serialNumber: report.generator.serialNumber,
          }
        : null,
      releasedToCustomerAt: report.releasedToCustomerAt,
      validationExpiresAt: report.validationExpiresAt,
      validationRevokedAt: report.validationRevokedAt,
      revokedAt: report.revokedAt,
      message: this.verificationMessage(verificationResult),
    };
  }

  async getPublicSharedReport(token: string, metadata?: RequestMetadata) {
    const tokenHash = this.hashToken(token);
    const link = await this.prisma.serviceReportShareLink.findUnique({
      where: { tokenHash },
      include: {
        report: {
          include: this.customerInclude(),
        },
      },
    });
    if (!link) {
      await this.recordDocumentAccess({
        accessType: DocumentAccessType.SHARE_OPEN,
        channel: DocumentAccessChannel.PUBLIC_LINK,
        result: DocumentAccessResult.NOT_FOUND,
        metadata,
      });
      throw new NotFoundException('Link publico nao encontrado.');
    }
    const blocked = this.getPublicLinkBlock(link);
    if (blocked) {
      await this.recordDocumentAccess({
        documentId: link.reportId,
        documentDeliveryId: link.report.generatedDocumentId,
        serviceReportId: link.reportId,
        clientId: link.report.clientId,
        shareLinkId: link.id,
        accessType: DocumentAccessType.SHARE_OPEN,
        channel: DocumentAccessChannel.PUBLIC_LINK,
        result: blocked.result,
        metadata,
      });
      throw new ForbiddenException(blocked.message);
    }
    await this.prisma.serviceReportShareLink.update({
      where: { id: link.id },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });
    await this.auditLogsService.record({
      domain: AuditDomain.SERVICE_REPORTS,
      entityType: 'SERVICE_REPORT',
      entityId: link.reportId,
      action: 'SHARE_LINK_OPENED',
      afterPayload: { linkId: link.id },
    });
    await this.recordDocumentAccess({
      documentId: link.reportId,
      documentDeliveryId: link.report.generatedDocumentId,
      serviceReportId: link.reportId,
      clientId: link.report.clientId,
      shareLinkId: link.id,
      accessType: DocumentAccessType.SHARE_OPEN,
      channel: DocumentAccessChannel.PUBLIC_LINK,
      result: DocumentAccessResult.SUCCESS,
      metadata,
    });
    return {
      report: this.toCustomerReport(link.report),
      permissions: {
        allowPdfDownload: link.allowPdfDownload,
        allowEvidenceDownload: link.allowEvidenceDownload,
      },
      validation:
        typeof link.report.validationToken === 'string' &&
        link.report.validationToken
          ? await this.verifyPublicReport(link.report.validationToken, metadata)
          : null,
    };
  }

  async listCustomerReports(
    userId: string | undefined,
    query: ListServiceReportsQueryDto = {},
  ) {
    const scope = await this.requireCustomerScope(userId);
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 80)));
    const reports = await this.prisma.serviceReport.findMany({
      where: {
        ...this.customerVisibleWhere(scope.clientId),
        generatorId: query.generatorId,
      },
      include: this.customerInclude(),
      orderBy: { releasedToCustomerAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return reports.map((report) => this.toCustomerReport(report));
  }

  async getCustomerReport(userId: string | undefined, reportId: string) {
    const scope = await this.requireCustomerScope(userId);
    const report = await this.prisma.serviceReport.findFirst({
      where: {
        id: reportId,
        ...this.customerVisibleWhere(scope.clientId),
      },
      include: this.customerInclude(),
    });
    if (!report) {
      throw new NotFoundException('Laudo nao encontrado.');
    }
    return this.toCustomerReport(report);
  }

  async getCustomerOrderReport(userId: string | undefined, orderId: string) {
    const scope = await this.requireCustomerScope(userId);
    const report = await this.prisma.serviceReport.findFirst({
      where: {
        maintenanceOrderId: orderId,
        ...this.customerVisibleWhere(scope.clientId),
      },
      include: this.customerInclude(),
    });
    if (!report) {
      throw new NotFoundException('Laudo da OS nao encontrado.');
    }
    return this.toCustomerReport(report);
  }

  async listCustomerEquipmentReports(
    userId: string | undefined,
    equipmentId: string,
    query: ListServiceReportsQueryDto = {},
  ) {
    const scope = await this.requireCustomerScope(userId);
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 80)));
    const reports = await this.prisma.serviceReport.findMany({
      where: {
        generatorId: equipmentId,
        ...this.customerVisibleWhere(scope.clientId),
      },
      include: this.customerInclude(),
      orderBy: { releasedToCustomerAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return reports.map((report) => this.toCustomerReport(report));
  }

  private customerVisibleWhere(
    clientId: string,
  ): Prisma.ServiceReportWhereInput {
    return {
      clientId,
      customerVisible: true,
      releasedToCustomerAt: { not: null },
      status: ReportStatus.RELEASED_TO_CUSTOMER,
      revokedAt: null,
    };
  }

  private async requireCustomerScope(
    userId: string | undefined,
  ): Promise<CustomerScope> {
    if (!userId) {
      throw new UnauthorizedException('Autenticacao obrigatoria.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        isActive: true,
        linkedClientId: true,
        linkedClient: { select: { id: true } },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario invalido.');
    }
    if (user.role !== UserRole.CLIENT || !user.linkedClientId) {
      throw new ForbiddenException('Usuario nao esta vinculado a um cliente.');
    }
    if (!user.linkedClient) {
      throw new ForbiddenException('Cliente vinculado nao encontrado.');
    }

    return {
      userId: user.id,
      clientId: user.linkedClientId,
    };
  }

  private async assertInternalActor(
    actorUserId: string | undefined,
  ): Promise<InternalActor> {
    if (!actorUserId) {
      throw new UnauthorizedException('Autenticacao obrigatoria.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: {
        id: true,
        role: true,
        isActive: true,
        technicianProfile: { select: { id: true } },
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario invalido.');
    }
    if (user.role === UserRole.CLIENT) {
      throw new ForbiddenException('Cliente deve usar o portal do cliente.');
    }
    return {
      id: user.id,
      role: user.role,
      technicianId: user.technicianProfile?.id ?? null,
    };
  }

  private requireActorTechnicianId(actor: InternalActor) {
    if (!actor.technicianId) {
      throw new ForbiddenException('Tecnico sem perfil operacional vinculado.');
    }
    return actor.technicianId;
  }

  private assertActorReportScope(
    actor: InternalActor,
    report: { technicianId?: string | null },
  ) {
    if (actor.role !== UserRole.TECHNICIAN) return;
    if (report.technicianId === this.requireActorTechnicianId(actor)) return;
    throw new ForbiddenException(
      'Tecnico so pode acessar laudos de OS atribuidas a ele.',
    );
  }

  private async getReportForMutation(tx: Prisma.TransactionClient, id: string) {
    const report = await tx.serviceReport.findUnique({
      where: { id },
      include: this.internalInclude(),
    });
    if (!report) {
      throw new NotFoundException('Relatorio tecnico nao encontrado.');
    }
    return report;
  }

  private assertEditable(status: ReportStatus) {
    if (!EDITABLE_REPORT_STATUSES.includes(status)) {
      throw new BadRequestException(
        'Somente relatorios em rascunho ou revisao podem ser editados.',
      );
    }
  }

  private validateChecklistItems(
    items: UpdateServiceReportChecklistDto['items'],
  ) {
    for (const item of items) {
      if (
        item.result === ChecklistResult.NOT_OK &&
        (!item.notes || item.notes.trim().length === 0)
      ) {
        throw new BadRequestException('Item NOT_OK exige observacao tecnica.');
      }
    }
  }

  private validateChecklistForApproval(
    items: Array<{
      required: boolean;
      result: ChecklistResult;
      notes: string | null;
    }>,
  ) {
    this.validateChecklistItems(
      items.map((item) => ({
        label: 'item',
        result: item.result,
        required: item.required,
        notes: item.notes ?? undefined,
      })),
    );
    const pendingRequired = items.find(
      (item) => item.required && item.result === ChecklistResult.PENDING,
    );
    if (pendingRequired) {
      throw new BadRequestException(
        'Checklist obrigatorio pendente bloqueia aprovacao.',
      );
    }
  }

  private async generateCode(tx: Prisma.TransactionClient) {
    const count = await tx.serviceReport.count();
    return `LDT-${String(count + 1).padStart(6, '0')}`;
  }

  private parseDate(value?: string) {
    return value ? new Date(value) : undefined;
  }

  private normalizeUserAgent(value?: string | string[]) {
    if (Array.isArray(value)) return value.join('; ');
    return value;
  }

  private async recordAudit(
    tx: Prisma.TransactionClient,
    action: string,
    entityId: string,
    actorUserId?: string,
    beforePayload?: unknown,
    afterPayload?: unknown,
    reason?: string,
  ) {
    await this.auditLogsService.record(
      {
        domain: AuditDomain.SERVICE_REPORTS,
        entityType: 'SERVICE_REPORT',
        entityId,
        action,
        actorUserId,
        beforePayload: beforePayload as Prisma.InputJsonValue | undefined,
        afterPayload: afterPayload as Prisma.InputJsonValue | undefined,
        reason,
      },
      tx,
    );
  }

  private async recordDocumentAccess(
    input: DocumentAccessInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    await db.documentAccessLog.create({
      data: {
        documentType: DeliveryDocumentType.SERVICE_REPORT,
        documentId: input.documentId ?? input.serviceReportId ?? null,
        documentDeliveryId: input.documentDeliveryId ?? null,
        serviceReportId: input.serviceReportId ?? null,
        evidenceId: input.evidenceId ?? null,
        userId: input.userId ?? null,
        clientId: input.clientId ?? null,
        shareLinkId: input.shareLinkId ?? null,
        accessType: input.accessType,
        channel: input.channel,
        result: input.result,
        ipAddress: input.metadata?.ip,
        userAgent: this.normalizeUserAgent(input.metadata?.userAgent),
      } satisfies Prisma.DocumentAccessLogUncheckedCreateInput,
    });
  }

  private async resolveCustomerAccessFailure(
    reportId: string,
    scope: CustomerScope,
  ) {
    const report = await this.prisma.serviceReport.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        clientId: true,
        status: true,
        revokedAt: true,
        validationRevokedAt: true,
        validationExpiresAt: true,
      },
    });
    if (!report) return DocumentAccessResult.NOT_FOUND;
    if (report.clientId !== scope.clientId) return DocumentAccessResult.DENIED;
    if (report.revokedAt || report.validationRevokedAt) {
      return DocumentAccessResult.REVOKED;
    }
    if (
      report.validationExpiresAt &&
      report.validationExpiresAt.getTime() <= Date.now()
    ) {
      return DocumentAccessResult.EXPIRED;
    }
    if (report.status !== ReportStatus.RELEASED_TO_CUSTOMER) {
      return DocumentAccessResult.DENIED;
    }
    return DocumentAccessResult.NOT_FOUND;
  }

  private withStorageInfo<T extends Record<string, unknown>>(report: T) {
    return {
      ...report,
      storageDriver: this.fileStorageService?.getDriver() ?? 'unconfigured',
    };
  }

  private buildProofHash(payload: Record<string, unknown>) {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private buildEvidenceHash(report: ReportMap) {
    const evidences = (report.evidences || []).map((evidence) => ({
      id: evidence.id,
      title: evidence.title,
      type: evidence.type,
      checksumSha256: evidence.checksumSha256,
      customerVisible: evidence.customerVisible,
      deletedAt: evidence.deletedAt,
    }));
    return this.buildProofHash({
      reportId: report.id,
      versionNumber: report.versionNumber ?? 1,
      evidences,
    });
  }

  private resolveVerificationResult(report: {
    status: ReportStatus;
    revokedAt?: Date | null;
    validationRevokedAt?: Date | null;
    validationExpiresAt?: Date | null;
  }) {
    if (report.revokedAt || report.validationRevokedAt) {
      return DocumentAccessResult.REVOKED;
    }
    if (
      report.validationExpiresAt &&
      report.validationExpiresAt.getTime() <= Date.now()
    ) {
      return DocumentAccessResult.EXPIRED;
    }
    if (report.status !== ReportStatus.RELEASED_TO_CUSTOMER) {
      return DocumentAccessResult.DENIED;
    }
    return DocumentAccessResult.SUCCESS;
  }

  private verificationMessage(result: DocumentAccessResult) {
    if (result === DocumentAccessResult.SUCCESS) return 'Documento valido.';
    if (result === DocumentAccessResult.REVOKED) return 'Documento revogado.';
    if (result === DocumentAccessResult.EXPIRED) return 'Validacao expirada.';
    if (result === DocumentAccessResult.DENIED) {
      return 'Documento nao esta liberado para validacao publica.';
    }
    return 'Validacao nao encontrada.';
  }

  private auditSnapshot(report: Record<string, unknown>) {
    return {
      status: report.status,
      title: report.title,
      diagnosis: report.diagnosis,
      performedServices: report.performedServices,
      recommendations: report.recommendations,
      observations: report.observations,
      safetyNotes: report.safetyNotes,
      customerNotes: report.customerNotes,
      signedAt:
        report.signedAt instanceof Date
          ? report.signedAt.toISOString()
          : report.signedAt,
    };
  }

  private portalSnapshot(report: ReportMap): Prisma.InputJsonValue {
    const snapshot = this.toCustomerReport({
      ...report,
      evidences: (report.evidences || []).filter(
        (evidence: { customerVisible?: boolean }) => evidence.customerVisible,
      ),
    });
    return JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue;
  }

  private requireStorage() {
    if (!this.fileStorageService) {
      throw new BadRequestException('Storage de arquivos nao configurado.');
    }
    return this.fileStorageService;
  }

  private requirePdfService() {
    if (!this.serviceReportPdfService) {
      throw new BadRequestException('Gerador de PDF nao configurado.');
    }
    return this.serviceReportPdfService;
  }

  private async loadEvidenceFile(evidence: {
    storageKey?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    checksumSha256?: string | null;
  }): Promise<LoadedFile> {
    if (!evidence.storageKey) {
      throw new NotFoundException(
        'Arquivo fisico da evidencia nao encontrado.',
      );
    }
    return this.requireStorage().load(evidence.storageKey, {
      fileName: evidence.fileName || 'evidencia',
      mimeType: evidence.mimeType || 'application/octet-stream',
      sizeBytes: evidence.sizeBytes ?? 0,
      checksumSha256: evidence.checksumSha256 || '',
    });
  }

  private async loadDocumentFile(
    document:
      | {
          fileStorageKey?: string | null;
          fileName?: string | null;
          mimeType?: string | null;
          sizeBytes?: number | null;
          checksumSha256?: string | null;
        }
      | null
      | undefined,
  ) {
    if (!document?.fileStorageKey) {
      throw new NotFoundException('PDF do laudo ainda nao foi gerado.');
    }
    return this.requireStorage().load(document.fileStorageKey, {
      fileName: document.fileName || 'laudo-tecnico.pdf',
      mimeType: document.mimeType || 'application/pdf',
      sizeBytes: document.sizeBytes ?? 0,
      checksumSha256: document.checksumSha256 || '',
    });
  }

  private async upsertGeneratedPdfDocument(
    tx: Prisma.TransactionClient,
    report: ReportMap,
    stored: StoredFile,
    actorUserId: string | undefined,
    now: Date,
  ) {
    const existingDocumentId =
      typeof report.generatedDocumentId === 'string'
        ? report.generatedDocumentId
        : null;
    const data = {
      documentType: DeliveryDocumentType.SERVICE_REPORT,
      documentId: this.safeText(report.id),
      documentCode: this.safeText(report.code),
      documentTitle: this.safeText(report.title, 'Laudo tecnico'),
      clientId: typeof report.clientId === 'string' ? report.clientId : null,
      counterpartName: this.resolveClientName(report),
      channel: DeliveryChannel.WEBHOOK,
      status: DeliveryStatus.DELIVERED,
      recipientName: this.resolveClientName(report),
      recipientTarget: `portal:${this.safeText(report.clientId)}`,
      subject: `PDF Laudo tecnico ${this.safeText(report.code)}`,
      message: 'PDF final do laudo tecnico gerado pelo sistema.',
      provider: 'manitec-pdf',
      payloadSnapshot: this.buildVersionSnapshot({
        ...report,
        documentHash: stored.checksumSha256,
      }),
      fileStorageKey: stored.storageKey,
      fileName: stored.fileName,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      checksumSha256: stored.checksumSha256,
      storedAt: now,
      sentAt: now,
      deliveredAt: now,
      errorMessage: null,
      failedAt: null,
      createdByUserId: actorUserId,
    } satisfies Prisma.DocumentDeliveryUncheckedCreateInput;

    if (existingDocumentId) {
      return tx.documentDelivery.update({
        where: { id: existingDocumentId },
        data,
      });
    }
    return tx.documentDelivery.create({ data });
  }

  private async ensureValidationToken(
    tx: Prisma.TransactionClient,
    report: ReportMap,
    actorUserId?: string,
  ): Promise<ReportMap> {
    const validationToken =
      typeof report.validationToken === 'string' && report.validationToken
        ? report.validationToken
        : randomBytes(24).toString('hex');
    const validationExpiresAt =
      report.validationExpiresAt instanceof Date
        ? report.validationExpiresAt
        : new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000);
    const documentHash =
      typeof report.documentHash === 'string' && report.documentHash
        ? report.documentHash
        : this.buildDocumentHash({ ...report, validationToken });

    if (
      report.validationToken === validationToken &&
      report.validationExpiresAt instanceof Date &&
      report.documentHash === documentHash
    ) {
      return report;
    }

    return tx.serviceReport.update({
      where: { id: String(report.id) },
      data: {
        validationToken,
        validationExpiresAt,
        documentHash,
        updatedByUserId: actorUserId,
      },
      include: this.internalInclude(),
    }) as Promise<ReportMap>;
  }

  private async ensureReportVersion(
    tx: Prisma.TransactionClient,
    report: ReportMap,
    actorUserId: string | undefined,
    changeReason: string,
    generatedDocumentId?: string,
  ) {
    const reportId = String(report.id);
    const versionNumber =
      typeof report.versionNumber === 'number' ? report.versionNumber : 1;
    const existing = await tx.serviceReportVersion.findUnique({
      where: { reportId_versionNumber: { reportId, versionNumber } },
      select: { id: true, generatedDocumentId: true },
    });
    if (existing) {
      if (generatedDocumentId && !existing.generatedDocumentId) {
        return tx.serviceReportVersion.update({
          where: { id: existing.id },
          data: { generatedDocumentId },
          select: { id: true },
        });
      }
      return existing;
    }

    return tx.serviceReportVersion.create({
      data: {
        reportId,
        versionNumber,
        snapshot: this.buildVersionSnapshot(report),
        generatedDocumentId:
          generatedDocumentId ||
          (typeof report.generatedDocumentId === 'string'
            ? report.generatedDocumentId
            : undefined),
        createdByUserId: actorUserId,
        changeReason,
      },
      select: { id: true },
    });
  }

  private async createGeneratedDocument(
    tx: Prisma.TransactionClient,
    report: ReportMap,
    actorUserId: string | undefined,
    now: Date,
  ) {
    const reportId = this.safeText(report.id);
    const documentCode = this.safeText(report.code);
    const documentTitle = this.safeText(report.title, 'Laudo tecnico');
    return tx.documentDelivery.create({
      data: {
        documentType: DeliveryDocumentType.SERVICE_REPORT,
        documentId: reportId,
        documentCode,
        documentTitle,
        clientId: typeof report.clientId === 'string' ? report.clientId : null,
        counterpartName: this.resolveClientName(report),
        channel: DeliveryChannel.WEBHOOK,
        status: DeliveryStatus.DELIVERED,
        recipientName: this.resolveClientName(report),
        recipientTarget: `internal://service-reports/${reportId}`,
        subject: `Laudo tecnico ${documentCode}`,
        message: 'Documento tecnico gerado em HTML imprimivel.',
        provider: 'manitec-html',
        payloadSnapshot: this.buildVersionSnapshot(report),
        deliveredAt: now,
        createdByUserId: actorUserId,
      },
    });
  }

  private buildVersionSnapshot(report: ReportMap): Prisma.InputJsonValue {
    return JSON.parse(
      JSON.stringify({
        ...this.toCustomerReport(report),
        versionNumber: report.versionNumber ?? 1,
        documentHash: report.documentHash ?? this.buildDocumentHash(report),
        validationUrl: this.getValidationUrl(
          typeof report.validationToken === 'string'
            ? report.validationToken
            : null,
        ),
      }),
    ) as Prisma.InputJsonValue;
  }

  private buildDocumentHash(report: ReportMap) {
    const visibleEvidence = (report.evidences || [])
      .filter((evidence) => evidence.customerVisible)
      .map((evidence) => ({
        id: evidence.id,
        title: evidence.title,
        type: evidence.type,
        checksumSha256: evidence.checksumSha256,
        customerVisible: evidence.customerVisible,
      }));
    const checklistItems = Array.isArray(report.checklistItems)
      ? report.checklistItems.map((item) => ({
          label: item.label,
          result: item.result,
          required: item.required,
          notes: item.notes,
          sortOrder: item.sortOrder,
        }))
      : [];
    const payload = {
      id: report.id,
      code: report.code,
      title: report.title,
      clientId: report.clientId,
      generatorId: report.generatorId,
      maintenanceOrderId: report.maintenanceOrderId,
      status: report.status,
      versionNumber: report.versionNumber ?? 1,
      diagnosis: report.diagnosis,
      performedServices: report.performedServices,
      recommendations: report.recommendations,
      customerNotes: report.customerNotes,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      signedAt: report.signedAt,
      signedByName: report.signedByName,
      releasedToCustomerAt: report.releasedToCustomerAt,
      checklistItems,
      evidences: visibleEvidence,
    };
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private async renderPrintableHtml(
    report: ReportMap,
    options: { audience: 'internal' | 'customer'; evidenceBasePath: string },
  ) {
    const validationToken =
      typeof report.validationToken === 'string'
        ? report.validationToken
        : null;
    const validationUrl = this.getValidationUrl(validationToken);
    const qrCodeDataUrl = validationUrl
      ? await this.generateQrCodeDataUrl(validationUrl)
      : null;
    const isCustomer = options.audience === 'customer';
    const evidences = (report.evidences || []).filter(
      (evidence) => !isCustomer || evidence.customerVisible,
    );
    const checklist = Array.isArray(report.checklistItems)
      ? report.checklistItems
      : [];
    const documentHash =
      typeof report.documentHash === 'string' && report.documentHash
        ? report.documentHash
        : this.buildDocumentHash(report);
    const template = await this.resolveTemplate(report);
    const enabledSections = new Set(
      this.normalizeTemplateSections(template.sectionsConfig)
        .filter((section) => section.enabled !== false)
        .map((section) => section.key),
    );

    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${this.escapeHtml(this.safeText(report.code, 'Laudo tecnico'))}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; color: #0f172a; }
    body { margin: 0; background: #f8fafc; }
    main { max-width: 960px; margin: 0 auto; padding: 32px 20px; }
    header, section { background: #fff; border: 1px solid #dbe3ee; border-radius: 12px; padding: 22px; margin-bottom: 16px; }
    .brand { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; }
    .brand-title { font-size: 28px; font-weight: 800; margin: 0; letter-spacing: 0; }
    .muted { color: #64748b; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .value { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; background: #f8fafc; }
    .label { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; color: #64748b; margin-bottom: 5px; }
    h2 { font-size: 16px; margin: 0 0 12px; }
    p { white-space: pre-wrap; line-height: 1.55; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-top: 1px solid #e2e8f0; padding: 10px; text-align: left; vertical-align: top; }
    th { color: #475569; background: #f8fafc; }
    .evidence { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .evidence article { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; background: #f8fafc; }
    .evidence img { width: 100%; max-height: 260px; object-fit: contain; border-radius: 8px; background: #fff; border: 1px solid #e2e8f0; }
    .qr { width: 128px; height: 128px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px; background: #fff; }
    @media print { body { background: #fff; } main { max-width: none; padding: 0; } header, section { break-inside: avoid; border-radius: 0; } .no-print { display: none; } }
    @media (max-width: 720px) { .brand, .grid, .evidence { grid-template-columns: 1fr; display: grid; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="brand">
        <div>
          <p class="muted" style="margin:0 0 6px;">MANITEC Operacao Integrada</p>
          <h1 class="brand-title">Laudo Tecnico ${this.escapeHtml(this.safeText(report.code))}</h1>
          <p class="muted">${this.escapeHtml(this.safeText(report.title))}</p>
        </div>
        <div>
          ${
            qrCodeDataUrl
              ? `<img class="qr" src="${qrCodeDataUrl}" alt="QR Code de validacao" />`
              : ''
          }
          ${
            validationUrl
              ? `<p class="muted" style="max-width:220px;font-size:12px;word-break:break-word;">Validacao: ${this.escapeHtml(validationUrl)}</p>`
              : ''
          }
        </div>
      </div>
      <div class="grid">
        ${this.valueCard('Cliente', this.resolveClientName(report))}
        ${this.valueCard('Equipamento', this.resolveGeneratorName(report))}
        ${this.valueCard('OS', this.resolveOrderTitle(report))}
        ${this.valueCard('Tecnico', this.resolveTechnicianName(report))}
        ${this.valueCard('Inicio', this.formatDateTime(report.startedAt))}
        ${this.valueCard('Fim', this.formatDateTime(report.finishedAt))}
        ${this.valueCard('Status', this.safeText(report.status, '-'))}
        ${this.valueCard(
          'Versao',
          typeof report.versionNumber === 'number' ? report.versionNumber : 1,
        )}
        ${this.valueCard('Hash', documentHash.slice(0, 16))}
      </div>
    </header>
    ${enabledSections.has('diagnosis') ? this.textSection('Diagnostico', report.diagnosis) : ''}
    ${enabledSections.has('performedServices') ? this.textSection('Servicos realizados', report.performedServices) : ''}
    ${enabledSections.has('recommendations') ? this.textSection('Recomendacoes', report.recommendations) : ''}
    ${enabledSections.has('customerNotes') ? this.textSection('Observacoes ao cliente', report.customerNotes) : ''}
    ${isCustomer ? '' : this.textSection('Observacoes internas', report.observations)}
    ${isCustomer ? '' : this.textSection('Notas internas de seguranca', report.safetyNotes)}
    ${
      enabledSections.has('checklist')
        ? `<section>
      <h2>Checklist</h2>
      ${
        checklist.length === 0
          ? '<p class="muted">Nenhum item de checklist registrado.</p>'
          : `<table><thead><tr><th>Item</th><th>Resultado</th><th>Obs.</th></tr></thead><tbody>${checklist
              .map(
                (item) =>
                  `<tr><td>${this.escapeHtml(this.safeText(item.label, '-'))}</td><td>${this.escapeHtml(this.safeText(item.result, '-'))}</td><td>${this.escapeHtml(this.safeText(item.notes, '-'))}</td></tr>`,
              )
              .join('')}</tbody></table>`
      }
    </section>`
        : ''
    }
    ${
      enabledSections.has('evidences')
        ? `<section>
      <h2>Evidencias</h2>
      ${
        evidences.length === 0
          ? '<p class="muted">Nenhuma evidencia visivel neste documento.</p>'
          : `<div class="evidence">${evidences
              .map((evidence) =>
                this.renderEvidence(evidence, options.evidenceBasePath),
              )
              .join('')}</div>`
      }
    </section>`
        : ''
    }
    ${
      enabledSections.has('signature')
        ? `<section>
      <h2>Assinatura</h2>
      <div class="grid">
        ${this.valueCard('Responsavel', report.signedByName)}
        ${this.valueCard('Papel', report.signerRole)}
        ${this.valueCard('Documento', report.signedByDocument)}
        ${this.valueCard('Assinado em', this.formatDateTime(report.signedAt))}
        ${this.valueCard('Hash assinatura', this.safeText(report.signatureHash, '-').slice(0, 16))}
        ${this.valueCard('Aceite cliente', this.formatDateTime(report.customerAcceptedAt))}
      </div>
      ${
        typeof report.signatureData === 'string' && report.signatureData
          ? `<p>${this.escapeHtml(report.signatureData)}</p>`
          : ''
      }
      ${
        typeof report.acceptanceText === 'string' && report.acceptanceText
          ? `<p class="muted">${this.escapeHtml(report.acceptanceText)}</p>`
          : ''
      }
    </section>`
        : ''
    }
    ${
      enabledSections.has('validation')
        ? `<section>
      <h2>Autenticidade</h2>
      <p class="muted">Hash SHA-256: ${this.escapeHtml(documentHash)}</p>
      <p class="muted">Este documento foi gerado pelo MANITEC Operacao Integrada. Use o QR Code ou o link de validacao para conferir a autenticidade.</p>
    </section>`
        : ''
    }
  </main>
  <script>window.addEventListener('load',function(){if(location.search.includes('print=1')) window.print();});</script>
</body>
</html>`;
  }

  private async generateQrCodeDataUrl(value: string) {
    try {
      const qrCode = await import('qrcode');
      const toDataURL =
        qrCode.toDataURL ||
        (qrCode.default as { toDataURL?: typeof qrCode.toDataURL } | undefined)
          ?.toDataURL;
      return toDataURL ? toDataURL(value, { margin: 1, width: 128 }) : null;
    } catch {
      return null;
    }
  }

  private renderEvidence(
    evidence: Record<string, unknown>,
    evidenceBasePath: string,
  ) {
    const title = this.escapeHtml(this.safeText(evidence.title, 'Evidencia'));
    const type = this.escapeHtml(this.safeText(evidence.type, '-'));
    const description =
      typeof evidence.description === 'string' && evidence.description
        ? `<p>${this.escapeHtml(evidence.description)}</p>`
        : '';
    const fileName =
      typeof evidence.fileName === 'string' && evidence.fileName
        ? `<p class="muted">${this.escapeHtml(evidence.fileName)}</p>`
        : '';
    const evidenceId = this.safeText(evidence.id);
    const downloadPath = `${evidenceBasePath}/${encodeURIComponent(evidenceId)}/download`;
    const image =
      typeof evidence.mimeType === 'string' &&
      evidence.mimeType.startsWith('image/') &&
      evidence.storageKey
        ? `<img src="${downloadPath}" alt="${title}" />`
        : '';
    const download =
      evidence.storageKey || evidence.fileUrl
        ? `<p><a href="${evidence.storageKey ? downloadPath : this.escapeHtml(this.safeText(evidence.fileUrl))}">Abrir evidencia</a></p>`
        : '';
    return `<article><strong>${title}</strong><p class="muted">${type}</p>${image}${description}${fileName}${download}</article>`;
  }

  private textSection(title: string, value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return '';
    return `<section><h2>${this.escapeHtml(title)}</h2><p>${this.escapeHtml(value)}</p></section>`;
  }

  private valueCard(label: string, value: unknown) {
    return `<div class="value"><span class="label">${this.escapeHtml(label)}</span><strong>${this.escapeHtml(this.formatUnknown(value))}</strong></div>`;
  }

  private formatUnknown(value: unknown) {
    if (value instanceof Date) return this.formatDateTime(value);
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
    return '-';
  }

  private safeText(value: unknown, fallback = '') {
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (value instanceof Date) return this.formatDateTime(value);
    return fallback;
  }

  private formatDateTime(value: unknown) {
    if (!value) return '-';
    if (
      !(value instanceof Date) &&
      typeof value !== 'string' &&
      typeof value !== 'number'
    ) {
      return '-';
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(date);
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private resolveClientName(report: ReportMap) {
    const client = report.client as
      | { tradeName?: string | null; companyName?: string | null }
      | undefined;
    return client?.tradeName || client?.companyName || '-';
  }

  private resolveGeneratorName(report: ReportMap) {
    const generator = report.generator as
      | { name?: string | null; serialNumber?: string | null }
      | undefined;
    if (!generator) return '-';
    return [generator.name, generator.serialNumber].filter(Boolean).join(' / ');
  }

  private resolveOrderTitle(report: ReportMap) {
    const order = report.maintenanceOrder as
      | { title?: string | null }
      | undefined;
    return order?.title || '-';
  }

  private resolveTechnicianName(report: ReportMap) {
    const technician = report.technician as
      | { user?: { name?: string | null } | null }
      | undefined;
    return technician?.user?.name || '-';
  }

  private getValidationUrl(token?: string | null) {
    return token
      ? `${this.getAppBaseUrl()}/public/service-reports/verify/${token}`
      : null;
  }

  private getAppBaseUrl() {
    return (
      process.env.APP_BASE_URL ||
      process.env.FRONTEND_URL ||
      'http://localhost:3001'
    ).replace(/\/+$/, '');
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private shareLinkSelect() {
    return {
      id: true,
      reportId: true,
      expiresAt: true,
      revokedAt: true,
      allowPdfDownload: true,
      allowEvidenceDownload: true,
      accessCount: true,
      lastAccessedAt: true,
      createdAt: true,
      createdByUser: { select: { id: true, name: true, email: true } },
    } satisfies Prisma.ServiceReportShareLinkSelect;
  }

  private assertPublicLinkUsable(link: {
    revokedAt?: Date | null;
    expiresAt: Date;
    report: {
      status: ReportStatus;
      revokedAt?: Date | null;
      validationRevokedAt?: Date | null;
    };
  }) {
    const blocked = this.getPublicLinkBlock(link);
    if (blocked) throw new ForbiddenException(blocked.message);
  }

  private getPublicLinkBlock(link: {
    revokedAt?: Date | null;
    expiresAt: Date;
    report: {
      status: ReportStatus;
      revokedAt?: Date | null;
      validationRevokedAt?: Date | null;
    };
  }) {
    if (link.revokedAt) {
      return {
        result: DocumentAccessResult.REVOKED,
        message: 'Link publico revogado.',
      };
    }
    if (link.report.revokedAt || link.report.validationRevokedAt) {
      return {
        result: DocumentAccessResult.REVOKED,
        message: 'Documento revogado.',
      };
    }
    if (link.expiresAt.getTime() <= Date.now()) {
      return {
        result: DocumentAccessResult.EXPIRED,
        message: 'Link publico expirado.',
      };
    }
    if (link.report.status !== ReportStatus.RELEASED_TO_CUSTOMER) {
      return {
        result: DocumentAccessResult.DENIED,
        message: 'Laudo nao esta liberado ao cliente.',
      };
    }
    return null;
  }

  private async resolveTemplate(
    report: ReportMap,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    const explicitTemplateId =
      typeof report.templateId === 'string' ? report.templateId : null;
    if (explicitTemplateId) {
      const explicit = await db.serviceReportTemplate.findFirst({
        where: { id: explicitTemplateId, active: true },
      });
      if (explicit) return explicit;
    }

    const generator = report.generator as
      | { modelId?: string | null }
      | undefined;
    const order = report.maintenanceOrder as
      | { type?: Prisma.EnumMaintenanceOrderTypeFilter | string | null }
      | undefined;
    if (generator?.modelId) {
      const byModel = await db.serviceReportTemplate.findFirst({
        where: {
          active: true,
          defaultForGeneratorModelId: generator.modelId,
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (byModel) return byModel;
    }
    if (typeof order?.type === 'string') {
      const byType = await db.serviceReportTemplate.findFirst({
        where: {
          active: true,
          defaultForOrderType: order.type as never,
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (byType) return byType;
    }
    const defaultTemplate = await db.serviceReportTemplate.findFirst({
      where: {
        OR: [{ id: 'default-manitec-service-report' }, { active: true }],
      },
      orderBy: [{ id: 'asc' }],
    });
    return (
      defaultTemplate ?? {
        id: 'fallback-manitec-service-report',
        name: 'Padrao MANITEC',
        description: 'Fallback interno MANITEC',
        active: true,
        defaultForGeneratorModelId: null,
        defaultForOrderType: null,
        sectionsConfig: this.defaultTemplateSections(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    );
  }

  private normalizeTemplateSections(value: unknown): PdfTemplateSection[] {
    const defaults = this.defaultTemplateSections();
    const configured = Array.isArray(value)
      ? value
          .filter((item): item is Record<string, unknown> => Boolean(item))
          .map((item) => ({
            key: this.safeText(item.key),
            label: this.safeText(item.label),
            enabled:
              typeof item.enabled === 'boolean' ? item.enabled : undefined,
            order: typeof item.order === 'number' ? item.order : undefined,
          }))
          .filter((item) => item.key)
      : [];
    const merged = new Map(defaults.map((section) => [section.key, section]));
    for (const section of configured) {
      merged.set(section.key, { ...merged.get(section.key), ...section });
    }
    return [...merged.values()].sort(
      (a, b) => (a.order ?? 999) - (b.order ?? 999),
    );
  }

  private defaultTemplateSections(): PdfTemplateSection[] {
    return [
      {
        key: 'identification',
        label: 'Identificacao',
        enabled: true,
        order: 1,
      },
      { key: 'diagnosis', label: 'Diagnostico', enabled: true, order: 2 },
      {
        key: 'performedServices',
        label: 'Servicos realizados',
        enabled: true,
        order: 3,
      },
      { key: 'checklist', label: 'Checklist', enabled: true, order: 4 },
      { key: 'evidences', label: 'Evidencias', enabled: true, order: 5 },
      {
        key: 'recommendations',
        label: 'Recomendacoes',
        enabled: true,
        order: 6,
      },
      {
        key: 'customerNotes',
        label: 'Observacoes ao cliente',
        enabled: true,
        order: 7,
      },
      { key: 'signature', label: 'Assinatura', enabled: true, order: 8 },
      { key: 'validation', label: 'Validacao', enabled: true, order: 9 },
    ];
  }

  private buildPdfInput(
    report: ReportMap,
    template: { sectionsConfig?: unknown } | null,
  ) {
    const generator = report.generator as
      | { name?: string | null; serialNumber?: string | null }
      | undefined;
    const client = report.client as
      | { companyName?: string | null; tradeName?: string | null }
      | undefined;
    const order = report.maintenanceOrder as
      | { title?: string | null }
      | undefined;
    const site = report.site as { name?: string | null } | undefined;
    const technician = report.technician as
      | { user?: { name?: string | null } | null }
      | undefined;
    const evidences = (report.evidences || []).filter(
      (evidence) => evidence.customerVisible,
    );
    return {
      code: this.safeText(report.code),
      title: this.safeText(report.title, 'Laudo tecnico'),
      clientName: client?.tradeName || client?.companyName || '-',
      orderTitle: order?.title || '-',
      generatorName: generator?.name || '-',
      generatorSerial: generator?.serialNumber || null,
      siteName: site?.name || null,
      technicianName: technician?.user?.name || null,
      diagnosis: this.safeText(report.diagnosis),
      performedServices: this.safeText(report.performedServices),
      recommendations: this.safeText(report.recommendations),
      customerNotes: this.safeText(report.customerNotes),
      startedAt: this.dateLike(report.startedAt),
      finishedAt: this.dateLike(report.finishedAt),
      signedAt: this.dateLike(report.signedAt),
      signedByName: this.safeText(report.signedByName),
      signedByDocument: this.safeText(report.signedByDocument),
      releasedToCustomerAt: this.dateLike(report.releasedToCustomerAt),
      versionNumber:
        typeof report.versionNumber === 'number' ? report.versionNumber : 1,
      documentHash:
        typeof report.documentHash === 'string' && report.documentHash
          ? report.documentHash
          : this.buildDocumentHash(report),
      validationUrl: this.getValidationUrl(
        typeof report.validationToken === 'string'
          ? report.validationToken
          : null,
      ),
      sections: this.normalizeTemplateSections(template?.sectionsConfig),
      checklistItems: Array.isArray(report.checklistItems)
        ? report.checklistItems.map((item) => ({
            label: this.safeText(item.label),
            result: this.safeText(item.result),
            notes: this.safeText(item.notes),
          }))
        : [],
      evidences: evidences.map((evidence) => ({
        title: this.safeText(evidence.title),
        type: this.safeText(evidence.type),
        description: this.safeText(evidence.description),
        fileName: this.safeText(evidence.fileName),
        checksumSha256: this.safeText(evidence.checksumSha256),
        customerVisible: Boolean(evidence.customerVisible),
      })),
    };
  }

  private dateLike(value: unknown) {
    if (value instanceof Date || typeof value === 'string') return value;
    return null;
  }

  private safeFileSegment(value: unknown) {
    return (
      this.safeText(value, 'laudo')
        .replace(/[^a-z0-9_-]+/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80) || 'laudo'
    );
  }

  private toCustomerReport(report: ReportMap) {
    return {
      id: report.id,
      code: report.code,
      title: report.title,
      status: report.status,
      diagnosis: report.diagnosis,
      performedServices: report.performedServices,
      recommendations: report.recommendations,
      customerNotes: report.customerNotes,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      signedAt: report.signedAt,
      signedByName: report.signedByName,
      signedByDocument: report.signedByDocument,
      signatureData: report.signatureData,
      signerRole: report.signerRole,
      signerEmail: report.signerEmail,
      acceptanceText: report.acceptanceText,
      evidenceHash: report.evidenceHash,
      signatureHash: report.signatureHash,
      signatureVersion: report.signatureVersion ?? 1,
      releasedToCustomerAt: report.releasedToCustomerAt,
      retentionUntil: report.retentionUntil,
      legalHold: report.legalHold,
      revokedAt: report.revokedAt,
      archivedAt: report.archivedAt,
      customerAcceptedAt: report.customerAcceptedAt,
      customerAcceptedByUserId: report.customerAcceptedByUserId,
      customerAcceptanceText: report.customerAcceptanceText,
      customerAcceptanceHash: report.customerAcceptanceHash,
      customerAcceptanceDocumentHash: report.customerAcceptanceDocumentHash,
      maintenanceOrder: report.maintenanceOrder,
      client: report.client,
      generator: report.generator,
      site: report.site,
      contract: report.contract,
      technician: report.technician,
      checklistItems: report.checklistItems,
      evidences: this.toCustomerEvidences(report.evidences),
      generatedDocument: report.generatedDocument
        ? {
            id: report.generatedDocument.id,
            documentType: report.generatedDocument.documentType,
            documentCode: report.generatedDocument.documentCode,
            documentTitle: report.generatedDocument.documentTitle,
            fileName: report.generatedDocument.fileName,
            mimeType: report.generatedDocument.mimeType,
            sizeBytes: report.generatedDocument.sizeBytes,
            checksumSha256: report.generatedDocument.checksumSha256,
            storedAt: report.generatedDocument.storedAt,
            hasStoredFile: Boolean(report.generatedDocument.fileStorageKey),
            createdAt: report.generatedDocument.createdAt,
          }
        : null,
      versionNumber: report.versionNumber ?? 1,
      documentHash: report.documentHash,
      validationExpiresAt: report.validationExpiresAt,
      validationUrl: this.getValidationUrl(
        typeof report.validationToken === 'string'
          ? report.validationToken
          : null,
      ),
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }

  private toCustomerEvidences(evidences: ReportMap['evidences'] | undefined) {
    return (evidences || []).map((evidence) => ({
      id: evidence.id,
      type: evidence.type,
      title: evidence.title,
      description: evidence.description,
      fileUrl: evidence.fileUrl,
      fileName: evidence.fileName,
      mimeType: evidence.mimeType,
      sizeBytes: evidence.sizeBytes,
      checksumSha256: evidence.checksumSha256,
      storedAt: evidence.storedAt,
      hasStoredFile: Boolean(evidence.storageKey),
      customerVisible: evidence.customerVisible,
      createdAt: evidence.createdAt,
    }));
  }

  private internalInclude() {
    return {
      maintenanceOrder: {
        select: {
          id: true,
          title: true,
          status: true,
          type: true,
          priority: true,
          startedAt: true,
          finishedAt: true,
          openedAt: true,
        },
      },
      client: { select: { id: true, companyName: true, tradeName: true } },
      generator: {
        select: {
          id: true,
          name: true,
          serialNumber: true,
          brand: true,
          power: true,
          modelId: true,
        },
      },
      site: { select: { id: true, name: true, code: true } },
      contract: { select: { id: true, code: true, title: true, status: true } },
      template: {
        select: {
          id: true,
          name: true,
          sectionsConfig: true,
        },
      },
      technician: {
        select: {
          id: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
      releasedByUser: { select: { id: true, name: true, email: true } },
      generatedDocument: {
        select: {
          id: true,
          documentType: true,
          documentCode: true,
          documentTitle: true,
          status: true,
          channel: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          checksumSha256: true,
          storedAt: true,
          fileStorageKey: true,
          createdAt: true,
        },
      },
      checklistItems: { orderBy: { sortOrder: 'asc' } },
      evidences: { orderBy: { createdAt: 'desc' } },
    } satisfies Prisma.ServiceReportInclude;
  }

  private customerInclude() {
    return {
      maintenanceOrder: {
        select: {
          id: true,
          title: true,
          status: true,
          type: true,
          openedAt: true,
          finishedAt: true,
        },
      },
      client: { select: { id: true, companyName: true, tradeName: true } },
      generator: {
        select: {
          id: true,
          name: true,
          serialNumber: true,
          brand: true,
          power: true,
          modelId: true,
        },
      },
      site: { select: { id: true, name: true, code: true } },
      contract: { select: { id: true, code: true, title: true, status: true } },
      technician: {
        select: {
          id: true,
          user: { select: { id: true, name: true } },
        },
      },
      generatedDocument: {
        select: {
          id: true,
          documentType: true,
          documentCode: true,
          documentTitle: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          checksumSha256: true,
          storedAt: true,
          fileStorageKey: true,
          createdAt: true,
        },
      },
      checklistItems: { orderBy: { sortOrder: 'asc' } },
      evidences: {
        where: { customerVisible: true },
        orderBy: { createdAt: 'desc' },
      },
    } satisfies Prisma.ServiceReportInclude;
  }
}
