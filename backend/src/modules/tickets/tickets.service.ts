import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuditDomain,
  ContractStatus,
  MaintenanceOrderType,
  OrderStatus,
  Prisma,
  TicketCategory,
  TicketCommentAuthorType,
  TicketOrigin,
  TicketPriority,
  TicketStatus,
  UserRole,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { MaintenanceOrdersService } from '../maintenance-orders/maintenance-orders.service';
import {
  AddTicketCommentDto,
  AssignTicketDto,
  ConvertTicketToOrderDto,
  CreateCustomerTicketDto,
  CreateTicketDto,
  CustomerTicketCommentDto,
  ListTicketsQueryDto,
  TicketActionNoteDto,
  UpdateTicketDto,
} from './dto/ticket.dto';

type RequestMetadata = {
  ip?: string;
  userAgent?: string;
};

type CustomerScope = {
  userId: string;
  clientId: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  };
  client: {
    id: string;
    companyName: string;
    tradeName: string | null;
    email: string | null;
    phone: string;
    contactName: string | null;
  };
};

type TicketRelationInput = {
  generatorId?: string;
  siteId?: string;
  contractId?: string;
  maintenanceOrderId?: string;
  assignedToUserId?: string;
  technicianId?: string;
};

type PrismaClientLike = DatabaseService | Prisma.TransactionClient;
type TicketCommentView = Record<string, unknown> & {
  customerVisible: boolean;
};
type TicketView = Record<string, unknown> & {
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  slaResponseDueAt: Date | null;
  slaResolutionDueAt: Date | null;
  assignedToUserId: string | null;
  technicianId: string | null;
  generatorId: string | null;
  siteId: string | null;
  contractId: string | null;
  internalNotes?: string | null;
  assignedToUser?: unknown;
  technician?: {
    id: string;
    user?: { name?: string | null } | null;
  } | null;
  openedByUser?: {
    id: string;
    name: string;
    role: UserRole;
  } | null;
  comments?: TicketCommentView[];
};

