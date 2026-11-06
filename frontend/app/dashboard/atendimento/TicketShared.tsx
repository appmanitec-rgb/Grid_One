"use client";
import Link from "next/link";
import { DataPill } from "../components/DashboardPageKit";
import {
  ServiceTicket,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from "@/lib/tickets";
import { ticketSlaDisplay } from "@/lib/ticket-workspace";
import styles from "./TicketWorkspace.module.css";

export const PRIMARY_BUTTON =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50";
export const SECONDARY_BUTTON =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
export function TicketSla({
  ticket,
  detail = true,
}: {
  ticket: ServiceTicket;
  detail?: boolean;
}) {
  const sla = ticketSlaDisplay(ticket);
  return (
    <div>
      <DataPill tone={sla.tone}>{sla.label}</DataPill>
      {detail ? <span className={styles.secondary}>{sla.detail}</span> : null}
    </div>
  );
}
export function TicketPriority({ ticket }: { ticket: ServiceTicket }) {
  return (
    <DataPill
      tone={
        ticket.priority === "CRITICAL"
          ? "rose"
          : ticket.priority === "HIGH"
            ? "amber"
            : "slate"
      }
    >
      {TICKET_PRIORITY_LABELS[ticket.priority]}
    </DataPill>
  );
}
export function TicketCard({ ticket }: { ticket: ServiceTicket }) {
  return (
    <Link
      href={"/dashboard/atendimento/" + ticket.id}
      className={styles.boardCard}
      aria-label={ticket.code + " · " + ticket.title}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-blue-700">{ticket.code}</span>
        <TicketPriority ticket={ticket} />
      </div>
      <h3>{ticket.title}</h3>
      <p className="text-xs leading-5 text-slate-500">
        {ticket.client?.tradeName ||
          ticket.client?.companyName ||
          "Cliente não informado"}
      </p>
      {ticket.generator?.name ? (
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {ticket.generator.name}
        </p>
      ) : null}
      <div className="mb-3 mt-3">
        <DataPill tone="slate">{TICKET_STATUS_LABELS[ticket.status]}</DataPill>
      </div>
      <TicketSla ticket={ticket} />
      <div className={styles.boardMeta}>
        <span>
          {ticket.assignedToUser?.name ||
            ticket.technician?.user?.name ||
            "Sem responsável"}
        </span>
        {ticket.maintenanceOrder ? (
          <span className="font-semibold text-emerald-700">O.S. vinculada</span>
        ) : null}
      </div>
    </Link>
  );
}
