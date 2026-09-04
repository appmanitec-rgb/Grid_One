"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import {
  ServiceTicket,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  formatTicketDate,
  ticketTone,
  ticketsGet,
  ticketsPost,
} from "@/lib/tickets";
import {
  DataPill,
  FieldBox,
  FormField,
  PageHero,
  SectionCard,
  StatusBanner,
  TextAreaInput,
  TextInput,
} from "../components/DashboardPageKit";
import ListPagination, {
  useListPagination,
} from "../components/ListPagination";

type ClientOption = {
  id: string;
  companyName: string;
  tradeName?: string | null;
};

type GeneratorOption = {
  id: string;
  name: string;
  serialNumber?: string | null;
  clientId: string;
};

const INITIAL_FORM = {
  clientId: "",
  generatorId: "",
  title: "",
  description: "",
  category: "CORRECTIVE_MAINTENANCE" as TicketCategory,
  priority: "MEDIUM" as TicketPriority,
  contactName: "",
  contactPhone: "",
  contactEmail: "",
};

const STATUSES: Array<"ALL" | TicketStatus> = [
  "ALL",
  "OPEN",
  "TRIAGE",
  "WAITING_CUSTOMER",
  "WAITING_INTERNAL",
  "SCHEDULED",
  "IN_PROGRESS",
  "CONVERTED_TO_ORDER",
  "RESOLVED",
  "CLOSED",
  "CANCELED",
];

