import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuditDomain,
  CostCenterEntryType,
  OrderStatus,
  Prisma,
  TechnicianWorkSessionStatus,
  TimeEntrySource,
  TimeEntryStatus,
  UserRole,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AddTicketCommentDto } from '../tickets/dto/ticket.dto';
import { TicketsService } from '../tickets/tickets.service';
import {
  TechnicianOrdersQueryDto,
  TechnicianTicketsQueryDto,
  TechnicianWorkPointDto,
} from './dto/technician-work.dto';

type RequestMetadata = {
  ip?: string;
  userAgent?: string | string[];
};

type TechnicianScope = {
  userId: string;
  technicianId: string;
};

@Injectable()
export class TechnicianWorkService {
  constructor(
    private readonly prisma: DatabaseService,
    private readonly auditLogsService: AuditLogsService,
    private readonly ticketsService: TicketsService,
  ) {}

  async listTickets(
    userId: string | undefined,
    query: TechnicianTicketsQueryDto,
  ) {
    return this.ticketsService.listTechnicianTickets(userId, query);
  }

  async commentTicket(
    userId: string | undefined,
    ticketId: string,
    dto: AddTicketCommentDto,
    metadata: RequestMetadata,
  ) {
    return this.ticketsService.addTechnicianComment(userId, ticketId, dto, {
      ip: metadata.ip,
      userAgent: this.normalizeUserAgent(metadata.userAgent),
    });
  }

