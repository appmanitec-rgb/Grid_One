"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ServiceTicket,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  formatTicketDate,
  portalTicketsGet,
  portalTicketsPost,
  ticketTone,
} from "@/lib/tickets";

export default function PortalTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const ticketId = params.id;
  const [ticket, setTicket] = useState<ServiceTicket | null>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTicket(await portalTicketsGet<ServiceTicket>(`/${ticketId}`));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar chamado.",
      );
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!comment.trim()) return;
    await runAction(async () => {
      await portalTicketsPost<ServiceTicket>(`/${ticketId}/comment`, {
        message: comment,
      });
      setComment("");
      setSuccess("Comentario enviado.");
      await load();
    });
  }

  async function handleCancel() {
    await runAction(async () => {
      await portalTicketsPost<ServiceTicket>(`/${ticketId}/cancel`, {
        note: "Cancelado pelo portal do cliente.",
      });
      setSuccess("Chamado cancelado.");
      await load();
    });
  }

  async function runAction(action: () => Promise<void>) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao executar acao.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !ticket) {
    return <State text="Carregando chamado..." />;
  }

  if (!ticket) {
    return <State text={error || "Chamado nao encontrado."} tone="error" />;
  }

  const canCancel = ["OPEN", "TRIAGE", "WAITING_CUSTOMER"].includes(
    ticket.status,
  );

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={ticketTone(ticket)}>{ticket.code}</Badge>
              <Badge tone={ticketTone(ticket)}>
                {TICKET_PRIORITY_LABELS[ticket.priority]}
              </Badge>
              <Badge>{TICKET_STATUS_LABELS[ticket.status]}</Badge>
            </div>
            <h1 className="mt-3 text-2xl font-extrabold text-slate-950">
              {ticket.title}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {ticket.generator?.name || "Sem equipamento vinculado"}
            </p>
          </div>
          <Link
            href="/portal/chamados"
            className="rounded-md border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-blue-200 hover:text-blue-700"
          >
            Voltar
          </Link>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Info
            label="Resposta SLA"
            value={formatTicketDate(ticket.slaResponseDueAt)}
          />
          <Info
            label="Solucao SLA"
            value={formatTicketDate(ticket.slaResolutionDueAt)}
          />
          <Info
            label="OS vinculada"
            value={
              ticket.maintenanceOrder
                ? ticket.maintenanceOrder.title
                : "Ainda nao"
            }
          />
        </div>

        <p className="mt-5 whitespace-pre-line text-sm leading-6 text-slate-700">
          {ticket.description}
        </p>
      </section>

      {error ? <State text={error} tone="error" /> : null}
      {success ? <State text={success} tone="success" /> : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-extrabold text-slate-950">
          Historico visivel
        </h2>
        <div className="mt-4 space-y-3">
          {(ticket.comments || []).map((item) => (
            <article
              key={item.id}
              className="rounded-md border border-slate-100 bg-slate-50 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge>
                  {item.authorType === "CUSTOMER"
                    ? "Cliente"
                    : item.authorType === "SYSTEM"
                      ? "Sistema"
                      : "Equipe"}
                </Badge>
                <span className="text-xs font-semibold text-slate-500">
                  {formatTicketDate(item.createdAt)}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm text-slate-700">
                {item.message}
              </p>
            </article>
          ))}
          {!ticket.comments?.length ? (
            <State text="Nenhuma interacao visivel ainda." />
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-extrabold text-slate-950">
          Adicionar comentario
        </h2>
        <form onSubmit={handleComment} className="mt-4 space-y-3">
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            className="min-h-28 w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            required
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-60"
            >
              Enviar comentario
            </button>
            <button
              type="button"
              disabled={saving || !canCancel}
              onClick={() => void handleCancel()}
              className="rounded-md border border-red-200 px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Cancelar chamado
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-extrabold text-slate-900">{value}</p>
    </div>
  );
}

function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  const classes =
    tone === "rose"
      ? "bg-rose-50 text-rose-700"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : tone === "emerald"
          ? "bg-emerald-50 text-emerald-700"
          : tone === "blue"
            ? "bg-blue-50 text-blue-700"
            : "bg-slate-100 text-slate-700";
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-bold ${classes}`}>
      {children}
    </span>
  );
}

function State({ text, tone }: { text: string; tone?: "error" | "success" }) {
  const classes =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-slate-200 bg-white text-slate-600";
  return (
    <div className={`rounded-md border p-3 text-sm font-semibold ${classes}`}>
      {text}
    </div>
  );
}
