"use client";

import { SelectField } from "@/app/dashboard/components/SelectField";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAccessFromToken } from "@/lib/access";
import {
  ticketsGet,
  type ServiceTicket,
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_CATEGORY_LABELS,
  formatTicketDate,
} from "@/lib/tickets";
import {
  csvCell,
  TICKET_BUCKET_LABELS,
  TICKET_ORIGIN_LABELS,
  type TicketBucket,
  type TicketColumnKey,
  type TicketAssignee,
  type TicketWorkspace,
} from "@/lib/ticket-workspace";
import {
  DataPill,
  PageHeader,
  SectionCard,
} from "../components/DashboardPageKit";
import ListPagination from "../components/ListPagination";
import NewTicketForm from "./NewTicketForm";
import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TicketCard,
  TicketPriority,
  TicketSla,
} from "./TicketShared";
import styles from "./TicketWorkspace.module.css";

const INITIAL_FILTERS = {
  search: "",
  status: "",
  priority: "",
  category: "",
  origin: "",
  assignedToUserId: "",
  sort: "urgency",
  bucket: "ACTIVE" as TicketBucket,
};
const METRICS: TicketBucket[] = [
  "ACTIVE",
  "NEW",
  "UNASSIGNED",
  "WAITING",
  "OVERDUE",
  "DUE_SOON",
];
export default function InternalTicketsPage() {
  const [access, setAccess] = useState(getAccessFromToken);
  const [ready, setReady] = useState(false);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "board">("list");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<TicketWorkspace | null>(null);
  const [assignees, setAssignees] = useState<TicketAssignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [directoryError, setDirectoryError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [initialClientId, setInitialClientId] = useState("");
  const [initialGeneratorId,setInitialGeneratorId] = useState("");
  const [created, setCreated] = useState<ServiceTicket | null>(null);
  const [moreColumn, setMoreColumn] = useState<TicketColumnKey | null>(null);
  const [exporting, setExporting] = useState(false);
  const generation = useRef(0);
  const exportController = useRef<AbortController | null>(null);

  useEffect(() => {
    setAccess(getAccessFromToken());
    const params = new URLSearchParams(window.location.search);
    setSearch(params.get("q") || "");
    const clientId = params.get("clientId") || "";
    setInitialClientId(clientId);
    setInitialGeneratorId(params.get("generatorId") || "");
    setShowCreate(
      Boolean(clientId) || window.location.hash === "#novo-chamado",
    );
    const saved = localStorage.getItem("gridone-ticket-view");
    if (saved === "board" || saved === "list") setView(saved);
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem("gridone-ticket-view", view);
  }, [ready, view]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      setFilters((current) => ({ ...current, search: search.trim() }));
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [ready, search]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    void ticketsGet<TicketAssignee[]>("/assignees", {
      signal: controller.signal,
    })
      .then((rows) => {
        setAssignees(rows);
        setDirectoryError("");
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setDirectoryError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar os responsáveis.",
          );
      });
    return () => controller.abort();
  }, [ready, refresh]);
  const filterParams = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters))
      if (value) params.set(key, value);
    return params.toString();
  }, [filters]);
  const requestParams = useMemo(() => {
    const params = new URLSearchParams(filterParams);
    params.set("page", String(view === "board" ? 1 : page));
    params.set("pageSize", String(view === "board" ? 20 : pageSize));
    params.set("view", view);
    return params.toString();
  }, [filterParams, page, pageSize, view]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    generation.current += 1;
    setMoreColumn(null);
    setLoading(true);
    setError("");
    void ticketsGet<TicketWorkspace>("/workspace?" + requestParams, {
      signal: controller.signal,
    })
      .then((result) => {
        setData(result);
        if (
          view === "list" &&
          page > 1 &&
          page > Math.max(1, Math.ceil(result.total / pageSize))
        )
          setPage(Math.max(1, Math.ceil(result.total / pageSize)));
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar a fila.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      generation.current += 1;
    };
  }, [ready, requestParams, refresh, view, page, pageSize]);
  useEffect(
    () => () => {
      exportController.current?.abort();
    },
    [],
  );

  function filter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "status" && value ? { bucket: "ALL" as TicketBucket } : {}),
    }));
    setPage(1);
  }
  function chooseBucket(bucket: TicketBucket) {
    setSearch("");
    setFilters({ ...INITIAL_FILTERS, bucket });
    setPage(1);
  }
  function closeCreate() {
    setShowCreate(false);
    setInitialClientId("");
    setInitialGeneratorId("");
    const url = new URL(window.location.href);
    url.searchParams.delete("clientId");
    url.searchParams.delete("generatorId");
    url.hash = "";
    window.history.replaceState(null, "", url.pathname + url.search);
  }
  async function loadMore(key: TicketColumnKey) {
    const column = data?.columns.find((item) => item.key === key);
    if (!column || moreColumn) return;
    const version = generation.current;
    setMoreColumn(key);
    setError("");
    const params = new URLSearchParams(filterParams);
    params.set("column", key);
    params.set("page", String(column.page + 1));
    params.set("pageSize", "20");
    try {
      const result = await ticketsGet<TicketWorkspace>("/workspace?" + params);
      if (version !== generation.current) return;
      setData((current) =>
        current
          ? {
              ...current,
              columns: current.columns.map((item) =>
                item.key === key
                  ? {
                      ...item,
                      total: result.total,
                      page: result.page,
                      hasMore: result.page * result.pageSize < result.total,
                      items: Array.from(
                        new Map(
                          [...item.items, ...result.items].map((ticket) => [
                            ticket.id,
                            ticket,
                          ]),
                        ).values(),
                      ),
                    }
                  : item,
              ),
            }
          : current,
      );
    } catch (err) {
      if (version === generation.current)
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar mais chamados.",
        );
    } finally {
      if (version === generation.current) setMoreColumn(null);
    }
  }
  async function exportCsv() {
    if (exporting) return;
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(true);
    setError("");
    try {
      const params = new URLSearchParams(filterParams);
      params.set("pageSize", "100");
      params.set("sort", "newest");
      params.set("to", new Date().toISOString());
      const rows: ServiceTicket[] = [];
      let exportPage = 1;
      let total = 1;
      while (rows.length < total) {
        params.set("page", String(exportPage++));
        const result = await ticketsGet<TicketWorkspace>(
          "/workspace?" + params,
          { signal: controller.signal },
        );
        total = result.total;
        if (!result.items.length && rows.length < total)
          throw new Error(
            "A fila mudou durante a exportação. Tente novamente.",
          );
        rows.push(...result.items);
      }
      const columns = [
        "Código",
        "Título",
        "Cliente",
        "Equipamento",
        "Responsável",
        "Status",
        "Prioridade",
        "Origem",
        "Criado em",
        "Atualizado em",
        "Prazo de resposta",
        "Prazo de solução",
      ];
      const lines = [
        columns,
        ...rows.map((ticket) => [
          ticket.code,
          ticket.title,
          ticket.client?.tradeName || ticket.client?.companyName,
          ticket.generator?.name,
          ticket.assignedToUser?.name || ticket.technician?.user?.name,
          TICKET_STATUS_LABELS[ticket.status],
          TICKET_PRIORITY_LABELS[ticket.priority],
          TICKET_ORIGIN_LABELS[ticket.origin] || "Não informada",
          formatTicketDate(ticket.createdAt),
          formatTicketDate(ticket.updatedAt),
          formatTicketDate(ticket.slaResponseDueAt),
          formatTicketDate(ticket.slaResolutionDueAt),
        ]),
      ];
      const blob = new Blob(
        [
          "\uFEFF" +
            lines.map((line) => line.map(csvCell).join(";")).join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      );
      const href = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = href;
      link.download =
        "chamados-" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (err) {
      if (!controller.signal.aborted)
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível exportar os chamados.",
        );
    } finally {
      if (!controller.signal.aborted) setExporting(false);
    }
  }
  const activeFilterCount = [
    filters.status,
    filters.priority,
    filters.category,
    filters.origin,
    filters.assignedToUserId,
  ].filter(Boolean).length;
  const hasFilters =
    search !== "" ||
    Object.entries(filters).some(
      ([key, value]) =>
        value !== INITIAL_FILTERS[key as keyof typeof INITIAL_FILTERS],
    );
  return (
    <div className="dashboard-page min-w-0 space-y-5">
      <PageHeader
        eyebrow="Operação · Central de atendimento"
        title="Chamados e atendimento"
        description="Organize os atendimentos por responsável, prioridade e prazo."
        actions={
          <>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={loading}
              onClick={() => setRefresh((value) => value + 1)}
            >
              {loading ? "Atualizando..." : "Atualizar fila"}
            </button>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={exporting || loading || !data?.total}
              onClick={() => void exportCsv()}
            >
              {exporting ? "Exportando..." : "Exportar CSV"}
            </button>
            {access.tickets.create ? (
              <button
                type="button"
                className={PRIMARY_BUTTON}
                onClick={() => {
                  setShowCreate(true);
                  requestAnimationFrame(() =>
                    document
                      .getElementById("novo-chamado")
                      ?.scrollIntoView({ block: "start" }),
                  );
                }}
              >
                + Novo chamado
              </button>
            ) : null}
          </>
        }
      />
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          {error}
          <button
            className="ml-3 font-bold underline"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Tentar novamente
          </button>
        </div>
      ) : null}
      {created ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          <span>
            Chamado {created.code} criado com os prazos de atendimento
            calculados.
          </span>
          <Link
            className="font-bold underline"
            href={"/dashboard/atendimento/" + created.id}
          >
            Abrir chamado criado
          </Link>
        </div>
      ) : null}
      {showCreate && access.tickets.create ? (
        <div id="novo-chamado" className="scroll-mt-6">
          <NewTicketForm
            initialClientId={initialClientId}
            initialGeneratorId={initialGeneratorId}
            assignees={assignees}
            canAssign={access.tickets.assign}
            onClose={closeCreate}
            onCreated={(ticket) => {
              setCreated(ticket);
              closeCreate();
              setRefresh((value) => value + 1);
            }}
          />
        </div>
      ) : null}
      <section aria-label="Visão geral dos chamados" className={styles.metrics}>
        {METRICS.map((key) => (
          <button
            type="button"
            key={key}
            className={styles.metric}
            aria-pressed={filters.bucket === key}
            data-tone={
              key === "OVERDUE" ? "rose" : key === "DUE_SOON" ? "amber" : "blue"
            }
            onClick={() => chooseBucket(key)}
          >
            <span>{TICKET_BUCKET_LABELS[key]}</span>
            <strong>{!data ? "—" : (data.summary[key] ?? 0)}</strong>
          </button>
        ))}
      </section>
      <SectionCard
        eyebrow="Fila de atendimento"
        title={TICKET_BUCKET_LABELS[filters.bucket]}
        description="Use a busca e os filtros para encontrar o atendimento."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={SECONDARY_BUTTON}
              aria-pressed={filters.bucket === "MINE"}
              onClick={() => chooseBucket("MINE")}
            >
              Meus chamados
            </button>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={!hasFilters}
              onClick={() => chooseBucket("ACTIVE")}
            >
              Limpar filtros
            </button>
          </div>
        }
      >
        <div className="min-w-0 space-y-4">
          <div className={styles.toolbar}>
            <label className={styles.field + " " + styles.search}>
              <span className="sr-only">Buscar chamado</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por código, assunto, cliente, equipamento ou responsável..."
              />
            </label>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              aria-expanded={showFilters}
              aria-controls="ticket-filters"
              onClick={() => setShowFilters((value) => !value)}
            >
              Filtros{activeFilterCount ? " (" + activeFilterCount + ")" : ""}
            </button>
            <div
              className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1"
              role="group"
              aria-label="Visualização dos chamados"
            >
              {(["list", "board"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={view === mode}
                  onClick={() => {
                    setView(mode);
                    setPage(1);
                  }}
                  className={
                    "rounded-lg px-4 py-2 text-sm font-bold " +
                    (view === mode
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-800")
                  }
                >
                  {mode === "list" ? "Lista" : "Quadro"}
                </button>
              ))}
            </div>
          </div>
          <div
            id="ticket-filters"
            className={styles.filters}
            hidden={!showFilters}
          >
            <label className={styles.field}>
              Status
              <SelectField
                value={filters.status}
                onChange={(event) => filter("status", event.target.value)}
              >
                <option value="">Todos os status</option>
                {Object.entries(TICKET_STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </SelectField>
            </label>
            <label className={styles.field}>
              Prioridade
              <SelectField
                value={filters.priority}
                onChange={(event) => filter("priority", event.target.value)}
              >
                <option value="">Todas as prioridades</option>
                {Object.entries(TICKET_PRIORITY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </SelectField>
            </label>
            <label className={styles.field}>
              Tipo de solicitação
              <SelectField
                value={filters.category}
                onChange={(event) => filter("category", event.target.value)}
              >
                <option value="">Todos os tipos</option>
                {Object.entries(TICKET_CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </SelectField>
            </label>
            <label className={styles.field}>
              Responsável
              <SelectField searchable
                value={filters.assignedToUserId}
                onChange={(event) =>
                  filter("assignedToUserId", event.target.value)
                }
              >
                <option value="">Todos os responsáveis</option>
                {assignees.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </SelectField>
            </label>
            <label className={styles.field}>
              Origem
              <SelectField
                value={filters.origin}
                onChange={(event) => filter("origin", event.target.value)}
              >
                <option value="">Todas as origens</option>
                {Object.entries(TICKET_ORIGIN_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </SelectField>
            </label>
            <label className={styles.field}>
              Ordenar por
              <SelectField
                value={filters.sort}
                onChange={(event) => filter("sort", event.target.value)}
              >
                <option value="urgency">Prioridade e prazo</option>
                <option value="updated">Última atualização</option>
                <option value="newest">Mais recentes</option>
                <option value="oldest">Mais antigos</option>
              </SelectField>
            </label>
          </div>
          {directoryError ? (
            <p role="status" className="text-xs text-amber-800">
              Não foi possível carregar a lista de responsáveis. Os demais
              filtros continuam disponíveis.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
            <span className="text-sm font-semibold text-slate-700">
              {loading
                ? "Carregando fila..."
                : String(data?.total ?? 0) + " chamado(s) encontrado(s)"}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => filter("bucket", "ALL")}
                className={
                  "rounded-lg border px-3 py-1.5 text-xs font-bold " +
                  (filters.bucket === "ALL"
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-200 text-slate-500")
                }
              >
                Incluir finalizados
              </button>
              <DataPill tone="slate">
                {view === "board" ? "Quadro por etapa" : "Lista de atendimento"}
              </DataPill>
            </div>
          </div>
          <div
            aria-busy={loading}
            className={loading ? "pointer-events-none opacity-50" : ""}
          >
            {!loading && !error && data?.total === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                <p className="font-bold text-slate-800">
                  Nenhum chamado nesta fila
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Ajuste os filtros ou registre um novo atendimento.
                </p>
              </div>
            ) : null}
            {!error && view === "list" && !!data?.items.length ? (
              <>
                <div
                  className={styles.tableRegion}
                  role="region"
                  aria-label="Lista de chamados. Role horizontalmente para ver todas as informações."
                  tabIndex={0}
                >
                  <table
                    className={styles.table}
                    data-pagination-skip="true"
                    data-sort-skip="true"
                  >
                    <thead>
                      <tr>
                        <th>Chamado</th>
                        <th>Assunto e cliente</th>
                        <th>Responsável</th>
                        <th>Status e prioridade</th>
                        <th>Última atualização</th>
                        <th>Prazo de atendimento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((ticket) => (
                        <tr key={ticket.id}>
                          <td>
                            <Link
                              className="whitespace-nowrap font-bold"
                              href={"/dashboard/atendimento/" + ticket.id}
                            >
                              {ticket.code}
                            </Link>
                            <span className={styles.secondary}>
                              {TICKET_ORIGIN_LABELS[ticket.origin] ||
                                "Não informada"}
                            </span>
                          </td>
                          <td>
                            <Link
                              className={styles.ticketTitle}
                              href={"/dashboard/atendimento/" + ticket.id}
                            >
                              {ticket.title}
                            </Link>
                            <span className={styles.secondary}>
                              {ticket.client?.tradeName ||
                                ticket.client?.companyName}
                            </span>
                            {ticket.generator?.name ? (
                              <span className={styles.secondary}>
                                {ticket.generator.name}
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <span className="font-semibold">
                              {ticket.assignedToUser?.name ||
                                ticket.technician?.user?.name ||
                                "Sem responsável"}
                            </span>
                            {ticket.maintenanceOrder ? (
                              <span className={styles.secondary}>
                                O.S. vinculada
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <div className="flex flex-col items-start gap-2">
                              <DataPill tone="slate">
                                {TICKET_STATUS_LABELS[ticket.status]}
                              </DataPill>
                              <TicketPriority ticket={ticket} />
                            </div>
                          </td>
                          <td>
                            <span className="whitespace-nowrap">
                              {formatTicketDate(ticket.updatedAt)}
                            </span>
                            <span className={styles.secondary}>
                              Criado: {formatTicketDate(ticket.createdAt)}
                            </span>
                          </td>
                          <td>
                            <TicketSla ticket={ticket} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={styles.mobileList}>
                  {data.items.map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} />
                  ))}
                </div>
              </>
            ) : null}
            {!error &&
            view === "board" &&
            data &&
            data.total > 0 &&
            data.columns.length ? (
              <div
                className={styles.boardRegion}
                role="region"
                aria-label="Quadro de chamados por etapa. Role horizontalmente para ver todas as etapas."
                tabIndex={0}
              >
                <div className={styles.board}>
                  {data.columns.map((column) => (
                    <section
                      key={column.key}
                      className={styles.column}
                      data-stage={column.key}
                      aria-label={column.label}
                    >
                      <header className={styles.columnHeader}>
                        <span>
                          <i aria-hidden="true" />
                          {column.label}
                        </span>
                        <b>{column.total}</b>
                      </header>
                      <div className={styles.columnBody}>
                        {column.items.map((ticket) => (
                          <TicketCard key={ticket.id} ticket={ticket} />
                        ))}
                        {!column.total ? (
                          <p className="px-2 py-8 text-center text-xs text-slate-400">
                            Sem chamados nesta etapa.
                          </p>
                        ) : null}
                        {column.hasMore ? (
                          <button
                            type="button"
                            className={SECONDARY_BUTTON}
                            disabled={!!moreColumn}
                            onClick={() => void loadMore(column.key)}
                            aria-label={"Carregar mais de " + column.label}
                          >
                            {moreColumn === column.key
                              ? "Carregando..."
                              : "Carregar mais (" +
                                (column.total - column.items.length) +
                                ")"}
                          </button>
                        ) : null}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {view === "list" && data && data.total > 0 ? (
            <ListPagination
              totalItems={data.total}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(value) => {
                setPageSize(value);
                setPage(1);
              }}
            />
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
