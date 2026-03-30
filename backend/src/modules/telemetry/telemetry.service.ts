import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ContractStatus,
  MaintenanceOrderType,
  OrderStatus,
  Prisma,
  TelemetryAlarmType,
} from '@prisma/client';
import { DatabaseService } from 'src/database/database.service';
import { CreateTelemetryEventDto } from './dto/create-telemetry-event.dto';

@Injectable()
export class TelemetryService {
  constructor(private readonly prisma: DatabaseService) {}

  async getOverview() {
    const recentEvents = await this.prisma.telemetryEvent.findMany({
      take: 36,
      orderBy: { receivedAt: 'desc' },
      include: {
        generator: {
          select: {
            id: true,
            name: true,
            serialNumber: true,
            criticality: true,
            operationalStatus: true,
            lifecycleStatus: true,
            client: {
              select: {
                id: true,
                companyName: true,
              },
            },
            currentSite: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const generatorIds = [
      ...new Set(recentEvents.map((event) => event.generatorId)),
    ];

    const activeOrders = generatorIds.length
      ? await this.prisma.maintenanceOrder.findMany({
          where: {
            generatorId: { in: generatorIds },
            status: { in: [OrderStatus.OPEN, OrderStatus.IN_PROGRESS] },
          },
          include: {
            technician: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
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
          },
          orderBy: { openedAt: 'desc' },
        })
      : [];

    const normalizedOrders = activeOrders.map((order) => ({
      generatorId: order.generatorId,
      id: order.id,
      title: order.title,
      status: order.status,
      type: order.type,
      priority: order.priority,
      openedAt: order.openedAt,
      scheduledTo: order.scheduledTo,
      auvoId: order.auvoId,
      auvoLink: order.auvoLink,
      technician: order.technician?.user
        ? {
            id: order.technician.user.id,
            name: order.technician.user.name,
            skillLevel: order.technician.user.skillLevel,
          }
        : null,
      contract: order.contract,
    }));

    const ordersByGenerator = new Map<string, typeof normalizedOrders>();
    for (const order of normalizedOrders) {
      const bucket = ordersByGenerator.get(order.generatorId) || [];
      bucket.push(order);
      ordersByGenerator.set(order.generatorId, bucket);
    }

    for (const bucket of ordersByGenerator.values()) {
      bucket.sort((a, b) => {
        const statusDelta =
          this.statusRank(a.status) - this.statusRank(b.status);
        if (statusDelta !== 0) return statusDelta;

        const priorityDelta =
          this.priorityRank(a.priority) - this.priorityRank(b.priority);
        if (priorityDelta !== 0) return priorityDelta;

        return b.openedAt.getTime() - a.openedAt.getTime();
      });
    }

    const recentAlerts = recentEvents.map((event) => {
      const severity = this.classifySeverity(event);
      const generatorOrders = ordersByGenerator.get(event.generatorId) || [];

      return {
        id: event.id,
        alarmType: event.alarmType,
        fuelLevelPercent: event.fuelLevelPercent,
        batteryVoltage: event.batteryVoltage,
        coolantTemperature: event.coolantTemperature,
        oilPressure: event.oilPressure,
        gridOnline: event.gridOnline,
        receivedAt: event.receivedAt,
        severity,
        generator: event.generator,
        activeOrderCount: generatorOrders.length,
        activeOrders: generatorOrders.slice(0, 3).map(({ ...order }) => order),
        automationOpen: generatorOrders.some(
          (order) => order.type === MaintenanceOrderType.REFUELING,
        ),
      };
    });

    const latestEventByGenerator = new Map<
      string,
      (typeof recentAlerts)[number]
    >();
    for (const event of recentAlerts) {
      if (!latestEventByGenerator.has(event.generator.id)) {
        latestEventByGenerator.set(event.generator.id, event);
      }
    }

    const generatorSnapshots = [...latestEventByGenerator.values()]
      .map((event) => ({
        generator: event.generator,
        severity: event.severity,
        activeOrderCount: event.activeOrderCount,
        activeOrders: event.activeOrders,
        automationOpen: event.automationOpen,
        lastEvent: {
          id: event.id,
          alarmType: event.alarmType,
          fuelLevelPercent: event.fuelLevelPercent,
          batteryVoltage: event.batteryVoltage,
          coolantTemperature: event.coolantTemperature,
          oilPressure: event.oilPressure,
          gridOnline: event.gridOnline,
          receivedAt: event.receivedAt,
        },
      }))
      .sort((a, b) => {
        const severityDelta =
          this.severityRank(b.severity) - this.severityRank(a.severity);
        if (severityDelta !== 0) return severityDelta;
        return (
          new Date(b.lastEvent.receivedAt).getTime() -
          new Date(a.lastEvent.receivedAt).getTime()
        );
      });

    const latestEvents = [...latestEventByGenerator.values()];

    return {
      stats: {
        monitoredGenerators: latestEvents.length,
        activeAlerts: latestEvents.filter((event) => event.severity !== 'ok')
          .length,
        lowFuelGenerators: latestEvents.filter((event) => this.isLowFuel(event))
          .length,
        gridFailures: latestEvents.filter(
          (event) =>
            event.alarmType === TelemetryAlarmType.GRID_FAILURE ||
            event.gridOnline === false,
        ).length,
        automationOpenOrders: normalizedOrders.filter(
          (order) => order.type === MaintenanceOrderType.REFUELING,
        ).length,
        linkedActiveOrders: normalizedOrders.length,
      },
      recentEvents: recentAlerts,
      generatorSnapshots,
    };
  }

  async ingestEvent(dto: CreateTelemetryEventDto) {
    const generator = dto.generatorId
      ? await this.prisma.generator.findUnique({
          where: { id: dto.generatorId },
        })
      : dto.serialNumber
        ? await this.prisma.generator.findUnique({
            where: { serialNumber: dto.serialNumber },
          })
        : null;

    if (!generator) {
      throw new BadRequestException(
        'Telemetria rejeitada: gerador nao encontrado por id/numero de serie.',
      );
    }

    const event = await this.prisma.telemetryEvent.create({
      data: {
        generatorId: generator.id,
        alarmType: dto.alarmType ?? TelemetryAlarmType.NONE,
        fuelLevelPercent: dto.fuelLevelPercent,
        batteryVoltage: dto.batteryVoltage,
        coolantTemperature: dto.coolantTemperature,
        oilPressure: dto.oilPressure,
        gridOnline: dto.gridOnline,
        payload: dto.payload as Prisma.InputJsonValue | undefined,
      },
    });

    const shouldOpenRefuel =
      (dto.alarmType === TelemetryAlarmType.LOW_FUEL ||
        (dto.fuelLevelPercent !== undefined && dto.fuelLevelPercent < 15)) &&
      dto.fuelLevelPercent !== undefined;

    if (shouldOpenRefuel) {
      const activeContract = await this.prisma.serviceContract.findFirst({
        where: {
          status: { in: [ContractStatus.ACTIVE, ContractStatus.RENEWAL] },
          includesFuelManagement: true,
          equipments: {
            some: { generatorId: generator.id },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (activeContract) {
        const existingOpen = await this.prisma.maintenanceOrder.findFirst({
          where: {
            generatorId: generator.id,
            contractId: activeContract.id,
            type: MaintenanceOrderType.REFUELING,
            status: { in: [OrderStatus.OPEN, OrderStatus.IN_PROGRESS] },
          },
          select: { id: true },
        });

        if (!existingOpen) {
          await this.prisma.maintenanceOrder.create({
            data: {
              title: 'Abastecimento automatico por telemetria',
              description: `Alarme de combustivel baixo (${dto.fuelLevelPercent}%).`,
              type: MaintenanceOrderType.REFUELING,
              status: OrderStatus.OPEN,
              priority: 'HIGH',
              generatorId: generator.id,
              contractId: activeContract.id,
              customerReport:
                'OS criada automaticamente por evento de telemetria.',
            },
          });
        }
      }
    }

    return {
      ok: true,
      eventId: event.id,
      generatorId: generator.id,
      automationTriggered: shouldOpenRefuel,
    };
  }

  private classifySeverity(event: {
    alarmType: TelemetryAlarmType;
    fuelLevelPercent: number | null;
    batteryVoltage: number | null;
    coolantTemperature: number | null;
    oilPressure: number | null;
    gridOnline: boolean | null;
  }): 'critical' | 'warning' | 'ok' {
    if (
      event.alarmType === TelemetryAlarmType.HIGH_COOLANT_TEMPERATURE ||
      event.alarmType === TelemetryAlarmType.LOW_OIL_PRESSURE ||
      event.alarmType === TelemetryAlarmType.START_FAILURE ||
      event.alarmType === TelemetryAlarmType.GRID_FAILURE ||
      (event.coolantTemperature !== null && event.coolantTemperature >= 98) ||
      (event.oilPressure !== null && event.oilPressure <= 20) ||
      event.gridOnline === false
    ) {
      return 'critical';
    }

    if (
      event.alarmType === TelemetryAlarmType.LOW_FUEL ||
      event.alarmType === TelemetryAlarmType.BATTERY_LOW ||
      (event.fuelLevelPercent !== null && event.fuelLevelPercent < 15) ||
      (event.batteryVoltage !== null && event.batteryVoltage < 12)
    ) {
      return 'warning';
    }

    return 'ok';
  }

  private isLowFuel(event: {
    alarmType: TelemetryAlarmType;
    fuelLevelPercent: number | null;
  }) {
    return (
      event.alarmType === TelemetryAlarmType.LOW_FUEL ||
      (event.fuelLevelPercent !== null && event.fuelLevelPercent < 15)
    );
  }

  private priorityRank(priority?: string | null) {
    const rank: Record<string, number> = {
      URGENT: 0,
      HIGH: 1,
      NORMAL: 2,
      LOW: 3,
    };

    return rank[priority || 'NORMAL'] ?? 9;
  }

  private statusRank(status: OrderStatus) {
    const rank: Record<OrderStatus, number> = {
      [OrderStatus.IN_PROGRESS]: 0,
      [OrderStatus.OPEN]: 1,
      [OrderStatus.COMPLETED]: 2,
      [OrderStatus.CANCELED]: 3,
    };

    return rank[status] ?? 9;
  }

  private severityRank(severity: 'ok' | 'warning' | 'critical') {
    const rank = {
      ok: 0,
      warning: 1,
      critical: 2,
    };

    return rank[severity];
  }
}
