"use client";

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
    <div className="space-y-5">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-extrabold text-slate-950">Financeiro</h1>
        <p className="mt-1 text-sm text-slate-500">Títulos vinculados à sua empresa.</p>
        <strong className="mt-4 block text-3xl text-slate-950">{formatPortalCurrency(openAmount)}</strong>
        <p className="text-sm font-medium text-slate-500">Saldo aberto estimado</p>
      </header>

      {loading ? <State text="Carregando financeiro..." /> : null}
      {error ? <State text={error} tone="error" /> : null}
      {!loading && !error && !items.length ? <State text="Nenhum titulo financeiro liberado." /> : null}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500">
          <span>Descrição</span>
          <span>Vencimento</span>
          <span>Valor</span>
        </div>
        {items.map((item) => (
          <article
            key={item.id}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
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

function State({ text, tone }: { text: string; tone?: "error" }) {
  return (
    <div
      className={`rounded-lg border p-4 text-sm font-semibold ${
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      {text}
    </div>
  );
}
