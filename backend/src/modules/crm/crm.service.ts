import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CommercialInspectionStatus,
  CrmActivityStatus,
  CrmActivityType,
  OpportunityLossReason,
  Prisma,
  SalesOpportunityPipeline,
  SalesOpportunityStage,
  SalesOpportunityType,
  UserRole,
} from '@prisma/client';
import { DatabaseService } from 'src/database/database.service';
import {
  AddInspectionMediaDto,
  CreateInspectionDto,
  CreateCrmActivityDto,
  CreateOpportunityDto,
  SetOpportunityStageDto,
  UpdateInspectionDto,
  UpdateCrmActivityDto,
  UpdateOpportunityDto,
} from './dto/crm.dto';

@Injectable()
export class CrmService {
  constructor(private readonly prisma: DatabaseService) {}

  listSellers(query?: string, take?: string | number, pipeline?: string) {
    const search = query?.trim();
    const limit = this.parseLookupLimit(take);
    const normalizedPipeline = this.normalizePipeline(pipeline);
    const andWhere: Prisma.UserWhereInput[] = [];
    if (search) {
      andWhere.push({
        OR: [
          { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { email: { contains: search, mode: Prisma.QueryMode.insensitive } },
          {
            department: {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        ],
      });
    }
    if (normalizedPipeline) {
      andWhere.push(this.buildSellerDepartmentWhere(normalizedPipeline));
    }

    const where: Prisma.UserWhereInput = {
      role: UserRole.SALES,
      isActive: true,
      ...(andWhere.length > 0 ? { AND: andWhere } : {}),
    };

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
      },
      orderBy: { name: 'asc' },
      take: limit,
    });
  }

