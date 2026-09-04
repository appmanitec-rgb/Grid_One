"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";
import { clearAuthSession } from "@/lib/auth-session";
import {
  DataPill,
  EmptyState,
  FieldBox,
  PageHero,
  SectionCard,
  StatusBanner,
} from "../../components/DashboardPageKit";

type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";
type ReceivableStatus = "OPEN" | "PARTIAL" | "OVERDUE" | "PAID" | "CANCELED";
type PayableStatus = "OPEN" | "PAID" | "OVERDUE" | "CANCELED";

type Projection = {
  horizonDays: number;
  expectedIn: number;
  expectedOut: number;
  realizedIn?: number;
  realizedOut?: number;
  projectedBalance: number;
  negative: boolean;
};

type BankAccount = {
  id: string;
  name: string;
  bankName?: string | null;
  type?: string | null;
  currentBalance?: number | null;
  isActive?: boolean | null;
};

type Receivable = {
  id: string;
  description: string;
  dueDate: string;
  netAmount: number;
  interestAmount?: number | null;
  penaltyAmount?: number | null;
  paidAmount: number;
  status: ReceivableStatus;
  client?: { id: string; companyName?: string | null } | null;
  contract?: { id: string; code?: string | null } | null;
  maintenanceOrder?: { id: string; title?: string | null } | null;
};

type Payable = {
  id: string;
  description: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: PayableStatus;
  supplier?: { id: string; companyName?: string | null } | null;
  purchaseOrder?: { id: string; code?: string | null } | null;
};

const PRIMARY_LINK =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800";
const SECONDARY_LINK =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function getDaysUntilDue(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate(),
  );

  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getReceivableOutstanding(item: Receivable) {
  return Math.max(
    0,
    Number(item.netAmount || 0) +
      Number(item.interestAmount || 0) +
      Number(item.penaltyAmount || 0) -
      Number(item.paidAmount || 0),
  );
}

function getPayableOutstanding(item: Payable) {
  return Math.max(0, Number(item.amount || 0) - Number(item.paidAmount || 0));
}

function projectionTone(item: Projection): Tone {
  if (item.negative) return "rose";
  if (item.projectedBalance <= 30000) return "amber";
  return "emerald";
}

