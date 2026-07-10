"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  customerPortalGet,
  formatPortalCurrency,
  formatPortalDate,
  PortalProposal,
  statusLabel,
} from "@/lib/customer-portal";

export default function PortalProposalsPage() {
  const [items, setItems] = useState<PortalProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const payload = await customerPortalGet<PortalProposal[]>("/proposals");
        if (!cancelled) setItems(payload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar propostas.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-5">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-extrabold text-slate-950">Propostas</h1>
        <p className="mt-1 text-sm text-slate-500">Acompanhe propostas liberadas para sua empresa.</p>
      </header>

      {loading ? <State text="Carregando propostas..." /> : null}
      {error ? <State text={error} tone="error" /> : null}
      {!loading && !error && !items.length ? <State text="Nenhuma proposta encontrada." /> : null}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500">
          <span>Proposta</span>
          <span>Status</span>
          <span>Valor</span>
        </div>
        {items.map((proposal) => (
          <Link
            key={proposal.id}
            href={`/portal/propostas/${proposal.id}`}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-blue-50"
          >
            <div>
              <p className="font-extrabold text-slate-950">{proposal.code}</p>
              <p className="text-sm text-slate-500">
                {proposal.generator?.name || "Sem equipamento"} - Validade {formatPortalDate(proposal.validUntil)}
              </p>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600">
              {statusLabel(proposal.status)}
            </span>
            <strong className="text-right text-sm text-slate-900">{formatPortalCurrency(proposal.totalValue)}</strong>
          </Link>
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
