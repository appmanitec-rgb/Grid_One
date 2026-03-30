import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalStatus,
  ApprovalType,
  AuditDomain,
  GeneratorCriticality,
  GeneratorLifecycleStatus,
  GeneratorOperationalStatus,
  InventoryMovementType,
  MaintenanceOrderType,
  OrderStatus,
  Prisma,
  SkillLevel,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateMaintenanceOrderDto } from './dto/create-maintenance-order.dto';
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
    return this.prisma.$transaction(async (tx) => {
      const generator = await this.ensureGeneratorAndSite(
        tx,
        dto.generatorId,
        dto.siteId,
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
    });
  }

  async findAll() {
    return this.prisma.maintenanceOrder.findMany({
      include: this.orderInclude(),
    });
  }

  async findOne(id: string) {
    return this.prisma.maintenanceOrder.findUnique({
      where: { id },
      include: this.orderInclude(),
    });
  }

  async update(
    id: string,
    dto: UpdateMaintenanceOrderDto,
    actorUserId?: string,
  ) {
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

    return this.prisma.$transaction(async (tx) => {
      const targetGeneratorId = dto.generatorId ?? current.generatorId;
      const generator = await this.ensureGeneratorAndSite(
        tx,
        targetGeneratorId,
        dto.siteId,
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
          scheduledTo: dto.scheduledTo ? new Date(dto.scheduledTo) : undefined,
          laborHours: dto.laborHours,
          hourMeterAfter: dto.hourMeterAfter,
          generatorId: dto.generatorId,
          siteId: dto.siteId,
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

  private async ensureGeneratorAndSite(
    tx: Prisma.TransactionClient,
    generatorId: string,
    siteId?: string,
  ) {
    const generator = await tx.generator.findUnique({
      where: { id: generatorId },
      select: { id: true, clientId: true, criticality: true },
    });
    if (!generator) {
      throw new NotFoundException('Gerador nao encontrado.');
    }

    if (!siteId) return generator;

    const site = await tx.site.findUnique({
      where: { id: siteId },
      select: { id: true, clientId: true },
    });
    if (!site || site.clientId !== generator.clientId) {
      throw new BadRequestException(
        'Local/obra invalido para o cliente do gerador.',
      );
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
      where: { orderId },
      select: {
        warehouseId: true,
        catalogItemId: true,
        quantity: true,
      },
    });

    for (const row of rows) {
      if (!row.warehouseId) continue;
      await tx.inventoryBalance.updateMany({
        where: {
          warehouseId: row.warehouseId,
          catalogItemId: row.catalogItemId,
          reservedQty: { gt: 0 },
        },
        data: {
          reservedQty: { decrement: row.quantity },
        },
      });

      await tx.inventoryMovement.create({
        data: {
          movementType: InventoryMovementType.RELEASE,
          warehouseId: row.warehouseId,
          catalogItemId: row.catalogItemId,
          quantity: row.quantity,
          referenceType: 'MAINTENANCE_ORDER',
          referenceId: orderId,
        },
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
