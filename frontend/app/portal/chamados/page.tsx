"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ServiceTicket,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  formatTicketDate,
  portalTicketsGet,
  ticketTone,
} from "@/lib/tickets";

const BUTTON =
  "inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500";

export default function PortalTicketsPage() {
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setTickets(await portalTicketsGet<ServiceTicket[]>());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar chamados.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const stats = useMemo(() => {
    const open = tickets.filter(
      (ticket) => !["RESOLVED", "CLOSED", "CANCELED"].includes(ticket.status),
    ).length;
    const waitingCustomer = tickets.filter(
      (ticket) => ticket.status === "WAITING_CUSTOMER",
    ).length;
    const converted = tickets.filter(
      (ticket) => ticket.maintenanceOrder,
    ).length;
    return { open, waitingCustomer, converted };
  }, [tickets]);

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-950">Chamados</h1>
            <p className="mt-1 text-sm text-slate-500">
              Acompanhe atendimento, SLA e OS vinculada quando houver.
            </p>
          </div>
          <Link href="/portal/chamados/novo" className={BUTTON}>
            Novo chamado
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Stat label="Abertos" value={stats.open} />
          <Stat label="Aguardando voce" value={stats.waitingCustomer} />
          <Stat label="Com OS vinculada" value={stats.converted} />
        </div>
      </section>

      {error ? <State tone="error" text={error} /> : null}

      <section className="grid gap-3">
        {loading ? <State text="Carregando chamados..." /> : null}
        {!loading && tickets.length === 0 ? (
          <State text="Nenhum chamado aberto." />
        ) : null}
        {tickets.map((ticket) => (
          <Link
            key={ticket.id}
            href={`/portal/chamados/${ticket.id}`}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={ticketTone(ticket)}>{ticket.code}</Badge>
                  <Badge tone={ticketTone(ticket)}>
                    {TICKET_PRIORITY_LABELS[ticket.priority]}
                  </Badge>
                  <Badge>{TICKET_STATUS_LABELS[ticket.status]}</Badge>
                </div>
                <h2 className="mt-3 text-lg font-extrabold text-slate-950">
                  {ticket.title}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {ticket.generator?.name || "Sem equipamento vinculado"}
                </p>
              </div>
              <div className="text-sm text-slate-600 md:text-right">
                <p>Resposta: {formatTicketDate(ticket.slaResponseDueAt)}</p>
                <p>Solucao: {formatTicketDate(ticket.slaResolutionDueAt)}</p>
                {ticket.maintenanceOrder ? (
                  <p className="mt-1 font-bold text-emerald-700">
                    OS vinculada
                  </p>
                ) : null}
              </div>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-slate-950">{value}</p>
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

function State({ text, tone }: { text: string; tone?: "error" }) {
  return (
    <div
      className={`rounded-md border p-3 text-sm font-semibold ${
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      {text}
    </div>
  );
}
