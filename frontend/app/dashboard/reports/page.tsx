"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState, useTransition } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";

type StatusBucket = {
  key: string;
  label: string;
  count: number;
  amount?: number;
};

type TopClient = {
  clientId: string;
  client: string;
  proposals: number;
  totalValue: number;
};

type OverviewAlert = {
  level: "critical" | "warning" | "info";
  code: string;
  title: string;
  detail: string;
};

type ReportsOverview = {
  period: {
    dateFrom: string;
    dateTo: string;
    days: number;
    generatedAt: string;
  };
  highlights: {
    proposalsInPeriod: number;
    proposalConversion: number;
    proposalValueInPeriod: number;
    openOrdersNow: number;
    activeContracts: number;
    recurringRevenueMonthly: number;
    overdueReceivablesAmount: number;
    bankBalance: number;
  };
  proposals: {
    totalCount: number;
    totalValue: number;
    averageTicket: number;
    wonCount: number;
    lostCount: number;
    wonValue: number;
    lostValue: number;
    conversionRate: number;
    byStatus: StatusBucket[];
    topClients: TopClient[];
  };
  opportunities: {
    totalCount: number;
    estimatedValue: number;
    byStage: StatusBucket[];
  };
  operations: {
    openOrdersNow: number;
    ordersOpenedInPeriod: number;
    ordersCompletedInPeriod: number;
    byStatus: StatusBucket[];
    preventiveBacklog: number;
    preventivesNext30Days: number;
  };
  contracts: {
    activeCount: number;
    renewalCount: number;
    newContractsInPeriod: number;
    monthlyRecurringRevenue: number;
    overdueInvoicesCount: number;
    overdueInvoicesAmount: number;
    byStatus: StatusBucket[];
  };
  finance: {
    bankBalance: number;
    receivablesOutstanding: number;
    receivablesOutstandingCount: number;
    receivablesOverdueAmount: number;
    receivablesOverdueCount: number;
    payablesOutstanding: number;
    payablesOutstandingCount: number;
    payablesOverdueAmount: number;
    payablesOverdueCount: number;
    netExposure: number;
    projectedBalance30Days: number;
  };
  inventory: {
    activeWarehouses: number;
    lowStockItems: number;
    totalPhysicalQty: number;
    totalReservedQty: number;
  };
  alerts: OverviewAlert[];
};

