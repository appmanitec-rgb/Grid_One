import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditDomain,
  CommissionStatus,
  FleetVehicleStatus,
  HrAssetStatus,
  InventoryMovementType,
  Prisma,
  UserRole,
  WarehouseType,
} from '@prisma/client';
import { DatabaseService } from 'src/database/database.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  AllocateFleetDto,
  AssignHrAssetDto,
  CreateCommissionDto,
  CreateCommissionRuleDto,
  CreateFleetVehicleDto,
  CreateTimeEntryDto,
  UpdateCommissionRuleDto,
} from './dto/hr-admin.dto';

export type AccessActor = {
  role?: UserRole;
  isSystemMaster?: boolean;
  accessPolicy?: {
    people?: {
      viewSensitive?: boolean;
      manageSensitive?: boolean;
    };
  };
};

@Injectable()
export class HrAdminService {
  constructor(
    private readonly prisma: DatabaseService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  listCollaborators(actor?: AccessActor) {
    const canViewSensitive = this.canViewSensitivePeople(actor);

    return this.prisma.user.findMany({
      where: {
        role: { not: UserRole.CLIENT },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        branch: true,
        isActive: true,
        ...(canViewSensitive ? { hourCost: true } : {}),
        technicianProfile: { select: { id: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async listAgentsOverview(actor?: AccessActor) {
    const canViewSensitive = this.canViewSensitivePeople(actor);
    const [internalUsers, portalUsers, clients, auditors] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: { notIn: [UserRole.CLIENT, UserRole.AUDITOR] } },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          department: true,
          branch: true,
          ...(canViewSensitive ? { hourCost: true } : {}),
          isActive: true,
          technicianProfile: { select: { id: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { role: UserRole.CLIENT },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          linkedClient: {
            select: { id: true, companyName: true, tradeName: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.client.findMany({
        select: {
          id: true,
          companyName: true,
          tradeName: true,
          cnpj: true,
          contactName: true,
          email: true,
          phone: true,
          portalUsers: { select: { id: true, name: true, email: true } },
        },
        orderBy: { companyName: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { role: UserRole.AUDITOR },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          department: true,
          branch: true,
          isActive: true,
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      internalUsers,
      systemUsers: [...internalUsers, ...auditors, ...portalUsers],
      portalUsers,
      clients,
      auditors,
      access: {
        canViewSensitivePeople: canViewSensitive,
      },
      summary: {
        internalUsers: internalUsers.length,
        systemUsers:
          internalUsers.length + auditors.length + portalUsers.length,
        portalUsers: portalUsers.length,
        clients: clients.length,
        auditors: auditors.length,
      },
    };
  }

  listTimeEntries(userId?: string, month?: string, actor?: AccessActor) {
    const canViewSensitive = this.canViewSensitivePeople(actor);
    const where: Prisma.TimeEntryWhereInput = {};
    if (userId) where.userId = userId;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split('-').map(Number);
      const from = new Date(y, m - 1, 1);
      const to = new Date(y, m, 1);
      where.startedAt = { gte: from, lt: to };
    }

    return this.prisma.timeEntry.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            department: true,
            ...(canViewSensitive ? { hourCost: true } : {}),
          },
        },
        maintenanceOrder: {
          select: { id: true, title: true, costCenterId: true },
        },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  async createTimeEntry(dto: CreateTimeEntryDto) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.timeEntry.create({
        data: {
          userId: dto.userId,
          maintenanceOrderId: dto.maintenanceOrderId,
          status: dto.status,
          startedAt: new Date(dto.startedAt),
          endedAt: dto.endedAt ? new Date(dto.endedAt) : undefined,
          transitMinutes: dto.transitMinutes || 0,
          workMinutes: dto.workMinutes || 0,
          extraMinutes: dto.extraMinutes || 0,
          nightMinutes: dto.nightMinutes || 0,
        },
        include: {
          user: { select: { hourCost: true } },
          maintenanceOrder: { select: { costCenterId: true } },
        },
      });

      if (
        entry.maintenanceOrder?.costCenterId &&
        Number(entry.user?.hourCost || 0) > 0
      ) {
        const hours = Number(entry.workMinutes || 0) / 60;
        const cost = hours * Number(entry.user.hourCost || 0);
        if (cost > 0) {
          await tx.costCenterEntry.create({
            data: {
              costCenterId: entry.maintenanceOrder.costCenterId,
              entryType: 'COST',
              sourceType: 'TIME_ENTRY',
              sourceId: entry.id,
              amount: cost,
              competenceDate: new Date(dto.startedAt),
              notes: 'Custo de homem-hora da equipe tecnica',
            },
          });
        }
      }

      return entry;
    });
  }

  async payrollExport(month?: string) {
    const rows = await this.listTimeEntries(undefined, month, {
      role: UserRole.HR,
      accessPolicy: {
        people: { viewSensitive: true },
      },
    });
    const grouped = new Map<
      string,
      {
        userId: string;
        name: string;
        transitMinutes: number;
        workMinutes: number;
        extraMinutes: number;
        nightMinutes: number;
      }
    >();

    type TimeEntryWithUser = Prisma.TimeEntryGetPayload<{
      include: { user: { select: { id: true; name: true } } };
    }>;

    for (const row of rows as TimeEntryWithUser[]) {
      const current = grouped.get(row.userId) || {
        userId: row.userId,
        name: row.user.name,
        transitMinutes: 0,
        workMinutes: 0,
        extraMinutes: 0,
        nightMinutes: 0,
      };
      current.transitMinutes += Number(row.transitMinutes || 0);
      current.workMinutes += Number(row.workMinutes || 0);
      current.extraMinutes += Number(row.extraMinutes || 0);
      current.nightMinutes += Number(row.nightMinutes || 0);
      grouped.set(row.userId, current);
    }

    return {
      month: month || 'all',
      collaborators: [...grouped.values()],
    };
  }

  listCommissions(status?: CommissionStatus) {
    return this.prisma.commissionEntry.findMany({
      where: status ? { status } : {},
      include: {
        user: { select: { id: true, name: true, department: true } },
        contract: { select: { id: true, code: true } },
        maintenanceOrder: { select: { id: true, title: true } },
        receivable: { select: { id: true, status: true, dueDate: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  createCommission(dto: CreateCommissionDto, actorUserId?: string) {
    this.assertCommissionOrigin(dto);

    const amount = Number(
      (Number(dto.baseAmount || 0) * Number(dto.percent || 0)) / 100,
    );

    return this.prisma.$transaction(async (tx) => {
      const commission = await tx.commissionEntry.create({
        data: {
          userId: dto.userId,
          receivableId: dto.receivableId,
          maintenanceOrderId: dto.maintenanceOrderId,
          contractId: dto.contractId,
          baseAmount: dto.baseAmount,
          percent: dto.percent,
          amount,
          notes: dto.notes,
        },
      });

      await this.auditLogsService.record(
        {
          domain: AuditDomain.PEOPLE,
          entityType: 'COMMISSION_ENTRY',
          entityId: commission.id,
          action: 'CREATE_COMMISSION',
          actorUserId,
          afterPayload: {
            userId: commission.userId,
            receivableId: commission.receivableId,
            maintenanceOrderId: commission.maintenanceOrderId,
            contractId: commission.contractId,
            status: commission.status,
            amount: commission.amount,
          },
        },
        tx,
      );

      return commission;
    });
  }

  updateCommissionStatus(
    id: string,
    status: CommissionStatus,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.commissionEntry.findUnique({
        where: { id },
      });

      if (!current) {
        throw new NotFoundException('Comissao nao encontrada.');
      }

      const updated = await tx.commissionEntry.update({
        where: { id },
        data: {
          status,
          releasedAt:
            status === CommissionStatus.RELEASED ? new Date() : undefined,
          paidAt: status === CommissionStatus.PAID ? new Date() : undefined,
        },
      });

      await this.auditLogsService.record(
        {
          domain: AuditDomain.PEOPLE,
          entityType: 'COMMISSION_ENTRY',
          entityId: id,
          action: 'UPDATE_COMMISSION_STATUS',
          actorUserId,
          beforePayload: { status: current.status },
          afterPayload: { status: updated.status },
        },
        tx,
      );

      return updated;
    });
  }

  listCommissionRules() {
    return this.prisma.commissionRule.findMany({
      include: {
        seller: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: [{ active: 'desc' }, { trigger: 'asc' }, { createdAt: 'desc' }],
    });
  }

  createCommissionRule(dto: CreateCommissionRuleDto, actorUserId?: string) {
    this.assertCommissionRuleScope(dto);

    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.commissionRule.create({
        data: {
          name: dto.name.trim(),
          sellerId: dto.sellerId,
          role: dto.role,
          percentage: dto.percentage,
          trigger: dto.trigger,
          active: dto.active ?? true,
          validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        },
      });

      await this.auditLogsService.record(
        {
          domain: AuditDomain.PEOPLE,
          entityType: 'COMMISSION_RULE',
          entityId: rule.id,
          action: 'CREATE_COMMISSION_RULE',
          actorUserId,
          afterPayload: {
            name: rule.name,
            sellerId: rule.sellerId,
            role: rule.role,
            percentage: rule.percentage,
            trigger: rule.trigger,
            active: rule.active,
          },
        },
        tx,
      );

      return rule;
    });
  }

  updateCommissionRule(
    id: string,
    dto: UpdateCommissionRuleDto,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.commissionRule.findUnique({ where: { id } });
      if (!current) {
        throw new NotFoundException('Regra de comissao nao encontrada.');
      }

      const nextScope = {
        sellerId:
          dto.sellerId === undefined
            ? (current.sellerId ?? undefined)
            : dto.sellerId,
        role: dto.role === undefined ? (current.role ?? undefined) : dto.role,
        validFrom:
          dto.validFrom === undefined
            ? current.validFrom?.toISOString()
            : dto.validFrom,
        validUntil:
          dto.validUntil === undefined
            ? current.validUntil?.toISOString()
            : dto.validUntil,
      };
      this.assertCommissionRuleScope(nextScope);

      const updated = await tx.commissionRule.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          sellerId: dto.sellerId,
          role: dto.role,
          percentage: dto.percentage,
          trigger: dto.trigger,
          active: dto.active,
          validFrom:
            dto.validFrom === undefined
              ? undefined
              : dto.validFrom
                ? new Date(dto.validFrom)
                : null,
          validUntil:
            dto.validUntil === undefined
              ? undefined
              : dto.validUntil
                ? new Date(dto.validUntil)
                : null,
        },
      });

      await this.auditLogsService.record(
        {
          domain: AuditDomain.PEOPLE,
          entityType: 'COMMISSION_RULE',
          entityId: id,
          action: 'UPDATE_COMMISSION_RULE',
          actorUserId,
          beforePayload: {
            name: current.name,
            sellerId: current.sellerId,
            role: current.role,
            percentage: current.percentage,
            trigger: current.trigger,
            active: current.active,
          },
          afterPayload: {
            name: updated.name,
            sellerId: updated.sellerId,
            role: updated.role,
            percentage: updated.percentage,
            trigger: updated.trigger,
            active: updated.active,
          },
        },
        tx,
      );

      return updated;
    });
  }

  private assertCommissionRuleScope(input: {
    sellerId?: string | null;
    role?: string | null;
    validFrom?: string | null;
    validUntil?: string | null;
  }) {
    if (input.sellerId && input.role) {
      throw new BadRequestException(
        'Regra de comissao deve ser por vendedor ou por perfil, nao ambos.',
      );
    }
    if (input.validFrom && input.validUntil) {
      const from = new Date(input.validFrom);
      const until = new Date(input.validUntil);
      if (from > until) {
        throw new BadRequestException(
          'Validade final da regra deve ser posterior ao inicio.',
        );
      }
    }
  }

  private assertCommissionOrigin(dto: CreateCommissionDto) {
    const hasOrigin =
      Boolean(dto.receivableId) ||
      Boolean(dto.maintenanceOrderId) ||
      Boolean(dto.contractId);

    if (!hasOrigin) {
      throw new BadRequestException(
        'Comissao precisa ter origem rastreavel: recebivel, contrato ou OS.',
      );
    }
  }

  private canViewSensitivePeople(actor?: AccessActor) {
    if (!actor) return false;
    if (actor.isSystemMaster || actor.role === UserRole.ADMIN) return true;
    const people = actor.accessPolicy?.people;
    return people?.viewSensitive === true || people?.manageSensitive === true;
  }

  listHrAssets() {
    return this.prisma.hrAssetAssignment.findMany({
      include: {
        user: { select: { id: true, name: true, department: true } },
        catalogItem: { select: { id: true, name: true, sku: true } },
      },
      orderBy: { deliveredAt: 'desc' },
    });
  }

  assignHrAsset(dto: AssignHrAssetDto) {
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.hrAssetAssignment.create({
        data: {
          userId: dto.userId,
          catalogItemId: dto.catalogItemId,
          assetType: dto.assetType,
          title: dto.title,
          caCode: dto.caCode,
          deliveredAt: new Date(dto.deliveredAt),
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
          signedTermUrl: dto.signedTermUrl,
        },
      });

      if (dto.catalogItemId) {
        await this.decrementMainStockForHrAsset(
          tx,
          dto.catalogItemId,
          assignment.id,
          dto.title,
        );
      }

      return assignment;
    });
  }

  updateHrAssetStatus(id: string, status: HrAssetStatus) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.hrAssetAssignment.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Item de RH nao encontrado.');

      if (
        current.status === HrAssetStatus.RETURNED &&
        status !== HrAssetStatus.RETURNED
      ) {
        throw new BadRequestException(
          'Item ja devolvido. Registre uma nova entrega para nova retirada.',
        );
      }

      const updated = await tx.hrAssetAssignment.update({
        where: { id },
        data: {
          status,
          returnedAt:
            status === HrAssetStatus.RETURNED ? new Date() : undefined,
        },
      });

      if (
        status === HrAssetStatus.RETURNED &&
        current.status !== HrAssetStatus.RETURNED &&
        current.catalogItemId
      ) {
        await this.incrementMainStockForHrAsset(
          tx,
          current.catalogItemId,
          current.id,
          current.title,
        );
      }

      return updated;
    });
  }

