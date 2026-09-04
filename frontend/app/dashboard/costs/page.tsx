"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { PageHero } from "../components/DashboardPageKit";

type Metrics = {
  orders: number; hours: number; transitHours: number; revenue: number;
  receivedRevenue: number; laborCost: number; materialCost: number;
  purchaseCost: number; commissionCost: number; otherCost: number;
  totalCost: number; result: number; marginPercent: number;
};

type OrderRow = Metrics & {
  id: string; title: string; status: string; type: string; date: string;
  costCenterId?: string | null;
  client: { id: string; name: string };
  generator: { id: string; name: string };
  technician?: { id: string; name: string } | null;
  contract?: { id: string; code: string; name: string } | null;
};

type DimensionRow = Metrics & { id: string; code?: string | null; name: string };
type CostCenterRow = DimensionRow & {
  client?: { id: string; name: string } | null;
  contract?: { id: string; code: string; name: string } | null;
  generator?: { id: string; name: string } | null;
};
type CostOverview = {
  period: { from: string; to: string }; summary: Metrics;
  purchases: { count: number; total: number; allocatedToCostCenters: number };
  orders: OrderRow[]; clients: DimensionRow[]; contracts: DimensionRow[];
  costCenters: CostCenterRow[];
};
type ViewMode = "orders" | "clients" | "contracts" | "costCenters";

const VIEW_LABELS: Record<ViewMode, string> = {
  orders: "Por O.S.", clients: "Por cliente", contracts: "Por contrato",
  costCenters: "Centros de custo",
};
const STATUS_OPTIONS = [
  ["", "Todos os status"], ["OPEN", "Aberta"],
  ["IN_PROGRESS", "Em andamento"], ["PAUSED", "Pausada"],
  ["COMPLETED", "Concluida"], ["CANCELED", "Cancelada"],
] as const;

function dateInput(daysAgo = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export default function CostsPage() {
  const [data, setData] = useState<CostOverview | null>(null);
  const [from, setFrom] = useState(() => dateInput(89));
  const [to, setTo] = useState(() => dateInput());
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("orders");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to });
      if (status) params.set("status", status);
      const response = await apiFetch(`/operational-costs/overview?${params}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Nao foi possivel consolidar os custos."));
      }
      setData((await response.json()) as CostOverview);
    } catch (loadError: unknown) {
      setData(null);
      setError(loadError instanceof Error ? loadError.message : "Nao foi possivel consolidar os custos.");
    } finally {
      setLoading(false);
    }
  }, [from, status, to]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const source = data[view] as Array<OrderRow | DimensionRow | CostCenterRow>;
    const query = search.trim().toLowerCase();
    if (!query) return source;
    return source.filter((row) => {
      const order = row as OrderRow;
      const center = row as CostCenterRow;
      return ["title" in row ? row.title : row.name, center.code, order.client?.name,
        order.generator?.name, order.contract?.code, center.client?.name,
        center.contract?.code].some((value) =>
        String(value ?? "").toLowerCase().includes(query),
      );
    });
  }, [data, search, view]);

  const summary = data?.summary;
  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHero
        compact
        eyebrow="Financeiro / Operacao"
        title="Custos de Operacao"
        description="Resultado consolidado das ordens, contratos e centros de custo."
        stats={summary ? [
          { label: "Receita reconhecida", value: money(summary.revenue), helper: `${money(summary.receivedRevenue)} recebido`, tone: "blue" },
          { label: "Custo operacional", value: money(summary.totalCost), helper: `${summary.orders} O.S. no periodo`, tone: "amber" },
          { label: "Resultado", value: money(summary.result), helper: `Margem ${percent(summary.marginPercent)}`, tone: summary.result >= 0 ? "emerald" : "rose" },
          { label: "Horas produtivas", value: `${number(summary.hours)} h`, helper: `${number(summary.transitHours)} h em deslocamento`, tone: "slate" },
        ] : []}
      />

      <section className="border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[minmax(150px,190px)_minmax(150px,190px)_minmax(180px,220px)_1fr_auto] md:items-end">
          <Field label="De"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={INPUT} /></Field>
          <Field label="Ate"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={INPUT} /></Field>
          <Field label="Status da O.S.">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={INPUT}>
              {STATUS_OPTIONS.map(([value, label]) => <option key={value || "all"} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Pesquisar"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="O.S., cliente, contrato ou equipamento" className={INPUT} /></Field>
          <button type="button" onClick={() => void load()} disabled={loading} className="h-10 border border-slate-900 bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-50">
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </section>

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {data ? <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Breakdown label="Mao de obra" value={data.summary.laborCost} />
          <Breakdown label="Materiais consumidos" value={data.summary.materialCost} />
          <Breakdown label="Compras alocadas" value={data.summary.purchaseCost} />
          <Breakdown label="Comissoes" value={data.summary.commissionCost} />
          <Breakdown label="Outros custos" value={data.summary.otherCost} />
        </section>

        <section className="border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2" role="tablist">
              {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => (
                <button key={mode} type="button" role="tab" aria-selected={view === mode} onClick={() => setView(mode)} className={`h-9 border px-3 text-sm font-semibold transition ${view === mode ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
                  {VIEW_LABELS[mode]}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">{rows.length} resultado(s) | Compras: {money(data.purchases.total)} em {data.purchases.count} pedido(s)</p>
          </div>
          <div className="overflow-x-auto">
            {view === "orders" ? <OrdersTable rows={rows as OrderRow[]} /> : <DimensionTable rows={rows as DimensionRow[]} view={view} />}
          </div>
        </section>
      </> : loading ? <div className="border border-slate-200 bg-white p-8 text-sm text-slate-500">Consolidando custos operacionais...</div> : null}
    </div>
  );
}