const PRIORITIES: Array<"ALL" | TicketPriority> = [
  "ALL",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

const CATEGORIES = Object.keys(TICKET_CATEGORY_LABELS) as TicketCategory[];

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export default function InternalTicketsPage() {
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [generators, setGenerators] = useState<GeneratorOption[]>([]);
  const [statusFilter, setStatusFilter] = useState<"ALL" | TicketStatus>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | TicketPriority>(
    "ALL",
  );
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ticketRows, clientRows, generatorRows] = await Promise.all([
        ticketsGet<ServiceTicket[]>(),
        fetchJson<ClientOption[]>("/clients"),
        fetchJson<GeneratorOption[]>("/generators"),
      ]);
      setTickets(ticketRows);
      setClients(clientRows);
      setGenerators(generatorRows);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar atendimento.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredTickets = useMemo(() => {
    const term = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (statusFilter !== "ALL" && ticket.status !== statusFilter)
        return false;
      if (priorityFilter !== "ALL" && ticket.priority !== priorityFilter)
        return false;
      if (overdueOnly && ticket.slaStatus !== "OVERDUE") return false;
      if (!term) return true;

      return (
        ticket.code.toLowerCase().includes(term) ||
        ticket.title.toLowerCase().includes(term) ||
        ticket.description.toLowerCase().includes(term) ||
        (ticket.client?.companyName || "").toLowerCase().includes(term) ||
        (ticket.client?.tradeName || "").toLowerCase().includes(term) ||
        (ticket.generator?.name || "").toLowerCase().includes(term)
      );
    });
  }, [tickets, statusFilter, priorityFilter, overdueOnly, query]);
  const { paginatedItems: paginatedTickets, paginationProps } =
    useListPagination(
      filteredTickets,
      `${query}|${statusFilter}|${priorityFilter}|${overdueOnly}`,
    );

  const stats = useMemo(() => {
    const active = tickets.filter(
      (ticket) => !["RESOLVED", "CLOSED", "CANCELED"].includes(ticket.status),
    ).length;
    const critical = tickets.filter(
      (ticket) => ticket.priority === "CRITICAL",
    ).length;
    const overdue = tickets.filter(
      (ticket) => ticket.slaStatus === "OVERDUE",
    ).length;
    const converted = tickets.filter(
      (ticket) => ticket.maintenanceOrder,
    ).length;
    return { active, critical, overdue, converted };
  }, [tickets]);

  const availableGenerators = useMemo(
    () =>
      form.clientId
        ? generators.filter((generator) => generator.clientId === form.clientId)
        : generators,
    [form.clientId, generators],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      await ticketsPost<ServiceTicket>("", {
        ...form,
        generatorId: form.generatorId || undefined,
        contactName: form.contactName || undefined,
        contactPhone: form.contactPhone || undefined,
        contactEmail: form.contactEmail || undefined,
      });
      setForm(INITIAL_FORM);
      setSuccess("Chamado interno criado com SLA calculado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar chamado.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Atendimento / SLA"
        title="Chamados conectados ao cliente, equipamento e operacao."
        description="A fila mostra prioridade, SLA, origem e conversao para OS sem expor informacoes internas no portal do cliente."
        stats={[
          {
            label: "Chamados ativos",
            value: String(stats.active),
            tone: "blue",
          },
          { label: "Criticos", value: String(stats.critical), tone: "rose" },
          { label: "SLA vencido", value: String(stats.overdue), tone: "amber" },
          {
            label: "Convertidos em OS",
            value: String(stats.converted),
            tone: "emerald",
          },
        ]}
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className={SECONDARY_BUTTON}
          >
            Atualizar fila
          </button>
        }
      />

      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {success ? <StatusBanner tone="emerald">{success}</StatusBanner> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <SectionCard
          eyebrow="Fila"
          title="Chamados em atendimento"
          description="Filtre por status, prioridade, SLA e pesquise por cliente, equipamento ou codigo."
          actions={
            <div className="flex flex-wrap gap-2">
              <TextInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar chamado..."
              />
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as "ALL" | TicketStatus)
                }
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status === "ALL"
                      ? "Todos status"
                      : TICKET_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
              <select
                value={priorityFilter}
                onChange={(event) =>
                  setPriorityFilter(
                    event.target.value as "ALL" | TicketPriority,
                  )
                }
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority === "ALL"
                      ? "Todas prioridades"
                      : TICKET_PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={overdueOnly}
                  onChange={(event) => setOverdueOnly(event.target.checked)}
                />
                SLA vencido
              </label>
            </div>
          }
        >
          <div className="space-y-3">
            {loading ? (
              <StatusBanner>Carregando chamados...</StatusBanner>
            ) : null}
            {!loading && filteredTickets.length === 0 ? (
              <FieldBox className="p-5 text-sm font-semibold text-slate-600">
                Nenhum chamado encontrado para os filtros atuais.
              </FieldBox>
            ) : null}
            {!loading && filteredTickets.length > 0 ? (
              <ListPagination {...paginationProps} />
            ) : null}
            {paginatedTickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/dashboard/atendimento/${ticket.id}`}
                className="block rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_16px_36px_-32px_rgba(15,23,42,0.32)] transition hover:border-sky-200 hover:bg-sky-50/40"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <DataPill tone={ticketTone(ticket)}>
                        {ticket.code}
                      </DataPill>
                      <DataPill tone={ticketTone(ticket)}>
                        {TICKET_PRIORITY_LABELS[ticket.priority]}
                      </DataPill>
                      <DataPill tone="slate">
                        {TICKET_STATUS_LABELS[ticket.status]}
                      </DataPill>
                    </div>
                    <h3 className="mt-3 text-base font-bold text-slate-950">
                      {ticket.title}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {ticket.client?.tradeName ||
                        ticket.client?.companyName ||
                        "Cliente"}{" "}
                      {ticket.generator?.name
                        ? `- ${ticket.generator.name}`
                        : ""}
                    </p>
                  </div>
                  <div className="text-sm text-slate-600 md:text-right">
                    <p className="font-bold text-slate-800">
                      SLA: {ticket.slaStatus || "OK"}
                    </p>
                    <p>Resposta: {formatTicketDate(ticket.slaResponseDueAt)}</p>
                    <p>
                      Solucao: {formatTicketDate(ticket.slaResolutionDueAt)}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Novo"
          title="Abrir chamado interno"
          description="Use quando o atendimento chegar por telefone, e-mail, WhatsApp ou time interno."
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Cliente">
              <select
                value={form.clientId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    clientId: event.target.value,
                    generatorId: "",
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                required
              >
                <option value="">Selecione</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.tradeName || client.companyName}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Equipamento">
              <select
                value={form.generatorId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    generatorId: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                <option value="">Nao vincular agora</option>
                {availableGenerators.map((generator) => (
                  <option key={generator.id} value={generator.id}>
                    {generator.name}{" "}
                    {generator.serialNumber
                      ? `- ${generator.serialNumber}`
                      : ""}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Categoria">
              <select
                value={form.category}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    category: event.target.value as TicketCategory,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {TICKET_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Prioridade">
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priority: event.target.value as TicketPriority,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                {(Object.keys(TICKET_PRIORITY_LABELS) as TicketPriority[]).map(
                  (priority) => (
                    <option key={priority} value={priority}>
                      {TICKET_PRIORITY_LABELS[priority]}
                    </option>
                  ),
                )}
              </select>
            </FormField>
            <FormField label="Titulo">
              <TextInput
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                required
              />
            </FormField>
            <FormField label="Descricao">
              <TextAreaInput
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                required
              />
            </FormField>
            <button
              type="submit"
              className={PRIMARY_BUTTON}
              disabled={submitting}
            >
              {submitting ? "Criando..." : "Criar chamado"}
            </button>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}

async function fetchJson<T>(path: string) {
  const response = await apiFetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, "Falha ao carregar dados."),
    );
  }
  return (await response.json()) as T;
}