const CUSTOMER_PORTAL_ORIGIN = TicketOrigin.CUSTOMER_PORTAL;
const TERMINAL_TICKET_STATUSES: TicketStatus[] = [
  TicketStatus.RESOLVED,
  TicketStatus.CLOSED,
  TicketStatus.CANCELED,
  TicketStatus.CONVERTED_TO_ORDER,
];

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: DatabaseService,
    private readonly auditLogsService: AuditLogsService,
    private readonly maintenanceOrdersService: MaintenanceOrdersService,
  ) {}

  async findAll(query: ListTicketsQueryDto) {
    const now = new Date();
    const where: Prisma.ServiceTicketWhereInput = {
      status: query.status,
      priority: query.priority,
      origin: query.origin,
      clientId: query.clientId,
      generatorId: query.generatorId,
      assignedToUserId: query.assignedToUserId,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };

    if (query.overdue === 'true') {
      where.OR = [
        {
          firstResponseAt: null,
          slaResponseDueAt: { lt: now },
          status: { notIn: TERMINAL_TICKET_STATUSES },
        },
        {
          resolvedAt: null,
          slaResolutionDueAt: { lt: now },
          status: { notIn: TERMINAL_TICKET_STATUSES },
        },
      ];
    }

    const rows = await this.prisma.serviceTicket.findMany({
      where,
      include: this.ticketInclude(),
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });

    return rows.map((row) => this.mapTicket(row));
  }

  async findOne(id: string) {
    return this.getTicketOrThrow(id);
  }

  async createInternal(
    dto: CreateTicketDto,
    actorUserId: string | undefined,
    metadata: RequestMetadata,
  ) {
    const priority =
      dto.priority ?? this.defaultPriorityForCategory(dto.category);
    return this.prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({
        where: { id: dto.clientId },
        select: { id: true },
      });
      if (!client) {
        throw new NotFoundException('Cliente nao encontrado.');
      }

      const relations = await this.validateRelations(tx, dto.clientId, dto);
      const now = new Date();
      const code = await this.generateCode(tx);
      const sla = this.calculateSla(
        priority,
        now,
        relations.contract?.responseTimeHours ?? null,
      );

      const ticket = await tx.serviceTicket.create({
        data: {
          code,
          clientId: dto.clientId,
          openedByUserId: actorUserId,
          assignedToUserId: dto.assignedToUserId,
          technicianId: dto.technicianId,
          generatorId: dto.generatorId,
          siteId: dto.siteId ?? relations.generator?.currentSiteId ?? null,
          contractId: dto.contractId ?? relations.contract?.id ?? null,
          maintenanceOrderId: dto.maintenanceOrderId,
          title: dto.title,
          description: dto.description,
          category: dto.category,
          priority,
          origin: dto.origin ?? TicketOrigin.INTERNAL,
          slaResponseDueAt: sla.responseDueAt,
          slaResolutionDueAt: sla.resolutionDueAt,
          contactName: dto.contactName,
          contactPhone: dto.contactPhone,
          contactEmail: dto.contactEmail,
          internalNotes: dto.internalNotes,
          comments: {
            create: {
              authorUserId: actorUserId,
              authorType: TicketCommentAuthorType.SYSTEM,
              customerVisible: false,
              message: 'Chamado criado internamente.',
            },
          },
        },
        include: this.ticketInclude(),
      });

      await this.auditLogsService.record(
        {
          domain: AuditDomain.TICKETS,
          entityType: 'SERVICE_TICKET',
          entityId: ticket.id,
          action: 'CREATE',
          actorUserId,
          afterPayload: {
            code: ticket.code,
            clientId: ticket.clientId,
            generatorId: ticket.generatorId,
            contractId: ticket.contractId,
            origin: ticket.origin,
            priority: ticket.priority,
            metadata,
          } as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return this.mapTicket(ticket);
    });
  }

  async update(
    id: string,
    dto: UpdateTicketDto,
    actorUserId: string | undefined,
    metadata: RequestMetadata,
  ) {
    const current = await this.prisma.serviceTicket.findUnique({
      where: { id },
      include: this.ticketInclude(),
    });
    if (!current) {
      throw new NotFoundException('Chamado nao encontrado.');
    }
    if (current.status === TicketStatus.CANCELED) {
      throw new BadRequestException('Chamado cancelado nao pode ser alterado.');
    }

    return this.prisma.$transaction(async (tx) => {
      const relations = await this.validateRelations(tx, current.clientId, {
        generatorId: dto.generatorId ?? current.generatorId ?? undefined,
        siteId: dto.siteId ?? current.siteId ?? undefined,
        contractId: dto.contractId ?? current.contractId ?? undefined,
        assignedToUserId:
          dto.assignedToUserId ?? current.assignedToUserId ?? undefined,
        technicianId: dto.technicianId ?? current.technicianId ?? undefined,
      });
      const statusData = this.timestampDataForStatus(dto.status, current);
      const priority = dto.priority ?? current.priority;
      const shouldRecalculateSla =
        dto.priority !== undefined || dto.contractId !== undefined;
      const sla = shouldRecalculateSla
        ? this.calculateSla(
            priority,
            current.createdAt,
            relations.contract?.responseTimeHours ?? null,
          )
        : null;

      const updated = await tx.serviceTicket.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          category: dto.category,
          priority: dto.priority,
          status: dto.status,
          assignedToUserId: dto.assignedToUserId,
          technicianId: dto.technicianId,
          generatorId: dto.generatorId,
          siteId: dto.siteId,
          contractId: dto.contractId,
          contactName: dto.contactName,
          contactPhone: dto.contactPhone,
          contactEmail: dto.contactEmail,
          internalNotes: dto.internalNotes,
          slaResponseDueAt: sla?.responseDueAt,
          slaResolutionDueAt: sla?.resolutionDueAt,
          ...statusData,
        },
        include: this.ticketInclude(),
      });

      await this.addSystemComment(tx, {
        ticketId: id,
        actorUserId,
        message: 'Chamado atualizado pela equipe interna.',
        customerVisible: false,
      });

      await this.auditLogsService.record(
        {
          domain: AuditDomain.TICKETS,
          entityType: 'SERVICE_TICKET',
          entityId: id,
          action: 'UPDATE',
          actorUserId,
          beforePayload: this.auditSnapshot(current),
          afterPayload: {
            ticket: this.auditSnapshot(updated),
            metadata,
          } as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return this.mapTicket(updated);
    });
  }

  async addInternalComment(
    id: string,
    dto: AddTicketCommentDto,
    actorUserId: string | undefined,
    metadata: RequestMetadata,
  ) {
    const current = await this.getTicketRecord(id);
    if (this.isClosedForCustomerInteraction(current.status)) {
      throw new BadRequestException(
        'Chamado encerrado ou cancelado nao aceita novos comentarios.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.serviceTicketComment.create({
        data: {
          ticketId: id,
          authorUserId: actorUserId,
          authorType: TicketCommentAuthorType.INTERNAL,
          message: dto.message,
          customerVisible: dto.customerVisible ?? false,
        },
      });

      const firstResponseData =
        dto.customerVisible && !current.firstResponseAt
          ? { firstResponseAt: new Date() }
          : {};
      const ticket = await tx.serviceTicket.update({
        where: { id },
        data: {
          ...firstResponseData,
          status: dto.customerVisible
            ? TicketStatus.WAITING_CUSTOMER
            : undefined,
        },
        include: this.ticketInclude(),
      });

      await this.auditLogsService.record(
        {
          domain: AuditDomain.TICKETS,
          entityType: 'SERVICE_TICKET',
          entityId: id,
          action: 'COMMENT_INTERNAL',
          actorUserId,
          afterPayload: {
            customerVisible: dto.customerVisible ?? false,
            metadata,
          } as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return ticket;
    });

    return this.mapTicket(updated);
  }

  async assign(
    id: string,
    dto: AssignTicketDto,
    actorUserId: string | undefined,
    metadata: RequestMetadata,
  ) {
    const current = await this.getTicketRecord(id);
    await this.validateRelations(this.prisma, current.clientId, {
      assignedToUserId: dto.assignedToUserId,
      technicianId: dto.technicianId,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.serviceTicket.update({
        where: { id },
        data: {
          assignedToUserId: dto.assignedToUserId,
          technicianId: dto.technicianId,
          status:
            current.status === TicketStatus.OPEN
              ? TicketStatus.TRIAGE
              : undefined,
          firstResponseAt: current.firstResponseAt ? undefined : new Date(),
        },
        include: this.ticketInclude(),
      });

      await this.addSystemComment(tx, {
        ticketId: id,
        actorUserId,
        message: 'Responsavel atribuido ao chamado.',
        customerVisible: false,
      });

      await this.auditLogsService.record(
        {
          domain: AuditDomain.TICKETS,
          entityType: 'SERVICE_TICKET',
          entityId: id,
          action: 'ASSIGN',
          actorUserId,
          beforePayload: {
            assignedToUserId: current.assignedToUserId,
            technicianId: current.technicianId,
          },
          afterPayload: {
            assignedToUserId: dto.assignedToUserId ?? null,
            technicianId: dto.technicianId ?? null,
            metadata,
          } as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return ticket;
    });

    return this.mapTicket(updated);
  }

  async convertToOrder(
    id: string,
    dto: ConvertTicketToOrderDto,
    actorUserId: string | undefined,
    metadata: RequestMetadata,
  ) {
    const ticket = await this.getTicketRecord(id);
    if (ticket.status === TicketStatus.CANCELED) {
      throw new BadRequestException('Chamado cancelado nao pode virar OS.');
    }
    if (
      ticket.status === TicketStatus.CLOSED ||
      ticket.status === TicketStatus.RESOLVED
    ) {
      throw new BadRequestException('Chamado encerrado nao pode virar OS.');
    }
    if (
      ticket.maintenanceOrderId ||
      ticket.status === TicketStatus.CONVERTED_TO_ORDER
    ) {
      throw new BadRequestException('Chamado ja foi convertido em OS.');
    }

    const generatorId = dto.generatorId ?? ticket.generatorId ?? undefined;
    if (!generatorId) {
      throw new BadRequestException(
        'Informe um equipamento antes de converter o chamado em OS.',
      );
    }

    const relations = await this.validateRelations(
      this.prisma,
      ticket.clientId,
      {
        generatorId,
        siteId: dto.siteId ?? ticket.siteId ?? undefined,
        contractId: dto.contractId ?? ticket.contractId ?? undefined,
        technicianId: dto.technicianId ?? ticket.technicianId ?? undefined,
      },
    );

    const order = await this.maintenanceOrdersService.create(
      {
        title: dto.title ?? `OS - Chamado ${ticket.code}`,
        description:
          dto.description ??
          [
            `Origem: Chamado ${ticket.code}`,
            `Cliente: ${ticket.client.companyName}`,
            '',
            ticket.description,
          ].join('\n'),
        type: MaintenanceOrderType.CORRECTIVE,
        status: OrderStatus.OPEN,
        priority: this.mapTicketPriorityToOrderPriority(ticket.priority),
        generatorId,
        siteId:
          dto.siteId ??
          ticket.siteId ??
          relations.generator?.currentSiteId ??
          undefined,
        contractId:
          dto.contractId ??
          ticket.contractId ??
          relations.contract?.id ??
          undefined,
        technicianId: dto.technicianId ?? ticket.technicianId ?? undefined,
        scheduledTo: dto.scheduledTo,
      },
      actorUserId,
    );

    const orderId = order?.id;
    if (!orderId) {
      throw new BadRequestException('Nao foi possivel criar a OS do chamado.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const converted = await tx.serviceTicket.update({
        where: { id },
        data: {
          status: TicketStatus.CONVERTED_TO_ORDER,
          maintenanceOrderId: orderId,
          firstResponseAt: ticket.firstResponseAt ?? new Date(),
        },
        include: this.ticketInclude(),
      });

      await this.addSystemComment(tx, {
        ticketId: id,
        actorUserId,
        message: `Chamado convertido na OS ${orderId}.`,
        customerVisible: true,
      });

      await this.auditLogsService.record(
        {
          domain: AuditDomain.TICKETS,
          entityType: 'SERVICE_TICKET',
          entityId: id,
          action: 'CONVERT_TO_ORDER',
          actorUserId,
          afterPayload: {
            maintenanceOrderId: orderId,
            generatorId,
            metadata,
          } as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return converted;
    });

    return this.mapTicket(updated);
  }

  async resolve(
    id: string,
    dto: TicketActionNoteDto,
    actorUserId: string | undefined,
    metadata: RequestMetadata,
  ) {
    return this.transitionTicket(id, TicketStatus.RESOLVED, {
      note: dto.note,
      actorUserId,
      metadata,
      action: 'RESOLVE',
      customerVisible: true,
    });
  }

  async close(
    id: string,
    dto: TicketActionNoteDto,
    actorUserId: string | undefined,
    metadata: RequestMetadata,
  ) {
    return this.transitionTicket(id, TicketStatus.CLOSED, {
      note: dto.note,
      actorUserId,
      metadata,
      action: 'CLOSE',
      customerVisible: true,
    });
  }

  async cancel(
    id: string,
    dto: TicketActionNoteDto,
    actorUserId: string | undefined,
    metadata: RequestMetadata,
  ) {
    return this.transitionTicket(id, TicketStatus.CANCELED, {
      note: dto.note,
      actorUserId,
      metadata,
      action: 'CANCEL',
      customerVisible: false,
    });
  }

  async listCustomerTickets(userId: string | undefined) {
    const scope = await this.requireCustomerScope(userId);
    const rows = await this.prisma.serviceTicket.findMany({
      where: {
        clientId: scope.clientId,
        customerVisible: true,
      },
      include: this.ticketInclude(),
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return rows.map((row) => this.mapCustomerTicket(row));
  }

  async getCustomerTicket(userId: string | undefined, ticketId: string) {
    const scope = await this.requireCustomerScope(userId);
    const ticket = await this.prisma.serviceTicket.findFirst({
      where: {
        id: ticketId,
        clientId: scope.clientId,
        customerVisible: true,
      },
      include: this.ticketInclude(),
    });

    if (!ticket) {
      throw new NotFoundException('Chamado nao encontrado.');
    }

    return this.mapCustomerTicket(ticket);
  }

  async createCustomerTicket(
    userId: string | undefined,
    dto: CreateCustomerTicketDto,
    metadata: RequestMetadata,
  ) {
    const scope = await this.requireCustomerScope(userId);
    const priority =
      dto.priority ?? this.defaultPriorityForCategory(dto.category);

    return this.prisma.$transaction(async (tx) => {
      const relations = await this.validateRelations(tx, scope.clientId, dto);
      const now = new Date();
      const code = await this.generateCode(tx);
      const sla = this.calculateSla(
        priority,
        now,
        relations.contract?.responseTimeHours ?? null,
      );

      const ticket = await tx.serviceTicket.create({
        data: {
          code,
          clientId: scope.clientId,
          openedByUserId: scope.userId,
          generatorId: dto.generatorId,
          siteId: dto.siteId ?? relations.generator?.currentSiteId ?? null,
          contractId: dto.contractId ?? relations.contract?.id ?? null,
          title: dto.title,
          description: dto.description,
          category: dto.category,
          priority,
          origin: CUSTOMER_PORTAL_ORIGIN,
          slaResponseDueAt: sla.responseDueAt,
          slaResolutionDueAt: sla.resolutionDueAt,
          contactName:
            dto.contactName ?? scope.client.contactName ?? scope.user.name,
          contactPhone: dto.contactPhone ?? scope.client.phone,
          contactEmail:
            dto.contactEmail ?? scope.client.email ?? scope.user.email,
          comments: {
            create: {
              authorUserId: scope.userId,
              authorType: TicketCommentAuthorType.CUSTOMER,
              customerVisible: true,
              message: dto.description,
            },
          },
        },
        include: this.ticketInclude(),
      });

      await this.auditLogsService.record(
        {
          domain: AuditDomain.TICKETS,
          entityType: 'SERVICE_TICKET',
          entityId: ticket.id,
          action: 'CUSTOMER_CREATE',
          actorUserId: scope.userId,
          afterPayload: {
            code: ticket.code,
            clientId: scope.clientId,
            generatorId: ticket.generatorId,
            contractId: ticket.contractId,
            priority,
            metadata,
          } as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return this.mapCustomerTicket(ticket);
    });
  }

  async addCustomerComment(
    userId: string | undefined,
    ticketId: string,
    dto: CustomerTicketCommentDto,
    metadata: RequestMetadata,
  ) {
    const scope = await this.requireCustomerScope(userId);
    const ticket = await this.prisma.serviceTicket.findFirst({
      where: {
        id: ticketId,
        clientId: scope.clientId,
        customerVisible: true,
      },
      include: this.ticketInclude(),
    });
    if (!ticket) {
      throw new NotFoundException('Chamado nao encontrado.');
    }
    if (this.isClosedForCustomerInteraction(ticket.status)) {
      throw new BadRequestException(
        'Chamado encerrado ou cancelado nao aceita novos comentarios.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.serviceTicketComment.create({
        data: {
          ticketId,
          authorUserId: scope.userId,
          authorType: TicketCommentAuthorType.CUSTOMER,
          customerVisible: true,
          message: dto.message,
        },
      });

      const row = await tx.serviceTicket.update({
        where: { id: ticketId },
        data: {
          status:
            ticket.status === TicketStatus.WAITING_CUSTOMER
              ? TicketStatus.WAITING_INTERNAL
              : undefined,
        },
        include: this.ticketInclude(),
      });

      await this.auditLogsService.record(
        {
          domain: AuditDomain.TICKETS,
          entityType: 'SERVICE_TICKET',
          entityId: ticketId,
          action: 'CUSTOMER_COMMENT',
          actorUserId: scope.userId,
          afterPayload: {
            metadata,
          } as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return row;
    });

    return this.mapCustomerTicket(updated);
  }

  async cancelCustomerTicket(
    userId: string | undefined,
    ticketId: string,
    dto: TicketActionNoteDto,
    metadata: RequestMetadata,
  ) {
    const scope = await this.requireCustomerScope(userId);
    const ticket = await this.prisma.serviceTicket.findFirst({
      where: {
        id: ticketId,
        clientId: scope.clientId,
        customerVisible: true,
      },
    });
    if (!ticket) {
      throw new NotFoundException('Chamado nao encontrado.');
    }
    const allowedStatuses: TicketStatus[] = [
      TicketStatus.OPEN,
      TicketStatus.TRIAGE,
      TicketStatus.WAITING_CUSTOMER,
    ];
    if (!allowedStatuses.includes(ticket.status)) {
      throw new BadRequestException(
        'Este chamado ja esta em atendimento avancado e nao pode ser cancelado pelo portal.',
      );
    }

    return this.transitionTicket(ticketId, TicketStatus.CANCELED, {
      note: dto.note ?? 'Cancelado pelo cliente.',
      actorUserId: scope.userId,
      metadata,
      action: 'CUSTOMER_CANCEL',
      customerVisible: true,
    }).then((row) => this.mapCustomerTicket(row));
  }

  private async transitionTicket(
    id: string,
    status: TicketStatus,
    input: {
      note?: string;
      actorUserId?: string;
      metadata: RequestMetadata;
      action: string;
      customerVisible: boolean;
    },
  ) {
    const current = await this.getTicketRecord(id);
    if (
      current.status === TicketStatus.CANCELED &&
      status !== TicketStatus.CANCELED
    ) {
      throw new BadRequestException(
        'Chamado cancelado nao pode ser reaberto por esta acao.',
      );
    }
    if (status === TicketStatus.CANCELED && current.maintenanceOrderId) {
      throw new BadRequestException(
        'Chamado vinculado a OS nao pode ser cancelado.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.serviceTicket.update({
        where: { id },
        data: {
          status,
          ...this.timestampDataForStatus(status, current),
        },
        include: this.ticketInclude(),
      });

      await this.addSystemComment(tx, {
        ticketId: id,
        actorUserId: input.actorUserId,
        message: input.note ?? `Status alterado para ${status}.`,
        customerVisible: input.customerVisible,
      });

      await this.auditLogsService.record(
        {
          domain: AuditDomain.TICKETS,
          entityType: 'SERVICE_TICKET',
          entityId: id,
          action: input.action,
          actorUserId: input.actorUserId,
          beforePayload: { status: current.status },
          afterPayload: {
            status,
            note: input.note ?? null,
            metadata: input.metadata,
          } as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return row;
    });

    return this.mapTicket(updated);
  }

  private async getTicketOrThrow(id: string) {
    const ticket = await this.getTicketRecord(id);
    return this.mapTicket(ticket);
  }

  private async getTicketRecord(id: string) {
    const ticket = await this.prisma.serviceTicket.findUnique({
      where: { id },
      include: this.ticketInclude(),
    });
    if (!ticket) {
      throw new NotFoundException('Chamado nao encontrado.');
    }
    return ticket;
  }

  private async validateRelations(
    db: PrismaClientLike,
    clientId: string,
    input: TicketRelationInput,
  ) {
    const [
      generator,
      site,
      contract,
      maintenanceOrder,
      assignedToUser,
      technician,
    ] = await Promise.all([
      input.generatorId
        ? db.generator.findFirst({
            where: { id: input.generatorId, clientId },
            select: {
              id: true,
              name: true,
              currentSiteId: true,
            },
          })
        : Promise.resolve(null),
      input.siteId
        ? db.site.findFirst({
            where: { id: input.siteId, clientId },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
      input.contractId
        ? db.serviceContract.findFirst({
            where: { id: input.contractId, clientId },
            select: {
              id: true,
              code: true,
              title: true,
              responseTimeHours: true,
            },
          })
        : Promise.resolve(null),
      input.maintenanceOrderId
        ? db.maintenanceOrder.findFirst({
            where: {
              id: input.maintenanceOrderId,
              generator: { clientId },
            },
            select: { id: true, generatorId: true },
          })
        : Promise.resolve(null),
      input.assignedToUserId
        ? db.user.findFirst({
            where: {
              id: input.assignedToUserId,
              isActive: true,
              role: { not: UserRole.CLIENT },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
      input.technicianId
        ? db.technician.findUnique({
            where: { id: input.technicianId },
            select: { id: true, userId: true },
          })
        : Promise.resolve(null),
    ]);

    if (input.generatorId && !generator) {
      throw new NotFoundException(
        'Equipamento nao encontrado para este cliente.',
      );
    }
    if (input.siteId && !site) {
      throw new NotFoundException('Local nao encontrado para este cliente.');
    }
    if (input.contractId && !contract) {
      throw new NotFoundException('Contrato nao encontrado para este cliente.');
    }
    if (input.maintenanceOrderId && !maintenanceOrder) {
      throw new NotFoundException('OS nao encontrada para este cliente.');
    }
    if (
      input.generatorId &&
      maintenanceOrder &&
      maintenanceOrder.generatorId !== input.generatorId
    ) {
      throw new BadRequestException(
        'OS vinculada nao pertence ao equipamento informado.',
      );
    }
    if (input.assignedToUserId && !assignedToUser) {
      throw new NotFoundException('Responsavel interno nao encontrado.');
    }
    if (input.technicianId && !technician) {
      throw new NotFoundException('Tecnico nao encontrado.');
    }

    const defaultContract =
      !contract && input.generatorId
        ? await db.serviceContract.findFirst({
            where: {
              clientId,
              status: ContractStatus.ACTIVE,
              equipments: { some: { generatorId: input.generatorId } },
            },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              code: true,
              title: true,
              responseTimeHours: true,
            },
          })
        : null;

    return {
      generator,
      site,
      contract: contract ?? defaultContract,
      maintenanceOrder,
      assignedToUser,
      technician,
    };
  }

  private async generateCode(db: PrismaClientLike) {
    const latest = await db.serviceTicket.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { code: true },
    });
    const currentNumber = latest?.code.match(/(\d+)$/)?.[1];
    const next = currentNumber ? Number(currentNumber) + 1 : 1;
    return `TCK-${String(next).padStart(6, '0')}`;
  }

  private calculateSla(
    priority: TicketPriority,
    createdAt: Date,
    contractResponseTimeHours: number | null,
  ) {
    const defaultResponseHours: Record<TicketPriority, number> = {
      [TicketPriority.LOW]: 24,
      [TicketPriority.MEDIUM]: 8,
      [TicketPriority.HIGH]: 4,
      [TicketPriority.CRITICAL]: 1,
    };
    const defaultResolutionHours: Record<TicketPriority, number> = {
      [TicketPriority.LOW]: 120,
      [TicketPriority.MEDIUM]: 72,
      [TicketPriority.HIGH]: 24,
      [TicketPriority.CRITICAL]: 8,
    };
    const responseHours =
      contractResponseTimeHours ?? defaultResponseHours[priority];
    return {
      responseDueAt: this.addHours(createdAt, responseHours),
      resolutionDueAt: this.addHours(
        createdAt,
        defaultResolutionHours[priority],
      ),
    };
  }

  private addHours(date: Date, hours: number) {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
  }

  private defaultPriorityForCategory(category: TicketCategory) {
    return category === TicketCategory.EMERGENCY
      ? TicketPriority.CRITICAL
      : TicketPriority.MEDIUM;
  }

  private timestampDataForStatus(status?: TicketStatus, current?: any) {
    if (!status) return {};
    const now = new Date();
    return {
      firstResponseAt:
        this.countsAsFirstResponse(status) && !current?.firstResponseAt
          ? now
          : undefined,
      resolvedAt:
        status === TicketStatus.RESOLVED && !current?.resolvedAt
          ? now
          : undefined,
      closedAt:
        status === TicketStatus.CLOSED && !current?.closedAt ? now : undefined,
      canceledAt:
        status === TicketStatus.CANCELED && !current?.canceledAt
          ? now
          : undefined,
    };
  }

  private countsAsFirstResponse(status: TicketStatus) {
    const firstResponseStatuses: TicketStatus[] = [
      TicketStatus.TRIAGE,
      TicketStatus.WAITING_CUSTOMER,
      TicketStatus.WAITING_INTERNAL,
      TicketStatus.SCHEDULED,
      TicketStatus.IN_PROGRESS,
      TicketStatus.CONVERTED_TO_ORDER,
      TicketStatus.RESOLVED,
    ];
    return firstResponseStatuses.includes(status);
  }

  private isClosedForCustomerInteraction(status: TicketStatus) {
    const closedStatuses: TicketStatus[] = [
      TicketStatus.CLOSED,
      TicketStatus.CANCELED,
      TicketStatus.CONVERTED_TO_ORDER,
    ];
    return closedStatuses.includes(status);
  }

  private mapTicketPriorityToOrderPriority(priority: TicketPriority) {
    const map: Record<TicketPriority, string> = {
      [TicketPriority.LOW]: 'LOW',
      [TicketPriority.MEDIUM]: 'NORMAL',
      [TicketPriority.HIGH]: 'HIGH',
      [TicketPriority.CRITICAL]: 'CRITICAL',
    };
    return map[priority];
  }

  private addSystemComment(
    db: PrismaClientLike,
    input: {
      ticketId: string;
      actorUserId?: string;
      message: string;
      customerVisible: boolean;
    },
  ) {
    return db.serviceTicketComment.create({
      data: {
        ticketId: input.ticketId,
        authorUserId: input.actorUserId,
        authorType: TicketCommentAuthorType.SYSTEM,
        message: input.message,
        customerVisible: input.customerVisible,
      },
    });
  }

  private mapTicket(ticket: TicketView) {
    const now = new Date();
    const isResponseOverdue =
      !ticket.firstResponseAt &&
      !!ticket.slaResponseDueAt &&
      ticket.slaResponseDueAt.getTime() < now.getTime() &&
      !TERMINAL_TICKET_STATUSES.includes(ticket.status);
    const isResolutionOverdue =
      !ticket.resolvedAt &&
      !!ticket.slaResolutionDueAt &&
      ticket.slaResolutionDueAt.getTime() < now.getTime() &&
      !TERMINAL_TICKET_STATUSES.includes(ticket.status);
    const isWarning =
      !isResponseOverdue &&
      !isResolutionOverdue &&
      [ticket.slaResponseDueAt, ticket.slaResolutionDueAt].some(
        (date) =>
          date &&
          date.getTime() > now.getTime() &&
          date.getTime() - now.getTime() <= 60 * 60 * 1000,
      );

    return {
      ...ticket,
      isResponseOverdue,
      isResolutionOverdue,
      slaStatus:
        isResponseOverdue || isResolutionOverdue
          ? 'OVERDUE'
          : isWarning
            ? 'WARNING'
            : 'OK',
    };
  }

  private mapCustomerTicket(ticket: TicketView) {
    const mapped = this.mapTicket(ticket);
    const safe = { ...mapped };
    const technician = mapped.technician;
    const openedByUser = mapped.openedByUser;
    const comments = mapped.comments ?? [];
    delete safe.internalNotes;
    delete safe.assignedToUser;
    delete safe.technician;
    delete safe.openedByUser;
    delete safe.comments;

    return {
      ...safe,
      comments: comments.filter((comment) => comment.customerVisible),
      internalNotes: undefined,
      assignedToUser: undefined,
      technician: technician
        ? { id: technician.id, user: { name: technician.user?.name ?? null } }
        : null,
      openedByUser:
        openedByUser?.role === UserRole.CLIENT
          ? { id: openedByUser.id, name: openedByUser.name }
          : null,
    };
  }

  private auditSnapshot(ticket: TicketView) {
    return {
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      assignedToUserId: ticket.assignedToUserId,
      technicianId: ticket.technicianId,
      generatorId: ticket.generatorId,
      siteId: ticket.siteId,
      contractId: ticket.contractId,
    } as unknown as Prisma.InputJsonValue;
  }

  private ticketInclude() {
    return {
      client: {
        select: {
          id: true,
          companyName: true,
          tradeName: true,
          phone: true,
        },
      },
      generator: {
        select: {
          id: true,
          name: true,
          serialNumber: true,
          brand: true,
          currentSiteId: true,
        },
      },
      site: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      contract: {
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          responseTimeHours: true,
        },
      },
      maintenanceOrder: {
        select: {
          id: true,
          title: true,
          status: true,
          scheduledTo: true,
          finishedAt: true,
        },
      },
      openedByUser: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      assignedToUser: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      technician: {
        select: {
          id: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
      comments: {
        orderBy: { createdAt: 'asc' as const },
        include: {
          authorUser: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
      },
    } satisfies Prisma.ServiceTicketInclude;
  }

  private async requireCustomerScope(
    userId: string | undefined,
  ): Promise<CustomerScope> {
    if (!userId) {
      throw new UnauthorizedException('Usuario nao identificado.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        linkedClientId: true,
        linkedClient: {
          select: {
            id: true,
            companyName: true,
            tradeName: true,
            email: true,
            phone: true,
            contactName: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario indisponivel para o portal.');
    }
    if (user.role !== UserRole.CLIENT) {
      throw new ForbiddenException(
        'A area do cliente e exclusiva para usuarios externos.',
      );
    }
    if (!user.linkedClientId || !user.linkedClient) {
      throw new ForbiddenException(
        'Conta de cliente sem empresa vinculada ao portal.',
      );
    }

    return {
      userId: user.id,
      clientId: user.linkedClientId,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      client: user.linkedClient,
    };
  }
}