function OrdersTable({ rows }: { rows: OrderRow[] }) {
  return <table className="min-w-[1280px] w-full text-sm">
    <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500"><tr>
      <Th>O.S. / Cliente</Th><Th>Contrato</Th><Th>Tecnico</Th><Th right>Horas</Th>
      <Th right>Receita</Th><Th right>Mao de obra</Th><Th right>Materiais</Th>
      <Th right>Comissao</Th><Th right>Custo total</Th><Th right>Resultado</Th><Th right>Margem</Th>
    </tr></thead>
    <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
      <td className="px-4 py-3"><Link href={`/dashboard/orders/${row.id}`} className="font-semibold text-sky-700 hover:underline">{row.title}</Link><p className="mt-1 text-xs text-slate-500">{row.client.name} | {row.generator.name}</p></td>
      <td className="px-4 py-3 text-slate-600">{row.contract?.code || "Sem contrato"}</td>
      <td className="px-4 py-3 text-slate-600">{row.technician?.name || "Nao definido"}</td>
      <Td value={`${number(row.hours)} h`} /><Td value={money(row.revenue)} /><Td value={money(row.laborCost)} />
      <Td value={money(row.materialCost)} /><Td value={money(row.commissionCost)} /><Td value={money(row.totalCost)} strong />
      <Td value={money(row.result)} tone={row.result >= 0 ? "positive" : "negative"} />
      <Td value={percent(row.marginPercent)} tone={row.marginPercent >= 0 ? "positive" : "negative"} />
    </tr>)}{rows.length === 0 ? <EmptyRow columns={11} /> : null}</tbody>
  </table>;
}

function DimensionTable({ rows, view }: { rows: DimensionRow[]; view: ViewMode }) {
  return <table className="min-w-[1120px] w-full text-sm">
    <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500"><tr>
      <Th>{VIEW_LABELS[view]}</Th><Th right>O.S.</Th><Th right>Horas</Th><Th right>Receita</Th>
      <Th right>Recebido</Th><Th right>Mao de obra</Th><Th right>Materiais</Th><Th right>Compras</Th>
      <Th right>Outros + comissao</Th><Th right>Resultado</Th><Th right>Margem</Th>
    </tr></thead>
    <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70">
      <td className="px-4 py-3 font-semibold text-slate-900">{row.code ? `${row.code} | ` : ""}{row.name}</td>
      <Td value={String(row.orders)} /><Td value={`${number(row.hours)} h`} /><Td value={money(row.revenue)} />
      <Td value={money(row.receivedRevenue)} /><Td value={money(row.laborCost)} /><Td value={money(row.materialCost)} />
      <Td value={money(row.purchaseCost)} /><Td value={money(row.otherCost + row.commissionCost)} />
      <Td value={money(row.result)} tone={row.result >= 0 ? "positive" : "negative"} />
      <Td value={percent(row.marginPercent)} tone={row.marginPercent >= 0 ? "positive" : "negative"} />
    </tr>)}{rows.length === 0 ? <EmptyRow columns={11} /> : null}</tbody>
  </table>;
}

function Breakdown({ label, value }: { label: string; value: number }) {
  return <div className="border border-slate-200 bg-white px-4 py-3 shadow-sm"><p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-slate-950">{money(value)}</p></div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>{children}</label>;
}
function Th({ children, right = false }: { children: ReactNode; right?: boolean }) {
  return <th className={`px-4 py-3 font-semibold ${right ? "text-right" : ""}`}>{children}</th>;
}
function Td({ value, strong = false, tone }: { value: string; strong?: boolean; tone?: "positive" | "negative" }) {
  return <td className={`whitespace-nowrap px-4 py-3 text-right ${strong ? "font-semibold text-slate-900" : "text-slate-600"} ${tone === "positive" ? "font-semibold text-emerald-700" : tone === "negative" ? "font-semibold text-red-700" : ""}`}>{value}</td>;
}
function EmptyRow({ columns }: { columns: number }) {
  return <tr><td colSpan={columns} className="px-4 py-10 text-center text-sm text-slate-500">Nenhum resultado encontrado para o periodo.</td></tr>;
}
function money(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0)); }
function number(value: number) { return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(value || 0)); }
function percent(value: number) { return `${number(value)}%`; }
const INPUT = "h-10 w-full border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100";
