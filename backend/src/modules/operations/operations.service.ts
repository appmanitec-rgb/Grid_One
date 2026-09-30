import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DowntimeStatus,
  GeneratorOperationalStatus,
  MaintenanceOrderType,
  OperationAttachmentKind,
  Prisma,
  TicketPriority,
  UserRole,
  WarrantyOwner,
  WarrantyStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { MaintenanceOrdersService } from '../maintenance-orders/maintenance-orders.service';
import { CreateMaintenanceOrderDto } from '../maintenance-orders/dto/create-maintenance-order.dto';
import {
  AddOperationAttachmentDto,
  CreateDowntimeDto,
  CreateWarrantyDto,
  ListCasesQueryDto,
  UpdateDowntimeDto,
  UpdateWarrantyDto,
} from './dto/operation-cases.dto';

const downtimeTerminal: DowntimeStatus[] = [
  DowntimeStatus.RESTORED,
  DowntimeStatus.CLOSED,
  DowntimeStatus.CANCELED,
];
const warrantyTerminal: WarrantyStatus[] = [
  WarrantyStatus.CLOSED,
  WarrantyStatus.CANCELED,
];

export const DOWNTIME_TRANSITIONS: Record<DowntimeStatus, DowntimeStatus[]> = {
  REPORTED: [DowntimeStatus.TRIAGE, DowntimeStatus.CANCELED],
  TRIAGE: [
    DowntimeStatus.IN_REPAIR,
    DowntimeStatus.WAITING_PARTS,
    DowntimeStatus.WAITING_SUPPLIER,
    DowntimeStatus.CANCELED,
  ],
  IN_REPAIR: [
    DowntimeStatus.WAITING_PARTS,
    DowntimeStatus.WAITING_SUPPLIER,
    DowntimeStatus.MONITORING,
    DowntimeStatus.RESTORED,
  ],
  WAITING_PARTS: [DowntimeStatus.IN_REPAIR, DowntimeStatus.RESTORED],
  WAITING_SUPPLIER: [DowntimeStatus.IN_REPAIR, DowntimeStatus.RESTORED],
  MONITORING: [DowntimeStatus.IN_REPAIR, DowntimeStatus.RESTORED],
  RESTORED: [DowntimeStatus.CLOSED, DowntimeStatus.IN_REPAIR],
  CLOSED: [DowntimeStatus.TRIAGE],
  CANCELED: [],
};

export const WARRANTY_TRANSITIONS: Record<WarrantyStatus, WarrantyStatus[]> = {
  OPEN: [WarrantyStatus.TRIAGE, WarrantyStatus.CANCELED],
  TRIAGE: [
    WarrantyStatus.WAITING_DOCUMENTS,
    WarrantyStatus.WAITING_SUPPLIER,
    WarrantyStatus.WAITING_MANUFACTURER,
    WarrantyStatus.APPROVED,
    WarrantyStatus.REJECTED,
    WarrantyStatus.CANCELED,
  ],
  WAITING_DOCUMENTS: [WarrantyStatus.TRIAGE, WarrantyStatus.CANCELED],
  WAITING_SUPPLIER: [
    WarrantyStatus.TRIAGE,
    WarrantyStatus.APPROVED,
    WarrantyStatus.REJECTED,
  ],
  WAITING_MANUFACTURER: [
    WarrantyStatus.TRIAGE,
    WarrantyStatus.APPROVED,
    WarrantyStatus.REJECTED,
  ],
  APPROVED: [WarrantyStatus.REPAIRING, WarrantyStatus.RESOLVED],
  REJECTED: [WarrantyStatus.TRIAGE, WarrantyStatus.CLOSED],
  REPAIRING: [
    WarrantyStatus.WAITING_SUPPLIER,
    WarrantyStatus.WAITING_MANUFACTURER,
    WarrantyStatus.RESOLVED,
  ],
  RESOLVED: [WarrantyStatus.CLOSED, WarrantyStatus.REPAIRING],
  CLOSED: [WarrantyStatus.TRIAGE],
  CANCELED: [],
};

const downtimeListInclude = {
  generator: {
    select: {
      id: true,
      code: true,
      name: true,
      brand: true,
      serialNumber: true,
      operationalStatus: true,
      warrantyEndDate: true,
    },
  },
  client: { select: { id: true, companyName: true, code: true } },
  maintenanceOrder: { select: { id: true, title: true, status: true } },
  ticket: { select: { id: true, code: true, title: true, status: true } },
  _count: { select: { warrantyCases: true } },
} satisfies Prisma.MachineDowntimeInclude;

