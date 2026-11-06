"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  commercialFetch,
  CommercialCapabilities,
  PORTFOLIO_LABELS,
  Portfolio,
} from "@/lib/commercial-workspace";
import { commercialLabel } from "@/lib/commercial-labels";
import {
  PageHeader,
  SectionCard,
  InlineMessage,
  DataPill,
  EmptyState,
} from "../../components/DashboardPageKit";

type Agenda = {
  counts: Record<string, number>;
  kind: string;
  items: Array<{
    id: string;
    title: string;
    client: string;
    owner?: string;
    dueAt?: string | null;
    overdue?: boolean;
    status?: string;
    href: string;
    action: string;
  }>;
  page: number;
  total: number;
  scope: string;
  updatedAt: string;
};
type Analytics = {
  basis: string;
  portfolios: Array<{
    portfolio: Portfolio;
    acceptedSales: number;
    grantedDiscounts: number;
    stageTimes: Array<{ stage: string; tracked: number; meanHours: number }>;
    profitability?: {
      reviewedSales: number;
      totalSales: number;
      marginPercent: number | null;
      contribution: number | null;
      limited: boolean;
    };
    wonCount: number;
    lostCount: number;
    conversionPercent: number | null;
    receivablesCreated: number;
    receivedFromCohort: number;
    losses: Array<{ lossReason: string | null; _count: { _all: number } }>;
    stages: Array<{
      stage: string;
      _count: { _all: number };
      _sum: { estimatedValue: number | null };
    }>;
  }>;
};
const categories = {
  activities: "Agenda de contatos",
  expiring: "Validade das propostas",
  approval: "Aprovações e ajustes",
  idle: "Negociações sem avanço",
  handoff: "Continuidade das vendas",
};
const currency = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n,
  );
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
export default function CommercialWorkspacePage() {
  const [capabilities, setCapabilities] = useState<CommercialCapabilities>();
  const [portfolio, setPortfolio] = useState("all");
  const [kind, setKind] = useState<keyof typeof categories>("activities");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState("agenda");
  const [data, setData] = useState<Agenda>();
  const [analytics, setAnalytics] = useState<Analytics>();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [to, setTo] = useState(() => new Date().toLocaleDateString("sv-SE"));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    commercialFetch<CommercialCapabilities>("/capabilities", {
      signal: controller.signal,
    })
      .then(setCapabilities)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  const canSeeTeam =
    !!capabilities &&
    (portfolio === "all"
      ? Object.values(capabilities.management).some((rights) => rights?.team)
      : capabilities.management[portfolio as Portfolio]?.team === true);
  useEffect(() => {
    if (tab === "analytics" && !canSeeTeam) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ portfolio, kind, page: String(page) });
    if (tab === "analytics") {
      params.set("from", `${from}T00:00:00-03:00`);
      params.set("to", `${to}T23:59:59-03:00`);
    }
    commercialFetch<Agenda | Analytics>(
      `/${tab === "agenda" ? "agenda" : "analytics"}?${params}`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (tab === "agenda") setData(value as Agenda);
        else setAnalytics(value as Analytics);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [portfolio, kind, page, tab, from, to, attempt, canSeeTeam]);
  return (
    <main className="dashboard-page space-y-5">
      <PageHeader
        eyebrow="Comercial"
        title="Agenda comercial"
        description="Contatos, propostas e continuidade das vendas."
        actions={
          <button
            className="app-button app-button-secondary"
            disabled={loading}
            onClick={() => setAttempt((n) => n + 1)}
          >
            Atualizar
          </button>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-52 text-sm font-medium">
          Carteira
          <select
            className={inputClass + " mt-1"}
            value={portfolio}
            onChange={(event) => {
              setPortfolio(event.target.value);
              setPage(1);
              setData(undefined);
              setAnalytics(undefined);
              setTab("agenda");
            }}
          >
            <option value="all">Carteiras autorizadas</option>
            {capabilities?.portfolios.map((value) => (
              <option key={value} value={value}>
                {PORTFOLIO_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Visão comercial"
        >
          <button
            className={`app-button ${tab === "agenda" ? "app-button-primary" : "app-button-secondary"}`}
            aria-pressed={tab === "agenda"}
            onClick={() => setTab("agenda")}
          >
            Minha rotina
          </button>
          {canSeeTeam ? (
            <button
              className={`app-button ${tab === "analytics" ? "app-button-primary" : "app-button-secondary"}`}
              aria-pressed={tab === "analytics"}
              onClick={() => setTab("analytics")}
            >
              Indicadores da equipe
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <InlineMessage tone="warning">
          {error}{" "}
          <button
            className="underline"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Tentar novamente
          </button>
        </InlineMessage>
      ) : null}
      {tab === "agenda" ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {Object.entries(categories).map(([key, title]) => (
              <button
                key={key}
                className={`rounded-xl border p-4 text-left ${kind === key ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"}`}
                aria-pressed={kind === key}
                onClick={() => {
                  setKind(key as keyof typeof categories);
                  setPage(1);
                  setData(undefined);
                }}
              >
                <span className="block text-sm font-medium">{title}</span>
                <strong className="mt-2 block text-2xl">
                  {data?.counts[key] ?? "—"}
                </strong>
              </button>
            ))}
          </div>
          <SectionCard
            title={categories[kind]}
            description={
              data?.scope || "Consultando seus registros autorizados."
            }
          >
            {loading ? (
              <p role="status" className="py-5 text-sm text-slate-500">
                Carregando acompanhamento…
              </p>
            ) : data?.items.length ? (
              <div className="divide-y divide-slate-200">
                {data.items.map((item) => (
                  <article
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={item.href}
                        className="font-semibold text-blue-700 hover:underline"
                      >
                        {item.title}
                      </Link>
                      <p className="mt-1 break-words text-sm text-slate-600">
                        {item.client}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.owner || "Responsável não definido"}
                        {item.dueAt
                          ? ` · ${new Date(item.dueAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.overdue ? (
                        <DataPill tone="rose">Retorno atrasado</DataPill>
                      ) : null}
                      {item.status ? (
                        <DataPill>{commercialLabel(item.status)}</DataPill>
                      ) : null}
                      <Link
                        href={item.href}
                        className="app-button app-button-secondary"
                      >
                        {item.action}
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : !error ? (
              <EmptyState
                title="Nenhuma pendência nesta seleção"
                description="As informações respeitam o seu usuário e as carteiras liberadas."
              />
            ) : null}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
              <span className="text-sm text-slate-500">
                {data?.total ?? 0} registros · página {page}
              </span>
              <div className="flex gap-2">
                <button
                  className="app-button app-button-secondary"
                  disabled={loading || page <= 1}
                  onClick={() => setPage((n) => n - 1)}
                >
                  Anterior
                </button>
                <button
                  className="app-button app-button-secondary"
                  disabled={loading || !data || page * 10 >= data.total}
                  onClick={() => setPage((n) => n + 1)}
                >
                  Próxima
                </button>
              </div>
            </div>
          </SectionCard>
        </>
      ) : canSeeTeam ? (
        <SectionCard
          title="Resultado das carteiras autorizadas"
          description="Consulta exclusiva do administrador responsável."
        >
          <div className="mb-5 grid max-w-lg grid-cols-2 gap-3">
            <label className="text-sm">
              De
              <input
                aria-label="Início do período"
                type="date"
                className={inputClass}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Até
              <input
                aria-label="Fim do período"
                type="date"
                className={inputClass}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          {loading ? (
            <p role="status">Carregando indicadores…</p>
          ) : (
            analytics?.portfolios.map((result) => (
              <section
                key={result.portfolio}
                className="mb-5 rounded-xl border border-slate-200 p-4"
              >
                <h3 className="mb-4 font-semibold">
                  {PORTFOLIO_LABELS[result.portfolio]}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Vendas aceitas", currency(result.acceptedSales)],
                    [
                      "Conversão das encerradas",
                      result.conversionPercent === null
                        ? "Sem encerramentos"
                        : `${result.conversionPercent}%`,
                    ],
                    ["Títulos gerados", currency(result.receivablesCreated)],
                    [
                      "Recebido dessas vendas",
                      currency(result.receivedFromCohort),
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className="mt-1 text-xl font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">
                      Descontos concedidos nas vendas aceitas
                    </p>
                    <strong>{currency(result.grantedDiscounts)}</strong>
                  </div>
                  {result.profitability ? (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">
                        Margem das vendas conferidas
                      </p>
                      <strong>
                        {result.profitability.marginPercent === null
                          ? "Não apurada"
                          : `${new Intl.NumberFormat("pt-BR").format(result.profitability.marginPercent)}%`}
                      </strong>
                      <p className="mt-1 text-xs text-slate-500">
                        {result.profitability.reviewedSales} de{" "}
                        {result.profitability.totalSales} vendas com custos
                        conferidos e vigentes.
                        {result.profitability.limited
                          ? " Reduza o período para apurar a margem."
                          : ""}
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="text-sm font-medium">
                      Oportunidades por etapa
                    </h4>
                    {result.stages.map((row) => (
                      <p
                        className="mt-2 flex justify-between gap-3 text-sm"
                        key={row.stage}
                      >
                        <span>{commercialLabel(row.stage)}</span>
                        <span>
                          {row._count._all} ·{" "}
                          {currency(Number(row._sum.estimatedValue || 0))}
                        </span>
                      </p>
                    ))}
                  </div>
                  <div>
                    <h4 className="text-sm font-medium">Motivos de perda</h4>
                    {result.losses.length ? (
                      result.losses.map((row) => (
                        <p
                          className="mt-2 text-sm"
                          key={row.lossReason || "unknown"}
                        >
                          {commercialLabel(row.lossReason || "Não informado")}:{" "}
                          {row._count._all}
                        </p>
                      ))
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">
                        Nenhuma perda registrada no período.
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <h4 className="text-sm font-medium">
                    Tempo médio na etapa atual
                  </h4>
                  {result.stageTimes.length ? (
                    result.stageTimes.map((row) => (
                      <p
                        key={row.stage}
                        className="mt-2 text-sm text-slate-600"
                      >
                        {commercialLabel(row.stage)} ·{" "}
                        {new Intl.NumberFormat("pt-BR", {
                          maximumFractionDigits: 1,
                        }).format(row.meanHours / 24)}{" "}
                        dias · {row.tracked} negociações com movimentação
                        rastreada
                      </p>
                    ))
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">
                      Ainda não há histórico suficiente para medir o tempo por
                      etapa.
                    </p>
                  )}
                </div>
              </section>
            ))
          )}
          {analytics ? (
            <p className="text-xs leading-relaxed text-slate-500">
              {analytics.basis}
            </p>
          ) : null}
        </SectionCard>
      ) : null}
    </main>
  );
}
