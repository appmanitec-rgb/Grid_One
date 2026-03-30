import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CommercialInspectionStatus,
  OpportunityLossReason,
  Prisma,
  SalesOpportunityStage,
} from '@prisma/client';
import { DatabaseService } from 'src/database/database.service';
import {
  AddInspectionMediaDto,
  CreateInspectionDto,
  CreateOpportunityDto,
  SetOpportunityStageDto,
  UpdateInspectionDto,
  UpdateOpportunityDto,
} from './dto/crm.dto';

@Injectable()
export class CrmService {
  constructor(private readonly prisma: DatabaseService) {}

  listOpportunities(stage?: string) {
    const normalizedStage =
      stage &&
      Object.values(SalesOpportunityStage).includes(
        stage as SalesOpportunityStage,
      )
        ? (stage as SalesOpportunityStage)
        : undefined;

    return this.prisma.salesOpportunity.findMany({
      where: normalizedStage ? { stage: normalizedStage } : {},
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
      },
    });

    if (!opportunity) {
      throw new NotFoundException('Oportunidade nao encontrada.');
    }

    return opportunity;
  }

  async opportunityPipeline() {
    const rows = await this.prisma.salesOpportunity.groupBy({
      by: ['stage'],
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

  createOpportunity(dto: CreateOpportunityDto) {
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
        stage,
        temperature: dto.temperature,
        estimatedValue: Number(dto.estimatedValue || 0),
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
        stage: nextStage,
        temperature: dto.temperature,
        estimatedValue:
          dto.estimatedValue !== undefined
            ? Number(dto.estimatedValue)
            : undefined,
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
}
