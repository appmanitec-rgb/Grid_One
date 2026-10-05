"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { getAccessFromToken } from "@/lib/access";

type ActivityType = "CALL" | "VISIT" | "MESSAGE" | "TASK";
type ActivityStatus = "PLANNED" | "COMPLETED" | "CANCELED";
type Activity = {
  id: string;
  type: ActivityType;
  status: ActivityStatus;
  subject: string;
  details?: string | null;
  occurredAt: string;
  dueAt?: string | null;
  completedAt?: string | null;
  createdBy?: { name: string } | null;
  owner?: { name: string } | null;
  opportunity?: { id: string; title: string } | null;
};
type ActivityPage = { items: Activity[]; hasMore: boolean; nextAction: Activity | null };

const typeLabels: Record<ActivityType, string> = {
  CALL: "Ligação",
  VISIT: "Visita",
  MESSAGE: "Mensagem",
  TASK: "Tarefa",
};
const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const displayDate = (value: string) => dateFormat.format(new Date(value));
const dateTimeInput = (value?: string | null) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";

export default function CrmTimeline({ clientId, opportunityId }: { clientId: string; opportunityId?: string }) {
  const [access, setAccess] = useState(() => getAccessFromToken());
  const [activities, setActivities] = useState<Activity[]>([]);
  const [nextAction, setNextAction] = useState<Activity | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [type, setType] = useState<ActivityType>("CALL");
  const [planned, setPlanned] = useState(false);
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [editingId, setEditingId] = useState("");

  const load = useCallback(async (skip = 0) => {
    if (!access.proposals.view) return;
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ clientId, skip: String(skip) });
      if (opportunityId) params.set("opportunityId", opportunityId);
      const response = await apiFetch(`/crm/activities?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readApiErrorMessage(response, "Falha ao carregar a linha do tempo."));
      const data = await response.json() as ActivityPage;
      setActivities((current) => skip ? [...current, ...data.items] : data.items);
      setNextAction(data.nextAction);
      setHasMore(data.hasMore);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar a linha do tempo.");
    } finally {
      setLoading(false);
    }
  }, [clientId, opportunityId, access.proposals.view]);

  useEffect(() => { setAccess(getAccessFromToken()); }, []);
  useEffect(() => { void load(); }, [load]);

  function resetForm() {
    setEditingId("");
    setType("CALL");
    setPlanned(false);
    setSubject("");
    setDetails("");
    setDueAt("");
    setOccurredAt("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(editingId ? `/crm/activities/${editingId}` : "/crm/activities", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId
          ? { subject: subject.trim(), details: details.trim(), dueAt: dueAt ? new Date(dueAt).toISOString() : undefined }
          : { clientId, opportunityId, type, status: planned || type === "TASK" ? "PLANNED" : "COMPLETED", subject: subject.trim(), details: details.trim(), dueAt: dueAt ? new Date(dueAt).toISOString() : undefined, occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined }),
      });
      if (!response.ok) throw new Error(await readApiErrorMessage(response, "Não foi possível salvar a atividade."));
      resetForm();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a atividade.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(activity: Activity, status: ActivityStatus) {
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(`/crm/activities/${activity.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error(await readApiErrorMessage(response, "Não foi possível atualizar a ação."));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a ação.");
    } finally {
      setSaving(false);
    }
  }

  const needsDueAt = editingId || planned || type === "TASK";
  if (!access.proposals.view) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Relacionamento comercial</p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">Linha do tempo</h2>
          <p className="text-sm text-slate-600">Registre contatos e acompanhe os próximos passos.</p>
        </div>
        {nextAction ? (
          <div className={`min-w-56 rounded-xl border p-3 ${new Date(nextAction.dueAt || "") < new Date() ? "border-rose-200 bg-rose-50" : "border-blue-200 bg-blue-50"}`}>
            <p className="text-xs font-bold uppercase text-slate-600">Próxima ação</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{nextAction.subject}</p>
            <p className="text-xs text-slate-600">{nextAction.dueAt ? displayDate(nextAction.dueAt) : "Sem prazo"}{nextAction.owner?.name ? ` · ${nextAction.owner.name}` : ""}</p>
          </div>
        ) : <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">Nenhuma ação agendada</span>}
      </div>

      {access.proposals.create || access.proposals.update ? <form onSubmit={(event) => void save(event)} className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-6">
        <label className="text-xs font-semibold text-slate-700 md:col-span-2">Tipo
          <select value={type} disabled={Boolean(editingId)} onChange={(event) => { const selected = event.target.value as ActivityType; setType(selected); setPlanned(selected === "TASK"); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700 md:col-span-4">Assunto
          <input required maxLength={200} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Ex.: Confirmar condições da proposta" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        </label>
        {!editingId && type !== "TASK" ? <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2"><input type="checkbox" checked={planned} onChange={(event) => setPlanned(event.target.checked)} />Agendar próxima ação</label> : null}
        {needsDueAt ? <label className="text-xs font-semibold text-slate-700 md:col-span-2">Prazo
          <input required type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        </label> : null}
        {!needsDueAt && !editingId ? <label className="text-xs font-semibold text-slate-700 md:col-span-2">Data do contato (opcional)
          <input type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        </label> : null}
        <label className="text-xs font-semibold text-slate-700 md:col-span-6">Observações
          <textarea rows={2} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Resumo do contato ou instruções para a tarefa" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        </label>
        <div className="flex gap-2 md:col-span-6">
          <button disabled={saving || (editingId ? !access.proposals.update : !access.proposals.create)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Salvando..." : editingId ? "Salvar alteração" : needsDueAt ? "Agendar ação" : "Registrar contato"}</button>
          {editingId ? <button type="button" onClick={resetForm} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancelar edição</button> : null}
        </div>
      </form> : null}

      {error ? <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-5 space-y-3">
        {activities.map((activity) => (
          <article key={activity.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">{typeLabels[activity.type]}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${activity.status === "PLANNED" ? "bg-blue-100 text-blue-800" : activity.status === "CANCELED" ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-800"}`}>{activity.status === "PLANNED" ? "Pendente" : activity.status === "CANCELED" ? "Cancelada" : "Concluída"}</span>
                  <h3 className="text-sm font-bold text-slate-900">{activity.subject}</h3>
                </div>
                <p className="mt-1 text-xs text-slate-500">{activity.status === "PLANNED" && activity.dueAt ? `Prazo: ${displayDate(activity.dueAt)}` : `Registro: ${displayDate(activity.occurredAt)}`}{activity.owner?.name ? ` · Responsável: ${activity.owner.name}` : ""}</p>
                {activity.createdBy?.name ? <p className="text-xs text-slate-500">Registrado por: {activity.createdBy.name}</p> : null}
                {activity.opportunity && !opportunityId ? <Link href={`/dashboard/opportunities/${activity.opportunity.id}`} className="mt-1 inline-block text-xs font-semibold text-blue-700 hover:underline">{activity.opportunity.title}</Link> : null}
                {activity.details ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{activity.details}</p> : null}
              </div>
              {activity.status === "PLANNED" && access.proposals.update ? <div className="flex flex-wrap gap-2">
                <button disabled={saving} onClick={() => { setEditingId(activity.id); setType(activity.type); setSubject(activity.subject); setDetails(activity.details || ""); setDueAt(dateTimeInput(activity.dueAt)); }} className="text-xs font-semibold text-blue-700">Editar</button>
                <button disabled={saving} onClick={() => void changeStatus(activity, "COMPLETED")} className="text-xs font-semibold text-emerald-700">Concluir</button>
                <button disabled={saving} onClick={() => void changeStatus(activity, "CANCELED")} className="text-xs font-semibold text-slate-600">Cancelar</button>
              </div> : null}
            </div>
          </article>
        ))}
        {!loading && activities.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">Nenhuma atividade comercial registrada.</p> : null}
        {hasMore ? <button disabled={loading} onClick={() => void load(activities.length)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">{loading ? "Carregando..." : "Carregar mais"}</button> : null}
      </div>
    </section>
  );
}
