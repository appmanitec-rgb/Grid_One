"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TechnicianOrder,
  TechnicianWorkSession,
  formatFieldDate,
  hasOpenWorkSession,
  orderStatusLabel,
  technicianGet,
  technicianPost,
} from "@/lib/technician-work";
import { StatusBanner } from "../../../components/DashboardPageKit";

const PRIMARY_BUTTON =
  "inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const DANGER_BUTTON =
  "inline-flex min-h-12 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50";

export default function TechnicianOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const [order, setOrder] = useState<TechnicianOrder | null>(null);
  const [sessions, setSessions] = useState<TechnicianWorkSession[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [orderRow, sessionRows] = await Promise.all([
        technicianGet<TechnicianOrder>(`/orders/${orderId}`),
        technicianGet<TechnicianWorkSession[]>(
          `/orders/${orderId}/work-sessions`,
        ),
      ]);
      setOrder(orderRow);
      setSessions(sessionRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar OS.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openSession = useMemo(
    () => sessions.find((session) => session.status === "OPEN"),
    [sessions],
  );
  const hasOpenSession = Boolean(openSession) || hasOpenWorkSession(order ?? undefined);

  async function perform(path: string, label: string, needsConfirm = false) {
    if (needsConfirm && !window.confirm(label)) return;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      await technicianPost(`/orders/${orderId}/${path}`, {
        note: note.trim() || undefined,
      });
      setNote("");
      setSuccess(path === "check-in" ? "Check-in registrado." : "Check-out registrado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao registrar acao.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !order) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500">
        Carregando OS...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-4">
        {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
        <Link href="/dashboard/tecnico" className={SECONDARY_BUTTON}>
          Voltar para campo
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-8">
      <Link href="/dashboard/tecnico" className="text-sm font-bold text-slate-600 hover:text-slate-950">
        Voltar para campo
      </Link>

      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            {orderStatusLabel(order.status)}
          </span>
          {hasOpenSession ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
              Check-in aberto
            </span>
          ) : null}
        </div>
        <h1 className="mt-3 text-2xl font-bold text-slate-950">{order.title}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {order.description || "Sem descricao tecnica."}
        </p>
      </header>

      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {success ? <StatusBanner tone="emerald">{success}</StatusBanner> : null}

      <section className="grid gap-3 sm:grid-cols-2">
        <Info label="Cliente" value={order.generator?.client?.tradeName || order.generator?.client?.companyName} />
        <Info label="Equipamento" value={order.generator?.name} />
        <Info label="Serie" value={order.generator?.serialNumber} />
        <Info label="Agendada" value={formatFieldDate(order.scheduledTo)} />
        <Info label="Local" value={order.site?.name || order.generator?.currentSite?.name} />
        <Info
          label="Contrato"
          value={order.contract ? `${order.contract.code} - ${order.contract.status}` : "-"}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
          Apontamento
        </h2>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
          placeholder="Observacao de campo"
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={submitting || hasOpenSession || order.status === "COMPLETED"}
            className={PRIMARY_BUTTON}
            onClick={() => perform("check-in", "Registrar check-in nesta OS?")}
          >
            Check-in
          </button>
          <button
            type="button"
            disabled={submitting || !hasOpenSession}
            className={DANGER_BUTTON}
            onClick={() =>
              perform("check-out", "Confirmar check-out e gerar apontamento?", true)
            }
          >
            Check-out
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
              Laudo tecnico
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {order.serviceReport
                ? `${order.serviceReport.code} - ${order.serviceReport.status}`
                : "Nenhum laudo vinculado a esta OS."}
            </p>
          </div>
          {order.serviceReport ? (
            <Link
              href={`/dashboard/relatorios-tecnicos/${order.serviceReport.id}`}
              className={SECONDARY_BUTTON}
            >
              Abrir laudo
            </Link>
          ) : (
            <Link href="/dashboard/relatorios-tecnicos" className={SECONDARY_BUTTON}>
              Criar laudo
            </Link>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
          Sessoes
        </h2>
        {sessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm font-semibold text-slate-500">
            Nenhum apontamento registrado.
          </div>
        ) : null}
        {sessions.map((session) => (
          <article key={session.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-bold text-slate-950">{session.status}</span>
              <span className="text-slate-500">
                {formatFieldDate(session.startedAt)} - {formatFieldDate(session.finishedAt)}
              </span>
            </div>
            {session.timeEntryId ? (
              <p className="mt-2 text-xs font-semibold text-emerald-700">
                Banco de horas gerado.
              </p>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value || "-"}</p>
    </div>
  );
}
