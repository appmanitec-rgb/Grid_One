import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CommissionStatus,
  FleetVehicleStatus,
  HrAssetStatus,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from 'src/database/database.service';
import {
  AllocateFleetDto,
  AssignHrAssetDto,
  CreateCommissionDto,
  CreateFleetVehicleDto,
  CreateTimeEntryDto,
} from './dto/hr-admin.dto';

@Injectable()
export class HrAdminService {
  constructor(private readonly prisma: DatabaseService) {}

  listCollaborators() {
    return this.prisma.user.findMany({
      include: {
        technicianProfile: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  listTimeEntries(userId?: string, month?: string) {
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
          select: { id: true, name: true, department: true, hourCost: true },
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
    const rows = await this.listTimeEntries(undefined, month);
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

  createCommission(dto: CreateCommissionDto) {
    const amount = Number(
      (Number(dto.baseAmount || 0) * Number(dto.percent || 0)) / 100,
    );
    return this.prisma.commissionEntry.create({
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
  }

  updateCommissionStatus(id: string, status: CommissionStatus) {
    return this.prisma.commissionEntry.update({
      where: { id },
      data: {
        status,
        releasedAt:
          status === CommissionStatus.RELEASED ? new Date() : undefined,
        paidAt: status === CommissionStatus.PAID ? new Date() : undefined,
      },
    });
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
    return this.prisma.hrAssetAssignment.create({
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
  }

  updateHrAssetStatus(id: string, status: HrAssetStatus) {
    return this.prisma.hrAssetAssignment.update({
      where: { id },
      data: {
        status,
        returnedAt: status === HrAssetStatus.RETURNED ? new Date() : undefined,
      },
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
}
