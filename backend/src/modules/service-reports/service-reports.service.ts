import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuditDomain,
  ChecklistResult,
  DeliveryChannel,
  DeliveryDocumentType,
  DeliveryStatus,
  OrderStatus,
  Prisma,
  ReportStatus,
  UserRole,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  AddServiceReportEvidenceDto,
  CancelServiceReportDto,
  CreateServiceReportDto,
  ListServiceReportsQueryDto,
  SignServiceReportDto,
  UpdateServiceReportChecklistDto,
  UpdateServiceReportDto,
} from './dto/service-report.dto';

type RequestMetadata = {
  ip?: string;
  userAgent?: string | string[];
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

type ReportMap = Record<string, unknown> & {
  evidences?: Array<Record<string, unknown> & { customerVisible?: boolean }>;
  generatedDocument?:
    | (Record<string, unknown> & {
        id?: unknown;
        documentType?: unknown;
        documentCode?: unknown;
        documentTitle?: unknown;
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
    return report;
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

      const updated = await tx.serviceReport.update({
        where: { id },
        data: {
          signedByName: dto.signedByName,
          signedByDocument: dto.signedByDocument,
          signatureData: dto.signatureData,
          signedAt: new Date(),
          signatureIp: metadata.ip,
          signatureUserAgent: this.normalizeUserAgent(metadata.userAgent),
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
      const document =
        current.generatedDocumentId !== null
          ? null
          : await tx.documentDelivery.create({
              data: {
                documentType: DeliveryDocumentType.SERVICE_REPORT,
                documentId: current.id,
                documentCode: current.code,
                documentTitle: current.title,
                clientId: current.clientId,
                counterpartName:
                  current.client.tradeName || current.client.companyName,
                channel: DeliveryChannel.WEBHOOK,
                status: DeliveryStatus.DELIVERED,
                recipientName: 'Portal do Cliente',
                recipientTarget: `portal:${current.clientId}`,
                subject: `Laudo tecnico ${current.code}`,
                message: 'Laudo tecnico liberado no Portal do Cliente.',
                payloadSnapshot: this.portalSnapshot(current),
                sentAt: now,
                deliveredAt: now,
                createdByUserId: actor.id,
              },
            });

      const updated = await tx.serviceReport.update({
        where: { id },
        data: {
          status: ReportStatus.RELEASED_TO_CUSTOMER,
          customerVisible: true,
          releasedToCustomerAt: now,
          releasedByUserId: actor.id,
          generatedDocumentId: document?.id ?? current.generatedDocumentId,
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
          documentDeliveryId: document?.id ?? current.generatedDocumentId,
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

  private toCustomerReport(report: ReportMap) {
    return {
      id: report.id,
      code: report.code,
      title: report.title,
      status: report.status,
      diagnosis: report.diagnosis,
      performedServices: report.performedServices,
      recommendations: report.recommendations,
      observations: report.observations,
      customerNotes: report.customerNotes,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      signedAt: report.signedAt,
      signedByName: report.signedByName,
      signedByDocument: report.signedByDocument,
      signatureData: report.signatureData,
      releasedToCustomerAt: report.releasedToCustomerAt,
      maintenanceOrder: report.maintenanceOrder,
      client: report.client,
      generator: report.generator,
      site: report.site,
      contract: report.contract,
      technician: report.technician,
      checklistItems: report.checklistItems,
      evidences: report.evidences,
      generatedDocument: report.generatedDocument
        ? {
            id: report.generatedDocument.id,
            documentType: report.generatedDocument.documentType,
            documentCode: report.generatedDocument.documentCode,
            documentTitle: report.generatedDocument.documentTitle,
            createdAt: report.generatedDocument.createdAt,
          }
        : null,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
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
        },
      },
      site: { select: { id: true, name: true, code: true } },
      contract: { select: { id: true, code: true, title: true, status: true } },
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
