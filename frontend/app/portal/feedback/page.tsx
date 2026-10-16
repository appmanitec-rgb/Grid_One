"use client";

import { SelectField } from "@/app/dashboard/components/SelectField";
import { useCallback, useEffect, useState } from "react";
import { PageHeader, SectionCard } from "@/app/dashboard/components/DashboardPageKit";
import { WorkspaceState } from "@/app/dashboard/components/WorkspaceState";
import { customerPortalGet, customerPortalPost, formatPortalDate } from "@/lib/customer-portal";

type Entry = { id: string; kind: string; message: string; createdAt: string; user: { name: string } };

export default function PortalFeedbackPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [kind, setKind] = useState<"OBSERVATION" | "FEEDBACK">("OBSERVATION");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setEntries(await customerPortalGet<Entry[]>("/feedback")); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível carregar as mensagens."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setSuccess("");
    try {
      await customerPortalPost("/feedback", { kind, message });
      setMessage("");
      setSuccess("Mensagem enviada. Obrigado por compartilhar sua opinião.");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível enviar a mensagem."); }
    finally { setBusy(false); }
  }
  return <div className="dashboard-page space-y-5">
    <PageHeader eyebrow="Comunicação" title="Observações e feedback" description="Compartilhe uma observação sobre o atendimento ou uma sugestão para a Manitec." />
    {error && <WorkspaceState tone="error" title={error} />}
    {success && <WorkspaceState tone="success" title={success} />}
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <SectionCard title="Nova mensagem" description="Seu relato ajuda nossa equipe a acompanhar o atendimento.">
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div><label htmlFor="feedback-kind" className="block text-sm font-semibold text-slate-700">Tipo</label><SelectField id="feedback-kind" value={kind} onChange={(event) => setKind(event.target.value as "OBSERVATION" | "FEEDBACK")} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2"><option value="OBSERVATION">Observação</option><option value="FEEDBACK">Feedback ou sugestão</option></SelectField></div>
          <div><label htmlFor="feedback-message" className="block text-sm font-semibold text-slate-700">Mensagem</label><textarea id="feedback-message" required maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} rows={6} className="mt-2 block w-full rounded-lg border border-slate-300 p-3" placeholder="Escreva sua mensagem..." /></div>
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-500">{message.length}/2000 caracteres</span><button disabled={busy || !message.trim()} className="min-h-11 rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{busy ? "Enviando..." : "Enviar mensagem"}</button></div>
        </form>
      </SectionCard>
      <SectionCard title="Mensagens anteriores" description="Histórico de observações e sugestões da sua empresa.">
        {loading ? <WorkspaceState tone="loading" title="Carregando mensagens..." /> : !entries.length && !error ? <WorkspaceState title="Nenhuma mensagem enviada ainda" description="Use o formulário para compartilhar sua primeira mensagem." /> : <div className="space-y-3">{entries.map((entry) => <article key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap justify-between gap-2 text-xs font-semibold text-slate-500"><span>{entry.kind === "FEEDBACK" ? "Feedback" : "Observação"} de {entry.user.name}</span><time>{formatPortalDate(entry.createdAt)}</time></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{entry.message}</p></article>)}</div>}
      </SectionCard>
    </div>
  </div>;
}