export default function CashFlowPage() {
  const router = useRouter();
  const [currentBalance, setCurrentBalance] = useState(0);
  const [projections, setProjections] = useState<Projection[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const handleUnauthorized = useCallback(
    async (response: Response) => {
      if (response.status !== 401) return false;
      clearAuthSession();
      router.replace("/");
      return true;
    },
    [router],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [projectionRes, accountsRes, receivablesRes, payablesRes] =
        await Promise.all([
          apiFetch(apiUrl("/finance/cash-flow/projection?days=90"), {
            cache: "no-store",
          }),
          apiFetch(apiUrl("/finance/bank-accounts"), { cache: "no-store" }),
          apiFetch(apiUrl("/finance/receivables"), { cache: "no-store" }),
          apiFetch(apiUrl("/finance/payables"), { cache: "no-store" }),
        ]);

      const failed = [
        {
          response: projectionRes,
          fallback: "Nao foi possivel carregar a projecao de caixa.",
        },
        {
          response: accountsRes,
          fallback: "Nao foi possivel carregar as contas bancarias.",
        },
        {
          response: receivablesRes,
          fallback: "Nao foi possivel carregar os recebiveis.",
        },
        {
          response: payablesRes,
          fallback: "Nao foi possivel carregar os pagaveis.",
        },
      ].find((entry) => !entry.response.ok);

      if (failed) {
        if (await handleUnauthorized(failed.response)) return;
        throw new Error(
          await readApiErrorMessage(failed.response, failed.fallback),
        );
      }

      const [projectionPayload, nextAccounts, nextReceivables, nextPayables] =
        (await Promise.all([
          projectionRes.json(),
          accountsRes.json(),
          receivablesRes.json(),
          payablesRes.json(),
        ])) as [
          { currentBalance?: number; projections?: Projection[] },
          BankAccount[],
          Receivable[],
          Payable[],
        ];

      setCurrentBalance(Number(projectionPayload.currentBalance || 0));
      setProjections(projectionPayload.projections || []);
      setBankAccounts(nextAccounts);
      setReceivables(nextReceivables);
      setPayables(nextPayables);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar o fluxo de caixa.",
      );
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const projectionsByHorizon = useMemo(() => {
    return [...projections].sort(
      (left, right) => left.horizonDays - right.horizonDays,
    );
  }, [projections]);

  const mainProjection =
    projectionsByHorizon.find((item) => item.horizonDays === 30) || null;
  const longProjection =
    projectionsByHorizon.find((item) => item.horizonDays === 90) || null;
  const firstNegativeProjection =
    projectionsByHorizon.find((item) => item.negative) || null;

  const soonReceivables = useMemo(() => {
    return receivables
      .filter(
        (item) =>
          item.status === "OPEN" ||
          item.status === "PARTIAL" ||
          item.status === "OVERDUE",
      )
      .sort(
        (left, right) =>
          new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime(),
      )
      .slice(0, 6);
  }, [receivables]);

  const soonPayables = useMemo(() => {
    return payables
      .filter((item) => item.status === "OPEN" || item.status === "OVERDUE")
      .sort(
        (left, right) =>
          new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime(),
      )
      .slice(0, 6);
  }, [payables]);

  const stats = useMemo(() => {
    const receivableExposure = receivables
      .filter(
        (item) =>
          item.status === "OPEN" ||
          item.status === "PARTIAL" ||
          item.status === "OVERDUE",
      )
      .reduce((total, item) => total + getReceivableOutstanding(item), 0);
    const payableExposure = payables
      .filter((item) => item.status === "OPEN" || item.status === "OVERDUE")
      .reduce((total, item) => total + getPayableOutstanding(item), 0);
    const overdueReceivables = receivables.filter(
      (item) => item.status === "OVERDUE",
    ).length;
    const overduePayables = payables.filter(
      (item) => item.status === "OVERDUE",
    ).length;

    return {
      receivableExposure,
      payableExposure,
      overdueReceivables,
      overduePayables,
    };
  }, [payables, receivables]);

  const activeAccounts = useMemo(
    () => bankAccounts.filter((item) => item.isActive !== false),
    [bankAccounts],
  );

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Financeiro executivo"
        title="Fluxo de caixa com horizonte real de entradas, saidas e saldo por conta."
        description="A projeção agora conversa com contas a receber, contas a pagar e saldos bancarios, para a leitura do caixa sair do campo teorico e virar instrumento de decisao operacional."
        stats={[
          {
            label: "Saldo atual",
            value: formatCurrency(currentBalance),
            helper: "Consolidado das contas bancarias ativas.",
            tone: currentBalance < 0 ? "rose" : "blue",
          },
          {
            label: "Projecao 30 dias",
            value: mainProjection
              ? formatCurrency(mainProjection.projectedBalance)
              : "-",
            helper: mainProjection
              ? `${formatCurrency(mainProjection.expectedIn)} previstas, ${formatCurrency(mainProjection.expectedOut)} de saidas e ${formatCurrency(Number(mainProjection.realizedIn || 0))} ja realizadas no mes.`
              : "Sem dados de horizonte carregados.",
            tone: mainProjection ? projectionTone(mainProjection) : "slate",
          },
          {
            label: "Projecao 90 dias",
            value: longProjection
              ? formatCurrency(longProjection.projectedBalance)
              : "-",
            helper: longProjection
              ? "Leitura de folego para contrato, compras e caixa."
              : "Sem dados de horizonte carregados.",
            tone: longProjection ? projectionTone(longProjection) : "slate",
          },
          {
            label: "Risco imediato",
            value: firstNegativeProjection
              ? `${firstNegativeProjection.horizonDays} dias`
              : "Controlado",
            helper: firstNegativeProjection
              ? "Primeiro horizonte com saldo projetado negativo."
              : "Nenhum horizonte negativo na projeção atual.",
            tone: firstNegativeProjection ? "rose" : "emerald",
          },
        ]}
        aside={
          <div className="space-y-3">
            <FieldBox>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Pressao do caixa
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div>
                  <p className="text-xs text-slate-500">Entradas em aberto</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">
                    {formatCurrency(stats.receivableExposure)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Saidas em aberto</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">
                    {formatCurrency(stats.payableExposure)}
                  </p>
                </div>
              </div>
            </FieldBox>

            <StatusBanner tone={firstNegativeProjection ? "rose" : "blue"}>
              {firstNegativeProjection
                ? `Atencao: o caixa projeta saldo negativo em ${firstNegativeProjection.horizonDays} dias se nada mudar no ritmo atual.`
                : "A carteira atual nao aponta saldo negativo nos horizontes analisados."}
            </StatusBanner>
          </div>
        }
      />

      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.75fr)_360px]">
        <div className="space-y-6">
          <SectionCard
            eyebrow="Horizonte financeiro"
            title="Pulso da projeção"
            description="Compare as janelas de 30, 60 e 90 dias e veja onde o caixa estica ou perde folego."
          >
            <div className="grid gap-3 md:grid-cols-3">
              {loading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`projection-loading-${index}`}
                    className="animate-pulse rounded-[24px] border border-slate-200 bg-slate-50/80 p-5"
                  >
                    <div className="h-5 w-24 rounded-full bg-slate-200" />
                    <div className="mt-3 h-16 rounded-2xl bg-slate-200" />
                  </div>
                ))
              ) : projectionsByHorizon.length === 0 ? (
                <div className="md:col-span-3">
                  <EmptyState
                    title="Sem projeções carregadas"
                    description="O endpoint de projeção nao retornou horizontes para analise."
                  />
                </div>
              ) : (
                projectionsByHorizon.map((item) => (
                  <article
                    key={item.horizonDays}
                    className={`rounded-[24px] border p-5 shadow-[0_20px_48px_-40px_rgba(15,31,50,0.45)] ${
                      item.negative
                        ? "border-rose-200 bg-rose-50/90"
                        : "border-slate-200 bg-slate-50/88"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-slate-900">
                        {item.horizonDays} dias
                      </p>
                      <DataPill tone={projectionTone(item)}>
                        {item.negative ? "Pressao" : "Estavel"}
                      </DataPill>
                    </div>
                    <p className="mt-3 text-2xl font-bold text-slate-950">
                      {formatCurrency(item.projectedBalance)}
                    </p>
                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      <div className="flex items-center justify-between gap-3">
                        <span>Entradas previstas</span>
                        <span className="font-semibold text-emerald-700">
                          {formatCurrency(item.expectedIn)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Saidas previstas</span>
                        <span className="font-semibold text-rose-700">
                          {formatCurrency(item.expectedOut)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Entradas realizadas</span>
                        <span className="font-semibold text-emerald-700">
                          {formatCurrency(Number(item.realizedIn || 0))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Saidas realizadas</span>
                        <span className="font-semibold text-rose-700">
                          {formatCurrency(Number(item.realizedOut || 0))}
                        </span>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Agenda financeira"
            title="Entradas e saidas mais proximas"
            description="A leitura de caixa fica melhor quando a projeção conversa com o que vence agora."
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Recebimentos prioritarios
                    </p>
                    <p className="text-sm text-slate-500">
                      Carteira ativa puxada de contas a receber.
                    </p>
                  </div>
                  <DataPill tone="blue">
                    {soonReceivables.length} titulo(s)
                  </DataPill>
                </div>

                {loading ? (
                  <div className="animate-pulse rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
                    <div className="h-5 w-24 rounded-full bg-slate-200" />
                    <div className="mt-3 h-24 rounded-2xl bg-slate-200" />
                  </div>
                ) : soonReceivables.length === 0 ? (
                  <EmptyState
                    title="Sem recebimentos urgentes"
                    description="Nenhum titulo ativo apareceu na janela prioritaria."
                  />
                ) : (
                  soonReceivables.map((item) => {
                    const dueInDays = getDaysUntilDue(item.dueDate);
                    return (
                      <Link
                        key={item.id}
                        href="/dashboard/finance/accounts-receivable"
                        className="block rounded-[24px] border border-slate-200 bg-white/92 p-4 transition hover:border-slate-300 hover:bg-white"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <DataPill
                            tone={item.status === "OVERDUE" ? "rose" : "blue"}
                          >
                            {item.status === "OVERDUE"
                              ? "Vencido"
                              : item.status === "PARTIAL"
                                ? "Parcial"
                                : "Em aberto"}
                          </DataPill>
                          {item.contract?.id ? (
                            <DataPill tone="slate">Contrato</DataPill>
                          ) : null}
                          {item.maintenanceOrder?.id ? (
                            <DataPill tone="amber">O.S.</DataPill>
                          ) : null}
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-900">
                          {item.client?.companyName ||
                            "Cliente nao identificado"}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {item.description}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                          <span className="text-slate-500">
                            {dueInDays !== null && dueInDays < 0
                              ? `${Math.abs(dueInDays)} dia(s) em atraso`
                              : dueInDays === 0
                                ? "Vence hoje"
                                : `Vence em ${dueInDays} dia(s)`}
                          </span>
                          <span className="font-semibold text-slate-900">
                            {formatCurrency(getReceivableOutstanding(item))}
                          </span>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Pagamentos prioritarios
                    </p>
                    <p className="text-sm text-slate-500">
                      Despesas ativas que pressionam o caixa nos proximos dias.
                    </p>
                  </div>
                  <DataPill tone="amber">
                    {soonPayables.length} titulo(s)
                  </DataPill>
                </div>

                {loading ? (
                  <div className="animate-pulse rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
                    <div className="h-5 w-24 rounded-full bg-slate-200" />
                    <div className="mt-3 h-24 rounded-2xl bg-slate-200" />
                  </div>
                ) : soonPayables.length === 0 ? (
                  <EmptyState
                    title="Sem pagamentos urgentes"
                    description="Nenhuma despesa ativa apareceu na janela prioritaria."
                  />
                ) : (
                  soonPayables.map((item) => {
                    const dueInDays = getDaysUntilDue(item.dueDate);
                    return (
                      <Link
                        key={item.id}
                        href="/dashboard/finance/accounts-payable"
                        className="block rounded-[24px] border border-slate-200 bg-white/92 p-4 transition hover:border-slate-300 hover:bg-white"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <DataPill
                            tone={item.status === "OVERDUE" ? "rose" : "amber"}
                          >
                            {item.status === "OVERDUE"
                              ? "Vencido"
                              : "Em aberto"}
                          </DataPill>
                          {item.purchaseOrder?.id ? (
                            <DataPill tone="slate">P.O.</DataPill>
                          ) : null}
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-900">
                          {item.supplier?.companyName ||
                            "Fornecedor nao identificado"}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {item.description}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                          <span className="text-slate-500">
                            {dueInDays !== null && dueInDays < 0
                              ? `${Math.abs(dueInDays)} dia(s) em atraso`
                              : dueInDays === 0
                                ? "Vence hoje"
                                : `Vence em ${dueInDays} dia(s)`}
                          </span>
                          <span className="font-semibold text-slate-900">
                            {formatCurrency(getPayableOutstanding(item))}
                          </span>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard
            eyebrow="Leituras de risco"
            title="Pontos de atencao"
            description="O que mais influencia a saude do caixa agora."
          >
            <div className="space-y-3">
              <FieldBox>
                <p className="text-sm font-semibold text-slate-900">
                  Recebiveis vencidos
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {stats.overdueReceivables} titulo(s) atrasados, pressionando a
                  entrada prevista.
                </p>
              </FieldBox>

              <FieldBox>
                <p className="text-sm font-semibold text-slate-900">
                  Pagaveis vencidos
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {stats.overduePayables} titulo(s) em atraso, elevando a
                  pressao de saida.
                </p>
              </FieldBox>

              <StatusBanner
                tone={
                  stats.receivableExposure >= stats.payableExposure
                    ? "blue"
                    : "amber"
                }
              >
                {stats.receivableExposure >= stats.payableExposure
                  ? "A carteira de entradas ainda cobre a de saidas, mas a velocidade de cobranca segue decisiva."
                  : "As saidas em aberto ja superam as entradas previstas; vale agir em cobranca e priorizacao de pagamentos."}
              </StatusBanner>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Bancos e caixas"
            title="Distribuicao por conta"
            description="Saldos ativos usados como base do caixa consolidado."
          >
            <div className="space-y-3">
              {loading ? (
                <div className="animate-pulse rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
                  <div className="h-5 w-24 rounded-full bg-slate-200" />
                  <div className="mt-3 h-24 rounded-2xl bg-slate-200" />
                </div>
              ) : activeAccounts.length === 0 ? (
                <EmptyState
                  title="Nenhuma conta ativa encontrada"
                  description="Sem contas bancarias ativas, o caixa consolidado perde rastreabilidade."
                />
              ) : (
                activeAccounts
                  .slice()
                  .sort(
                    (left, right) =>
                      Number(right.currentBalance || 0) -
                      Number(left.currentBalance || 0),
                  )
                  .slice(0, 5)
                  .map((account) => (
                    <div
                      key={account.id}
                      className="rounded-[22px] border border-slate-200 bg-slate-50/85 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {account.name}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {account.bankName || "Banco nao informado"}
                            {account.type ? ` / ${account.type}` : ""}
                          </p>
                        </div>
                        <DataPill
                          tone={
                            Number(account.currentBalance || 0) < 0
                              ? "rose"
                              : "emerald"
                          }
                        >
                          {Number(account.currentBalance || 0) < 0
                            ? "Negativo"
                            : "Saudavel"}
                        </DataPill>
                      </div>
                      <p className="mt-3 text-lg font-bold text-slate-950">
                        {formatCurrency(Number(account.currentBalance || 0))}
                      </p>
                    </div>
                  ))
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
