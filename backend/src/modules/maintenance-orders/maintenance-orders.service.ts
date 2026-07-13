import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalStatus,
  ApprovalType,
  AuditDomain,
  CostCenterEntryType,
  GeneratorCriticality,
  GeneratorLifecycleStatus,
  GeneratorOperationalStatus,
  InventoryMovementType,
  MaintenanceOrderType,
  OrderStatus,
  Prisma,
  SkillLevel,
  TechnicianWorkSessionStatus,
  TimeEntrySource,
  TimeEntryStatus,
  UserRole,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateMaintenanceOrderDto } from './dto/create-maintenance-order.dto';
import { ListMaintenanceOrdersQueryDto } from './dto/list-maintenance-orders-query.dto';
import { UpdateMaintenanceOrderDto } from './dto/update-maintenance-order.dto';

type AssignmentValidationResult = {
  warnings: string[];
};

@Injectable()
export class MaintenanceOrdersService {
  constructor(
    private readonly prisma: DatabaseService,
    private readonly approvalsService: ApprovalsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(dto: CreateMaintenanceOrderDto, actorUserId?: string) {
    await this.assertInternalActor(actorUserId);
    return this.prisma.$transaction((tx) =>
      this.createInTransaction(tx, dto, actorUserId),
    );
  }

  async createInTransaction(
    tx: Prisma.TransactionClient,
    dto: CreateMaintenanceOrderDto,
    actorUserId?: string,
  ) {
    const generator = await this.ensureGeneratorAndSite(
      tx,
      dto.generatorId,
      dto.siteId,
      dto.contractId,
    );
    const assignmentValidation = await this.ensureTechnicianAssignmentRules(
      tx,
      {
        orderId: null,
        generatorId: dto.generatorId,
        generatorCriticality: generator.criticality,
        technicianId: dto.technicianId,
        checklistData: dto.checklistData,
        assignmentJustification: dto.assignmentJustification,
        assignmentOverrideApprovalId: dto.assignmentOverrideApprovalId,
        certificationJustification: dto.certificationJustification,
        actorUserId,
      },
    );

    const reservedMap = dto.materials?.length
      ? await this.reserveMaterials(
          tx,
          dto.materials,
          'MAINTENANCE_ORDER',
          dto.title,
        )
      : new Map<string, string>();

    const order = await tx.maintenanceOrder.create({
      data: {
        title: dto.title,
        description: dto.description,
        auvoId: dto.auvoId,
        auvoLink: dto.auvoLink,
        type: dto.type ?? MaintenanceOrderType.CORRECTIVE,
        status: dto.status ?? OrderStatus.OPEN,
        priority: dto.priority,
        customerReport: dto.customerReport,
        checklistData: dto.checklistData as Prisma.InputJsonValue | undefined,
        customerSignatureUrl: dto.customerSignatureUrl,
        displacementStartedAt: dto.displacementStartedAt
          ? new Date(dto.displacementStartedAt)
          : undefined,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
        pausedAt: dto.pausedAt ? new Date(dto.pausedAt) : undefined,
        finishedAt: dto.finishedAt ? new Date(dto.finishedAt) : undefined,
        scheduledTo: dto.scheduledTo ? new Date(dto.scheduledTo) : undefined,
        laborHours: dto.laborHours,
        hourMeterAfter: dto.hourMeterAfter,
        generatorId: dto.generatorId,
        siteId: dto.siteId,
        contractId: dto.contractId,
        technicianId: dto.technicianId,
        materials: dto.materials?.length
          ? {
              create: dto.materials.map((item) => ({
                catalogItemId: item.catalogItemId,
                warehouseId:
                  item.warehouseId ||
                  reservedMap.get(`${item.catalogItemId}:${item.quantity}`),
                quantity: item.quantity,
                unitCost: item.unitCost,
                reservedAt: new Date(),
              })),
            }
          : undefined,
      },
    });

    await this.applyGeneratorStatusOnOrderChange(
      tx,
      dto.generatorId,
      dto.type ?? MaintenanceOrderType.CORRECTIVE,
      dto.status ?? OrderStatus.OPEN,
      dto.hourMeterAfter,
    );

    if ((dto.status ?? OrderStatus.OPEN) === OrderStatus.COMPLETED) {
      await this.finalizeCompletedOrder(tx, order.id, actorUserId);
    }

    const fullOrder = await tx.maintenanceOrder.findUnique({
      where: { id: order.id },
      include: this.orderInclude(),
    });

    await this.auditLogsService.record(
      {
        domain: AuditDomain.MAINTENANCE_ORDERS,
        entityType: 'MAINTENANCE_ORDER',
        entityId: order.id,
        action: 'CREATE',
        actorUserId,
        afterPayload: {
          status: dto.status ?? OrderStatus.OPEN,
          generatorId: dto.generatorId,
          technicianId: dto.technicianId,
          warnings: assignmentValidation.warnings,
        } as unknown as Prisma.InputJsonValue,
      },
      tx,
    );

    if (!fullOrder) return fullOrder;
    if (assignmentValidation.warnings.length === 0) return fullOrder;
    return {
      ...fullOrder,
      dispatchWarnings: assignmentValidation.warnings,
    };
  }

  async findAll(
    actorUserId?: string,
    query: ListMaintenanceOrdersQueryDto = {},
  ) {
    const scope = await this.getActorScope(actorUserId);
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 100)));
    const search = query.search?.trim();
    const where: Prisma.MaintenanceOrderWhereInput = {
      status: query.status,
      type: query.type,
      technicianId:
        scope?.role === UserRole.TECHNICIAN
          ? this.requireActorTechnicianId(scope)
          : query.technicianId,
      generatorId: query.generatorId,
      scheduledTo:
        query.dateFrom || query.dateTo
          ? {
              gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
              lte: query.dateTo ? new Date(query.dateTo) : undefined,
            }
          : undefined,
      generator:
        scope?.role === UserRole.CLIENT
          ? { clientId: this.requireLinkedClientId(scope) }
          : query.clientId
            ? { clientId: query.clientId }
            : undefined,
      OR: search
        ? [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            {
              generator: {
                name: { contains: search, mode: 'insensitive' },
              },
            },
            {
              generator: {
                client: {
                  companyName: { contains: search, mode: 'insensitive' },
                },
              },
            },
          ]
        : undefined,
    };

    return this.prisma.maintenanceOrder.findMany({
      where,
      include: this.orderInclude(),
      orderBy: [{ scheduledTo: 'asc' }, { openedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  async findOne(id: string, actorUserId?: string) {
    const order = await this.prisma.maintenanceOrder.findUnique({
      where: { id },
      include: this.orderInclude(),
    });

    if (!order) {
      throw new NotFoundException('OS nao encontrada.');
    }

    await this.assertOrderScope(
      order.generator.client.id,
      actorUserId,
      order.technicianId,
    );
    return order;
  }

  async update(
    id: string,
    dto: UpdateMaintenanceOrderDto,
    actorUserId?: string,
  ) {
    const actor = await this.assertInternalActor(actorUserId);
    const current = await this.prisma.maintenanceOrder.findUnique({
      where: { id },
      select: {
        id: true,
        generatorId: true,
        status: true,
        type: true,
        technicianId: true,
        checklistData: true,
      },
    });

    if (!current) {
      throw new NotFoundException('OS nao encontrada.');
    }
    await this.assertTechnicianOrderUpdateScope(actor, current, dto);
    if (current.status === OrderStatus.CANCELED) {
      throw new BadRequestException('OS cancelada nao pode ser alterada.');
    }
    if (dto.materials?.length && current.status === OrderStatus.COMPLETED) {
      throw new BadRequestException(
        'Materiais de OS concluida ou cancelada nao podem ser alterados.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const targetGeneratorId = dto.generatorId ?? current.generatorId;
      const generator = await this.ensureGeneratorAndSite(
        tx,
        targetGeneratorId,
        dto.siteId,
        dto.contractId,
      );
      const assignmentValidation = await this.ensureTechnicianAssignmentRules(
        tx,
        {
          orderId: id,
          generatorId: targetGeneratorId,
          generatorCriticality: generator.criticality,
          technicianId: dto.technicianId ?? current.technicianId ?? undefined,
          checklistData:
            dto.checklistData ??
            (current.checklistData as Record<string, unknown> | undefined),
          assignmentJustification: dto.assignmentJustification,
          assignmentOverrideApprovalId: dto.assignmentOverrideApprovalId,
          certificationJustification: dto.certificationJustification,
          actorUserId,
        },
      );

      if (dto.materials?.length) {
        await this.releaseMaterialsByOrder(tx, id);
        const reservedMap = await this.reserveMaterials(
          tx,
          dto.materials,
          'MAINTENANCE_ORDER',
          id,
        );
        await tx.maintenanceOrderMaterial.deleteMany({
          where: { orderId: id },
        });
        await tx.maintenanceOrderMaterial.createMany({
          data: dto.materials.map((item) => ({
            orderId: id,
            catalogItemId: item.catalogItemId,
            warehouseId:
              item.warehouseId ||
              reservedMap.get(`${item.catalogItemId}:${item.quantity}`),
            quantity: item.quantity,
            unitCost: item.unitCost,
            reservedAt: new Date(),
          })),
        });
      }

      const before = await tx.maintenanceOrder.findUnique({
        where: { id },
        include: this.orderInclude(),
      });

      const updated = await tx.maintenanceOrder.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          auvoId: dto.auvoId,
          auvoLink: dto.auvoLink,
          type: dto.type,
          status: dto.status,
          priority: dto.priority,
          customerReport: dto.customerReport,
          checklistData: dto.checklistData as Prisma.InputJsonValue | undefined,
          customerSignatureUrl: dto.customerSignatureUrl,
          displacementStartedAt: dto.displacementStartedAt
            ? new Date(dto.displacementStartedAt)
            : undefined,
          startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
          pausedAt: dto.pausedAt ? new Date(dto.pausedAt) : undefined,
          finishedAt: dto.finishedAt ? new Date(dto.finishedAt) : undefined,
          closedAt:
            dto.status === OrderStatus.COMPLETED ||
            dto.status === OrderStatus.CANCELED
              ? dto.finishedAt
                ? new Date(dto.finishedAt)
                : new Date()
              : undefined,
          scheduledTo: dto.scheduledTo ? new Date(dto.scheduledTo) : undefined,
          laborHours: dto.laborHours,
          hourMeterAfter: dto.hourMeterAfter,
          generatorId: dto.generatorId,
          siteId: dto.siteId,
          contractId: dto.contractId,
          technicianId: dto.technicianId,
          materials: undefined,
        },
      });

      await this.applyGeneratorStatusOnOrderChange(
        tx,
        updated.generatorId,
        updated.type,
        dto.status ?? current.status,
        dto.hourMeterAfter,
      );

      if (
        updated.status === OrderStatus.CANCELED &&
        current.status !== OrderStatus.CANCELED
      ) {
        await this.releaseMaterialsByOrder(tx, id);
      }

      if (
        updated.status === OrderStatus.COMPLETED &&
        current.status !== OrderStatus.COMPLETED
      ) {
        await this.finalizeCompletedOrder(tx, id, actorUserId);
      }

      const fullOrder = await tx.maintenanceOrder.findUnique({
        where: { id },
        include: this.orderInclude(),
      });

      await this.auditLogsService.record(
        {
          domain: AuditDomain.MAINTENANCE_ORDERS,
          entityType: 'MAINTENANCE_ORDER',
          entityId: id,
          action: 'UPDATE',
          actorUserId,
          beforePayload: before as unknown as Prisma.InputJsonValue,
          afterPayload: {
            order: fullOrder,
            warnings: assignmentValidation.warnings,
          } as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      if (!fullOrder) return fullOrder;
      if (assignmentValidation.warnings.length === 0) return fullOrder;
      return {
        ...fullOrder,
        dispatchWarnings: assignmentValidation.warnings,
      };
    });
  }

  async submitVisitReport(
    id: string,
    actorUserId: string,
    report: string,
    note?: string,
  ) {
    await this.assertInternalActor(actorUserId);
    const current = await this.prisma.maintenanceOrder.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!current) throw new NotFoundException('OS nao encontrada.');

    const updated = await this.prisma.maintenanceOrder.update({
      where: { id },
      data: {
        customerReport: report,
        status:
          current.status === OrderStatus.OPEN
            ? OrderStatus.IN_PROGRESS
            : current.status,
      },
      include: this.orderInclude(),
    });

    const approvalRequest = await this.approvalsService.create({
      type: ApprovalType.RVT_SIGNOFF,
      entityType: 'MAINTENANCE_ORDER',
      entityId: id,
      requesterUserId: actorUserId,
      requestNote: note || 'Relatorio de visita tecnica submetido para gestor.',
    });

    await this.auditLogsService.record({
      domain: AuditDomain.MAINTENANCE_ORDERS,
      entityType: 'MAINTENANCE_ORDER',
      entityId: id,
      action: 'VISIT_REPORT_SUBMITTED',
      actorUserId,
      afterPayload: {
        approvalRequestId: approvalRequest.id,
      },
      reason: note,
    });

    return {
      order: updated,
      approvalRequest,
    };
  }

  async remove(id: string, actorUserId?: string) {
    await this.assertInternalActor(actorUserId);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.maintenanceOrder.findUnique({
        where: { id },
        include: this.orderInclude(),
      });

      await this.releaseMaterialsByOrder(tx, id);
      const removed = await tx.maintenanceOrder.delete({
        where: { id },
      });

      await this.auditLogsService.record(
        {
          domain: AuditDomain.MAINTENANCE_ORDERS,
          entityType: 'MAINTENANCE_ORDER',
          entityId: id,
          action: 'DELETE',
          actorUserId,
          beforePayload: before as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return removed;
    });
  }

  private async getActorScope(actorUserId?: string) {
    if (!actorUserId) {
      return null;
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: {
        id: true,
        role: true,
        linkedClientId: true,
        technicianProfile: {
          select: { id: true },
        },
      },
    });

    if (!actor) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    return actor;
  }

  private requireLinkedClientId(actor: { linkedClientId: string | null }) {
    if (!actor.linkedClientId) {
      throw new ForbiddenException(
        'Conta de cliente sem empresa vinculada ao portal.',
      );
    }

    return actor.linkedClientId;
  }

  private async assertInternalActor(actorUserId?: string) {
    const actor = await this.getActorScope(actorUserId);
    if (actor?.role === UserRole.CLIENT) {
      throw new ForbiddenException(
        'Usuarios do portal do cliente nao podem executar esta acao.',
      );
    }
    return actor;
  }

  private async assertOrderScope(
    clientId: string,
    actorUserId?: string,
    technicianId?: string | null,
  ) {
    const actor = await this.getActorScope(actorUserId);
    if (actor?.role === UserRole.TECHNICIAN) {
      if (technicianId !== this.requireActorTechnicianId(actor)) {
        throw new NotFoundException('OS nao encontrada.');
      }
      return;
    }

    if (actor?.role !== UserRole.CLIENT) {
      return;
    }

    if (clientId !== this.requireLinkedClientId(actor)) {
      throw new NotFoundException('OS nao encontrada.');
    }
  }

  private requireActorTechnicianId(actor: {
    technicianProfile?: { id: string } | null;
  }) {
    if (!actor.technicianProfile?.id) {
      throw new ForbiddenException(
        'Usuario tecnico sem perfil de tecnico vinculado.',
      );
    }
    return actor.technicianProfile.id;
  }

  private async assertTechnicianOrderUpdateScope(
    actor: {
      role: UserRole;
      technicianProfile?: { id: string } | null;
    } | null,
    current: {
      id: string;
      technicianId: string | null;
    },
    dto: UpdateMaintenanceOrderDto,
  ) {
    if (actor?.role !== UserRole.TECHNICIAN) return;

    const technicianId = this.requireActorTechnicianId(actor);
    if (current.technicianId !== technicianId) {
      throw new NotFoundException('OS nao encontrada.');
    }

    if (dto.technicianId && dto.technicianId !== technicianId) {
      throw new ForbiddenException(
        'Tecnico nao pode transferir OS para outro tecnico.',
      );
    }

    if (
      dto.generatorId ||
      dto.siteId ||
      dto.contractId ||
      dto.materials?.length
    ) {
      throw new ForbiddenException(
        'Tecnico nao pode alterar cliente, equipamento, contrato ou materiais da OS.',
      );
    }

    if (dto.status === OrderStatus.CANCELED) {
      throw new ForbiddenException('Tecnico nao pode cancelar OS diretamente.');
    }

    if (dto.status !== OrderStatus.COMPLETED) return;

    const openSession = await this.prisma.technicianWorkSession.findFirst({
      where: {
        maintenanceOrderId: current.id,
        technicianId,
        status: TechnicianWorkSessionStatus.OPEN,
      },
      select: { id: true },
    });

    if (openSession) {
      throw new BadRequestException(
        'Finalize o check-out antes de concluir a OS.',
      );
    }
  }

  private async ensureGeneratorAndSite(
    tx: Prisma.TransactionClient,
    generatorId: string,
    siteId?: string,
    contractId?: string,
  ) {
    const generator = await tx.generator.findUnique({
      where: { id: generatorId },
      select: { id: true, clientId: true, criticality: true },
    });
    if (!generator) {
      throw new NotFoundException('Gerador nao encontrado.');
    }

    if (!siteId && !contractId) return generator;

    if (siteId) {
      const site = await tx.site.findUnique({
        where: { id: siteId },
        select: { id: true, clientId: true },
      });
      if (!site || site.clientId !== generator.clientId) {
        throw new BadRequestException(
          'Local/obra invalido para o cliente do gerador.',
        );
      }
    }

    if (contractId) {
      const contract = await tx.serviceContract.findUnique({
        where: { id: contractId },
        select: { id: true, clientId: true },
      });
      if (!contract || contract.clientId !== generator.clientId) {
        throw new BadRequestException(
          'Contrato invalido para o cliente do gerador.',
        );
      }
    }

    return generator;
  }

  private async ensureTechnicianAssignmentRules(
    tx: Prisma.TransactionClient,
    input: {
      orderId: string | null;
      generatorId: string;
      generatorCriticality: GeneratorCriticality;
      technicianId?: string;
      checklistData?: Record<string, unknown>;
      assignmentJustification?: string;
      assignmentOverrideApprovalId?: string;
      certificationJustification?: string;
      actorUserId?: string;
    },
  ): Promise<AssignmentValidationResult> {
    const warnings: string[] = [];
    if (!input.technicianId) return { warnings };

    const technician = await tx.technician.findUnique({
      where: { id: input.technicianId },
      include: {
        user: {
          select: { id: true, name: true, skillLevel: true },
        },
      },
    });

    if (!technician) {
      throw new BadRequestException('Tecnico informado nao existe.');
    }

    const requiredSkill = this.minimumSkillForCriticality(
      input.generatorCriticality,
    );
    const technicianRank = this.skillRank(technician.user.skillLevel);
    const requiredRank = this.skillRank(requiredSkill);

    if (technicianRank < requiredRank) {
      if (!input.assignmentJustification?.trim()) {
        throw new BadRequestException(
          `Tecnico abaixo da senioridade minima para criticidade ${input.generatorCriticality}. Informe justificativa para solicitar excecao.`,
        );
      }

      if (!input.assignmentOverrideApprovalId) {
        if (!input.actorUserId) {
          throw new BadRequestException(
            'Solicitante nao identificado para abrir aprovacao de excecao.',
          );
        }

        const approvalRequest = await this.approvalsService.create({
          type: ApprovalType.RVT_SIGNOFF,
          entityType: 'MAINTENANCE_ORDER_ASSIGNMENT',
          entityId:
            input.orderId || `${input.generatorId}:${input.technicianId}`,
          requesterUserId: input.actorUserId,
          requestNote: input.assignmentJustification,
        });

        throw new BadRequestException(
          `Excecao de senioridade pendente. Solicite aprovacao do gestor (ID: ${approvalRequest.id}).`,
        );
      }

      await this.validateAssignmentOverrideApproval(
        tx,
        input.assignmentOverrideApprovalId,
        input.orderId || `${input.generatorId}:${input.technicianId}`,
      );

      warnings.push(
        `Excecao de senioridade aplicada para tecnico ${technician.user.name}.`,
      );

      await this.auditLogsService.record(
        {
          domain: AuditDomain.MAINTENANCE_ORDERS,
          entityType: 'MAINTENANCE_ORDER',
          entityId:
            input.orderId || `${input.generatorId}:${input.technicianId}`,
          action: 'DISPATCH_SENIORITY_OVERRIDE',
          actorUserId: input.actorUserId,
          reason: input.assignmentJustification,
          afterPayload: {
            technicianId: input.technicianId,
            technicianSkill: technician.user.skillLevel,
            requiredSkill,
            approvalRequestId: input.assignmentOverrideApprovalId,
          },
        },
        tx,
      );
    }

    const competency = await this.checkCompetencyGaps(
      tx,
      technician.user.id,
      input.checklistData,
    );
    if (
      competency.missingCertifications.length > 0 ||
      competency.missingSpecialties.length > 0
    ) {
      if (!input.certificationJustification?.trim()) {
        const missing = [
          ...competency.missingCertifications.map(
            (item) => `certificacao ${item}`,
          ),
          ...competency.missingSpecialties.map(
            (item) => `especialidade ${item}`,
          ),
        ];
        throw new BadRequestException(
          `Competencias pendentes (${missing.join(', ')}). Informe justificativa para prosseguir.`,
        );
      }

      const warning = `Alocacao com ressalvas: faltando certificacoes (${competency.missingCertifications.join(', ') || '-'}) e especialidades (${competency.missingSpecialties.join(', ') || '-'}).`;
      warnings.push(warning);

      await this.auditLogsService.record(
        {
          domain: AuditDomain.MAINTENANCE_ORDERS,
          entityType: 'MAINTENANCE_ORDER',
          entityId:
            input.orderId || `${input.generatorId}:${input.technicianId}`,
          action: 'DISPATCH_COMPETENCY_OVERRIDE',
          actorUserId: input.actorUserId,
          reason: input.certificationJustification,
          afterPayload: {
            missingCertifications: competency.missingCertifications,
            missingSpecialties: competency.missingSpecialties,
            technicianId: input.technicianId,
          },
        },
        tx,
      );
    }

    return { warnings };
  }

  private async validateAssignmentOverrideApproval(
    tx: Prisma.TransactionClient,
    approvalId: string,
    expectedEntityId: string,
  ) {
    const approval = await tx.approvalRequest.findUnique({
      where: { id: approvalId },
      select: {
        id: true,
        status: true,
        type: true,
        entityType: true,
        entityId: true,
      },
    });
    if (!approval) {
      throw new BadRequestException('Aprovacao de excecao nao encontrada.');
    }
    if (approval.status !== ApprovalStatus.APPROVED) {
      throw new BadRequestException(
        'Aprovacao de excecao ainda nao esta aprovada.',
      );
    }
    if (
      approval.type !== ApprovalType.RVT_SIGNOFF ||
      approval.entityType !== 'MAINTENANCE_ORDER_ASSIGNMENT'
    ) {
      throw new BadRequestException(
        'Aprovacao informada nao pertence ao fluxo de excecao de despacho.',
      );
    }
    if (approval.entityId !== expectedEntityId) {
      throw new BadRequestException(
        'Aprovacao informada nao corresponde a esta atribuicao.',
      );
    }
  }

  private async checkCompetencyGaps(
    tx: Prisma.TransactionClient,
    userId: string,
    checklistData?: Record<string, unknown>,
  ) {
    if (!checklistData) {
      return {
        missingCertifications: [] as string[],
        missingSpecialties: [] as string[],
      };
    }

    const requiredCertifications = new Set<string>();
    const rawCertifications = checklistData['requiredCertifications'];
    if (Array.isArray(rawCertifications)) {
      rawCertifications
        .filter((item) => typeof item === 'string')
        .forEach((item) => requiredCertifications.add(item.toUpperCase()));
    }
    if (
      checklistData['requiresNr35'] === true ||
      checklistData['workAtHeight'] === true
    ) {
      requiredCertifications.add('NR-35');
    }
    if (checklistData['requiresNr10'] === true) {
      requiredCertifications.add('NR-10');
    }
    if (
      checklistData['requiresSep'] === true ||
      checklistData['requiresSEP'] === true
    ) {
      requiredCertifications.add('SEP');
    }

    const requiredSpecialties = new Set<string>();
    const rawSpecialties = checklistData['requiredSpecialties'];
    if (Array.isArray(rawSpecialties)) {
      rawSpecialties
        .filter((item) => typeof item === 'string')
        .forEach((item) => requiredSpecialties.add(item.toUpperCase()));
    }

    const now = new Date();
    const certificationList = Array.from(requiredCertifications);
    const specialtyList = Array.from(requiredSpecialties);

    const validCertifications =
      certificationList.length > 0
        ? await tx.userCertification.findMany({
            where: {
              userId,
              code: { in: certificationList },
              validUntil: { gte: now },
            },
            select: { code: true },
          })
        : [];

    const validSpecialties =
      specialtyList.length > 0
        ? await tx.userManufacturerSpecialty.findMany({
            where: {
              userId,
              manufacturer: { in: specialtyList },
              OR: [{ validUntil: null }, { validUntil: { gte: now } }],
            },
            select: { manufacturer: true },
          })
        : [];

    const certSet = new Set(validCertifications.map((item) => item.code));
    const specialtySet = new Set(
      validSpecialties.map((item) => item.manufacturer.toUpperCase()),
    );

    return {
      missingCertifications: certificationList.filter(
        (item) => !certSet.has(item),
      ),
      missingSpecialties: specialtyList.filter(
        (item) => !specialtySet.has(item),
      ),
    };
  }

  private minimumSkillForCriticality(criticality: GeneratorCriticality) {
    if (criticality === GeneratorCriticality.A) return SkillLevel.SENIOR;
    if (criticality === GeneratorCriticality.B) return SkillLevel.PLENO;
    return SkillLevel.JUNIOR;
  }

  private skillRank(level: SkillLevel) {
    const map: Record<SkillLevel, number> = {
      TRAINEE: 0,
      JUNIOR: 1,
      PLENO: 2,
      SENIOR: 3,
      MASTER: 4,
    };
    return map[level] ?? 0;
  }

  private async finalizeCompletedOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
    actorUserId?: string,
  ) {
    await this.consumeOrderMaterials(tx, orderId, actorUserId);
    await this.createTimeEntryForFinishedOrder(tx, orderId, actorUserId);
    await this.auditLogsService.record(
      {
        domain: AuditDomain.MAINTENANCE_ORDERS,
        entityType: 'MAINTENANCE_ORDER',
        entityId: orderId,
        action: 'FINALIZE',
        actorUserId,
      },
      tx,
    );
  }

  private async consumeOrderMaterials(
    tx: Prisma.TransactionClient,
    orderId: string,
    actorUserId?: string,
  ) {
    const order = await tx.maintenanceOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        title: true,
        status: true,
        costCenterId: true,
        materials: {
          where: { appliedAt: null },
          include: {
            catalogItem: {
              select: {
                id: true,
                name: true,
                stockCurrent: true,
                averageCost: true,
                costPrice: true,
                lastCost: true,
              },
            },
          },
        },
      },
    });

    if (!order) throw new NotFoundException('OS nao encontrada.');
    if (order.status === OrderStatus.CANCELED) {
      throw new BadRequestException('OS cancelada nao pode consumir estoque.');
    }
    if (order.materials.length === 0) return;

    const consumed: Array<{
      catalogItemId: string;
      warehouseId: string;
      quantity: number;
      unitCost: number | null;
    }> = [];

    for (const material of order.materials) {
      const quantity = Number(material.quantity || 0);
      if (quantity <= 0) {
        throw new BadRequestException(
          'Materiais da OS precisam ter quantidade maior que zero.',
        );
      }
      if (!material.warehouseId) {
        throw new BadRequestException(
          'Material da OS precisa ter almoxarifado para baixa.',
        );
      }

      const balance = await tx.inventoryBalance.findUnique({
        where: {
          warehouseId_catalogItemId: {
            warehouseId: material.warehouseId,
            catalogItemId: material.catalogItemId,
          },
        },
      });
      if (!balance) {
        throw new BadRequestException(
          'Saldo de estoque nao encontrado para material da OS.',
        );
      }

      const physicalQty = Number(balance.physicalQty || 0);
      const reservedQty = Number(balance.reservedQty || 0);
      const reservedToConsume = Math.min(reservedQty, quantity);
      const additionalNeeded = Math.max(0, quantity - reservedToConsume);
      const availableQty = Math.max(0, physicalQty - reservedQty);

      if (physicalQty < quantity || availableQty < additionalNeeded) {
        throw new BadRequestException(
          'Estoque disponivel insuficiente para consumir material da OS.',
        );
      }

      const unitCost =
        material.unitCost ??
        material.catalogItem.averageCost ??
        material.catalogItem.lastCost ??
        material.catalogItem.costPrice ??
        null;

      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: {
          physicalQty: { decrement: quantity },
          reservedQty:
            reservedToConsume > 0
              ? { decrement: reservedToConsume }
              : undefined,
        },
      });

      await tx.catalogItem.update({
        where: { id: material.catalogItemId },
        data: {
          stockCurrent: Math.max(
            0,
            Number(material.catalogItem.stockCurrent || 0) - quantity,
          ),
        },
      });

      await tx.inventoryMovement.create({
        data: {
          movementType: InventoryMovementType.OS_CONSUMPTION,
          warehouseId: material.warehouseId,
          catalogItemId: material.catalogItemId,
          quantity,
          unitCost,
          referenceType: 'MAINTENANCE_ORDER',
          referenceId: orderId,
          note: `Consumo na finalizacao da OS ${order.title}`,
        },
      });

      await tx.maintenanceOrderMaterial.update({
        where: { id: material.id },
        data: { appliedAt: new Date() },
      });

      if (order.costCenterId && unitCost && unitCost > 0) {
        await tx.costCenterEntry.create({
          data: {
            costCenterId: order.costCenterId,
            entryType: CostCenterEntryType.COST,
            sourceType: 'MAINTENANCE_ORDER_MATERIAL',
            sourceId: material.id,
            amount: Number((quantity * unitCost).toFixed(2)),
            competenceDate: new Date(),
            notes: `Peca aplicada na OS ${order.title}`,
          },
        });
      }

      consumed.push({
        catalogItemId: material.catalogItemId,
        warehouseId: material.warehouseId,
        quantity,
        unitCost,
      });
    }

    await this.auditLogsService.record(
      {
        domain: AuditDomain.INVENTORY,
        entityType: 'MAINTENANCE_ORDER',
        entityId: orderId,
        action: 'OS_STOCK_CONSUMED',
        actorUserId,
        afterPayload: consumed as unknown as Prisma.InputJsonValue,
      },
      tx,
    );
  }

  private async createTimeEntryForFinishedOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
    actorUserId?: string,
  ) {
    const order = await tx.maintenanceOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        title: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        costCenterId: true,
        technician: {
          select: {
            userId: true,
            user: {
              select: { hourCost: true },
            },
          },
        },
      },
    });

    if (!order) throw new NotFoundException('OS nao encontrada.');
    if (order.status === OrderStatus.CANCELED) return;
    if (!order.technician?.userId) {
      await this.auditLogsService.record(
        {
          domain: AuditDomain.PEOPLE,
          entityType: 'MAINTENANCE_ORDER',
          entityId: orderId,
          action: 'TIME_ENTRY_SKIPPED',
          actorUserId,
          reason: 'OS finalizada sem tecnico atribuido.',
        },
        tx,
      );
      return;
    }
    if (!order.startedAt || !order.finishedAt) {
      await this.auditLogsService.record(
        {
          domain: AuditDomain.PEOPLE,
          entityType: 'MAINTENANCE_ORDER',
          entityId: orderId,
          action: 'TIME_ENTRY_PENDING',
          actorUserId,
          reason: 'OS finalizada sem inicio/fim confiaveis.',
        },
        tx,
      );
      return;
    }

    const workMinutes = Math.max(
      0,
      Math.round(
        (order.finishedAt.getTime() - order.startedAt.getTime()) / 60000,
      ),
    );
    if (workMinutes <= 0) {
      await this.auditLogsService.record(
        {
          domain: AuditDomain.PEOPLE,
          entityType: 'MAINTENANCE_ORDER',
          entityId: orderId,
          action: 'TIME_ENTRY_PENDING',
          actorUserId,
          reason: 'OS finalizada com duracao invalida.',
        },
        tx,
      );
      return;
    }

    const existing = await tx.timeEntry.findFirst({
      where: {
        maintenanceOrderId: orderId,
        userId: order.technician.userId,
      },
      select: { id: true },
    });
    if (existing) return;

    const entry = await tx.timeEntry.create({
      data: {
        userId: order.technician.userId,
        maintenanceOrderId: orderId,
        status: TimeEntryStatus.WORK,
        source: TimeEntrySource.MAINTENANCE_ORDER_FINALIZATION,
        startedAt: order.startedAt,
        endedAt: order.finishedAt,
        workMinutes,
      },
    });

    if (order.costCenterId && Number(order.technician.user.hourCost || 0) > 0) {
      const hours = workMinutes / 60;
      const cost = hours * Number(order.technician.user.hourCost || 0);
      if (cost > 0) {
        await tx.costCenterEntry.create({
          data: {
            costCenterId: order.costCenterId,
            entryType: CostCenterEntryType.COST,
            sourceType: 'TIME_ENTRY',
            sourceId: entry.id,
            amount: Number(cost.toFixed(2)),
            competenceDate: order.startedAt,
            notes: 'Custo de homem-hora gerado pela finalizacao da OS',
          },
        });
      }
    }

    await this.auditLogsService.record(
      {
        domain: AuditDomain.PEOPLE,
        entityType: 'TIME_ENTRY',
        entityId: entry.id,
        action: 'CREATE_FROM_MAINTENANCE_ORDER',
        actorUserId,
        afterPayload: {
          maintenanceOrderId: orderId,
          userId: order.technician.userId,
          workMinutes,
        },
      },
      tx,
    );
  }

  private async reserveMaterials(
    tx: Prisma.TransactionClient,
    materials: Array<{
      catalogItemId: string;
      quantity: number;
      warehouseId?: string;
    }>,
    referenceType?: string,
    referenceId?: string,
  ) {
    const reservedMap = new Map<string, string>();

    for (const material of materials) {
      if (material.quantity <= 0) {
        throw new BadRequestException('Quantidade de material deve ser > 0.');
      }

      const balances = await tx.inventoryBalance.findMany({
        where: material.warehouseId
          ? {
              warehouseId: material.warehouseId,
              catalogItemId: material.catalogItemId,
            }
          : { catalogItemId: material.catalogItemId },
        orderBy: [{ physicalQty: 'desc' }],
      });
      const selected = balances.find(
        (row) =>
          Number(row.physicalQty) - Number(row.reservedQty) >=
          material.quantity,
      );
      if (!selected) {
        throw new BadRequestException(
          'Estoque disponivel insuficiente para reservar material da OS.',
        );
      }

      await tx.inventoryBalance.update({
        where: { id: selected.id },
        data: { reservedQty: { increment: material.quantity } },
      });

      await tx.inventoryMovement.create({
        data: {
          movementType: InventoryMovementType.RESERVATION,
          warehouseId: selected.warehouseId,
          catalogItemId: material.catalogItemId,
          quantity: material.quantity,
          referenceType,
          referenceId,
        },
      });

      reservedMap.set(
        `${material.catalogItemId}:${material.quantity}`,
        selected.warehouseId,
      );
    }

    return reservedMap;
  }

  private async releaseMaterialsByOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
  ) {
    const rows = await tx.maintenanceOrderMaterial.findMany({
      where: {
        orderId,
        appliedAt: null,
        reservedAt: { not: null },
      },
      select: {
        id: true,
        warehouseId: true,
        catalogItemId: true,
        quantity: true,
      },
    });

    for (const row of rows) {
      if (!row.warehouseId) continue;
      const balance = await tx.inventoryBalance.findUnique({
        where: {
          warehouseId_catalogItemId: {
            warehouseId: row.warehouseId,
            catalogItemId: row.catalogItemId,
          },
        },
      });
      if (!balance) continue;
      const releaseQty = Math.min(
        Number(row.quantity || 0),
        Number(balance.reservedQty || 0),
      );
      if (releaseQty <= 0) continue;

      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { reservedQty: { decrement: releaseQty } },
      });

      await tx.inventoryMovement.create({
        data: {
          movementType: InventoryMovementType.RELEASE,
          warehouseId: row.warehouseId,
          catalogItemId: row.catalogItemId,
          quantity: releaseQty,
          referenceType: 'MAINTENANCE_ORDER',
          referenceId: orderId,
        },
      });

      await tx.maintenanceOrderMaterial.update({
        where: { id: row.id },
        data: { reservedAt: null },
      });
    }
  }

  private async applyGeneratorStatusOnOrderChange(
    tx: Prisma.TransactionClient,
    generatorId: string,
    type: MaintenanceOrderType,
    status: OrderStatus,
    hourMeterAfter?: number,
  ) {
    const generator = await tx.generator.findUnique({
      where: { id: generatorId },
      select: { id: true, hourMeter: true, lifecycleStatus: true },
    });
    if (!generator) return;

    if (status === OrderStatus.COMPLETED) {
      await tx.generator.update({
        where: { id: generatorId },
        data: {
          hourMeter:
            hourMeterAfter !== undefined
              ? Math.max(Number(generator.hourMeter || 0), hourMeterAfter)
              : generator.hourMeter,
          lifecycleStatus:
            generator.lifecycleStatus === GeneratorLifecycleStatus.SCRAP
              ? generator.lifecycleStatus
              : GeneratorLifecycleStatus.AVAILABLE,
          operationalStatus: GeneratorOperationalStatus.OPERATING,
        },
      });
      return;
    }

    if (
      type === MaintenanceOrderType.CORRECTIVE ||
      type === MaintenanceOrderType.PREVENTIVE ||
      type === MaintenanceOrderType.DEMOBILIZATION
    ) {
      await tx.generator.update({
        where: { id: generatorId },
        data: {
          lifecycleStatus: GeneratorLifecycleStatus.IN_MAINTENANCE,
          operationalStatus: GeneratorOperationalStatus.IN_MAINTENANCE,
        },
      });
    }
  }

  private orderInclude() {
    return {
      generator: {
        include: {
          client: true,
          currentSite: true,
        },
      },
      site: true,
      materials: {
        include: {
          warehouse: {
            select: { id: true, code: true, name: true },
          },
          catalogItem: {
            select: {
              id: true,
              name: true,
              sku: true,
            },
          },
        },
      },
      technician: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              hourCost: true,
              department: true,
              skillLevel: true,
            },
          },
        },
      },
      contract: {
        select: {
          id: true,
          code: true,
          status: true,
        },
      },
    };
  }
}