  expiringAssets(days = 15) {
    const until = new Date();
    until.setDate(until.getDate() + days);

    return this.prisma.hrAssetAssignment.findMany({
      where: {
        status: HrAssetStatus.ACTIVE,
        expiresAt: { not: null, lte: until },
      },
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { expiresAt: 'asc' },
    });
  }

  listFleetVehicles() {
    return this.prisma.fleetVehicle.findMany({
      include: {
        allocations: {
          where: { releasedAt: null },
          include: {
            user: { select: { id: true, name: true } },
            maintenanceOrder: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { plate: 'asc' },
    });
  }

  createFleetVehicle(dto: CreateFleetVehicleDto) {
    return this.prisma.fleetVehicle.create({
      data: {
        plate: dto.plate,
        renavam: dto.renavam,
        model: dto.model,
        currentKm: dto.currentKm || 0,
        nextOilChangeKm: dto.nextOilChangeKm,
      },
    });
  }

  async allocateVehicle(dto: AllocateFleetDto) {
    return this.prisma.$transaction(async (tx) => {
      const vehicle = await tx.fleetVehicle.findUnique({
        where: { id: dto.vehicleId },
      });
      if (!vehicle) throw new NotFoundException('Veiculo nao encontrado.');
      if (
        vehicle.status === FleetVehicleStatus.BLOCKED ||
        vehicle.status === FleetVehicleStatus.MAINTENANCE
      ) {
        throw new BadRequestException('Veiculo bloqueado para despacho.');
      }

      const allocation = await tx.fleetAllocation.create({
        data: {
          vehicleId: dto.vehicleId,
          userId: dto.userId,
          maintenanceOrderId: dto.maintenanceOrderId,
          startKm: dto.startKm,
        },
      });

      await tx.fleetVehicle.update({
        where: { id: dto.vehicleId },
        data: { status: FleetVehicleStatus.IN_USE },
      });

      return allocation;
    });
  }

  async releaseVehicle(allocationId: string, endKm: number) {
    return this.prisma.$transaction(async (tx) => {
      const alloc = await tx.fleetAllocation.findUnique({
        where: { id: allocationId },
      });
      if (!alloc)
        throw new NotFoundException('Alocacao de frota nao encontrada.');

      const updatedAlloc = await tx.fleetAllocation.update({
        where: { id: allocationId },
        data: {
          releasedAt: new Date(),
          endKm,
        },
      });

      const vehicle = await tx.fleetVehicle.findUnique({
        where: { id: alloc.vehicleId },
      });
      if (!vehicle) throw new NotFoundException('Veiculo nao encontrado.');

      const shouldBlock =
        vehicle.nextOilChangeKm !== null &&
        vehicle.nextOilChangeKm !== undefined
          ? endKm >= vehicle.nextOilChangeKm
          : false;

      await tx.fleetVehicle.update({
        where: { id: vehicle.id },
        data: {
          currentKm: endKm,
          status: shouldBlock
            ? FleetVehicleStatus.BLOCKED
            : FleetVehicleStatus.AVAILABLE,
        },
      });

      return {
        allocation: updatedAlloc,
        blockedForLongTrips: shouldBlock,
      };
    });
  }

  private async ensureMainWarehouse(tx: Prisma.TransactionClient) {
    const existing = await tx.warehouse.findFirst({
      where: { type: WarehouseType.MAIN },
    });
    if (existing) return existing;

    return tx.warehouse.create({
      data: {
        code: 'MATRIZ',
        name: 'Almoxarifado Matriz',
        type: WarehouseType.MAIN,
      },
    });
  }

  private async decrementMainStockForHrAsset(
    tx: Prisma.TransactionClient,
    catalogItemId: string,
    assignmentId: string,
    title: string,
  ) {
    const warehouse = await this.ensureMainWarehouse(tx);
    const balance = await tx.inventoryBalance.findUnique({
      where: {
        warehouseId_catalogItemId: {
          warehouseId: warehouse.id,
          catalogItemId,
        },
      },
    });
    const available =
      Number(balance?.physicalQty || 0) - Number(balance?.reservedQty || 0);

    if (!balance || available < 1) {
      throw new BadRequestException(
        'Estoque disponivel insuficiente para registrar a saida do item.',
      );
    }

    await tx.inventoryBalance.update({
      where: { id: balance.id },
      data: { physicalQty: { decrement: 1 } },
    });

    await tx.inventoryMovement.create({
      data: {
        movementType: InventoryMovementType.OUT,
        warehouseId: warehouse.id,
        catalogItemId,
        quantity: -1,
        referenceType: 'HR_ASSET_ASSIGNMENT',
        referenceId: assignmentId,
        note: `Saida para tecnico: ${title}`,
      },
    });

    await this.syncCatalogStockCurrent(tx, catalogItemId);
  }

  private async incrementMainStockForHrAsset(
    tx: Prisma.TransactionClient,
    catalogItemId: string,
    assignmentId: string,
    title: string,
  ) {
    const warehouse = await this.ensureMainWarehouse(tx);

    await tx.inventoryBalance.upsert({
      where: {
        warehouseId_catalogItemId: {
          warehouseId: warehouse.id,
          catalogItemId,
        },
      },
      update: { physicalQty: { increment: 1 } },
      create: {
        warehouseId: warehouse.id,
        catalogItemId,
        physicalQty: 1,
        reservedQty: 0,
        minQty: 0,
        maxQty: 0,
      },
    });

    await tx.inventoryMovement.create({
      data: {
        movementType: InventoryMovementType.IN,
        warehouseId: warehouse.id,
        catalogItemId,
        quantity: 1,
        referenceType: 'HR_ASSET_RETURN',
        referenceId: assignmentId,
        note: `Devolucao de tecnico: ${title}`,
      },
    });

    await this.syncCatalogStockCurrent(tx, catalogItemId);
  }

  private async syncCatalogStockCurrent(
    tx: Prisma.TransactionClient,
    catalogItemId: string,
  ) {
    const agg = await tx.inventoryBalance.aggregate({
      where: { catalogItemId },
      _sum: { physicalQty: true },
    });

    await tx.catalogItem.update({
      where: { id: catalogItemId },
      data: { stockCurrent: Number(agg._sum.physicalQty || 0) },
    });
  }
}