  listOpportunities(
    stage?: string,
    pipeline?: string,
    opportunityType?: string,
  ) {
    const normalizedStage =
      stage &&
      Object.values(SalesOpportunityStage).includes(
        stage as SalesOpportunityStage,
      )
        ? (stage as SalesOpportunityStage)
        : undefined;
    const normalizedPipeline = this.normalizePipeline(pipeline);
    const normalizedType = this.normalizeOpportunityType(opportunityType);

    const where: Prisma.SalesOpportunityWhereInput = {
      ...(normalizedStage ? { stage: normalizedStage } : {}),
      ...(normalizedPipeline ? { pipeline: normalizedPipeline } : {}),
      ...(normalizedType ? { opportunityType: normalizedType } : {}),
    };

    return this.prisma.salesOpportunity.findMany({
      where,
      include: {
        client: { select: { id: true, companyName: true, tradeName: true } },
        assignedSeller: { select: { id: true, name: true } },
        site: { select: { id: true, name: true } },
        primaryContact: {
          select: { id: true, name: true, phone: true, email: true },
        },
        inspections: {
          select: {
            id: true,
            code: true,
            status: true,
            scheduledAt: true,
            finishedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        proposals: {
          select: {
            id: true,
            code: true,
            status: true,
            totalValue: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        crmActivities: {
          where: { status: CrmActivityStatus.PLANNED },
          select: { id: true, type: true, subject: true, dueAt: true },
          orderBy: { dueAt: 'asc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getOpportunity(id: string) {
    const opportunity = await this.prisma.salesOpportunity.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, companyName: true, tradeName: true } },
        assignedSeller: { select: { id: true, name: true } },
        site: { select: { id: true, name: true } },
        primaryContact: {
          select: { id: true, name: true, phone: true, email: true },
        },
        inspections: {
          select: {
            id: true,
            code: true,
            status: true,
            scheduledAt: true,
            finishedAt: true,
            technicalNotes: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        proposals: {
          select: {
            id: true,
            code: true,
            status: true,
            totalValue: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        crmActivities: {
          where: { status: CrmActivityStatus.PLANNED },
          select: { id: true, type: true, subject: true, dueAt: true },
          orderBy: { dueAt: 'asc' },
          take: 1,
        },
      },
    });

    if (!opportunity) {
      throw new NotFoundException('Oportunidade nao encontrada.');
    }

    return opportunity;
  }

  async opportunityPipeline(pipeline?: string) {
    const normalizedPipeline = this.normalizePipeline(pipeline);
    const rows = await this.prisma.salesOpportunity.groupBy({
      by: ['stage'],
      where: normalizedPipeline ? { pipeline: normalizedPipeline } : undefined,
      _count: { _all: true },
      _sum: { estimatedValue: true },
    });

    const byStage = new Map(rows.map((row) => [row.stage, row]));
    return Object.values(SalesOpportunityStage).map((stage) => {
      const current = byStage.get(stage);
      return {
        stage,
        count: current?._count._all || 0,
        estimatedValue: Number(current?._sum.estimatedValue || 0),
      };
    });
  }

  async opportunityForecast(pipeline?: string) {
    const normalizedPipeline = this.normalizePipeline(pipeline);
    const opportunities = await this.prisma.salesOpportunity.findMany({
      where: {
        stage: {
          notIn: [SalesOpportunityStage.WON, SalesOpportunityStage.LOST],
        },
        ...(normalizedPipeline ? { pipeline: normalizedPipeline } : {}),
      },
      select: {
        id: true,
        stage: true,
        estimatedValue: true,
        probabilityPercent: true,
        expectedCloseDate: true,
      },
    });
    const months = new Map<
      string,
      { month: string; count: number; amount: number; weightedAmount: number }
    >();
    let unscheduled = 0;
    let overdue = 0;
    let totalAmount = 0;
    let totalWeightedAmount = 0;
    const todayInBrazil = new Date().toLocaleDateString('sv-SE', {
      timeZone: 'America/Sao_Paulo',
    });
    for (const item of opportunities) {
      const probability =
        item.probabilityPercent ?? this.stageProbability(item.stage);
      const amount = Number(item.estimatedValue || 0);
      const weightedAmount =
        Math.round(((amount * probability) / 100) * 100) / 100;
      totalAmount += amount;
      totalWeightedAmount += weightedAmount;
      if (!item.expectedCloseDate) {
        unscheduled += 1;
        continue;
      }
      if (item.expectedCloseDate.toISOString().slice(0, 10) < todayInBrazil)
        overdue += 1;
      const month = item.expectedCloseDate.toISOString().slice(0, 7);
      const current = months.get(month) ?? {
        month,
        count: 0,
        amount: 0,
        weightedAmount: 0,
      };
      current.count += 1;
      current.amount += amount;
      current.weightedAmount += weightedAmount;
      months.set(month, current);
    }
    return {
      count: opportunities.length,
      amount: totalAmount,
      weightedAmount: Math.round(totalWeightedAmount * 100) / 100,
      unscheduled,
      overdue,
      months: [...months.values()].sort((a, b) =>
        a.month.localeCompare(b.month),
      ),
    };
  }

  async listActivities(
    clientId?: string,
    opportunityId?: string,
    skip?: string,
  ) {
    if (!clientId && !opportunityId) {
      throw new BadRequestException('Informe cliente ou oportunidade.');
    }
    const offset = Math.max(0, Math.min(10000, Number(skip) || 0));
    const where: Prisma.CrmActivityWhereInput = {
      ...(clientId ? { clientId } : {}),
      ...(opportunityId ? { opportunityId } : {}),
    };
    const [rows, nextAction] = await Promise.all([
      this.prisma.crmActivity.findMany({
        where,
        include: {
          createdBy: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } },
          opportunity: { select: { id: true, title: true } },
        },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        skip: offset,
        take: 51,
      }),
      this.prisma.crmActivity.findFirst({
        where: { ...where, status: CrmActivityStatus.PLANNED },
        orderBy: { dueAt: 'asc' },
        include: { owner: { select: { id: true, name: true } } },
      }),
    ]);
    return { items: rows.slice(0, 50), hasMore: rows.length > 50, nextAction };
  }

  async createActivity(dto: CreateCrmActivityDto, actorId: string) {
    const subject = dto.subject?.trim();
    if (!subject)
      throw new BadRequestException('Informe o assunto da atividade.');
    const status =
      dto.status ??
      (dto.type === CrmActivityType.TASK
        ? CrmActivityStatus.PLANNED
        : CrmActivityStatus.COMPLETED);
    if (status === CrmActivityStatus.PLANNED && !dto.dueAt) {
      throw new BadRequestException('Informe o prazo da proxima acao.');
    }
    let ownerId = actorId;
    if (dto.opportunityId) {
      const opportunity = await this.prisma.salesOpportunity.findUnique({
        where: { id: dto.opportunityId },
        select: { clientId: true, assignedSellerId: true },
      });
      if (!opportunity || opportunity.clientId !== dto.clientId) {
        throw new BadRequestException(
          'A oportunidade nao pertence ao cliente informado.',
        );
      }
      ownerId = opportunity.assignedSellerId || actorId;
    } else {
      const client = await this.prisma.client.findUnique({
        where: { id: dto.clientId },
        select: { id: true },
      });
      if (!client) throw new NotFoundException('Cliente nao encontrado.');
    }
    return this.prisma.crmActivity.create({
      data: {
        clientId: dto.clientId,
        opportunityId: dto.opportunityId,
        type: dto.type,
        status,
        subject,
        details: dto.details?.trim() || null,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        completedAt: status === CrmActivityStatus.COMPLETED ? new Date() : null,
        createdById: actorId,
        ownerId,
      },
    });
  }

  async updateActivity(id: string, dto: UpdateCrmActivityDto) {
    const existing = await this.prisma.crmActivity.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Atividade nao encontrada.');
    const status = dto.status ?? existing.status;
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : existing.dueAt;
    if (status === CrmActivityStatus.PLANNED && !dueAt) {
      throw new BadRequestException('Informe o prazo da proxima acao.');
    }
    const subject =
      dto.subject === undefined ? existing.subject : dto.subject.trim();
    if (!subject)
      throw new BadRequestException('Informe o assunto da atividade.');
    return this.prisma.crmActivity.update({
      where: { id },
      data: {
        subject,
        details:
          dto.details === undefined ? undefined : dto.details.trim() || null,
        dueAt,
        status,
        completedAt:
          status === CrmActivityStatus.COMPLETED
            ? (existing.completedAt ?? new Date())
            : null,
      },
    });
  }

  private stageProbability(stage: SalesOpportunityStage): number {
    const defaults: Record<SalesOpportunityStage, number> = {
      PROSPECTION: 10,
      SITE_SURVEY_SCHEDULED: 25,
      PROPOSAL_SENT: 50,
      NEGOTIATION: 75,
      WON: 100,
      LOST: 0,
    };
    return defaults[stage];
  }

  async createOpportunity(dto: CreateOpportunityDto) {
    const opportunityType =
      dto.opportunityType ?? SalesOpportunityType.FIELD_SERVICE;
    const pipeline = this.resolvePipeline(dto.pipeline, opportunityType);
    await this.assertCommercialSeller(dto.assignedSellerId, pipeline);

    const stage = dto.stage ?? SalesOpportunityStage.PROSPECTION;
    const stageData = this.buildOpportunityStageData(
      stage,
      dto.lossReason,
      dto.lossReasonDetail,
    );

    return this.prisma.salesOpportunity.create({
      data: {
        title: dto.title,
        clientId: dto.clientId,
        siteId: dto.siteId,
        clientAddressId: dto.clientAddressId,
        primaryContactId: dto.primaryContactId,
        assignedSellerId: dto.assignedSellerId,
        pipeline,
        opportunityType,
        stage,
        temperature: dto.temperature,
        estimatedValue: Number(dto.estimatedValue || 0),
        probabilityPercent: dto.probabilityPercent,
        expectedCloseDate: dto.expectedCloseDate
          ? new Date(dto.expectedCloseDate)
          : undefined,
        source: dto.source,
        notes: dto.notes,
        ...stageData,
      },
      include: {
        client: { select: { id: true, companyName: true } },
        assignedSeller: { select: { id: true, name: true } },
      },
    });
  }

  async updateOpportunity(id: string, dto: UpdateOpportunityDto) {
    const existing = await this.prisma.salesOpportunity.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Oportunidade nao encontrada.');
    if (dto.clientId && dto.clientId !== existing.clientId) {
      const activityCount = await this.prisma.crmActivity.count({
        where: { opportunityId: id },
      });
      if (activityCount > 0) {
        throw new BadRequestException(
          'Nao e permitido trocar o cliente de oportunidade com historico comercial.',
        );
      }
    }

    const opportunityType = dto.opportunityType ?? existing.opportunityType;
    const pipeline = this.resolvePipeline(
      dto.pipeline ??
        (dto.opportunityType !== undefined ? undefined : existing.pipeline),
      opportunityType,
    );
    if (dto.assignedSellerId !== undefined) {
      await this.assertCommercialSeller(dto.assignedSellerId, pipeline);
    }

    const nextStage = dto.stage ?? existing.stage;
    const stageData = this.buildOpportunityStageData(
      nextStage,
      dto.lossReason ?? existing.lossReason ?? undefined,
      dto.lossReasonDetail ?? existing.lossReasonDetail ?? undefined,
    );

    return this.prisma.salesOpportunity.update({
      where: { id },
      data: {
        title: dto.title,
        clientId: dto.clientId,
        siteId: dto.siteId,
        clientAddressId: dto.clientAddressId,
        primaryContactId: dto.primaryContactId,
        assignedSellerId: dto.assignedSellerId,
        pipeline,
        opportunityType,
        stage: nextStage,
        temperature: dto.temperature,
        estimatedValue:
          dto.estimatedValue !== undefined
            ? Number(dto.estimatedValue)
            : undefined,
        probabilityPercent: dto.probabilityPercent,
        expectedCloseDate: dto.expectedCloseDate
          ? new Date(dto.expectedCloseDate)
          : dto.expectedCloseDate === null
            ? null
            : undefined,
        source: dto.source,
        notes: dto.notes,
        ...stageData,
      },
      include: {
        client: { select: { id: true, companyName: true } },
        assignedSeller: { select: { id: true, name: true } },
      },
    });
  }

  setOpportunityStage(id: string, dto: SetOpportunityStageDto) {
    return this.updateOpportunity(id, {
      stage: dto.stage,
      lossReason: dto.lossReason,
      lossReasonDetail: dto.lossReasonDetail,
    });
  }

  async removeOpportunity(id: string) {
    const existing = await this.prisma.salesOpportunity.findUnique({
      where: { id },
      include: {
        _count: { select: { proposals: true, inspections: true } },
      },
    });

    if (!existing) throw new NotFoundException('Oportunidade nao encontrada.');
    if (existing._count.proposals > 0) {
      throw new BadRequestException(
        'Nao e permitido excluir oportunidade com proposta vinculada.',
      );
    }

    await this.prisma.salesOpportunity.delete({ where: { id } });
    return { deleted: true };
  }

  listInspections(status?: string) {
    const normalizedStatus =
      status &&
      Object.values(CommercialInspectionStatus).includes(
        status as CommercialInspectionStatus,
      )
        ? (status as CommercialInspectionStatus)
        : undefined;

    return this.prisma.commercialInspection.findMany({
      where: normalizedStatus ? { status: normalizedStatus } : {},
      include: {
        opportunity: {
          select: { id: true, title: true, stage: true, estimatedValue: true },
        },
        client: { select: { id: true, companyName: true } },
        site: { select: { id: true, name: true } },
        primaryContact: {
          select: { id: true, name: true, phone: true, email: true },
        },
        inspectorUser: { select: { id: true, name: true } },
        media: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createInspection(dto: CreateInspectionDto) {
    return this.prisma.$transaction(async (tx) => {
      const opportunity = await tx.salesOpportunity.findUnique({
        where: { id: dto.opportunityId },
      });
      if (!opportunity) {
        throw new NotFoundException('Oportunidade nao encontrada.');
      }

      const code = await this.generateNextInspectionCode(tx);
      const status =
        dto.status ??
        (dto.scheduledAt
          ? CommercialInspectionStatus.SCHEDULED
          : CommercialInspectionStatus.DRAFT);

      const created = await tx.commercialInspection.create({
        data: {
          code,
          status,
          opportunityId: dto.opportunityId,
          clientId: opportunity.clientId,
          siteId: dto.siteId ?? opportunity.siteId,
          clientAddressId: dto.clientAddressId ?? opportunity.clientAddressId,
          primaryContactId:
            dto.primaryContactId ?? opportunity.primaryContactId,
          inspectorUserId: dto.inspectorUserId,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
          finishedAt: dto.finishedAt ? new Date(dto.finishedAt) : undefined,
          requiredPowerKva:
            dto.requiredPowerKva !== undefined
              ? Number(dto.requiredPowerKva)
              : undefined,
          voltage: dto.voltage,
          qtaDistanceMeters:
            dto.qtaDistanceMeters !== undefined
              ? Number(dto.qtaDistanceMeters)
              : undefined,
          needsMunck: Boolean(dto.needsMunck),
          accessNotes: dto.accessNotes,
          checklistData: dto.checklistData as Prisma.InputJsonValue,
          technicalNotes: dto.technicalNotes,
        },
        include: {
          opportunity: {
            select: {
              id: true,
              title: true,
              stage: true,
              estimatedValue: true,
            },
          },
          client: { select: { id: true, companyName: true } },
          inspectorUser: { select: { id: true, name: true } },
          media: true,
        },
      });

      if (
        opportunity.stage === SalesOpportunityStage.PROSPECTION &&
        status !== CommercialInspectionStatus.CANCELED
      ) {
        await tx.salesOpportunity.update({
          where: { id: opportunity.id },
          data: { stage: SalesOpportunityStage.SITE_SURVEY_SCHEDULED },
        });
      }

      return created;
    });
  }

  async updateInspection(id: string, dto: UpdateInspectionDto) {
    const current = await this.prisma.commercialInspection.findUnique({
      where: { id },
      include: { opportunity: { select: { id: true, stage: true } } },
    });
    if (!current) throw new NotFoundException('Vistoria nao encontrada.');

    const nextStatus = dto.status ?? current.status;
    const data: Prisma.CommercialInspectionUncheckedUpdateInput = {
      status: nextStatus,
      siteId: dto.siteId,
      clientAddressId: dto.clientAddressId,
      primaryContactId: dto.primaryContactId,
      inspectorUserId: dto.inspectorUserId,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
      finishedAt: dto.finishedAt ? new Date(dto.finishedAt) : undefined,
      requiredPowerKva:
        dto.requiredPowerKva !== undefined
          ? Number(dto.requiredPowerKva)
          : undefined,
      voltage: dto.voltage,
      qtaDistanceMeters:
        dto.qtaDistanceMeters !== undefined
          ? Number(dto.qtaDistanceMeters)
          : undefined,
      needsMunck: dto.needsMunck,
      accessNotes: dto.accessNotes,
      checklistData: dto.checklistData as Prisma.InputJsonValue,
      technicalNotes: dto.technicalNotes,
    };

    if (
      nextStatus === CommercialInspectionStatus.IN_PROGRESS &&
      !current.startedAt
    ) {
      data.startedAt = data.startedAt || new Date();
    }
    if (
      nextStatus === CommercialInspectionStatus.COMPLETED &&
      !current.finishedAt
    ) {
      data.finishedAt = data.finishedAt || new Date();
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.commercialInspection.update({
        where: { id },
        data,
        include: {
          opportunity: {
            select: {
              id: true,
              title: true,
              stage: true,
            },
          },
          client: { select: { id: true, companyName: true } },
          inspectorUser: { select: { id: true, name: true } },
          media: { orderBy: { createdAt: 'desc' } },
        },
      });

      if (
        updated.opportunity.stage === SalesOpportunityStage.PROSPECTION &&
        nextStatus !== CommercialInspectionStatus.CANCELED
      ) {
        await tx.salesOpportunity.update({
          where: { id: updated.opportunity.id },
          data: { stage: SalesOpportunityStage.SITE_SURVEY_SCHEDULED },
        });
      }

      return updated;
    });
  }

  async addInspectionMedia(inspectionId: string, dto: AddInspectionMediaDto) {
    const inspection = await this.prisma.commercialInspection.findUnique({
      where: { id: inspectionId },
      select: { id: true },
    });
    if (!inspection) throw new NotFoundException('Vistoria nao encontrada.');

    return this.prisma.commercialInspectionMedia.create({
      data: {
        inspectionId,
        fileUrl: dto.fileUrl,
        fileName: dto.fileName,
        mimeType: dto.mimeType,
        fileSizeBytes:
          dto.fileSizeBytes !== undefined
            ? Number(dto.fileSizeBytes)
            : undefined,
        capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : undefined,
      },
    });
  }

  async removeInspection(id: string) {
    const existing = await this.prisma.commercialInspection.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Vistoria nao encontrada.');
    await this.prisma.commercialInspection.delete({ where: { id } });
    return { deleted: true };
  }

  private buildOpportunityStageData(
    stage: SalesOpportunityStage,
    lossReason?: OpportunityLossReason,
    lossReasonDetail?: string,
  ) {
    if (stage === SalesOpportunityStage.LOST) {
      if (!lossReason) {
        throw new BadRequestException(
          'Motivo de perda e obrigatorio ao mover oportunidade para perdido.',
        );
      }
      return {
        lossReason,
        lossReasonDetail,
        lostAt: new Date(),
        wonAt: null,
      };
    }

    if (stage === SalesOpportunityStage.WON) {
      return {
        lossReason: null,
        lossReasonDetail: null,
        lostAt: null,
        wonAt: new Date(),
      };
    }

    return {
      lossReason: null,
      lossReasonDetail: null,
      lostAt: null,
      wonAt: null,
    };
  }

  private async generateNextInspectionCode(tx: Prisma.TransactionClient) {
    const latest = await tx.commercialInspection.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { code: true },
    });

    const current = latest?.code
      ? Number(/^VIS-(\d+)$/.exec(latest.code)?.[1] || 0)
      : 0;
    const next = current + 1;
    return `VIS-${String(next).padStart(5, '0')}`;
  }

  private async assertCommercialSeller(
    sellerId?: string | null,
    pipeline?: SalesOpportunityPipeline,
  ) {
    if (!sellerId) return;

    const seller = await this.prisma.user.findFirst({
      where: {
        id: sellerId,
        role: UserRole.SALES,
        isActive: true,
        ...(pipeline
          ? { AND: [this.buildSellerDepartmentWhere(pipeline)] }
          : {}),
      },
      select: { id: true },
    });

    if (!seller) {
      throw new BadRequestException(
        'Vendedor responsavel deve ser um usuario ativo do comercial e compativel com o pipeline.',
      );
    }
  }

  private normalizePipeline(input?: string) {
    return input &&
      Object.values(SalesOpportunityPipeline).includes(
        input as SalesOpportunityPipeline,
      )
      ? (input as SalesOpportunityPipeline)
      : undefined;
  }

  private normalizeOpportunityType(input?: string) {
    return input &&
      Object.values(SalesOpportunityType).includes(
        input as SalesOpportunityType,
      )
      ? (input as SalesOpportunityType)
      : undefined;
  }

  private resolvePipeline(
    input: SalesOpportunityPipeline | undefined,
    opportunityType: SalesOpportunityType,
  ) {
    const inferred = this.inferPipelineByType(opportunityType);
    if (!input) return inferred;
    if (opportunityType !== SalesOpportunityType.OTHER && input !== inferred) {
      throw new BadRequestException(
        'Tipo de oportunidade incompativel com o pipeline comercial selecionado.',
      );
    }
    return input;
  }

  private inferPipelineByType(opportunityType: SalesOpportunityType) {
    const generatorTypes: SalesOpportunityType[] = [
      SalesOpportunityType.GENERATOR_SALE,
      SalesOpportunityType.GENERATOR_RENTAL,
      SalesOpportunityType.INSTALLATION_RETROFIT,
    ];
    if (generatorTypes.includes(opportunityType)) {
      return SalesOpportunityPipeline.COMMERCIAL_01_GENERATORS;
    }

    const contractTypes: SalesOpportunityType[] = [
      SalesOpportunityType.MAINTENANCE_CONTRACT,
      SalesOpportunityType.CONTRACT_RENEWAL,
      SalesOpportunityType.CONTRACT_EXPANSION,
    ];
    if (contractTypes.includes(opportunityType)) {
      return SalesOpportunityPipeline.COMMERCIAL_02_CONTRACTS;
    }

    return SalesOpportunityPipeline.COMMERCIAL_03_PARTS_SERVICES;
  }

  private buildSellerDepartmentWhere(
    pipeline: SalesOpportunityPipeline,
  ): Prisma.UserWhereInput {
    const specificTerms: Record<SalesOpportunityPipeline, string[]> = {
      [SalesOpportunityPipeline.COMMERCIAL_01_GENERATORS]: [
        'Comercial 01',
        'Gerador',
        'Geradores',
      ],
      [SalesOpportunityPipeline.COMMERCIAL_02_CONTRACTS]: [
        'Comercial 02',
        'Contrato',
        'Contratos',
      ],
      [SalesOpportunityPipeline.COMMERCIAL_03_PARTS_SERVICES]: [
        'Comercial 03',
        'Pecas',
        'Peças',
        'Servico',
        'Serviço',
        'Servicos',
        'Serviços',
      ],
    };

    return {
      OR: [
        { department: null },
        { department: { equals: 'Comercial', mode: 'insensitive' } },
        ...specificTerms[pipeline].map((term) => ({
          department: { contains: term, mode: 'insensitive' as const },
        })),
      ],
    };
  }

  private parseLookupLimit(value?: string | number) {
    const parsed = Number(value ?? 10);
    if (!Number.isFinite(parsed)) return 10;
    return Math.min(Math.max(Math.trunc(parsed), 1), 20);
  }
}
