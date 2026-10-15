"use client";
import { WorkspaceState } from "@/app/dashboard/components/WorkspaceState";
import { PageHeader, MetricCard } from "@/app/dashboard/components/DashboardPageKit";
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
    <div className="dashboard-page space-y-5">
      <><PageHeader eyebrow="Atendimento" title="Chamados" description="Acompanhe o atendimento, os prazos e a ordem de serviço vinculada." actions={<Link href="/portal/chamados/novo" className={BUTTON}>Novo chamado</Link>} /><div className="dashboard-metrics-grid"><MetricCard label="Abertos" value={String(stats.open)} loading={loading} /><MetricCard label="Aguardando você" value={String(stats.waitingCustomer)} loading={loading} tone="amber" /><MetricCard label="Com O.S. vinculada" value={String(stats.converted)} loading={loading} tone="blue" /></div></>

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
  return <WorkspaceState title={text} tone={tone || (/^Carregando/i.test(text) ? "loading" : "empty")} />;
}