  async listOrders(
    userId: string | undefined,
    query: TechnicianOrdersQueryDto,
  ) {
    const scope = await this.requireTechnicianScope(userId);
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 50)));
    const where = this.buildOwnOrderWhere(scope.technicianId, query);

    return this.prisma.maintenanceOrder.findMany({
      where,
      include: this.technicianOrderInclude(),
      orderBy: [{ scheduledTo: 'asc' }, { openedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  async getOrder(userId: string | undefined, orderId: string) {
    const scope = await this.requireTechnicianScope(userId);
    const order = await this.prisma.maintenanceOrder.findFirst({
      where: { id: orderId, technicianId: scope.technicianId },
      include: this.technicianOrderInclude(),
    });

    if (!order) {
      throw new NotFoundException('OS nao encontrada.');
    }

    return order;
  }

  async listWorkSessions(userId: string | undefined, orderId: string) {
    const scope = await this.requireTechnicianScope(userId);
    await this.assertOwnOrder(scope.technicianId, orderId);
    return this.prisma.technicianWorkSession.findMany({
      where: {
        maintenanceOrderId: orderId,
        technicianId: scope.technicianId,
      },
      select: this.workSessionSelect(),
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
  }

  async checkIn(
    userId: string | undefined,
    orderId: string,
    dto: TechnicianWorkPointDto,
    metadata: RequestMetadata,
  ) {
    const scope = await this.requireTechnicianScope(userId);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.maintenanceOrder.findFirst({
        where: { id: orderId, technicianId: scope.technicianId },
        select: { id: true, status: true, startedAt: true },
      });
      if (!order) {
        throw new NotFoundException('OS nao encontrada.');
      }
      if (order.status === OrderStatus.CANCELED) {
        throw new BadRequestException('OS cancelada nao aceita check-in.');
      }
      if (order.status === OrderStatus.COMPLETED) {
        throw new BadRequestException('OS concluida nao aceita check-in.');
      }

      const openSession = await tx.technicianWorkSession.findFirst({
        where: {
          maintenanceOrderId: orderId,
          technicianId: scope.technicianId,
          status: TechnicianWorkSessionStatus.OPEN,
        },
        select: { id: true },
      });
      if (openSession) {
        throw new BadRequestException('Ja existe check-in aberto nesta OS.');
      }

      const now = new Date();
      const session = await tx.technicianWorkSession.create({
        data: {
          maintenanceOrderId: orderId,
          technicianId: scope.technicianId,
          userId: scope.userId,
          status: TechnicianWorkSessionStatus.OPEN,
          startedAt: now,
          startLatitude: dto.latitude,
          startLongitude: dto.longitude,
          startNote: dto.note,
          startIp: metadata.ip,
          startUserAgent: this.normalizeUserAgent(metadata.userAgent),
        },
        select: this.workSessionSelect(),
      });

      if (order.status === OrderStatus.OPEN) {
        await tx.maintenanceOrder.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.IN_PROGRESS,
            startedAt: order.startedAt ?? now,
          },
        });
      }

      await this.auditLogsService.record(
        {
          domain: AuditDomain.MAINTENANCE_ORDERS,
          entityType: 'TECHNICIAN_WORK_SESSION',
          entityId: session.id,
          action: 'TECHNICIAN_CHECK_IN',
          actorUserId: scope.userId,
          afterPayload: {
            maintenanceOrderId: orderId,
            technicianId: scope.technicianId,
            metadata,
          } as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return session;
    });
  }

  async checkOut(
    userId: string | undefined,
    orderId: string,
    dto: TechnicianWorkPointDto,
    metadata: RequestMetadata,
  ) {
    const scope = await this.requireTechnicianScope(userId);
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.technicianWorkSession.findFirst({
        where: {
          maintenanceOrderId: orderId,
          technicianId: scope.technicianId,
          status: TechnicianWorkSessionStatus.OPEN,
        },
        include: {
          maintenanceOrder: {
            select: {
              id: true,
              costCenterId: true,
              status: true,
            },
          },
          user: {
            select: { hourCost: true },
          },
        },
        orderBy: { startedAt: 'desc' },
      });

      if (!session) {
        throw new BadRequestException('Nao existe check-in aberto nesta OS.');
      }
      if (session.maintenanceOrder.status === OrderStatus.CANCELED) {
        throw new BadRequestException('OS cancelada nao aceita check-out.');
      }

      const finishedAt = new Date();
      if (finishedAt.getTime() <= session.startedAt.getTime()) {
        throw new BadRequestException(
          'Check-out precisa ser depois do check-in.',
        );
      }

      const claimed = await tx.technicianWorkSession.updateMany({
        where: {
          id: session.id,
          status: TechnicianWorkSessionStatus.OPEN,
        },
        data: {
          status: TechnicianWorkSessionStatus.CLOSED,
          finishedAt,
          endLatitude: dto.latitude,
          endLongitude: dto.longitude,
          endNote: dto.note,
          endIp: metadata.ip,
          endUserAgent: this.normalizeUserAgent(metadata.userAgent),
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException(
          'Check-out ja processado para esta sessao.',
        );
      }

      const workMinutes = Math.max(
        1,
        Math.round(
          (finishedAt.getTime() - session.startedAt.getTime()) / 60000,
        ),
      );
      const entry = await this.createTimeEntryForSession(tx, {
        userId: scope.userId,
        maintenanceOrderId: orderId,
        workSessionId: session.id,
        startedAt: session.startedAt,
        finishedAt,
        workMinutes,
        costCenterId: session.maintenanceOrder.costCenterId,
        hourCost: session.user.hourCost,
      });

      const closed = await tx.technicianWorkSession.update({
        where: { id: session.id },
        data: { timeEntryId: entry.id },
        select: this.workSessionSelect(),
      });

      await this.auditLogsService.record(
        {
          domain: AuditDomain.MAINTENANCE_ORDERS,
          entityType: 'TECHNICIAN_WORK_SESSION',
          entityId: session.id,
          action: 'TECHNICIAN_CHECK_OUT',
          actorUserId: scope.userId,
          afterPayload: {
            maintenanceOrderId: orderId,
            technicianId: scope.technicianId,
            timeEntryId: entry.id,
            workMinutes,
            metadata,
          } as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return closed;
    });
  }

  private async createTimeEntryForSession(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      maintenanceOrderId: string;
      workSessionId: string;
      startedAt: Date;
      finishedAt: Date;
      workMinutes: number;
      costCenterId: string | null;
      hourCost: number | null;
    },
  ) {
    const existing = await tx.timeEntry.findFirst({
      where: {
        maintenanceOrderId: input.maintenanceOrderId,
        userId: input.userId,
        source: TimeEntrySource.CHECK_IN_OUT,
        startedAt: input.startedAt,
      },
      select: { id: true },
    });

    if (existing) return existing;

    const entry = await tx.timeEntry.create({
      data: {
        userId: input.userId,
        maintenanceOrderId: input.maintenanceOrderId,
        status: TimeEntryStatus.WORK,
        source: TimeEntrySource.CHECK_IN_OUT,
        startedAt: input.startedAt,
        endedAt: input.finishedAt,
        workMinutes: input.workMinutes,
      },
    });

    if (input.costCenterId && Number(input.hourCost || 0) > 0) {
      const cost = (input.workMinutes / 60) * Number(input.hourCost || 0);
      if (cost > 0) {
        await tx.costCenterEntry.create({
          data: {
            costCenterId: input.costCenterId,
            entryType: CostCenterEntryType.COST,
            sourceType: 'TIME_ENTRY',
            sourceId: entry.id,
            amount: Number(cost.toFixed(2)),
            competenceDate: input.startedAt,
            notes: 'Custo de homem-hora gerado por check-in/check-out da OS',
          },
        });
      }
    }

    await this.auditLogsService.record(
      {
        domain: AuditDomain.PEOPLE,
        entityType: 'TIME_ENTRY',
        entityId: entry.id,
        action: 'CREATE_FROM_WORK_SESSION',
        actorUserId: input.userId,
        afterPayload: {
          maintenanceOrderId: input.maintenanceOrderId,
          workSessionId: input.workSessionId,
          workMinutes: input.workMinutes,
          source: TimeEntrySource.CHECK_IN_OUT,
        } as unknown as Prisma.InputJsonValue,
      },
      tx,
    );

    return entry;
  }

  private async assertOwnOrder(technicianId: string, orderId: string) {
    const order = await this.prisma.maintenanceOrder.findFirst({
      where: { id: orderId, technicianId },
      select: { id: true },
    });
    if (!order) {
      throw new NotFoundException('OS nao encontrada.');
    }
  }

  private async requireTechnicianScope(
    userId: string | undefined,
  ): Promise<TechnicianScope> {
    if (!userId) {
      throw new UnauthorizedException('Usuario tecnico nao identificado.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        isActive: true,
        technicianProfile: {
          select: { id: true },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario indisponivel.');
    }
    if (user.role !== UserRole.TECHNICIAN) {
      throw new ForbiddenException(
        'Area tecnica exclusiva para usuarios tecnicos.',
      );
    }
    if (!user.technicianProfile?.id) {
      throw new ForbiddenException(
        'Usuario tecnico sem perfil de tecnico vinculado.',
      );
    }

    return {
      userId: user.id,
      technicianId: user.technicianProfile.id,
    };
  }

  private buildOwnOrderWhere(
    technicianId: string,
    query: TechnicianOrdersQueryDto,
  ): Prisma.MaintenanceOrderWhereInput {
    const search = query.search?.trim();
    return {
      technicianId,
      status: query.status,
      scheduledTo:
        query.dateFrom || query.dateTo
          ? {
              gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
              lte: query.dateTo ? new Date(query.dateTo) : undefined,
            }
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
  }

  private technicianOrderInclude() {
    return {
      generator: {
        select: {
          id: true,
          name: true,
          serialNumber: true,
          brand: true,
          client: {
            select: {
              id: true,
              companyName: true,
              tradeName: true,
              phone: true,
              contactName: true,
            },
          },
          currentSite: {
            select: { id: true, name: true, code: true },
          },
        },
      },
      site: {
        select: { id: true, name: true, code: true },
      },
      contract: {
        select: { id: true, code: true, title: true, status: true },
      },
      materials: {
        select: {
          id: true,
          quantity: true,
          reservedAt: true,
          appliedAt: true,
          catalogItem: { select: { id: true, name: true, sku: true } },
          warehouse: { select: { id: true, code: true, name: true } },
        },
      },
      serviceReport: {
        select: {
          id: true,
          code: true,
          status: true,
          customerVisible: true,
          releasedToCustomerAt: true,
        },
      },
      workSessions: {
        select: this.workSessionSelect(),
        orderBy: { startedAt: 'desc' as const },
        take: 5,
      },
    } satisfies Prisma.MaintenanceOrderInclude;
  }

  private workSessionSelect() {
    return {
      id: true,
      maintenanceOrderId: true,
      technicianId: true,
      userId: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      startLatitude: true,
      startLongitude: true,
      endLatitude: true,
      endLongitude: true,
      startNote: true,
      endNote: true,
      timeEntryId: true,
      createdAt: true,
      updatedAt: true,
    } satisfies Prisma.TechnicianWorkSessionSelect;
  }

  private normalizeUserAgent(userAgent?: string | string[]) {
    if (Array.isArray(userAgent)) return userAgent.join(' ');
    return userAgent;
  }
}
