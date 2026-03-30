import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AccountsPayableStatus,
  AccountsReceivableStatus,
  ContractInvoiceStatus,
  ContractStatus,
  OrderStatus,
  ProposalStatus,
  SalesOpportunityStage,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';

type StatusBucket = {
  key: string;
  label: string;
  count: number;
  amount?: number;
};

type OverviewAlert = {
  level: 'critical' | 'warning' | 'info';
  code: string;
  title: string;
  detail: string;
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: DatabaseService) {}

  async overview(dateFrom?: string, dateTo?: string) {
    const period = this.resolvePeriod(dateFrom, dateTo);
    const now = new Date();
    const next30Days = this.endOfDay(this.addDays(now, 30));

    const [
      proposalStatusRows,
      proposalClientRows,
      opportunityStageRows,
      opportunityTotals,
      ordersByStatusRows,
      openOrdersNow,
      ordersOpenedInPeriod,
      ordersCompletedInPeriod,
      contractStatusRows,
      newContractsInPeriod,
      overdueInvoicesAgg,
      receivablesOutstandingAgg,
      receivablesOverdueAgg,
      receivablesDueSoonAgg,
      payablesOutstandingAgg,
      payablesOverdueAgg,
      payablesDueSoonAgg,
      bankBalanceAgg,
      activeWarehouses,
      inventoryBalances,
      preventiveBacklog,
      preventiveNext30Days,
    ] = await Promise.all([
      this.prisma.proposal.groupBy({
        by: ['status'],
        where: {
          createdAt: {
            gte: period.start,
            lte: period.end,
          },
        },
        _count: { _all: true },
        _sum: { totalValue: true },
      }),
      this.prisma.proposal.groupBy({
        by: ['clientId'],
        where: {
          createdAt: {
            gte: period.start,
            lte: period.end,
          },
        },
        _count: { _all: true },
        _sum: { totalValue: true },
      }),
      this.prisma.salesOpportunity.groupBy({
        by: ['stage'],
        where: {
          createdAt: {
            gte: period.start,
            lte: period.end,
          },
        },
        _count: { _all: true },
        _sum: { estimatedValue: true },
      }),
      this.prisma.salesOpportunity.aggregate({
        where: {
          createdAt: {
            gte: period.start,
            lte: period.end,
          },
        },
        _count: { _all: true },
        _sum: { estimatedValue: true },
      }),
      this.prisma.maintenanceOrder.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.maintenanceOrder.count({
        where: {
          status: {
            in: [OrderStatus.OPEN, OrderStatus.IN_PROGRESS],
          },
        },
      }),
      this.prisma.maintenanceOrder.count({
        where: {
          openedAt: {
            gte: period.start,
            lte: period.end,
          },
        },
      }),
      this.prisma.maintenanceOrder.count({
        where: {
          finishedAt: {
            gte: period.start,
            lte: period.end,
          },
        },
      }),
      this.prisma.serviceContract.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { recurringAmount: true },
      }),
      this.prisma.serviceContract.count({
        where: {
          createdAt: {
            gte: period.start,
            lte: period.end,
          },
        },
      }),
      this.prisma.contractInvoice.aggregate({
        where: { status: ContractInvoiceStatus.OVERDUE },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.accountsReceivable.aggregate({
        where: {
          status: {
            in: [
              AccountsReceivableStatus.OPEN,
              AccountsReceivableStatus.PARTIAL,
              AccountsReceivableStatus.OVERDUE,
            ],
          },
        },
        _count: { _all: true },
        _sum: {
          netAmount: true,
          interestAmount: true,
          penaltyAmount: true,
          paidAmount: true,
        },
      }),
      this.prisma.accountsReceivable.aggregate({
        where: {
          status: AccountsReceivableStatus.OVERDUE,
        },
        _count: { _all: true },
        _sum: {
          netAmount: true,
          interestAmount: true,
          penaltyAmount: true,
          paidAmount: true,
        },
      }),
      this.prisma.accountsReceivable.aggregate({
        where: {
          dueDate: { lte: next30Days },
          status: {
            in: [
              AccountsReceivableStatus.OPEN,
              AccountsReceivableStatus.PARTIAL,
              AccountsReceivableStatus.OVERDUE,
            ],
          },
        },
        _sum: {
          netAmount: true,
          interestAmount: true,
          penaltyAmount: true,
          paidAmount: true,
        },
      }),
      this.prisma.accountsPayable.aggregate({
        where: {
          status: {
            in: [AccountsPayableStatus.OPEN, AccountsPayableStatus.OVERDUE],
          },
        },
        _count: { _all: true },
        _sum: { amount: true, paidAmount: true },
      }),
      this.prisma.accountsPayable.aggregate({
        where: {
          status: AccountsPayableStatus.OVERDUE,
        },
        _count: { _all: true },
        _sum: { amount: true, paidAmount: true },
      }),
      this.prisma.accountsPayable.aggregate({
        where: {
          dueDate: { lte: next30Days },
          status: {
            in: [AccountsPayableStatus.OPEN, AccountsPayableStatus.OVERDUE],
          },
        },
        _sum: { amount: true, paidAmount: true },
      }),
      this.prisma.bankAccount.aggregate({
        where: { isActive: true },
        _sum: { currentBalance: true },
      }),
      this.prisma.warehouse.count({
        where: { isActive: true },
      }),
      this.prisma.inventoryBalance.findMany({
        select: {
          physicalQty: true,
          reservedQty: true,
          minQty: true,
        },
      }),
      this.prisma.contractPreventiveSchedule.count({
        where: {
          generatedOrderId: null,
          scheduledDate: { lte: now },
        },
      }),
      this.prisma.contractPreventiveSchedule.count({
        where: {
          generatedOrderId: null,
          scheduledDate: {
            gt: now,
            lte: next30Days,
          },
        },
      }),
    ]);

    const topClientRows = proposalClientRows
      .map((row) => ({
        clientId: row.clientId,
        proposals: row._count._all,
        totalValue: this.toNumber(row._sum.totalValue),
      }))
      .filter((row) => row.totalValue > 0)
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 6);

    const topClients = topClientRows.length
      ? await this.loadTopClients(topClientRows)
      : [];

    const proposalByStatus = this.mapEnumBuckets(
      Object.values(ProposalStatus),
      proposalStatusRows,
      proposalStatusLabels,
      (row) => row.status,
      (row) => this.toNumber(row._sum.totalValue),
    );

    const totalProposals = proposalByStatus.reduce(
      (sum, row) => sum + row.count,
      0,
    );
    const totalProposalValue = proposalByStatus.reduce(
      (sum, row) => sum + this.toNumber(row.amount),
      0,
    );
    const wonBucket =
      proposalByStatus.find((row) => row.key === ProposalStatus.WON) ?? null;
    const lostBucket =
      proposalByStatus.find((row) => row.key === ProposalStatus.LOST) ?? null;
    const decidedProposals =
      this.toNumber(wonBucket?.count) + this.toNumber(lostBucket?.count);
    const proposalConversion =
      decidedProposals > 0
        ? (this.toNumber(wonBucket?.count) / decidedProposals) * 100
        : 0;

    const opportunityByStage = this.mapEnumBuckets(
      Object.values(SalesOpportunityStage),
      opportunityStageRows,
      opportunityStageLabels,
      (row) => row.stage,
      (row) => this.toNumber(row._sum.estimatedValue),
    );

    const ordersByStatus = this.mapEnumBuckets(
      Object.values(OrderStatus),
      ordersByStatusRows,
      orderStatusLabels,
      (row) => row.status,
    );

    const contractsByStatus = this.mapEnumBuckets(
      Object.values(ContractStatus),
      contractStatusRows,
      contractStatusLabels,
      (row) => row.status,
      (row) => this.toNumber(row._sum.recurringAmount),
    );

    const activeContractCount = this.findBucketCount(
      contractsByStatus,
      ContractStatus.ACTIVE,
    );
    const renewalContractCount = this.findBucketCount(
      contractsByStatus,
      ContractStatus.RENEWAL,
    );
    const recurringRevenue = contractsByStatus
      .filter(
        (row) =>
          row.key === ContractStatus.ACTIVE ||
          row.key === ContractStatus.RENEWAL,
      )
      .reduce((sum, row) => sum + this.toNumber(row.amount), 0);

    const receivablesOutstanding = this.readReceivableOutstanding(
      receivablesOutstandingAgg._sum,
    );
    const receivablesOverdueAmount = this.readReceivableOutstanding(
      receivablesOverdueAgg._sum,
    );
    const payablesOutstanding = this.readPayableOutstanding(
      payablesOutstandingAgg._sum,
    );
    const payablesOverdueAmount = this.readPayableOutstanding(
      payablesOverdueAgg._sum,
    );
    const projectedBalance30Days =
      this.toNumber(bankBalanceAgg._sum.currentBalance) +
      this.readReceivableOutstanding(receivablesDueSoonAgg._sum) -
      this.readPayableOutstanding(payablesDueSoonAgg._sum);

    const inventoryHealth = inventoryBalances.reduce(
      (acc, balance) => {
        const physicalQty = this.toNumber(balance.physicalQty);
        const reservedQty = this.toNumber(balance.reservedQty);
        const minQty = this.toNumber(balance.minQty);
        const availableQty = physicalQty - reservedQty;

        acc.totalPhysicalQty += physicalQty;
        acc.totalReservedQty += reservedQty;
        if (availableQty < minQty) {
          acc.lowStockItems += 1;
        }

        return acc;
      },
      {
        totalPhysicalQty: 0,
        totalReservedQty: 0,
        lowStockItems: 0,
      },
    );

    const alerts = this.buildAlerts({
      receivablesOverdueAmount,
      receivablesOverdueCount: receivablesOverdueAgg._count._all || 0,
      payablesOverdueAmount,
      payablesOverdueCount: payablesOverdueAgg._count._all || 0,
      preventiveBacklog,
      lowStockItems: inventoryHealth.lowStockItems,
      projectedBalance30Days,
    });

    return {
      period: {
        dateFrom: this.toDateInputValue(period.start),
        dateTo: this.toDateInputValue(period.end),
        days: period.days,
        generatedAt: now.toISOString(),
      },
      highlights: {
        proposalsInPeriod: totalProposals,
        proposalConversion,
        proposalValueInPeriod: totalProposalValue,
        openOrdersNow,
        activeContracts: activeContractCount,
        recurringRevenueMonthly: recurringRevenue,
        overdueReceivablesAmount: receivablesOverdueAmount,
        bankBalance: this.toNumber(bankBalanceAgg._sum.currentBalance),
      },
      proposals: {
        totalCount: totalProposals,
        totalValue: totalProposalValue,
        averageTicket:
          totalProposals > 0 ? totalProposalValue / totalProposals : 0,
        wonCount: this.toNumber(wonBucket?.count),
        lostCount: this.toNumber(lostBucket?.count),
        wonValue: this.toNumber(wonBucket?.amount),
        lostValue: this.toNumber(lostBucket?.amount),
        conversionRate: proposalConversion,
        byStatus: proposalByStatus,
        topClients,
      },
      opportunities: {
        totalCount: opportunityTotals._count._all || 0,
        estimatedValue: this.toNumber(opportunityTotals._sum.estimatedValue),
        byStage: opportunityByStage,
      },
      operations: {
        openOrdersNow,
        ordersOpenedInPeriod,
        ordersCompletedInPeriod,
        byStatus: ordersByStatus,
        preventiveBacklog,
        preventivesNext30Days: preventiveNext30Days,
      },
      contracts: {
        activeCount: activeContractCount,
        renewalCount: renewalContractCount,
        newContractsInPeriod,
        monthlyRecurringRevenue: recurringRevenue,
        overdueInvoicesCount: overdueInvoicesAgg._count._all || 0,
        overdueInvoicesAmount: this.toNumber(overdueInvoicesAgg._sum.amount),
        byStatus: contractsByStatus,
      },
      finance: {
        bankBalance: this.toNumber(bankBalanceAgg._sum.currentBalance),
        receivablesOutstanding,
        receivablesOutstandingCount: receivablesOutstandingAgg._count._all || 0,
        receivablesOverdueAmount,
        receivablesOverdueCount: receivablesOverdueAgg._count._all || 0,
        payablesOutstanding,
        payablesOutstandingCount: payablesOutstandingAgg._count._all || 0,
        payablesOverdueAmount,
        payablesOverdueCount: payablesOverdueAgg._count._all || 0,
        netExposure: receivablesOutstanding - payablesOutstanding,
        projectedBalance30Days,
      },
      inventory: {
        activeWarehouses,
        lowStockItems: inventoryHealth.lowStockItems,
        totalPhysicalQty: inventoryHealth.totalPhysicalQty,
        totalReservedQty: inventoryHealth.totalReservedQty,
      },
      alerts,
    };
  }

  private async loadTopClients(
    rows: Array<{ clientId: string; proposals: number; totalValue: number }>,
  ) {
    const clients = await this.prisma.client.findMany({
      where: { id: { in: rows.map((row) => row.clientId) } },
      select: { id: true, companyName: true, tradeName: true },
    });

    const clientMap = new Map(
      clients.map((client) => [
        client.id,
        client.tradeName || client.companyName || 'Sem cliente',
      ]),
    );

    return rows.map((row) => ({
      clientId: row.clientId,
      client: clientMap.get(row.clientId) || 'Sem cliente',
      proposals: row.proposals,
      totalValue: row.totalValue,
    }));
  }

  private resolvePeriod(dateFrom?: string, dateTo?: string) {
    const end = dateTo
      ? this.parseDateInput(dateTo, 'end')
      : this.endOfDay(new Date());
    const start = dateFrom
      ? this.parseDateInput(dateFrom, 'start')
      : this.startOfDay(this.addDays(end, -89));

    if (start > end) {
      throw new BadRequestException(
        'Periodo invalido: a data inicial precisa ser anterior a data final.',
      );
    }

    const diffDays = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1,
    );

    return {
      start,
      end,
      days: diffDays,
    };
  }

  private parseDateInput(value: string, mode: 'start' | 'end') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) {
      throw new BadRequestException(
        'Formato de data invalido. Use YYYY-MM-DD.',
      );
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, monthIndex, day);

    if (
      Number.isNaN(date.getTime()) ||
      date.getFullYear() !== year ||
      date.getMonth() !== monthIndex ||
      date.getDate() !== day
    ) {
      throw new BadRequestException('Data informada e invalida.');
    }

    return mode === 'start' ? this.startOfDay(date) : this.endOfDay(date);
  }

  private mapEnumBuckets<
    TEnum extends string,
    TRow extends { _count: { _all: number } },
  >(
    values: TEnum[],
    rows: TRow[],
    labels: Record<string, string>,
    keySelector: (row: TRow) => TEnum,
    amountSelector?: (row: TRow) => number,
  ): StatusBucket[] {
    const map = new Map(
      rows.map((row) => [
        keySelector(row),
        {
          count: row._count._all || 0,
          amount: amountSelector ? amountSelector(row) : undefined,
        },
      ]),
    );

    return values.map((value) => {
      const current = map.get(value);
      return {
        key: value,
        label: labels[value] || value,
        count: current?.count || 0,
        amount: current?.amount,
      };
    });
  }

  private findBucketCount(rows: StatusBucket[], key: string) {
    return rows.find((row) => row.key === key)?.count || 0;
  }

  private readReceivableOutstanding(sum: {
    netAmount?: number | null;
    interestAmount?: number | null;
    penaltyAmount?: number | null;
    paidAmount?: number | null;
  }) {
    return (
      this.toNumber(sum.netAmount) +
      this.toNumber(sum.interestAmount) +
      this.toNumber(sum.penaltyAmount) -
      this.toNumber(sum.paidAmount)
    );
  }

  private readPayableOutstanding(sum: {
    amount?: number | null;
    paidAmount?: number | null;
  }) {
    return this.toNumber(sum.amount) - this.toNumber(sum.paidAmount);
  }

  private buildAlerts(input: {
    receivablesOverdueAmount: number;
    receivablesOverdueCount: number;
    payablesOverdueAmount: number;
    payablesOverdueCount: number;
    preventiveBacklog: number;
    lowStockItems: number;
    projectedBalance30Days: number;
  }): OverviewAlert[] {
    const alerts: OverviewAlert[] = [];

    if (input.receivablesOverdueCount > 0) {
      alerts.push({
        level: input.receivablesOverdueAmount > 50_000 ? 'critical' : 'warning',
        code: 'receivables-overdue',
        title: 'Cobrancas vencidas precisam de acao',
        detail: `${input.receivablesOverdueCount} titulos em atraso somando ${this.formatCurrency(
          input.receivablesOverdueAmount,
        )}.`,
      });
    }

    if (input.payablesOverdueCount > 0) {
      alerts.push({
        level: 'warning',
        code: 'payables-overdue',
        title: 'Pagamentos em atraso no financeiro',
        detail: `${input.payablesOverdueCount} contas a pagar vencidas somando ${this.formatCurrency(
          input.payablesOverdueAmount,
        )}.`,
      });
    }

    if (input.preventiveBacklog > 0) {
      alerts.push({
        level: input.preventiveBacklog > 10 ? 'critical' : 'warning',
        code: 'preventive-backlog',
        title: 'Preventivas aguardando geracao ou execucao',
        detail: `${input.preventiveBacklog} agendas preventivas estao vencidas ou pendentes.`,
      });
    }

    if (input.lowStockItems > 0) {
      alerts.push({
        level: 'info',
        code: 'inventory-low-stock',
        title: 'Estoque abaixo do minimo',
        detail: `${input.lowStockItems} itens estao com disponibilidade abaixo do minimo configurado.`,
      });
    }

    if (input.projectedBalance30Days < 0) {
      alerts.push({
        level: 'critical',
        code: 'cash-flow-negative',
        title: 'Fluxo de caixa projetado negativo',
        detail: `A projecao para 30 dias indica saldo de ${this.formatCurrency(
          input.projectedBalance30Days,
        )}.`,
      });
    }

    return alerts;
  }

  private formatCurrency(value: number) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }

  private toDateInputValue(date: Date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  private toNumber(value?: number | null) {
    return Number(value || 0);
  }

  private startOfDay(date: Date) {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      0,
      0,
      0,
      0,
    );
  }

  private endOfDay(date: Date) {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      23,
      59,
      59,
      999,
    );
  }

  private addDays(date: Date, days: number) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }
}

const proposalStatusLabels: Record<string, string> = {
  DRAFT: 'Rascunho',
  BOARD_REVIEW: 'Diretoria',
  REVISION_REQUIRED: 'Revisao',
  CLIENT_REVIEW: 'Cliente',
  DISCOUNT_REVIEW: 'Desconto',
  WON: 'Ganhas',
  LOST: 'Perdidas',
  SENT: 'Enviadas',
  APPROVED: 'Aprovadas',
  REJECTED: 'Rejeitadas',
};

const opportunityStageLabels: Record<string, string> = {
  PROSPECTION: 'Prospeccao',
  SITE_SURVEY_SCHEDULED: 'Vistoria agendada',
  PROPOSAL_SENT: 'Proposta enviada',
  NEGOTIATION: 'Negociacao',
  WON: 'Ganhas',
  LOST: 'Perdidas',
};

const orderStatusLabels: Record<string, string> = {
  OPEN: 'Aberta',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluida',
  CANCELED: 'Cancelada',
};

const contractStatusLabels: Record<string, string> = {
  ACTIVE: 'Ativo',
  SUSPENDED: 'Suspenso',
  CANCELED: 'Cancelado',
  RENEWAL: 'Renovacao',
};
