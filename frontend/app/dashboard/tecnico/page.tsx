"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ServiceTicket,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  formatTicketDate,
  ticketTone,
} from "@/lib/tickets";
import {
  TechnicianOrder,
  formatFieldDate,
  hasOpenWorkSession,
  orderStatusLabel,
  technicianGet,
} from "@/lib/technician-work";
import { StatusBanner } from "../components/DashboardPageKit";

const PRIMARY_BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800";
const SECONDARY_BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50";

export default function TechnicianDashboardPage() {
  const [orders, setOrders] = useState<TechnicianOrder[]>([]);
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [orderRows, ticketRows] = await Promise.all([
        technicianGet<TechnicianOrder[]>("/orders?pageSize=30"),
        technicianGet<ServiceTicket[]>("/tickets?pageSize=30"),
      ]);
      setOrders(orderRows);
      setTickets(ticketRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar campo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const today = orders.filter((order) =>
      order.scheduledTo?.startsWith(todayKey),
    ).length;
    const openSessions = orders.filter((order) => hasOpenWorkSession(order)).length;
    const delayed = orders.filter((order) => {
      if (!order.scheduledTo || ["COMPLETED", "CANCELED"].includes(order.status)) {
        return false;
      }
      return new Date(order.scheduledTo).getTime() < Date.now();
    }).length;
    return { today, openSessions, delayed };
  }, [orders]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          Campo técnico
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Minha rota</h1>
            <p className="mt-1 text-sm text-slate-600">
              OS, chamados e apontamentos de execução atribuídos a você.
            </p>
          </div>
          <button type="button" onClick={load} className={SECONDARY_BUTTON}>
            Atualizar
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Metric label="Hoje" value={stats.today} />
          <Metric label="Em campo" value={stats.openSessions} tone="emerald" />
          <Metric label="Atrasadas" value={stats.delayed} tone="rose" />
        </div>
      </header>

      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500">
          Carregando agenda de campo...
        </div>
      ) : null}

      {!loading && orders.length === 0 ? (
        <EmptyState title="Nenhuma OS atribuída" />
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
          Minhas OS
        </h2>
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
          Meus chamados
        </h2>
        {!loading && tickets.length === 0 ? (
          <EmptyState title="Nenhum chamado atribuído" />
        ) : null}
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} />
        ))}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "slate" | "emerald" | "rose";
}) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-950",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-70">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function OrderCard({ order }: { order: TechnicianOrder }) {
  const openSession = hasOpenWorkSession(order);
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
              {orderStatusLabel(order.status)}
            </span>
            {openSession ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                Check-in aberto
              </span>
            ) : null}
          </div>
          <h3 className="mt-3 text-lg font-bold text-slate-950">{order.title}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {order.generator?.client?.tradeName ||
              order.generator?.client?.companyName ||
              "Cliente não informado"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {order.generator?.name || "Equipamento não informado"} -{" "}
            {formatFieldDate(order.scheduledTo)}
          </p>
        </div>
        <Link href={`/dashboard/tecnico/ordens/${order.id}`} className={PRIMARY_BUTTON}>
          Abrir OS
        </Link>
      </div>
    </article>
  );
}

function TicketCard({ ticket }: { ticket: ServiceTicket }) {
  const tone = ticketTone(ticket);
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    blue: "border-sky-200 bg-sky-50 text-sky-800",
  };
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>
              {TICKET_PRIORITY_LABELS[ticket.priority]}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
              {TICKET_STATUS_LABELS[ticket.status]}
            </span>
          </div>
          <h3 className="mt-3 text-base font-bold text-slate-950">
            {ticket.code} - {ticket.title}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {ticket.client?.tradeName || ticket.client?.companyName || "Cliente"}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Aberto em {formatTicketDate(ticket.createdAt)}
          </p>
        </div>
      </div>
    </article>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm font-semibold text-slate-500">
      {title}
    </div>
  );
}
