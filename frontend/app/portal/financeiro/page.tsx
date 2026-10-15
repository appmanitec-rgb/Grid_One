"use client";
import { WorkspaceState } from "@/app/dashboard/components/WorkspaceState";
import { PageHeader } from "@/app/dashboard/components/DashboardPageKit";
import { useEffect, useMemo, useState } from "react";
import {
  customerPortalGet,
  formatPortalCurrency,
  formatPortalDate,
  PortalFinancialEntry,
  statusLabel,
} from "@/lib/customer-portal";

export default function PortalFinancialPage() {
  const [items, setItems] = useState<PortalFinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const payload = await customerPortalGet<PortalFinancialEntry[]>("/financial");
        if (!cancelled) setItems(payload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar financeiro.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const openAmount = useMemo(
    () =>
      items.reduce((sum, item) => {
        if (item.status === "PAID") return sum;
        return sum + Math.max(0, Number(item.netAmount || 0) - Number(item.paidAmount || 0));
      }, 0),
    [items],
  );

  return (
    <div className="dashboard-page space-y-5">
      <PageHeader eyebrow="Central do cliente" title="Financeiro" description="Títulos vinculados à sua empresa." meta={<><span>Saldo em aberto</span><strong className="text-lg text-slate-950">{loading ? "—" : formatPortalCurrency(openAmount)}</strong></>} />

      {loading ? <State text="Carregando financeiro..." /> : null}
      {error ? <State text={error} tone="error" /> : null}
      {!loading && !error && !items.length ? <State text="Nenhum titulo financeiro liberado." /> : null}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="portal-list-heading grid grid-cols-[1fr_auto_auto] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500">
          <span>Descrição</span>
          <span>Vencimento</span>
          <span>Valor</span>
        </div>
        {items.map((item) => (
          <article
            key={item.id}
            className="portal-list-row grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
          >
            <div>
              <p className="font-extrabold text-slate-950">{item.description}</p>
              <p className="text-sm text-slate-500">
                {statusLabel(item.status)}
                {item.contract ? ` - Contrato ${item.contract.code}` : ""}
                {item.maintenanceOrder ? ` - ${item.maintenanceOrder.title}` : ""}
              </p>
            </div>
            <span className="text-sm font-semibold text-slate-600">{formatPortalDate(item.dueDate)}</span>
            <strong className="text-right text-sm text-slate-900">{formatPortalCurrency(item.netAmount)}</strong>
          </article>
        ))}
      </section>
    </div>
  );
}

function State({ text, tone }: { text: string; tone?: "error" | "success" }) {
  return <WorkspaceState title={text} tone={tone || (/^Carregando/i.test(text) ? "loading" : "empty")} />;
}
