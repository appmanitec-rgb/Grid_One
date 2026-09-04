import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AccountsReceivableStatus,
  CostCenterEntryType,
  OrderStatus,
  PurchaseOrderStatus,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';

type OverviewFilters = {
  from?: string;
  to?: string;
  status?: string;
  clientId?: string;
  contractId?: string;
};

type CostMetrics = {
  orders: number;
  hours: number;
  transitHours: number;
  revenue: number;
  receivedRevenue: number;
  laborCost: number;
  materialCost: number;
  purchaseCost: number;
  commissionCost: number;
  otherCost: number;
  totalCost: number;
  result: number;
  marginPercent: number;
};

type DimensionRow = CostMetrics & {
  id: string;
  code?: string | null;
  name: string;
};

const metricKeys: Array<keyof CostMetrics> = [
  'orders',
  'hours',
  'transitHours',
  'revenue',
  'receivedRevenue',
  'laborCost',
  'materialCost',
  'purchaseCost',
  'commissionCost',
  'otherCost',
  'totalCost',
  'result',
  'marginPercent',
];

@Injectable()
export class OperationalCostsService {
  constructor(private readonly prisma: DatabaseService) {}

  async overview(filters: OverviewFilters) {
    const period = this.resolvePeriod(filters.from, filters.to);
    const status = this.resolveStatus(filters.status);
    const orderWhere = {
      ...(status ? { status } : {}),
      ...(filters.clientId
        ? { generator: { clientId: filters.clientId } }
        : {}),
      ...(filters.contractId ? { contractId: filters.contractId } : {}),
      OR: [
        { finishedAt: { gte: period.from, lte: period.to } },
        {
          finishedAt: null,
          openedAt: { gte: period.from, lte: period.to },
        },
      ],
    };

    const costCenterWhere = {
      ...(filters.contractId ? { contractId: filters.contractId } : {}),
      ...(filters.clientId
        ? {
            OR: [
              { clientId: filters.clientId },
              { contract: { clientId: filters.clientId } },
              { generator: { clientId: filters.clientId } },
            ],
          }
        : {}),
    };

    const [orders, costCenters, commissions, receivables, purchases] =
      await Promise.all([
        this.prisma.maintenanceOrder.findMany({
          where: orderWhere,
          select: {
            id: true,
            title: true,
            status: true,
            type: true,
            openedAt: true,
            finishedAt: true,
            laborHours: true,
            costCenterId: true,
            contractId: true,
            generator: {
              select: {
                id: true,
                name: true,
                client: {
                  select: { id: true, companyName: true, tradeName: true },
                },
              },
            },
            contract: {
              select: { id: true, code: true, title: true, costCenterId: true },
            },
            technician: {
              select: {
                user: { select: { id: true, name: true, hourCost: true } },
              },
            },
            materials: {
              select: {
                id: true,
                quantity: true,
                unitCost: true,
                appliedAt: true,
                catalogItem: { select: { id: true, name: true, sku: true } },
              },
            },
            timeEntries: {
              select: {
                id: true,
                transitMinutes: true,
                workMinutes: true,
                extraMinutes: true,
                nightMinutes: true,
                user: { select: { id: true, name: true, hourCost: true } },
              },
            },
            receivableEntries: {
              where: { status: { not: AccountsReceivableStatus.CANCELED } },
              select: { id: true, netAmount: true, paidAmount: true },
            },
            commissions: {
              select: { id: true, amount: true },
            },
          },
          orderBy: [{ finishedAt: 'desc' }, { openedAt: 'desc' }],
        }),
        this.prisma.costCenter.findMany({
          where: costCenterWhere,
          select: {
            id: true,
            code: true,
            name: true,
            client: {
              select: { id: true, companyName: true, tradeName: true },
            },
            contract: {
              select: {
                id: true,
                code: true,
                title: true,
                client: {
                  select: { id: true, companyName: true, tradeName: true },
                },
              },
            },
            generator: {
              select: {
                id: true,
                name: true,
                client: {
                  select: { id: true, companyName: true, tradeName: true },
                },
              },
            },
            entries: {
              where: {
                competenceDate: { gte: period.from, lte: period.to },
              },
              select: {
                entryType: true,
                sourceType: true,
                sourceId: true,
                amount: true,
              },
            },
          },
          orderBy: { code: 'asc' },
        }),
        this.prisma.commissionEntry.findMany({
          where: {
            createdAt: { gte: period.from, lte: period.to },
            ...(filters.contractId ? { contractId: filters.contractId } : {}),
            ...(filters.clientId
              ? {
                  OR: [
                    { contract: { clientId: filters.clientId } },
                    {
                      maintenanceOrder: {
                        generator: { clientId: filters.clientId },
                      },
                    },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            amount: true,
            contractId: true,
            maintenanceOrderId: true,
            maintenanceOrder: { select: { costCenterId: true } },
            contract: { select: { costCenterId: true } },
          },
        }),
        this.prisma.accountsReceivable.findMany({
          where: {
            competenceDate: { gte: period.from, lte: period.to },
            status: { not: AccountsReceivableStatus.CANCELED },
            ...(filters.clientId ? { clientId: filters.clientId } : {}),
            ...(filters.contractId ? { contractId: filters.contractId } : {}),
          },
          select: {
            id: true,
            costCenterId: true,
            maintenanceOrderId: true,
            netAmount: true,
            paidAmount: true,
          },
        }),
        this.prisma.purchaseOrder.aggregate({
          where: {
            issueDate: { gte: period.from, lte: period.to },
            status: { not: PurchaseOrderStatus.CANCELED },
          },
          _count: { _all: true },
          _sum: { totalAmount: true },
        }),
      ]);

    const commissionByCenter = new Map<string, number>();
    for (const commission of commissions) {
      const centerId =
        commission.maintenanceOrder?.costCenterId ??
        commission.contract?.costCenterId;
      if (!centerId) continue;
      commissionByCenter.set(
        centerId,
        (commissionByCenter.get(centerId) ?? 0) + Number(commission.amount),
      );
    }

    const receivedByCenter = new Map<string, number>();
    for (const receivable of receivables) {
      if (!receivable.costCenterId) continue;
      receivedByCenter.set(
        receivable.costCenterId,
        (receivedByCenter.get(receivable.costCenterId) ?? 0) +
          Number(receivable.paidAmount),
      );
    }

    const centerRows = costCenters.map((center) => {
      const metrics = this.metricsFromEntries(
        center.entries,
        commissionByCenter.get(center.id) ?? 0,
        receivedByCenter.get(center.id) ?? 0,
      );
      const client = center.client ?? center.contract?.client ?? center.generator?.client;
      return {
        id: center.id,
        code: center.code,
        name: center.name,
        client: client
          ? { id: client.id, name: client.tradeName || client.companyName }
          : null,
        contract: center.contract
          ? {
              id: center.contract.id,
              code: center.contract.code,
              name: center.contract.title || center.contract.code,
            }
          : null,
        generator: center.generator
          ? { id: center.generator.id, name: center.generator.name }
          : null,
        ...metrics,
      };
    });

    const centerIds = new Set(centerRows.map((row) => row.id));
    const orderRows = orders.map((order) => this.orderMetrics(order));
    const centerById = new Map(centerRows.map((row) => [row.id, row]));
    for (const order of orderRows) {
      if (!order.costCenterId) continue;
      const center = centerById.get(order.costCenterId);
      if (!center) continue;
      center.orders += 1;
      center.hours += order.hours;
      center.transitHours += order.transitHours;
      center.client ??= order.client;
      center.contract ??= order.contract;
      this.finishMetrics(center);
    }

    const summary = this.emptyMetrics();
    for (const center of centerRows) this.addMetrics(summary, center);
    for (const order of orderRows) {
      if (!order.costCenterId || !centerIds.has(order.costCenterId)) {
        this.addMetrics(summary, order);
      }
    }
    this.finishMetrics(summary);

    const clients = new Map<string, DimensionRow>();
    const contracts = new Map<string, DimensionRow>();
    for (const center of centerRows) {
      if (center.client) {
        this.addDimension(clients, center.client.id, center.client.name, center);
      }
      if (center.contract) {
        this.addDimension(
          contracts,
          center.contract.id,
          center.contract.name,
          center,
          center.contract.code,
        );
      }
    }
    for (const order of orderRows) {
      if (order.costCenterId && centerIds.has(order.costCenterId)) continue;
      this.addDimension(
        clients,
        order.client.id,
        order.client.name,
        order,
      );
      if (order.contract) {
        this.addDimension(
          contracts,
          order.contract.id,
          order.contract.name,
          order,
          order.contract.code,
        );
      }
    }

    return {
      period,
      filters: {
        status: status ?? null,
        clientId: filters.clientId ?? null,
        contractId: filters.contractId ?? null,
      },
      summary,
      purchases: {
        count: purchases._count._all,
        total: Number(purchases._sum.totalAmount ?? 0),
        allocatedToCostCenters: centerRows.reduce(
          (sum, row) => sum + row.purchaseCost,
          0,
        ),
      },
      orders: orderRows,
      clients: this.finalizeDimensions(clients),
      contracts: this.finalizeDimensions(contracts),
      costCenters: centerRows,
    };
  }

  private orderMetrics(order: any) {
    let hours = 0;
    let transitHours = 0;
    let laborCost = 0;
    for (const entry of order.timeEntries) {
      const productiveMinutes =
        Number(entry.workMinutes) +
        Number(entry.extraMinutes) +
        Number(entry.nightMinutes);
      const transitMinutes = Number(entry.transitMinutes);
      hours += productiveMinutes / 60;
      transitHours += transitMinutes / 60;
      laborCost +=
        ((productiveMinutes + transitMinutes) / 60) *
        Number(entry.user.hourCost ?? 0);
    }
    if (order.timeEntries.length === 0 && Number(order.laborHours) > 0) {
      hours = Number(order.laborHours);
      laborCost = hours * Number(order.technician?.user?.hourCost ?? 0);
    }

    const materialCost = order.materials
      .filter((material: any) => material.appliedAt)
      .reduce(
        (sum: number, material: any) =>
          sum + Number(material.quantity) * Number(material.unitCost ?? 0),
        0,
      );
    const revenue = order.receivableEntries.reduce(
      (sum: number, row: any) => sum + Number(row.netAmount),
      0,
    );
    const receivedRevenue = order.receivableEntries.reduce(
      (sum: number, row: any) => sum + Number(row.paidAmount),
      0,
    );
    const commissionCost = order.commissions.reduce(
      (sum: number, row: any) => sum + Number(row.amount),
      0,
    );
    const metrics = this.emptyMetrics();
    Object.assign(metrics, {
      orders: 1,
      hours,
      transitHours,
      revenue,
      receivedRevenue,
      laborCost,
      materialCost,
      commissionCost,
    });
    this.finishMetrics(metrics);

    return {
      id: order.id,
      title: order.title,
      status: order.status,
      type: order.type,
      date: order.finishedAt ?? order.openedAt,
      costCenterId: order.costCenterId,
      client: {
        id: order.generator.client.id,
        name:
          order.generator.client.tradeName || order.generator.client.companyName,
      },
      generator: { id: order.generator.id, name: order.generator.name },
      technician: order.technician?.user
        ? { id: order.technician.user.id, name: order.technician.user.name }
        : null,
      contract: order.contract
        ? {
            id: order.contract.id,
            code: order.contract.code,
            name: order.contract.title || order.contract.code,
          }
        : null,
      materials: order.materials
        .filter((material: any) => material.appliedAt)
        .map((material: any) => ({
          id: material.id,
          name: material.catalogItem.name,
          sku: material.catalogItem.sku,
          quantity: Number(material.quantity),
          unitCost: Number(material.unitCost ?? 0),
          totalCost:
            Number(material.quantity) * Number(material.unitCost ?? 0),
        })),
      ...metrics,
    };
  }

  private metricsFromEntries(
    entries: Array<{
      entryType: CostCenterEntryType;
      sourceType: string;
      amount: number;
    }>,
    commissionCost: number,
    receivedRevenue: number,
  ) {
    const metrics = this.emptyMetrics();
    metrics.commissionCost = commissionCost;
    metrics.receivedRevenue = receivedRevenue;
    for (const entry of entries) {
      const amount = Number(entry.amount);
      if (entry.entryType === CostCenterEntryType.REVENUE) {
        metrics.revenue += amount;
      } else if (entry.sourceType === 'TIME_ENTRY') {
        metrics.laborCost += amount;
      } else if (entry.sourceType === 'MAINTENANCE_ORDER_MATERIAL') {
        metrics.materialCost += amount;
      } else if (entry.sourceType === 'ACCOUNTS_PAYABLE') {
        metrics.purchaseCost += amount;
      } else {
        metrics.otherCost += amount;
      }
    }
    this.finishMetrics(metrics);
    return metrics;
  }

  private emptyMetrics(): CostMetrics {
    return {
      orders: 0,
      hours: 0,
      transitHours: 0,
      revenue: 0,
      receivedRevenue: 0,
      laborCost: 0,
      materialCost: 0,
      purchaseCost: 0,
      commissionCost: 0,
      otherCost: 0,
      totalCost: 0,
      result: 0,
      marginPercent: 0,
    };
  }

  private addMetrics(target: CostMetrics, source: CostMetrics) {
    target.orders += source.orders;
    target.hours += source.hours;
    target.transitHours += source.transitHours;
    target.revenue += source.revenue;
    target.receivedRevenue += source.receivedRevenue;
    target.laborCost += source.laborCost;
    target.materialCost += source.materialCost;
    target.purchaseCost += source.purchaseCost;
    target.commissionCost += source.commissionCost;
    target.otherCost += source.otherCost;
  }

  private finishMetrics(metrics: CostMetrics) {
    metrics.totalCost =
      metrics.laborCost +
      metrics.materialCost +
      metrics.purchaseCost +
      metrics.commissionCost +
      metrics.otherCost;
    metrics.result = metrics.revenue - metrics.totalCost;
    metrics.marginPercent =
      metrics.revenue > 0 ? (metrics.result / metrics.revenue) * 100 : 0;
    for (const key of metricKeys) {
      metrics[key] = Number(metrics[key].toFixed(2));
    }
  }

  private addDimension(
    map: Map<string, DimensionRow>,
    id: string,
    name: string,
    metrics: CostMetrics,
    code?: string | null,
  ) {
    const row = map.get(id) ?? { id, name, code, ...this.emptyMetrics() };
    this.addMetrics(row, metrics);
    map.set(id, row);
  }

  private finalizeDimensions(map: Map<string, DimensionRow>) {
    return [...map.values()]
      .map((row) => {
        this.finishMetrics(row);
        return row;
      })
      .sort((a, b) => b.result - a.result);
  }

  private resolvePeriod(from?: string, to?: string) {
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 89);
    defaultFrom.setHours(0, 0, 0, 0);
    const start = from ? new Date(`${from}T00:00:00`) : defaultFrom;
    const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Periodo de custos invalido.');
    }
    if (start > end) {
      throw new BadRequestException('A data inicial deve ser anterior a final.');
    }
    return { from: start, to: end };
  }

  private resolveStatus(status?: string) {
    if (!status) return undefined;
    if (!Object.values(OrderStatus).includes(status as OrderStatus)) {
      throw new BadRequestException('Status de OS invalido.');
    }
    return status as OrderStatus;
  }
}
