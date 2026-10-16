"use client";

import { SelectField } from "@/app/dashboard/components/SelectField";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  type FormEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  canAccessDashboardPath,
  decodeToken,
  getAccessFromToken,
} from "@/lib/access";
import {
  ServiceTicket,
  TicketStatus,
  TicketPriority,
  TicketCategory,
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_CATEGORY_LABELS,
  formatTicketDate,
  ticketsGet,
  ticketsPatch,
  ticketsPost,
} from "@/lib/tickets";
import {
  EDITABLE_TICKET_STATUSES,
  TICKET_ORIGIN_LABELS,
  isTicketActive,
  ticketEventMessage,
  type TicketAssignee,
} from "@/lib/ticket-workspace";
import {
  DataPill,
  PageHeader,
  SectionCard,
} from "../../components/DashboardPageKit";
import {
  OperationalBreadcrumb,
  PermissionAwareLink,
  RelatedEntityGrid,
} from "../../components/OperationalLinks";
import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TicketPriority as PriorityBadge,
  TicketSla,
} from "../TicketShared";
import styles from "../TicketWorkspace.module.css";

type GeneratorOption = {
  id: string;
  name: string;
  serialNumber?: string | null;
  clientId: string;
};
type Properties = {
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  internalNotes: string;
};
const INITIAL_PROPERTIES: Properties = {
  status: "OPEN",
  priority: "MEDIUM",
  category: "CORRECTIVE_MAINTENANCE",
  internalNotes: "",
};
const TABS = [
  { key: "conversation", label: "Conversa" },
  { key: "history", label: "Histórico" },
  { key: "relationships", label: "Relacionamentos" },
] as const;
type Tab = (typeof TABS)[number]["key"];
export default function InternalTicketDetailPage() {
  const { id: ticketId } = useParams<{ id: string }>();
  const [access, setAccess] = useState(getAccessFromToken);
  const [userId, setUserId] = useState("");
  const [ticket, setTicket] = useState<ServiceTicket | null>(null);
  const [generators, setGenerators] = useState<GeneratorOption[]>([]);
  const [assignees, setAssignees] = useState<TicketAssignee[]>([]);
  const [properties, setProperties] = useState<Properties>(INITIAL_PROPERTIES);
  const [assignedId, setAssignedId] = useState("");
  const [convertGeneratorId, setConvertGeneratorId] = useState("");
  const [scheduledTo, setScheduledTo] = useState("");
  const [tab, setTab] = useState<Tab>("conversation");
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [drafts, setDrafts] = useState({ reply: "", note: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [optionsError, setOptionsError] = useState("");
  const [reload, setReload] = useState(0);
  const propertiesDirty =
    !!ticket &&
    (properties.status !== ticket.status ||
      properties.priority !== ticket.priority ||
      properties.category !== ticket.category ||
      properties.internalNotes !== (ticket.internalNotes || ""));
  const assignmentDirty =
    !!ticket && assignedId !== (ticket.assignedToUser?.id || "");
  const dirty =
    propertiesDirty ||
    assignmentDirty ||
    Boolean(drafts.reply.trim() || drafts.note.trim());
  const applyTicket = useCallback(
    (next: ServiceTicket, resetProperties = true, resetAssignment = true) => {
      setTicket(next);
      if (resetProperties)
        setProperties({
          status: next.status,
          priority: next.priority,
          category: next.category,
          internalNotes: next.internalNotes || "",
        });
      if (resetAssignment) setAssignedId(next.assignedToUser?.id || "");
    },
    [],
  );
  useEffect(() => {
    setAccess(getAccessFromToken());
    setUserId(decodeToken()?.sub || "");
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void ticketsGet<ServiceTicket>("/" + ticketId, {
      signal: controller.signal,
    })
      .then((next) => {
        applyTicket(next);
        setConvertGeneratorId(next.generator?.id || "");
        setGenerators((current) =>
          current.length &&
          current.every((generator) => generator.clientId === next.client?.id)
            ? current
            : next.generator
              ? [
                  {
                    id: next.generator.id,
                    name: next.generator.name || "Equipamento do chamado",
                    serialNumber: next.generator.serialNumber,
                    clientId: next.client?.id || "",
                  },
                ]
              : [],
        );
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar o chamado.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [ticketId, reload, applyTicket]);
  useEffect(() => {
    const controller = new AbortController();
    setOptionsError("");
    if (access.tickets.assign)
      void ticketsGet<TicketAssignee[]>("/assignees", {
        signal: controller.signal,
      })
        .then(setAssignees)
        .catch(() => {
          if (!controller.signal.aborted)
            setOptionsError(
              "Não foi possível carregar a lista de responsáveis. Use Atualizar para tentar novamente.",
            );
        });
    if (access.tickets.convertToOrder)
      void ticketsGet<GeneratorOption[]>(
        "/" + ticketId + "/equipment-options",
        { signal: controller.signal },
      )
        .then(setGenerators)
        .catch(() => {
          if (!controller.signal.aborted)
            setOptionsError(
              "Não foi possível carregar os equipamentos disponíveis. Use Atualizar para tentar novamente.",
            );
        });
    return () => controller.abort();
  }, [ticketId, access.tickets.assign, access.tickets.convertToOrder, reload]);
  useEffect(() => {
    if (!dirty) return;
    function preventUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [dirty]);
  function confirmNavigation(event: MouseEvent<HTMLDivElement>) {
    if (
      event.target instanceof Element &&
      event.target.closest("a[href]") &&
      dirty &&
      !window.confirm(
        "Há alterações ou uma mensagem não salva. Deseja sair deste chamado?",
      )
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
  async function runAction(
    action: () => Promise<ServiceTicket>,
    text: string,
    resetProperties = false,
    resetAssignment = false,
  ) {
    if (saving) return false;
    setSaving(true);
    setError("");
    setSuccess("");
    const syncProperties = resetProperties || !propertiesDirty,
      syncAssignment = resetAssignment || !assignmentDirty;
    try {
      const updated = await action();
      applyTicket(updated, syncProperties, syncAssignment);
      setSuccess(text);
      try {
        applyTicket(
          await ticketsGet<ServiceTicket>("/" + ticketId),
          syncProperties,
          syncAssignment,
        );
      } catch {
        setError(
          "A ação foi salva, mas o histórico não pôde ser atualizado. Use Atualizar para conferir.",
        );
      }
      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível concluir a ação.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = drafts[mode].trim();
    if (!message || saving) return;
    const submittedMode = mode;
    if (
      await runAction(
        () =>
          ticketsPost<ServiceTicket>("/" + ticketId + "/comment", {
            message,
            customerVisible: submittedMode === "reply",
          }),
        submittedMode === "reply"
          ? "Resposta registrada na central do cliente."
          : "Nota interna registrada.",
      )
    )
      setDrafts((current) => ({ ...current, [submittedMode]: "" }));
  }
  async function transition(action: "resolve" | "close" | "cancel") {
    const name = { resolve: "resolver", close: "fechar", cancel: "cancelar" }[
      action
    ];
    if (
      !window.confirm(
        "Deseja " +
          name +
          " este chamado? A ação será registrada no histórico.",
      )
    )
      return;
    await runAction(
      () => ticketsPost<ServiceTicket>("/" + ticketId + "/" + action, {}),
      "Ação registrada no chamado.",
      true,
    );
  }
  async function convert() {
    if (!convertGeneratorId || saving) return;
    const success = await runAction(
      () =>
        ticketsPost<ServiceTicket>("/" + ticketId + "/convert-to-order", {
          generatorId: convertGeneratorId,
          scheduledTo: scheduledTo
            ? new Date(scheduledTo).toISOString()
            : undefined,
        }),
      "Chamado convertido em OS.",
      true,
    );
    if (success) setScheduledTo("");
  }
  function refresh() {
    if (
      !dirty ||
      window.confirm("Descartar alterações e recarregar o chamado?")
    ) {
      setDrafts({ reply: "", note: "" });
      setReload((value) => value + 1);
    }
  }
  if ((loading && !ticket) || (ticket && ticket.id !== ticketId))
    return (
      <div className="dashboard-page">
        <p
          role="status"
          className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500"
        >
          Carregando chamado...
        </p>
      </div>
    );
  if (!ticket)
    return (
      <div className="dashboard-page space-y-4">
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"
        >
          {error || "Chamado não encontrado."}
        </div>
        <Link href="/dashboard/atendimento" className={SECONDARY_BUTTON}>
          <span className="sm:hidden">Fila</span>
          <span className="hidden sm:inline">Voltar à fila</span>
        </Link>
      </div>
    );
  const active = isTicketActive(ticket);
  const canComment =
    access.tickets.comment &&
    ![
      "CLOSED",
      "CANCELED",
      "CONVERTING_TO_ORDER",
      "CONVERTED_TO_ORDER",
    ].includes(ticket.status);
  const comments =
    tab === "history"
      ? ticket.comments || []
      : (ticket.comments || []).filter((item) => item.authorType !== "SYSTEM");
  const proposalHref =
    "/dashboard/proposals/new?clientId=" +
    encodeURIComponent(ticket.client?.id || "");
  const canPrepareProposal =
    access.proposals.create &&
    ticket.client?.id &&
    canAccessDashboardPath(proposalHref, access.pages);
  return (
    <div
      className="dashboard-page min-w-0 space-y-5"
      onClickCapture={confirmNavigation}
    >
      <OperationalBreadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Chamados", href: "/dashboard/atendimento" },
          { label: ticket.code },
        ]}
      />
      <PageHeader
        eyebrow={"Atendimento · " + ticket.code}
        title={ticket.title}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <DataPill tone="blue">
              {TICKET_STATUS_LABELS[ticket.status]}
            </DataPill>
            <PriorityBadge ticket={ticket} />
            <TicketSla ticket={ticket} detail={false} />
            <span className="text-xs text-slate-500">
              {TICKET_ORIGIN_LABELS[ticket.origin] || "Origem não informada"} ·
              Aberto em {formatTicketDate(ticket.createdAt)}
            </span>
          </div>
        }
        actions={
          <>
            <Link href="/dashboard/atendimento" className={SECONDARY_BUTTON}>
              <span className="sm:hidden">Fila</span>
              <span className="hidden sm:inline">Voltar à fila</span>
            </Link>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={refresh}
              disabled={saving || loading}
            >
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
            {canPrepareProposal ? (
              <Link className={SECONDARY_BUTTON} href={proposalHref}>
                Nova proposta
              </Link>
            ) : null}
            {ticket.maintenanceOrder && access.orders.view ? (
              <PermissionAwareLink
                href={"/dashboard/orders/" + ticket.maintenanceOrder.id}
                permission="orders.view"
                className={PRIMARY_BUTTON}
              >
                Abrir O.S.
              </PermissionAwareLink>
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
        </div>
      ) : null}
      {success ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {success}
        </div>
      ) : null}
      {optionsError ? (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
        >
          {optionsError}
        </p>
      ) : null}
      <section
        className="rounded-2xl border border-slate-200 bg-white px-5 py-4"
        aria-label="Contexto do atendimento"
      >
        <dl className={styles.contextGrid}>
          <div>
            <dt>Cliente</dt>
            <dd>
              {ticket.client ? (
                <PermissionAwareLink
                  href={"/dashboard/clients/" + ticket.client.id}
                  permission="clients.view"
                  className="font-bold text-blue-700 hover:underline"
                >
                  {ticket.client.tradeName || ticket.client.companyName}
                </PermissionAwareLink>
              ) : (
                "Não informado"
              )}
            </dd>
            <dd className="mt-1 text-xs text-slate-500">
              {[ticket.client?.city, ticket.client?.state]
                .filter(Boolean)
                .join(" · ")}
            </dd>
          </div>
          <div>
            <dt>Equipamento</dt>
            <dd>
              {ticket.generator ? (
                <PermissionAwareLink
                  href={"/dashboard/equipments/" + ticket.generator.id}
                  permission="equipments.view"
                  className="font-bold text-blue-700 hover:underline"
                >
                  {ticket.generator.name || "Equipamento vinculado"}
                </PermissionAwareLink>
              ) : (
                "Sem equipamento vinculado"
              )}
            </dd>
            <dd className="mt-1 text-xs text-slate-500">
              {ticket.generator?.serialNumber
                ? "Série: " + ticket.generator.serialNumber
                : "O equipamento pode ser definido antes de gerar a O.S."}
            </dd>
          </div>
          <div>
            <dt>Contrato de atendimento</dt>
            <dd>
              {ticket.contract ? (
                <PermissionAwareLink
                  href={"/dashboard/contracts/" + ticket.contract.id}
                  permission="contracts.view"
                  className="font-bold text-blue-700 hover:underline"
                >
                  {ticket.contract.code}
                </PermissionAwareLink>
              ) : (
                "Sem contrato vinculado"
              )}
            </dd>
            <dd className="mt-1 text-xs text-slate-500">
              {ticket.contract?.responseTimeHours
                ? "Prazo de resposta contratual: " +
                  ticket.contract.responseTimeHours +
                  "h"
                : "Prazos definidos pela prioridade do chamado."}
            </dd>
          </div>
        </dl>
      </section>
      <div className={styles.detailGrid}>
        <section
          aria-label="Conversa e acompanhamento"
          className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5"
        >
          <h2 className="sr-only">Conversa e acompanhamento</h2>
          <div
            role="tablist"
            aria-label="Conteúdo do chamado"
            className={styles.tabs}
          >
            {TABS.map((item, index) => (
              <button
                key={item.key}
                id={"ticket-tab-" + item.key}
                aria-controls={"ticket-panel-" + item.key}
                role="tab"
                type="button"
                aria-selected={tab === item.key}
                tabIndex={tab === item.key ? 0 : -1}
                className={styles.tab}
                onClick={() => setTab(item.key)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft")
                    return;
                  event.preventDefault();
                  const next =
                    TABS[
                      (index +
                        (event.key === "ArrowRight" ? 1 : TABS.length - 1)) %
                        TABS.length
                    ];
                  setTab(next.key);
                  document.getElementById("ticket-tab-" + next.key)?.focus();
                }}
              >
                {item.label}
                {item.key === "conversation" &&
                ticket.comments?.filter(
                  (comment) => comment.authorType !== "SYSTEM",
                ).length
                  ? " (" +
                    ticket.comments.filter(
                      (comment) => comment.authorType !== "SYSTEM",
                    ).length +
                    ")"
                  : ""}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={"ticket-panel-" + tab}
            aria-labelledby={"ticket-tab-" + tab}
            tabIndex={0}
          >
            {tab === "relationships" ? (
              <div>
                <h3 className="mb-4 text-base font-bold text-slate-900">
                  Relacionamentos do chamado
                </h3>
                <RelatedEntityGrid
                  items={[
                    ...(ticket.client
                      ? [
                          {
                            label:
                              ticket.client.tradeName ||
                              ticket.client.companyName,
                            description: "Cliente solicitante.",
                            href: "/dashboard/clients/" + ticket.client.id,
                            badge: "Cliente",
                            tone: "blue" as const,
                            permission: "clients.view",
                          },
                        ]
                      : []),
                    ...(ticket.generator
                      ? [
                          {
                            label: ticket.generator.name || "Equipamento",
                            description:
                              ticket.generator.serialNumber ||
                              "Equipamento do atendimento.",
                            href:
                              "/dashboard/equipments/" + ticket.generator.id,
                            badge: "Equipamento",
                            tone: "blue" as const,
                            permission: "equipments.view",
                          },
                        ]
                      : []),
                    ...(ticket.contract
                      ? [
                          {
                            label: ticket.contract.code,
                            description:
                              "Contrato de cobertura do atendimento.",
                            href: "/dashboard/contracts/" + ticket.contract.id,
                            badge: "Contrato",
                            tone: "emerald" as const,
                            permission: "contracts.view",
                          },
                        ]
                      : []),
                    ...(ticket.maintenanceOrder
                      ? [
                          {
                            label: ticket.maintenanceOrder.title,
                            description:
                              "Ordem de serviço gerada por este chamado.",
                            href:
                              "/dashboard/orders/" + ticket.maintenanceOrder.id,
                            badge: "O.S.",
                            tone: "amber" as const,
                            permission: "orders.view",
                          },
                        ]
                      : []),
                  ]}
                />
              </div>
            ) : (
              <>
                <article className={styles.message} data-kind="customer">
                  <div className={styles.messageHead}>
                    <strong>Descrição da solicitação</strong>
                    <time dateTime={ticket.createdAt}>
                      {formatTicketDate(ticket.createdAt)}
                    </time>
                  </div>
                  <p>{ticket.description}</p>
                  <span className={styles.secondary}>
                    Registrado por{" "}
                    {ticket.openedByUser?.name ||
                      ticket.contactName ||
                      "Equipe Manitec"}
                  </span>
                </article>
                {tab === "conversation" && canComment ? (
                  <form
                    className={styles.composer}
                    data-mode={mode}
                    onSubmit={(event) => void submitMessage(event)}
                    aria-label="Responder chamado"
                  >
                    <div className={styles.composerHead}>
                      <button
                        type="button"
                        aria-pressed={mode === "reply"}
                        onClick={() => setMode("reply")}
                        disabled={saving}
                      >
                        Resposta ao cliente
                      </button>
                      <button
                        type="button"
                        aria-pressed={mode === "note"}
                        onClick={() => setMode("note")}
                        disabled={saving}
                      >
                        Nota interna
                      </button>
                    </div>
                    <label className="sr-only" htmlFor="ticket-message">
                      {mode === "reply"
                        ? "Resposta ao cliente"
                        : "Nota interna"}
                    </label>
                    <textarea
                      id="ticket-message"
                      value={drafts[mode]}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [mode]: event.target.value,
                        }))
                      }
                      placeholder={
                        mode === "reply"
                          ? "Escreva uma resposta clara para o cliente..."
                          : "Registre uma observação para a equipe Manitec..."
                      }
                      required
                      maxLength={10000}
                      disabled={saving}
                    />
                    <div className={styles.composerFooter}>
                      <p className="max-w-sm text-xs leading-5 text-slate-500">
                        {mode === "reply"
                          ? "Esta resposta fica visível na central do cliente."
                          : "Somente a equipe Manitec pode ver esta nota."}
                      </p>
                      <button
                        type="submit"
                        className={
                          mode === "reply" ? PRIMARY_BUTTON : SECONDARY_BUTTON
                        }
                        disabled={saving || !drafts[mode].trim()}
                      >
                        {saving
                          ? "Salvando..."
                          : mode === "reply"
                            ? "Enviar resposta"
                            : "Salvar nota interna"}
                      </button>
                    </div>
                  </form>
                ) : null}
                {tab === "conversation" && !canComment ? (
                  <p className="my-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    {!access.tickets.comment
                      ? "Seu perfil permite consultar as interações deste chamado."
                      : ticket.maintenanceOrder
                        ? "O atendimento continua na ordem de serviço vinculada."
                        : "Este chamado está finalizado e não recebe novas mensagens."}
                  </p>
                ) : null}
                <div className="mb-4 mt-7 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-slate-800">
                    {tab === "history"
                      ? "Histórico do atendimento"
                      : "Interações registradas"}
                  </h3>
                  <span className="text-xs text-slate-400">
                    Da primeira à mais recente
                  </span>
                </div>
                <div className={styles.thread}>
                  {comments.map((item) => (
                    <article
                      key={item.id}
                      className={styles.message}
                      data-kind={
                        item.authorType === "SYSTEM"
                          ? "system"
                          : !item.customerVisible
                            ? "note"
                            : item.authorType === "CUSTOMER"
                              ? "customer"
                              : "reply"
                      }
                    >
                      <div className={styles.messageHead}>
                        <div className="flex flex-wrap items-center gap-2">
                          <strong>
                            {item.authorUser?.name ||
                              (item.authorType === "CUSTOMER"
                                ? "Cliente"
                                : item.authorType === "SYSTEM"
                                  ? "Sistema"
                                  : "Equipe Manitec")}
                          </strong>
                          <DataPill
                            tone={
                              item.authorType === "SYSTEM"
                                ? "slate"
                                : !item.customerVisible
                                  ? "amber"
                                  : "blue"
                            }
                          >
                            {item.authorType === "SYSTEM"
                              ? "Evento do sistema"
                              : !item.customerVisible
                                ? "Nota interna"
                                : item.authorType === "CUSTOMER"
                                  ? "Mensagem do cliente"
                                  : "Resposta ao cliente"}
                          </DataPill>
                        </div>
                        <time dateTime={item.createdAt}>
                          {formatTicketDate(item.createdAt)}
                        </time>
                      </div>
                      <p>
                        {item.authorType === "SYSTEM"
                          ? ticketEventMessage(item.message)
                          : item.message}
                      </p>
                    </article>
                  ))}
                </div>
                {!comments.length ? (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                    {tab === "history"
                      ? "Nenhum evento registrado."
                      : "A conversa ainda não tem mensagens."}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </section>
        <aside className={styles.detailAside} aria-label="Gestão do chamado">
          <SectionCard
            title="Responsável"
            description="Quem acompanha este atendimento."
          >
            {access.tickets.assign && active ? (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction(
                    () =>
                      ticketsPost<ServiceTicket>("/" + ticketId + "/assign", {
                        assignedToUserId: assignedId || null,
                      }),
                    "Responsável atualizado.",
                    false,
                    true,
                  );
                }}
              >
                <label className={styles.field}>
                  Atribuído a
                  <SelectField searchable
                    value={assignedId}
                    onChange={(event) => setAssignedId(event.target.value)}
                    disabled={saving}
                  >
                    <option value="">Sem responsável</option>
                    {ticket.assignedToUser &&
                    !assignees.some(
                      (user) => user.id === ticket.assignedToUser?.id,
                    ) ? (
                      <option value={ticket.assignedToUser.id}>
                        {ticket.assignedToUser.name}
                      </option>
                    ) : null}
                    {assignees.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </SelectField>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    className={PRIMARY_BUTTON}
                    disabled={saving || !assignmentDirty}
                  >
                    Salvar responsável
                  </button>
                  {assignees.some((user) => user.id === userId) &&
                  assignedId !== userId ? (
                    <button
                      type="button"
                      className={SECONDARY_BUTTON}
                      disabled={saving}
                      onClick={() =>
                        void runAction(
                          () =>
                            ticketsPost<ServiceTicket>(
                              "/" + ticketId + "/assign",
                              { assignedToUserId: userId },
                            ),
                          "Você assumiu este chamado.",
                          false,
                          true,
                        )
                      }
                    >
                      Assumir chamado
                    </button>
                  ) : null}
                </div>
              </form>
            ) : (
              <p className="text-sm font-semibold text-slate-800">
                {ticket.assignedToUser?.name || "Sem responsável definido"}
              </p>
            )}
            {ticket.technician?.user?.name ? (
              <p className="mt-3 text-xs text-slate-500">
                Técnico: <strong>{ticket.technician.user.name}</strong>
              </p>
            ) : null}
          </SectionCard>
          <SectionCard
            title="Classificação"
            description="Status, prioridade e tipo do pedido."
          >
            {access.tickets.update && active ? (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction(
                    () =>
                      ticketsPatch<ServiceTicket>("/" + ticketId, properties),
                    "Classificação salva.",
                    true,
                  );
                }}
              >
                <label className={styles.field}>
                  Status
                  <SelectField
                    value={properties.status}
                    onChange={(event) =>
                      setProperties((current) => ({
                        ...current,
                        status: event.target.value as TicketStatus,
                      }))
                    }
                    disabled={saving}
                  >
                    {EDITABLE_TICKET_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {TICKET_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </SelectField>
                </label>
                <label className={styles.field}>
                  Prioridade
                  <SelectField
                    value={properties.priority}
                    onChange={(event) =>
                      setProperties((current) => ({
                        ...current,
                        priority: event.target.value as TicketPriority,
                      }))
                    }
                    disabled={saving}
                  >
                    {Object.entries(TICKET_PRIORITY_LABELS).map(
                      ([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ),
                    )}
                  </SelectField>
                </label>
                <label className={styles.field}>
                  Tipo de solicitação
                  <SelectField
                    value={properties.category}
                    onChange={(event) =>
                      setProperties((current) => ({
                        ...current,
                        category: event.target.value as TicketCategory,
                      }))
                    }
                    disabled={saving}
                  >
                    {Object.entries(TICKET_CATEGORY_LABELS).map(
                      ([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ),
                    )}
                  </SelectField>
                </label>
                <details>
                  <summary className="cursor-pointer text-xs font-semibold text-slate-500">
                    Orientações fixas da equipe
                  </summary>
                  <label className={styles.field + " mt-3"}>
                    Orientações internas
                    <textarea
                      rows={3}
                      value={properties.internalNotes}
                      onChange={(event) =>
                        setProperties((current) => ({
                          ...current,
                          internalNotes: event.target.value,
                        }))
                      }
                      disabled={saving}
                      maxLength={10000}
                    />
                    <span className="text-xs font-normal">
                      Não aparecem na central do cliente.
                    </span>
                  </label>
                </details>
                {propertiesDirty ? (
                  <p className="text-xs font-semibold text-amber-700">
                    Alterações não salvas
                  </p>
                ) : null}
                <button
                  type="submit"
                  className={PRIMARY_BUTTON}
                  disabled={saving || !propertiesDirty}
                >
                  Salvar classificação
                </button>
              </form>
            ) : (
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Status</dt>
                  <dd className="mt-1 font-semibold">
                    {TICKET_STATUS_LABELS[ticket.status]}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Prioridade</dt>
                  <dd className="mt-1 font-semibold">
                    {TICKET_PRIORITY_LABELS[ticket.priority]}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Tipo</dt>
                  <dd className="mt-1 font-semibold">
                    {TICKET_CATEGORY_LABELS[ticket.category]}
                  </dd>
                </div>
                {ticket.internalNotes ? (
                  <div>
                    <dt className="text-xs text-slate-500">
                      Orientações internas
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap">
                      {ticket.internalNotes}
                    </dd>
                  </div>
                ) : null}
              </dl>
            )}
          </SectionCard>
          <SectionCard title="Prazos do atendimento" eyebrow="SLA">
            <div className="space-y-4">
              <TicketSla ticket={ticket} />
              <dl className="space-y-3 text-xs">
                <div>
                  <dt className="text-slate-500">Primeira resposta</dt>
                  <dd className="mt-1 font-semibold text-slate-800">
                    {ticket.firstResponseAt
                      ? "Atendido em " +
                        formatTicketDate(ticket.firstResponseAt)
                      : formatTicketDate(ticket.slaResponseDueAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Prazo de solução</dt>
                  <dd className="mt-1 font-semibold text-slate-800">
                    {formatTicketDate(ticket.slaResolutionDueAt)}
                  </dd>
                </div>
              </dl>
            </div>
          </SectionCard>
          <SectionCard title="Solicitante e contato">
            <dl className="space-y-3 text-sm">
              {[
                ["Contato", ticket.contactName || ticket.client?.contactName],
                ["Telefone", ticket.contactPhone || ticket.client?.phone],
                ["E-mail", ticket.contactEmail || ticket.client?.email],
                ["Endereço", ticket.client?.address],
                ["CNPJ / CPF", ticket.client?.cnpj],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="mt-1 break-words font-medium text-slate-800">
                    {value || "Não informado"}
                  </dd>
                </div>
              ))}
            </dl>
          </SectionCard>
          {access.tickets.convertToOrder ? (
            <SectionCard
              title="Converter em OS"
              description="Encaminhe a execução para a equipe de operação."
            >
              {ticket.maintenanceOrder ? (
                <div className="space-y-3">
                  <p className="text-sm text-emerald-800">
                    Chamado já convertido para {ticket.maintenanceOrder.title}.
                  </p>
                  <PermissionAwareLink
                    href={"/dashboard/orders/" + ticket.maintenanceOrder.id}
                    permission="orders.view"
                    className={SECONDARY_BUTTON}
                  >
                    Ver ordem de serviço
                  </PermissionAwareLink>
                  <button type="button" className={PRIMARY_BUTTON} disabled>
                    Converter para OS
                  </button>
                </div>
              ) : active ? (
                <div className="space-y-4">
                  <label className={styles.field}>
                    Equipamento da OS
                    <SelectField searchable
                      value={convertGeneratorId}
                      onChange={(event) =>
                        setConvertGeneratorId(event.target.value)
                      }
                      disabled={saving}
                    >
                      <option value="">Selecione o equipamento</option>
                      {generators.map((generator) => (
                        <option key={generator.id} value={generator.id}>
                          {generator.name}
                          {generator.serialNumber
                            ? " · " + generator.serialNumber
                            : ""}
                        </option>
                      ))}
                    </SelectField>
                  </label>
                  <label className={styles.field}>
                    Agendamento
                    <input
                      type="datetime-local"
                      value={scheduledTo}
                      onChange={(event) => setScheduledTo(event.target.value)}
                      disabled={saving}
                    />
                    <span className="text-xs font-normal text-slate-500">
                      Opcional. Também pode ser definido na programação.
                    </span>
                  </label>
                  <button
                    type="button"
                    className={PRIMARY_BUTTON}
                    onClick={() => void convert()}
                    disabled={saving || !convertGeneratorId}
                  >
                    Converter para OS
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Este chamado está finalizado e não pode gerar uma nova ordem.
                </p>
              )}
            </SectionCard>
          ) : null}
          {(access.tickets.resolve ||
            access.tickets.close ||
            access.tickets.cancel) &&
          ticket.status !== "CLOSED" &&
          ticket.status !== "CANCELED" ? (
            <SectionCard
              title="Conclusão do chamado"
              description="As ações ficam registradas no histórico."
            >
              <div className="flex flex-wrap gap-2">
                {access.tickets.resolve && active ? (
                  <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    disabled={saving}
                    onClick={() => void transition("resolve")}
                  >
                    Resolver
                  </button>
                ) : null}
                {access.tickets.close &&
                ticket.status !== "CONVERTING_TO_ORDER" ? (
                  <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    disabled={saving}
                    onClick={() => void transition("close")}
                  >
                    Fechar
                  </button>
                ) : null}
                {access.tickets.cancel && active && !ticket.maintenanceOrder ? (
                  <button
                    type="button"
                    className="min-h-10 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    disabled={saving}
                    onClick={() => void transition("cancel")}
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>
            </SectionCard>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