const warrantyListInclude = {
  generator: {
    select: {
      id: true,
      code: true,
      name: true,
      brand: true,
      warrantyEndDate: true,
    },
  },
  client: { select: { id: true, companyName: true, code: true } },
  downtime: { select: { id: true, code: true, status: true } },
  maintenanceOrder: { select: { id: true, title: true, status: true } },
  supplier: { select: { id: true, companyName: true } },
  manufacturer: { select: { id: true, name: true } },
} satisfies Prisma.WarrantyCaseInclude;

@Injectable()
export class OperationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly orders: MaintenanceOrdersService,
  ) {}

  async options(actorUserId: string) {
    await this.actor(actorUserId);
    const [
      generators,
      users,
      suppliers,
      manufacturers,
      orders,
      tickets,
      downtimes,
    ] = await Promise.all([
      this.db.generator.findMany({
        select: {
          id: true,
          code: true,
          name: true,
          brand: true,
          serialNumber: true,
          warrantyEndDate: true,
          operationalStatus: true,
          clientId: true,
          client: { select: { id: true, companyName: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.db.user.findMany({
        where: { isActive: true, role: { not: UserRole.CLIENT } },
        select: { id: true, name: true, role: true },
        orderBy: { name: 'asc' },
      }),
      this.db.supplier.findMany({
        where: { isActive: true },
        select: { id: true, companyName: true },
        orderBy: { companyName: 'asc' },
      }),
      this.db.manufacturer.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.db.maintenanceOrder.findMany({
        select: { id: true, title: true, status: true, generatorId: true },
        orderBy: { openedAt: 'desc' },
      }),
      this.db.serviceTicket.findMany({
        select: { id: true, code: true, title: true, generatorId: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.db.machineDowntime.findMany({
        select: { id: true, code: true, generatorId: true, status: true },
        orderBy: { reportedAt: 'desc' },
      }),
    ]);
    return {
      generators,
      users,
      suppliers,
      manufacturers,
      orders,
      tickets,
      downtimes,
    };
  }

  async listDowntimes(query: ListCasesQueryDto, actorUserId: string) {
    await this.actor(actorUserId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const status = this.parseStatus(query.status, DowntimeStatus);
    const q = query.q?.trim().slice(0, 150);
    const where: Prisma.MachineDowntimeWhereInput = {
      ...(status ? { status } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.generatorId ? { generatorId: query.generatorId } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { symptom: { contains: q, mode: 'insensitive' } },
              { generator: { name: { contains: q, mode: 'insensitive' } } },
              { client: { companyName: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const now = new Date();
    const [items, total, active, critical, overdue, restored] =
      await Promise.all([
        this.db.machineDowntime.findMany({
          where,
          include: downtimeListInclude,
          orderBy: [{ reportedAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.db.machineDowntime.count({ where }),
        this.db.machineDowntime.count({
          where: { status: { notIn: downtimeTerminal } },
        }),
        this.db.machineDowntime.count({
          where: {
            priority: TicketPriority.CRITICAL,
            status: { notIn: downtimeTerminal },
          },
        }),
        this.db.machineDowntime.count({
          where: {
            OR: [
              { responseDueAt: { lt: now }, status: DowntimeStatus.REPORTED },
              {
                targetRestoreAt: { lt: now },
                status: { notIn: downtimeTerminal },
              },
            ],
          },
        }),
        this.db.machineDowntime.count({
          where: { status: DowntimeStatus.RESTORED },
        }),
      ]);
    return {
      items,
      total,
      page,
      pageSize,
      summary: { active, critical, overdue, restored },
    };
  }

  async listWarranties(query: ListCasesQueryDto, actorUserId: string) {
    await this.actor(actorUserId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const status = this.parseStatus(query.status, WarrantyStatus);
    const q = query.q?.trim().slice(0, 150);
    const where: Prisma.WarrantyCaseWhereInput = {
      ...(status ? { status } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.generatorId ? { generatorId: query.generatorId } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { title: { contains: q, mode: 'insensitive' } },
              { defectDescription: { contains: q, mode: 'insensitive' } },
              { externalProtocol: { contains: q, mode: 'insensitive' } },
              { generator: { name: { contains: q, mode: 'insensitive' } } },
              { client: { companyName: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const now = new Date();
    const [items, total, ours, factory, waitingSupplier, overdue] =
      await Promise.all([
        this.db.warrantyCase.findMany({
          where,
          include: warrantyListInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.db.warrantyCase.count({ where }),
        this.db.warrantyCase.count({
          where: {
            owner: WarrantyOwner.OUR,
            status: { notIn: warrantyTerminal },
          },
        }),
        this.db.warrantyCase.count({
          where: {
            owner: WarrantyOwner.MANUFACTURER,
            status: { notIn: warrantyTerminal },
          },
        }),
        this.db.warrantyCase.count({
          where: { status: WarrantyStatus.WAITING_SUPPLIER },
        }),
        this.db.warrantyCase.count({
          where: {
            responseDueAt: { lt: now },
            status: {
              notIn: [
                ...warrantyTerminal,
                WarrantyStatus.APPROVED,
                WarrantyStatus.REJECTED,
                WarrantyStatus.RESOLVED,
              ],
            },
          },
        }),
      ]);
    return {
      items,
      total,
      page,
      pageSize,
      summary: { ours, factory, waitingSupplier, overdue },
    };
  }

  async getDowntime(id: string, actorUserId: string) {
    await this.actor(actorUserId);
    const record = await this.db.machineDowntime.findUnique({
      where: { id },
      include: {
        ...downtimeListInclude,
        events: { orderBy: { createdAt: 'desc' } },
        attachments: { orderBy: { createdAt: 'desc' } },
        warrantyCases: {
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            owner: true,
          },
        },
      },
    });
    if (!record) throw new NotFoundException('Maquina parada nao encontrada.');
    return {
      ...record,
      allowedTransitions: DOWNTIME_TRANSITIONS[record.status],
    };
  }

  async getWarranty(id: string, actorUserId: string) {
    await this.actor(actorUserId);
    const record = await this.db.warrantyCase.findUnique({
      where: { id },
      include: {
        ...warrantyListInclude,
        events: { orderBy: { createdAt: 'desc' } },
        attachments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!record) throw new NotFoundException('Garantia nao encontrada.');
    return {
      ...record,
      allowedTransitions: WARRANTY_TRANSITIONS[record.status],
    };
  }

  async createDowntime(dto: CreateDowntimeDto, actorUserId: string) {
    const actor = await this.actor(actorUserId);
    const generator = await this.generator(dto.generatorId);
    await this.checkLinks(
      dto.generatorId,
      dto.maintenanceOrderId,
      dto.ticketId,
    );
    await this.checkAssignee(dto.assignedUserId);
    const failureStartedAt = new Date(dto.failureStartedAt);
    if (failureStartedAt.getTime() > Date.now() + 60_000) {
      throw new BadRequestException('A parada nao pode comecar no futuro.');
    }
    if (
      dto.targetRestoreAt &&
      new Date(dto.targetRestoreAt) < failureStartedAt
    ) {
      throw new BadRequestException(
        'A previsao de retorno deve ser posterior ao inicio da parada.',
      );
    }
    const record = await this.db.$transaction(async (tx) => {
      const active = await tx.machineDowntime.count({
        where: {
          generatorId: generator.id,
          status: { notIn: downtimeTerminal },
        },
      });
      if (active > 0) {
        throw new BadRequestException(
          'Ja existe uma parada ativa para este equipamento. Atualize o caso existente.',
        );
      }
      const created = await tx.machineDowntime.create({
        data: {
          code: this.code('MP'),
          generatorId: generator.id,
          clientId: generator.clientId,
          maintenanceOrderId: dto.maintenanceOrderId,
          ticketId: dto.ticketId,
          symptom: dto.symptom.trim(),
          operationalImpact: dto.operationalImpact?.trim(),
          failureCategory: dto.failureCategory?.trim(),
          priority: dto.priority ?? TicketPriority.HIGH,
          failureStartedAt,
          responseDueAt: dto.responseDueAt
            ? new Date(dto.responseDueAt)
            : undefined,
          targetRestoreAt: dto.targetRestoreAt
            ? new Date(dto.targetRestoreAt)
            : undefined,
          assignedUserId: dto.assignedUserId,
          openedByUserId: actor.id,
          events: {
            create: {
              toStatus: DowntimeStatus.REPORTED,
              note: 'Parada registrada: ' + dto.symptom.trim(),
              actorUserId: actor.id,
              actorName: actor.name,
            },
          },
        },
      });
      if (
        generator.operationalStatus !== GeneratorOperationalStatus.DEACTIVATED
      ) {
        await tx.generator.update({
          where: { id: generator.id },
          data: {
            operationalStatus: GeneratorOperationalStatus.STOPPED_BY_FAILURE,
          },
        });
      }
      return created;
    });
    return this.getDowntime(record.id, actorUserId);
  }

  async updateDowntime(
    id: string,
    dto: UpdateDowntimeDto,
    actorUserId: string,
  ) {
    const actor = await this.actor(actorUserId);
    const current = await this.db.machineDowntime.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Maquina parada nao encontrada.');
    const nextStatus = dto.status ?? current.status;
    const changedStatus = nextStatus !== current.status;
    if (
      changedStatus &&
      !DOWNTIME_TRANSITIONS[current.status].includes(nextStatus)
    ) {
      throw new BadRequestException(
        'Transicao de etapa invalida para esta parada.',
      );
    }
    if (
      changedStatus &&
      downtimeTerminal.includes(current.status) &&
      !downtimeTerminal.includes(nextStatus)
    ) {
      const otherActive = await this.db.machineDowntime.count({
        where: {
          generatorId: current.generatorId,
          id: { not: id },
          status: { notIn: downtimeTerminal },
        },
      });
      if (otherActive) {
        throw new BadRequestException(
          'Ja existe uma parada ativa para este equipamento.',
        );
      }
    }
    if (changedStatus && (!dto.note || dto.note.trim().length < 3)) {
      throw new BadRequestException(
        'Justifique a mudanca de etapa com pelo menos 3 caracteres.',
      );
    }
    const resolution =
      dto.resolution === undefined ? current.resolution : dto.resolution;
    const rootCause =
      dto.rootCause === undefined ? current.rootCause : dto.rootCause;
    if (
      (nextStatus === DowntimeStatus.RESTORED ||
        nextStatus === DowntimeStatus.CLOSED) &&
      !resolution?.trim()
    ) {
      throw new BadRequestException(
        'Registre a solucao antes de restaurar a maquina.',
      );
    }
    if (nextStatus === DowntimeStatus.CLOSED && !rootCause?.trim()) {
      throw new BadRequestException(
        'Registre a causa raiz antes de encerrar a parada.',
      );
    }
    await this.checkLinks(
      current.generatorId,
      dto.maintenanceOrderId,
      dto.ticketId,
    );
    await this.checkAssignee(dto.assignedUserId);
    const targetRestoreAt =
      dto.targetRestoreAt === undefined
        ? current.targetRestoreAt
        : this.dateOrNull(dto.targetRestoreAt);
    if (targetRestoreAt && targetRestoreAt < current.failureStartedAt) {
      throw new BadRequestException(
        'A previsao de retorno deve ser posterior ao inicio da parada.',
      );
    }
    await this.db.$transaction(async (tx) => {
      await tx.machineDowntime.update({
        where: { id },
        data: {
          status: nextStatus,
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.diagnosis !== undefined
            ? { diagnosis: this.clean(dto.diagnosis) }
            : {}),
          ...(dto.temporarySolution !== undefined
            ? { temporarySolution: this.clean(dto.temporarySolution) }
            : {}),
          ...(dto.rootCause !== undefined
            ? { rootCause: this.clean(dto.rootCause) }
            : {}),
          ...(dto.resolution !== undefined
            ? { resolution: this.clean(dto.resolution) }
            : {}),
          ...(dto.operationalImpact !== undefined
            ? { operationalImpact: this.clean(dto.operationalImpact) }
            : {}),
          ...(dto.assignedUserId !== undefined
            ? { assignedUserId: dto.assignedUserId }
            : {}),
          ...(dto.maintenanceOrderId !== undefined
            ? { maintenanceOrderId: dto.maintenanceOrderId }
            : {}),
          ...(dto.ticketId !== undefined ? { ticketId: dto.ticketId } : {}),
          ...(dto.responseDueAt !== undefined
            ? { responseDueAt: this.dateOrNull(dto.responseDueAt) }
            : {}),
          ...(dto.targetRestoreAt !== undefined ? { targetRestoreAt } : {}),
          ...(changedStatus && nextStatus === DowntimeStatus.RESTORED
            ? { restoredAt: new Date() }
            : {}),
          ...(changedStatus &&
          (nextStatus === DowntimeStatus.CLOSED ||
            nextStatus === DowntimeStatus.CANCELED)
            ? { closedAt: new Date() }
            : {}),
          ...(changedStatus && !downtimeTerminal.includes(nextStatus)
            ? { restoredAt: null, closedAt: null }
            : {}),
        },
      });
      await tx.machineDowntimeEvent.create({
        data: {
          downtimeId: id,
          fromStatus: changedStatus ? current.status : undefined,
          toStatus: changedStatus ? nextStatus : undefined,
          note: dto.note?.trim() || 'Dados da parada atualizados.',
          actorUserId: actor.id,
          actorName: actor.name,
        },
      });
      const stillActive = await tx.machineDowntime.count({
        where: {
          generatorId: current.generatorId,
          status: { notIn: downtimeTerminal },
        },
      });
      if (stillActive === 0) {
        await tx.generator.updateMany({
          where: {
            id: current.generatorId,
            operationalStatus: GeneratorOperationalStatus.STOPPED_BY_FAILURE,
          },
          data: { operationalStatus: GeneratorOperationalStatus.OPERATING },
        });
      } else if (changedStatus && downtimeTerminal.includes(current.status)) {
        await tx.generator.updateMany({
          where: {
            id: current.generatorId,
            operationalStatus: { not: GeneratorOperationalStatus.DEACTIVATED },
          },
          data: {
            operationalStatus: GeneratorOperationalStatus.STOPPED_BY_FAILURE,
          },
        });
      }
    });
    return this.getDowntime(id, actorUserId);
  }

  async openCorrectiveOrder(id: string, actorUserId: string) {
    const actor = await this.actor(actorUserId);
    const downtime = await this.db.machineDowntime.findUnique({
      where: { id },
      include: { generator: { select: { currentSiteId: true } } },
    });
    if (!downtime)
      throw new NotFoundException('Maquina parada nao encontrada.');
    if (downtime.maintenanceOrderId)
      throw new BadRequestException('Esta parada ja possui uma OS vinculada.');
    if (downtimeTerminal.includes(downtime.status))
      throw new BadRequestException('Reabra a parada antes de criar uma OS.');
    const order = await this.orders.create(
      {
        title: `Corretiva ${downtime.code}`,
        description: `${downtime.symptom}${downtime.operationalImpact ? `\nImpacto: ${downtime.operationalImpact}` : ''}`,
        generatorId: downtime.generatorId,
        siteId: downtime.generator.currentSiteId ?? undefined,
        type: MaintenanceOrderType.CORRECTIVE,
        priority: downtime.priority,
      } as CreateMaintenanceOrderDto,
      actorUserId,
    );
    if (!order) throw new BadRequestException('A OS nao foi criada.');
    await this.db.machineDowntime.update({
      where: { id },
      data: {
        maintenanceOrderId: order.id,
        events: {
          create: {
            note: `OS corretiva ${order.title} criada e vinculada.`,
            actorUserId: actor.id,
            actorName: actor.name,
          },
        },
      },
    });
    return this.getDowntime(id, actorUserId);
  }

  async createWarranty(dto: CreateWarrantyDto, actorUserId: string) {
    const actor = await this.actor(actorUserId);
    const generator = await this.generator(dto.generatorId);
    await this.checkLinks(
      dto.generatorId,
      dto.maintenanceOrderId,
      undefined,
      dto.downtimeId,
    );
    await this.checkSupplierAndManufacturer(dto.supplierId, dto.manufacturerId);
    await this.checkAssignee(dto.assignedUserId);
    const record = await this.db.warrantyCase.create({
      data: {
        code: this.code('GAR'),
        generatorId: generator.id,
        clientId: generator.clientId,
        downtimeId: dto.downtimeId,
        maintenanceOrderId: dto.maintenanceOrderId,
        supplierId: dto.supplierId,
        manufacturerId: dto.manufacturerId,
        owner: dto.owner,
        title: dto.title.trim(),
        defectDescription: dto.defectDescription.trim(),
        component: dto.component?.trim(),
        partNumber: dto.partNumber?.trim(),
        serialNumber: dto.serialNumber?.trim(),
        claimAmount: dto.claimAmount,
        coverageEndsAt: generator.warrantyEndDate,
        responseDueAt: dto.responseDueAt
          ? new Date(dto.responseDueAt)
          : undefined,
        assignedUserId: dto.assignedUserId,
        openedByUserId: actor.id,
        events: {
          create: {
            toStatus: WarrantyStatus.OPEN,
            note: `Garantia ${dto.owner === WarrantyOwner.OUR ? 'Manitec' : 'de fabrica'} registrada: ${dto.defectDescription.trim()}`,
            actorUserId: actor.id,
            actorName: actor.name,
          },
        },
      },
    });
    return this.getWarranty(record.id, actorUserId);
  }

  async updateWarranty(
    id: string,
    dto: UpdateWarrantyDto,
    actorUserId: string,
  ) {
    const actor = await this.actor(actorUserId);
    const current = await this.db.warrantyCase.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Garantia nao encontrada.');
    const nextStatus = dto.status ?? current.status;
    const nextOwner = dto.owner ?? current.owner;
    const changedStatus = nextStatus !== current.status;
    if (
      changedStatus &&
      !WARRANTY_TRANSITIONS[current.status].includes(nextStatus)
    ) {
      throw new BadRequestException(
        'Transicao de etapa invalida para esta garantia.',
      );
    }
    if (changedStatus && (!dto.note || dto.note.trim().length < 3)) {
      throw new BadRequestException(
        'Justifique a mudanca de etapa com pelo menos 3 caracteres.',
      );
    }
    if (
      dto.owner &&
      dto.owner !== current.owner &&
      current.status !== WarrantyStatus.OPEN &&
      current.status !== WarrantyStatus.TRIAGE
    ) {
      throw new BadRequestException(
        'O responsavel pela cobertura so pode mudar durante a triagem.',
      );
    }
    const supplierId =
      dto.supplierId === undefined ? current.supplierId : dto.supplierId;
    const manufacturerId =
      dto.manufacturerId === undefined
        ? current.manufacturerId
        : dto.manufacturerId;
    const coverageDecision =
      dto.coverageDecision === undefined
        ? current.coverageDecision
        : dto.coverageDecision;
    const resolution =
      dto.resolution === undefined ? current.resolution : dto.resolution;
    if (
      nextStatus === WarrantyStatus.WAITING_SUPPLIER &&
      (nextOwner !== WarrantyOwner.OUR || !supplierId)
    ) {
      throw new BadRequestException(
        'Garantia nossa aguardando fornecedor exige um fornecedor vinculado.',
      );
    }
    if (
      nextStatus === WarrantyStatus.WAITING_MANUFACTURER &&
      (nextOwner !== WarrantyOwner.MANUFACTURER || !manufacturerId)
    ) {
      throw new BadRequestException(
        'A espera da fabrica exige cobertura de fabrica e fabricante vinculado.',
      );
    }
    if (
      (nextStatus === WarrantyStatus.APPROVED ||
        nextStatus === WarrantyStatus.REJECTED) &&
      !coverageDecision?.trim()
    ) {
      throw new BadRequestException(
        'Registre a decisao sobre cobertura antes de aprovar ou recusar.',
      );
    }
    if (
      (nextStatus === WarrantyStatus.RESOLVED ||
        nextStatus === WarrantyStatus.CLOSED) &&
      current.status !== WarrantyStatus.REJECTED &&
      !resolution?.trim()
    ) {
      throw new BadRequestException(
        'Registre a solucao antes de concluir a garantia.',
      );
    }
    const claimAmount =
      dto.claimAmount === undefined ? current.claimAmount : dto.claimAmount;
    const approvedAmount =
      dto.approvedAmount === undefined
        ? current.approvedAmount
        : dto.approvedAmount;
    if (
      claimAmount != null &&
      approvedAmount != null &&
      approvedAmount > claimAmount
    ) {
      throw new BadRequestException(
        'O valor aprovado nao pode superar o valor solicitado.',
      );
    }
    await this.checkLinks(
      current.generatorId,
      dto.maintenanceOrderId,
      undefined,
      dto.downtimeId,
    );
    await this.checkSupplierAndManufacturer(dto.supplierId, dto.manufacturerId);
    await this.checkAssignee(dto.assignedUserId);
    await this.db.warrantyCase.update({
      where: { id },
      data: {
        status: nextStatus,
        owner: nextOwner,
        ...(dto.diagnosis !== undefined
          ? { diagnosis: this.clean(dto.diagnosis) }
          : {}),
        ...(dto.coverageDecision !== undefined
          ? { coverageDecision: this.clean(dto.coverageDecision) }
          : {}),
        ...(dto.resolution !== undefined
          ? { resolution: this.clean(dto.resolution) }
          : {}),
        ...(dto.externalProtocol !== undefined
          ? { externalProtocol: this.clean(dto.externalProtocol) }
          : {}),
        ...(dto.supplierProtocol !== undefined
          ? { supplierProtocol: this.clean(dto.supplierProtocol) }
          : {}),
        ...(dto.downtimeId !== undefined ? { downtimeId: dto.downtimeId } : {}),
        ...(dto.maintenanceOrderId !== undefined
          ? { maintenanceOrderId: dto.maintenanceOrderId }
          : {}),
        ...(dto.supplierId !== undefined ? { supplierId: dto.supplierId } : {}),
        ...(dto.manufacturerId !== undefined
          ? { manufacturerId: dto.manufacturerId }
          : {}),
        ...(dto.assignedUserId !== undefined
          ? { assignedUserId: dto.assignedUserId }
          : {}),
        ...(dto.responseDueAt !== undefined
          ? { responseDueAt: this.dateOrNull(dto.responseDueAt) }
          : {}),
        ...(dto.claimAmount !== undefined
          ? { claimAmount: dto.claimAmount }
          : {}),
        ...(dto.approvedAmount !== undefined
          ? { approvedAmount: dto.approvedAmount }
          : {}),
        ...(changedStatus &&
        (nextStatus === WarrantyStatus.WAITING_SUPPLIER ||
          nextStatus === WarrantyStatus.WAITING_MANUFACTURER) &&
        !current.submittedAt
          ? { submittedAt: new Date() }
          : {}),
        ...(changedStatus && nextStatus === WarrantyStatus.RESOLVED
          ? { resolvedAt: new Date() }
          : {}),
        ...(changedStatus &&
        (nextStatus === WarrantyStatus.CLOSED ||
          nextStatus === WarrantyStatus.CANCELED)
          ? { closedAt: new Date() }
          : {}),
        ...(changedStatus && !warrantyTerminal.includes(nextStatus)
          ? { closedAt: null }
          : {}),
        events: {
          create: {
            fromStatus: changedStatus ? current.status : undefined,
            toStatus: changedStatus ? nextStatus : undefined,
            note: dto.note?.trim() || 'Dados da garantia atualizados.',
            actorUserId: actor.id,
            actorName: actor.name,
          },
        },
      },
    });
    return this.getWarranty(id, actorUserId);
  }

  async addAttachment(
    kind: 'downtime' | 'warranty',
    id: string,
    dto: AddOperationAttachmentDto,
    actorUserId: string,
  ) {
    const actor = await this.actor(actorUserId);
    if (kind === 'downtime') await this.getDowntime(id, actorUserId);
    else await this.getWarranty(id, actorUserId);
    const url = dto.url.trim();
    if (/^https?:\/\//i.test(url)) {
      try {
        if (!['http:', 'https:'].includes(new URL(url).protocol)) {
          throw new Error('Invalid protocol');
        }
      } catch {
        throw new BadRequestException('Link de evidencia invalido.');
      }
    }
    await this.db.$transaction(async (tx) => {
      await tx.operationAttachment.create({
        data: {
          ...(kind === 'downtime' ? { downtimeId: id } : { warrantyId: id }),
          kind: dto.kind ?? OperationAttachmentKind.OTHER,
          name: dto.name.trim(),
          url,
          addedById: actor.id,
          addedByName: actor.name,
        },
      });
      if (kind === 'downtime') {
        await tx.machineDowntimeEvent.create({
          data: {
            downtimeId: id,
            note: `Evidencia anexada: ${dto.name.trim()}`,
            actorUserId: actor.id,
            actorName: actor.name,
          },
        });
      } else {
        await tx.warrantyCaseEvent.create({
          data: {
            warrantyId: id,
            note: `Documento anexado: ${dto.name.trim()}`,
            actorUserId: actor.id,
            actorName: actor.name,
          },
        });
      }
    });
    return kind === 'downtime'
      ? this.getDowntime(id, actorUserId)
      : this.getWarranty(id, actorUserId);
  }

  async removeAttachment(
    kind: 'downtime' | 'warranty',
    id: string,
    attachmentId: string,
    actorUserId: string,
  ) {
    const actor = await this.actor(actorUserId);
    const attachment = await this.db.operationAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (
      !attachment ||
      (kind === 'downtime'
        ? attachment.downtimeId !== id
        : attachment.warrantyId !== id)
    ) {
      throw new NotFoundException('Anexo nao encontrado neste caso.');
    }
    await this.db.$transaction(async (tx) => {
      await tx.operationAttachment.delete({ where: { id: attachmentId } });
      if (kind === 'downtime') {
        await tx.machineDowntimeEvent.create({
          data: {
            downtimeId: id,
            note: `Evidencia removida: ${attachment.name}`,
            actorUserId: actor.id,
            actorName: actor.name,
          },
        });
      } else {
        await tx.warrantyCaseEvent.create({
          data: {
            warrantyId: id,
            note: `Documento removido: ${attachment.name}`,
            actorUserId: actor.id,
            actorName: actor.name,
          },
        });
      }
    });
    return kind === 'downtime'
      ? this.getDowntime(id, actorUserId)
      : this.getWarranty(id, actorUserId);
  }

  private clean(value: string | null) {
    return value?.trim() || null;
  }

  private dateOrNull(value: string | null) {
    return value ? new Date(value) : null;
  }

  private parseStatus<T extends string>(
    value: string | undefined,
    values: Record<string, T>,
  ) {
    if (!value || value === 'ALL') return undefined;
    if (!Object.values(values).includes(value as T)) {
      throw new BadRequestException('Status invalido.');
    }
    return value as T;
  }

  private async actor(id: string) {
    const user = await this.db.user.findUnique({
      where: { id },
      select: { id: true, name: true, role: true, isActive: true },
    });
    if (!user?.isActive || user.role === UserRole.CLIENT) {
      throw new ForbiddenException('Area exclusiva da equipe interna.');
    }
    return user;
  }

  private code(prefix: string) {
    return `${prefix}-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private async generator(id: string) {
    const generator = await this.db.generator.findUnique({
      where: { id },
      select: {
        id: true,
        clientId: true,
        currentSiteId: true,
        warrantyEndDate: true,
        operationalStatus: true,
      },
    });
    if (!generator) throw new NotFoundException('Equipamento nao encontrado.');
    return generator;
  }

  private async checkLinks(
    generatorId: string,
    orderId?: string | null,
    ticketId?: string | null,
    downtimeId?: string | null,
  ) {
    if (orderId) {
      const order = await this.db.maintenanceOrder.findUnique({
        where: { id: orderId },
        select: { generatorId: true },
      });
      if (!order || order.generatorId !== generatorId)
        throw new BadRequestException(
          'A OS deve pertencer ao equipamento selecionado.',
        );
    }
    if (ticketId) {
      const ticket = await this.db.serviceTicket.findUnique({
        where: { id: ticketId },
        select: { generatorId: true },
      });
      if (!ticket || ticket.generatorId !== generatorId)
        throw new BadRequestException(
          'O chamado deve pertencer ao equipamento selecionado.',
        );
    }
    if (downtimeId) {
      const downtime = await this.db.machineDowntime.findUnique({
        where: { id: downtimeId },
        select: { generatorId: true },
      });
      if (!downtime || downtime.generatorId !== generatorId)
        throw new BadRequestException(
          'A parada deve pertencer ao equipamento selecionado.',
        );
    }
  }

  private async checkAssignee(userId?: string | null) {
    if (!userId) return;
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { isActive: true, role: true },
    });
    if (!user?.isActive || user.role === UserRole.CLIENT)
      throw new BadRequestException('Responsavel interno invalido.');
  }

  private async checkSupplierAndManufacturer(
    supplierId?: string | null,
    manufacturerId?: string | null,
  ) {
    if (supplierId) {
      const supplier = await this.db.supplier.findUnique({
        where: { id: supplierId },
        select: { isActive: true },
      });
      if (!supplier?.isActive)
        throw new BadRequestException('Fornecedor invalido.');
    }
    if (manufacturerId) {
      const manufacturer = await this.db.manufacturer.findUnique({
        where: { id: manufacturerId },
        select: { isActive: true },
      });
      if (!manufacturer?.isActive)
        throw new BadRequestException('Fabricante invalido.');
    }
  }
}
