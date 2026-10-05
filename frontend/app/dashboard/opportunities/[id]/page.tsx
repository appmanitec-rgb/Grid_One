"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import CrmTimeline from "../../components/CrmTimeline";
import { apiFetch, readApiErrorMessage } from "@/lib/api";

type Opportunity = {
  id: string;
  title: string;
  stage: string;
  estimatedValue: number;
  probabilityPercent?: number | null;
  expectedCloseDate?: string | null;
  client: { id: string; companyName: string; tradeName?: string | null };
  assignedSeller?: { name: string } | null;
  proposals?: Array<{ id: string; code: string; status: string }>;
};
const stageLabels: Record<string, string> = {
  PROSPECTION: "Prospecção",
  SITE_SURVEY_SCHEDULED: "Vistoria agendada",
  PROPOSAL_SENT: "Proposta enviada",
  NEGOTIATION: "Negociação",
  WON: "Ganha",
  LOST: "Perdida",
};
const stageProbability: Record<string, number> = {
  PROSPECTION: 10,
  SITE_SURVEY_SCHEDULED: 25,
  PROPOSAL_SENT: 50,
  NEGOTIATION: 75,
  WON: 100,
  LOST: 0,
};
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function OpportunityDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [amount, setAmount] = useState("");
  const [probability, setProbability] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const response = await apiFetch(`/crm/opportunities/${id}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readApiErrorMessage(response, "Oportunidade não encontrada."));
      const item = await response.json() as Opportunity;
      setOpportunity(item);
      setAmount(String(item.estimatedValue ?? 0));
      setProbability(item.probabilityPercent == null ? "" : String(item.probabilityPercent));
      setCloseDate(item.expectedCloseDate?.slice(0, 10) || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a oportunidade.");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function saveForecast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await apiFetch(`/crm/opportunities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimatedValue: Number(amount),
          probabilityPercent: probability === "" ? null : Number(probability),
          expectedCloseDate: closeDate || null,
        }),
      });
      if (!response.ok) throw new Error(await readApiErrorMessage(response, "Não foi possível atualizar a previsão."));
      setMessage("Previsão atualizada.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a previsão.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !opportunity) return <div className="p-8 text-sm text-slate-600">Carregando oportunidade...</div>;
  if (!opportunity) return <div className="p-8"><p className="text-rose-700">{error || "Oportunidade não encontrada."}</p><Link href="/dashboard/opportunities" className="text-blue-700">Voltar ao funil</Link></div>;
  const effectiveProbability = opportunity.probabilityPercent ?? stageProbability[opportunity.stage] ?? 0;

  return <main className="mx-auto max-w-6xl space-y-5 p-5 md:p-8">
    <Link href="/dashboard/opportunities" className="text-sm font-semibold text-blue-700 hover:underline">← Funil de vendas</Link>
    <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Oportunidade · {stageLabels[opportunity.stage] || opportunity.stage}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{opportunity.title}</h1>
          <Link href={`/dashboard/clients/${opportunity.client.id}`} className="mt-2 inline-block text-sm font-semibold text-blue-700 hover:underline">{opportunity.client.tradeName || opportunity.client.companyName}</Link>
          <p className="text-sm text-slate-600">Responsável: {opportunity.assignedSeller?.name || "Não definido"}</p>
        </div>
        <div className="rounded-xl bg-blue-50 p-4 text-right">
          <p className="text-xs font-bold uppercase text-slate-600">Previsão ponderada</p>
          <p className="text-xl font-bold text-blue-900">{currency.format(Number(opportunity.estimatedValue || 0) * effectiveProbability / 100)}</p>
          <p className="text-xs text-slate-600">{effectiveProbability}% de {currency.format(Number(opportunity.estimatedValue || 0))}</p>
        </div>
      </div>
    </header>

    <form onSubmit={(event) => void saveForecast(event)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">Previsão de vendas</h2>
      <p className="mt-1 text-sm text-slate-600">A probabilidade padrão da etapa é {stageProbability[opportunity.stage] ?? 0}%. Informe outro percentual se houver uma avaliação mais precisa.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold text-slate-700">Valor estimado (R$)<input required min="0" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-700">Probabilidade (%)<input min="0" max="100" step="1" type="number" value={probability} onChange={(event) => setProbability(event.target.value)} placeholder={`Padrão: ${stageProbability[opportunity.stage] ?? 0}%`} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-700">Fechamento previsto<input type="date" value={closeDate} onChange={(event) => setCloseDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
      </div>
      <button disabled={saving} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Salvando..." : "Salvar previsão"}</button>
      {message ? <p className="mt-2 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p> : null}
    </form>

    <CrmTimeline clientId={opportunity.client.id} opportunityId={opportunity.id} />
    {opportunity.proposals?.length ? <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-slate-900">Propostas vinculadas</h2><div className="mt-3 flex flex-wrap gap-2">{opportunity.proposals.map((proposal) => <Link key={proposal.id} href={`/dashboard/proposals/${proposal.id}`} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-blue-700">{proposal.code} · {proposal.status}</Link>)}</div></section> : null}
  </main>;
}