type DateRange = {
  dateFrom: string;
  dateTo: string;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const shortCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const numberFormatter = new Intl.NumberFormat("pt-BR");
const percentFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export default function ReportsPage() {
  const [draftRange, setDraftRange] = useState<DateRange>(() => createRangeFromDays(90));
  const [appliedRange, setAppliedRange] = useState<DateRange>(() => createRangeFromDays(90));
  const [overview, setOverview] = useState<ReportsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        dateFrom: appliedRange.dateFrom,
        dateTo: appliedRange.dateTo,
      });

      const response = await apiFetch(`/reports/overview?${params.toString()}`, {
        cache: "no-store",
      });

      if (cancelled) return;

      if (!response.ok) {
        setOverview(null);
        setError(await readApiErrorMessage(response, "Nao foi possivel carregar os relatorios."));
        setLoading(false);
        return;
      }

      const payload = (await response.json()) as ReportsOverview;
      if (cancelled) return;

      setOverview(payload);
      setDraftRange({
        dateFrom: payload.period.dateFrom,
        dateTo: payload.period.dateTo,
      });
      setLoading(false);
    }

    void loadOverview();

    return () => {
      cancelled = true;
    };
  }, [appliedRange.dateFrom, appliedRange.dateTo]);

  const generatedAtLabel = overview
    ? dateTimeFormatter.format(new Date(overview.period.generatedAt))
    : "";

  const highlightCards = useMemo(() => {
    if (!overview) return [];

    return [
      {
        title: "Propostas no periodo",
        value: formatNumber(overview.highlights.proposalsInPeriod),
        tone: "blue" as const,
        helper: `${formatCurrency(overview.highlights.proposalValueInPeriod)} movimentados`,
      },
      {
        title: "Conversao comercial",
        value: `${formatPercent(overview.highlights.proposalConversion)}%`,
        tone: "emerald" as const,
        helper: `${formatNumber(overview.proposals.wonCount)} ganhas vs ${formatNumber(overview.proposals.lostCount)} perdidas`,
      },
      {
        title: "Receita recorrente",
        value: formatShortCurrency(overview.highlights.recurringRevenueMonthly),
        tone: "amber" as const,
        helper: `${formatNumber(overview.highlights.activeContracts)} contratos ativos`,
      },
      {
        title: "OS abertas agora",
        value: formatNumber(overview.highlights.openOrdersNow),
        tone: "rose" as const,
        helper: `${formatNumber(overview.operations.preventiveBacklog)} preventivas em backlog`,
      },
      {
        title: "Recebiveis vencidos",
        value: formatShortCurrency(overview.highlights.overdueReceivablesAmount),
        tone: "orange" as const,
        helper: `${formatNumber(overview.finance.receivablesOverdueCount)} titulos vencidos`,
      },
      {
        title: "Saldo bancario",
        value: formatShortCurrency(overview.highlights.bankBalance),
        tone: overview.highlights.bankBalance >= 0 ? ("slate" as const) : ("rose" as const),
        helper: `Projecao 30 dias: ${formatCurrency(overview.finance.projectedBalance30Days)}`,
      },
    ];
  }, [overview]);

  function applyDraftRange() {
    if (!draftRange.dateFrom || !draftRange.dateTo) {
      setError("Informe a data inicial e final.");
      return;
    }

    if (draftRange.dateFrom > draftRange.dateTo) {
      setError("A data inicial precisa ser anterior a data final.");
      return;
    }

    setError("");
    startTransition(() => {
      setAppliedRange({ ...draftRange });
    });
  }

  function applyQuickRange(days: number) {
    const range = createRangeFromDays(days);
    setDraftRange(range);
    setError("");
    startTransition(() => {
      setAppliedRange(range);
    });
  }

  function applyCurrentMonth() {
    const range = createCurrentMonthRange();
    setDraftRange(range);
    setError("");
    startTransition(() => {
      setAppliedRange(range);
    });
  }

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#eef4ff_0%,#f7fbff_38%,#f6f8fb_100%)] p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[28px] bg-slate-950 px-6 py-7 text-white shadow-[0_30px_90px_-45px_rgba(15,23,42,0.9)] md:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.22),transparent_36%),radial-gradient(circle_at_80%_20%,rgba(45,212,191,0.16),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.14),transparent_32%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <p className="inline-flex w-fit rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-100">
                Centro executivo
              </p>
              <div className="space-y-2">
                <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">
                  Relatorios gerenciais com leitura real do negocio
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-200 md:text-base">
                  Comercial, contratos, operacao, estoque e financeiro agora aparecem no mesmo painel.
                  O filtro atua sobre o periodo analisado, enquanto carteira, caixa e backlog seguem como leitura viva da operacao.
                </p>
              </div>
            </div>

            <div className="relative rounded-2xl border border-white/10 bg-white/8 px-4 py-4 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">
                Ultima atualizacao
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {generatedAtLabel || "Carregando..."}
              </p>
              <p className="mt-1 text-sm text-slate-300">
                {overview
                  ? `${formatNumber(overview.period.days)} dias monitorados entre ${formatDate(overview.period.dateFrom)} e ${formatDate(overview.period.dateTo)}.`
                  : "Sincronizando indicadores executivos."}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.6fr)]">
          <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.45)] backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Janela de analise</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Ajuste o periodo do comercial e da producao para comparar desempenho e carga operacional.
                </p>
              </div>
              <Link
                href="/dashboard"
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Voltar ao dashboard
              </Link>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Data inicial
                </span>
                <input
                  type="date"
                  value={draftRange.dateFrom}
                  onChange={(event) =>
                    setDraftRange((current) => ({ ...current, dateFrom: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Data final
                </span>
                <input
                  type="date"
                  value={draftRange.dateTo}
                  onChange={(event) =>
                    setDraftRange((current) => ({ ...current, dateTo: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <QuickRangeButton label="7 dias" onClick={() => applyQuickRange(7)} />
              <QuickRangeButton label="30 dias" onClick={() => applyQuickRange(30)} />
              <QuickRangeButton label="90 dias" onClick={() => applyQuickRange(90)} />
              <QuickRangeButton label="Mes atual" onClick={applyCurrentMonth} />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={applyDraftRange}
                disabled={loading || isPending}
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {loading || isPending ? "Atualizando..." : "Atualizar painel"}
              </button>
              <p className="text-sm text-slate-500">
                Snapshot atual: caixa, backlog, contratos, cobrancas e estoque.
              </p>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {highlightCards.map((card) => (
              <KpiCard key={card.title} {...card} />
            ))}

            {!highlightCards.length && loading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-[132px] animate-pulse rounded-[24px] border border-slate-200 bg-white/80"
                  />
                ))
              : null}
          </div>
        </section>

        {overview?.alerts?.length ? (
          <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.45)] backdrop-blur">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Alertas prioritarios</h2>
              <p className="mt-1 text-sm text-slate-600">
                Leitura automatica dos pontos que mais pedem acao da gestao agora.
              </p>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {overview.alerts.map((alert) => (
                <AlertCard key={alert.code} alert={alert} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 2xl:grid-cols-2">
          <Panel
            title="Comercial"
            subtitle="Pipeline de propostas, volume financeiro do periodo e concentracao por cliente."
          >
            {overview ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <StatusDistribution
                  title="Pipeline de propostas"
                  rows={overview.proposals.byStatus}
                  amountLabel="Valor"
                />

                <div className="space-y-4">
                  <MetricGrid
                    items={[
                      {
                        label: "Ticket medio",
                        value: formatCurrency(overview.proposals.averageTicket),
                      },
                      {
                        label: "Valor ganho",
                        value: formatCurrency(overview.proposals.wonValue),
                      },
                      {
                        label: "Pipeline CRM",
                        value: formatShortCurrency(overview.opportunities.estimatedValue),
                      },
                      {
                        label: "Oportunidades",
                        value: formatNumber(overview.opportunities.totalCount),
                      },
                    ]}
                  />

                  <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Top clientes por valor</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Ranking do periodo selecionado.
                      </p>
                    </div>

                    <div className="mt-4 space-y-3">
                      {overview.proposals.topClients.length ? (
                        overview.proposals.topClients.map((client, index) => (
                          <div
                            key={client.clientId}
                            className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                {String(index + 1).padStart(2, "0")}
                              </p>
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {client.client}
                              </p>
                              <p className="text-xs text-slate-500">
                                {formatNumber(client.proposals)} propostas
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-slate-900">
                              {formatCurrency(client.totalValue)}
                            </p>
                          </div>
                        ))
                      ) : (
                        <EmptyState text="Sem clientes ranqueados neste periodo." />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState text="Carregando indicadores comerciais." />
            )}
          </Panel>

          <Panel
            title="Operacao e Estoque"
            subtitle="Carga atual de ordens, preventivas pendentes e saude do estoque."
          >
            {overview ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <StatusDistribution title="Status das OS" rows={overview.operations.byStatus} />

                <div className="space-y-4">
                  <MetricGrid
                    items={[
                      {
                        label: "OS abertas no periodo",
                        value: formatNumber(overview.operations.ordersOpenedInPeriod),
                      },
                      {
                        label: "OS concluidas no periodo",
                        value: formatNumber(overview.operations.ordersCompletedInPeriod),
                      },
                      {
                        label: "Preventivas em atraso",
                        value: formatNumber(overview.operations.preventiveBacklog),
                      },
                      {
                        label: "Preventivas proximos 30d",
                        value: formatNumber(overview.operations.preventivesNext30Days),
                      },
                    ]}
                  />

                  <div className="grid gap-3 md:grid-cols-3">
                    <MiniHealthCard
                      title="Itens abaixo do minimo"
                      value={formatNumber(overview.inventory.lowStockItems)}
                      tone={overview.inventory.lowStockItems > 0 ? "amber" : "emerald"}
                    />
                    <MiniHealthCard
                      title="Estoque fisico"
                      value={formatNumber(overview.inventory.totalPhysicalQty)}
                      tone="slate"
                    />
                    <MiniHealthCard
                      title="Reservas"
                      value={formatNumber(overview.inventory.totalReservedQty)}
                      tone="blue"
                    />
                  </div>

                  <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                    <p className="text-sm font-semibold text-slate-900">Leitura rapida da operacao</p>
                    <div className="mt-3 space-y-3 text-sm text-slate-600">
                      <MetricRow
                        label="OS em aberto agora"
                        value={formatNumber(overview.operations.openOrdersNow)}
                      />
                      <MetricRow
                        label="Armazens monitorados"
                        value={formatNumber(overview.inventory.activeWarehouses)}
                      />
                      <MetricRow
                        label="Capacidade de estoque livre"
                        value={formatNumber(
                          Math.max(
                            0,
                            overview.inventory.totalPhysicalQty - overview.inventory.totalReservedQty,
                          ),
                        )}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState text="Carregando indicadores operacionais." />
            )}
          </Panel>

          <Panel
            title="Contratos"
            subtitle="Carteira viva, renovacoes e inadimplencia do portifolio contratado."
          >
            {overview ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <StatusDistribution
                  title="Carteira por status"
                  rows={overview.contracts.byStatus}
                  amountLabel="Recorrencia"
                />

                <div className="space-y-4">
                  <MetricGrid
                    items={[
                      {
                        label: "Contratos ativos",
                        value: formatNumber(overview.contracts.activeCount),
                      },
                      {
                        label: "Renovacoes",
                        value: formatNumber(overview.contracts.renewalCount),
                      },
                      {
                        label: "Novos no periodo",
                        value: formatNumber(overview.contracts.newContractsInPeriod),
                      },
                      {
                        label: "Mensal recorrente",
                        value: formatCurrency(overview.contracts.monthlyRecurringRevenue),
                      },
                    ]}
                  />

                  <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                    <p className="text-sm font-semibold text-slate-900">Faturas e risco contratual</p>
                    <div className="mt-3 space-y-3 text-sm text-slate-600">
                      <MetricRow
                        label="Faturas em atraso"
                        value={formatNumber(overview.contracts.overdueInvoicesCount)}
                      />
                      <MetricRow
                        label="Valor em atraso"
                        value={formatCurrency(overview.contracts.overdueInvoicesAmount)}
                      />
                      <MetricRow
                        label="Recebiveis vencidos"
                        value={formatCurrency(overview.finance.receivablesOverdueAmount)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState text="Carregando leitura de contratos." />
            )}
          </Panel>

          <Panel
            title="Financeiro"
            subtitle="Caixa atual, exposicao liquida e pressao de recebimentos e pagamentos."
          >
            {overview ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-4">
                  <MetricGrid
                    items={[
                      {
                        label: "Saldo bancario",
                        value: formatCurrency(overview.finance.bankBalance),
                      },
                      {
                        label: "Projecao 30 dias",
                        value: formatCurrency(overview.finance.projectedBalance30Days),
                      },
                      {
                        label: "Exposicao liquida",
                        value: formatCurrency(overview.finance.netExposure),
                      },
                      {
                        label: "Recebiveis em aberto",
                        value: formatCurrency(overview.finance.receivablesOutstanding),
                      },
                    ]}
                  />

                  <div className="grid gap-3 md:grid-cols-2">
                    <MiniHealthCard
                      title="Titulos a receber"
                      value={formatNumber(overview.finance.receivablesOutstandingCount)}
                      tone="emerald"
                    />
                    <MiniHealthCard
                      title="Titulos a pagar"
                      value={formatNumber(overview.finance.payablesOutstandingCount)}
                      tone="rose"
                    />
                  </div>
                </div>

                <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-sm font-semibold text-slate-900">Pressao financeira</p>
                  <div className="mt-4 space-y-4">
                    <FinanceBar
                      label="Recebiveis vencidos"
                      amount={overview.finance.receivablesOverdueAmount}
                      total={Math.max(overview.finance.receivablesOutstanding, 1)}
                      tone="emerald"
                      helper={`${formatNumber(overview.finance.receivablesOverdueCount)} titulos`}
                    />
                    <FinanceBar
                      label="Payables vencidos"
                      amount={overview.finance.payablesOverdueAmount}
                      total={Math.max(overview.finance.payablesOutstanding, 1)}
                      tone="rose"
                      helper={`${formatNumber(overview.finance.payablesOverdueCount)} titulos`}
                    />
                    <FinanceBar
                      label="Payables em aberto"
                      amount={overview.finance.payablesOutstanding}
                      total={Math.max(overview.finance.receivablesOutstanding + overview.finance.payablesOutstanding, 1)}
                      tone="amber"
                      helper="Compromissos ainda nao liquidados"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState text="Carregando consolidado financeiro." />
            )}
          </Panel>
        </section>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.45)] backdrop-blur">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function KpiCard({
  title,
  value,
  helper,
  tone,
}: {
  title: string;
  value: string;
  helper: string;
  tone: "blue" | "emerald" | "amber" | "rose" | "orange" | "slate";
}) {
  const toneClasses: Record<typeof tone, string> = {
    blue: "border-sky-200 bg-sky-50 text-sky-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    orange: "border-orange-200 bg-orange-50 text-orange-700",
    slate: "border-slate-200 bg-slate-100 text-slate-700",
  };

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/90 p-5 shadow-[0_24px_60px_-52px_rgba(15,23,42,0.5)]">
      <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] ${toneClasses[tone]}`}>
        {title}
      </div>
      <p className="mt-4 text-3xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{helper}</p>
    </div>
  );
}

function QuickRangeButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white"
    >
      {label}
    </button>
  );
}

function AlertCard({ alert }: { alert: OverviewAlert }) {
  const toneClasses: Record<OverviewAlert["level"], string> = {
    critical: "border-rose-200 bg-rose-50 text-rose-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    info: "border-sky-200 bg-sky-50 text-sky-800",
  };

  return (
    <div className={`rounded-[22px] border px-4 py-4 ${toneClasses[alert.level]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{alert.title}</p>
        <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em]">
          {alert.level}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6">{alert.detail}</p>
    </div>
  );
}

function StatusDistribution({
  title,
  rows,
  amountLabel,
}: {
  title: string;
  rows: StatusBucket[];
  amountLabel?: string;
}) {
  const maxCount = Math.max(...rows.map((row) => row.count), 1);

  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-xs text-slate-500">
          Distribuicao atual consolidada pelo backend.
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-700">{row.label}</p>
              <p className="text-sm font-semibold text-slate-900">{formatNumber(row.count)}</p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#0f172a_0%,#38bdf8_100%)]"
                style={{ width: `${Math.max((row.count / maxCount) * 100, row.count > 0 ? 8 : 0)}%` }}
              />
            </div>
            {typeof row.amount === "number" ? (
              <p className="mt-2 text-xs text-slate-500">
                {amountLabel || "Valor"}: {formatCurrency(row.amount)}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricGrid({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-[22px] border border-slate-200 bg-white px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            {item.label}
          </p>
          <p className="mt-2 text-lg font-bold text-slate-950">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function MiniHealthCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: "amber" | "emerald" | "slate" | "blue" | "rose";
}) {
  const toneClasses: Record<typeof tone, string> = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    slate: "border-slate-200 bg-slate-100 text-slate-800",
    blue: "border-sky-200 bg-sky-50 text-sky-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
  };

  return (
    <div className={`rounded-[22px] border px-4 py-4 ${toneClasses[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em]">{title}</p>
      <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
    </div>
  );
}

function FinanceBar({
  label,
  amount,
  total,
  helper,
  tone,
}: {
  label: string;
  amount: number;
  total: number;
  helper: string;
  tone: "emerald" | "rose" | "amber";
}) {
  const toneClasses: Record<typeof tone, string> = {
    emerald: "from-emerald-500 to-teal-400",
    rose: "from-rose-500 to-orange-400",
    amber: "from-amber-500 to-yellow-400",
  };
  const width = total > 0 ? Math.min(100, Math.max((amount / total) * 100, amount > 0 ? 7 : 0)) : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-sm font-semibold text-slate-900">{formatCurrency(amount)}</p>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full bg-gradient-to-r ${toneClasses[tone]}`} style={{ width: `${width}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function createRangeFromDays(days: number): DateRange {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));

  return {
    dateFrom: toDateInputValue(start),
    dateTo: toDateInputValue(end),
  };
}

function createCurrentMonthRange(): DateRange {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), 1);

  return {
    dateFrom: toDateInputValue(start),
    dateTo: toDateInputValue(end),
  };
}

function toDateInputValue(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatShortCurrency(value: number) {
  return shortCurrencyFormatter.format(value);
}

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatPercent(value: number) {
  return percentFormatter.format(value);
}
