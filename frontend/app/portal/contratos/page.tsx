"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { customerPortalGet, formatPortalDate, PortalContract } from "@/lib/customer-portal";

const STATUS: Record<string, string> = { ACTIVE: "Ativo", DRAFT: "Rascunho", EXPIRED: "Vencido", CANCELED: "Cancelado", SUSPENDED: "Suspenso" };
const COVERAGE: Record<string, string> = { INCLUDED: "Peças incluídas", BILLED_SEPARATELY: "Peças cobradas separadamente", PARTIAL: "Cobertura parcial" };

export default function PortalContractsPage() {
  const [contracts, setContracts] = useState<PortalContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void customerPortalGet<PortalContract[]>("/contracts")
      .then((rows) => { if (!cancelled) setContracts(rows); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Não foi possível carregar seus contratos."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Área do cliente</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">Meus contratos</h1>
        <p className="mt-2 text-sm text-slate-600">Consulte vigência, cobertura e equipamentos vinculados à sua empresa.</p>
      </section>
      {loading ? <p className="rounded-xl bg-white p-5 text-sm text-slate-600">Carregando contratos...</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</p> : null}
      {!loading && !error && contracts.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Nenhum contrato está vinculado a este cadastro.</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {contracts.map((contract) => (
          <article key={contract.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">{contract.code}</p><h2 className="mt-1 text-lg font-bold text-slate-950">{contract.title || "Contrato de manutenção"}</h2></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">{STATUS[contract.status] || contract.status}</span></div>
            <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><p><span className="block text-xs text-slate-500">Vigência</span><strong className="text-slate-800">{formatPortalDate(contract.startDate)} a {formatPortalDate(contract.endDate)}</strong></p><p><span className="block text-xs text-slate-500">Cobertura de peças</span><strong className="text-slate-800">{COVERAGE[contract.partsCoverage] || contract.partsCoverage}</strong></p><p><span className="block text-xs text-slate-500">Periodicidade preventiva</span><strong className="text-slate-800">{contract.preventiveRecurrence}</strong></p><p><span className="block text-xs text-slate-500">Prazo de resposta</span><strong className="text-slate-800">{contract.responseTimeHours ? `${contract.responseTimeHours} h` : "Conforme contrato"}</strong></p></div>
            <div className="mt-5 border-t border-slate-100 pt-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Equipamentos cobertos</p>{contract.equipments.length ? <div className="mt-2 flex flex-wrap gap-2">{contract.equipments.map(({ generator }) => <Link key={generator.id} href={`/portal/equipamentos/${generator.id}`} className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100">{generator.name}</Link>)}</div> : <p className="mt-2 text-sm text-slate-500">Nenhum equipamento vinculado.</p>}</div>
          </article>
        ))}
      </div>
    </div>
  );
}
