"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import {
  ServiceTicket,
  TicketPriority,
  TicketStatus,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  formatTicketDate,
  ticketTone,
  ticketsGet,
  ticketsPatch,
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
} from "../../components/DashboardPageKit";

type GeneratorOption = {
  id: string;
  name: string;
  serialNumber?: string | null;
  clientId: string;
};

const STATUSES: TicketStatus[] = [
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

const PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const DANGER_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50";

export default function InternalTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const ticketId = params.id;
  const [ticket, setTicket] = useState<ServiceTicket | null>(null);
  const [generators, setGenerators] = useState<GeneratorOption[]>([]);
  const [comment, setComment] = useState("");
  const [customerVisible, setCustomerVisible] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<TicketStatus>("OPEN");
  const [selectedPriority, setSelectedPriority] =
    useState<TicketPriority>("MEDIUM");
  const [internalNotes, setInternalNotes] = useState("");
  const [convertGeneratorId, setConvertGeneratorId] = useState("");
  const [scheduledTo, setScheduledTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ticketPayload, generatorPayload] = await Promise.all([
        ticketsGet<ServiceTicket>(`/${ticketId}`),
        fetchJson<GeneratorOption[]>("/generators"),
      ]);
      setTicket(ticketPayload);
      setSelectedStatus(ticketPayload.status);
      setSelectedPriority(ticketPayload.priority);
      setInternalNotes(ticketPayload.internalNotes || "");
      setConvertGeneratorId(ticketPayload.generator?.id || "");
      setGenerators(generatorPayload);
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

  const clientGenerators = useMemo(() => {
    if (!ticket?.client?.id) return generators;
    return generators.filter(
      (generator) => generator.clientId === ticket.client?.id,
    );
  }, [generators, ticket?.client?.id]);

  async function handleComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!comment.trim()) return;
    await runAction(async () => {
      await ticketsPost<ServiceTicket>(`/${ticketId}/comment`, {
        message: comment,
        customerVisible,
      });
      setComment("");
      await load();
      setSuccess("Comentario registrado.");
    });
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      await ticketsPatch<ServiceTicket>(`/${ticketId}`, {
        status: selectedStatus,
        priority: selectedPriority,
        internalNotes: internalNotes || undefined,
      });
      await load();
      setSuccess("Chamado atualizado.");
    });
  }

  async function handleConvert() {
    await runAction(async () => {
      await ticketsPost<ServiceTicket>(`/${ticketId}/convert-to-order`, {
        generatorId: convertGeneratorId || undefined,
        scheduledTo: scheduledTo
          ? new Date(scheduledTo).toISOString()
          : undefined,
      });
      await load();
      setSuccess("Chamado convertido em OS.");
    });
  }

  async function handleTransition(action: "resolve" | "close" | "cancel") {
    await runAction(async () => {
      await ticketsPost<ServiceTicket>(`/${ticketId}/${action}`, {});
      await load();
      setSuccess("Acao registrada no chamado.");
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
    return <StatusBanner>Carregando chamado...</StatusBanner>;
  }

  if (!ticket) {
    return (
      <StatusBanner tone="rose">
        {error || "Chamado nao encontrado."}
      </StatusBanner>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Atendimento"
        title={`${ticket.code} - ${ticket.title}`}
        description={`${ticket.client?.tradeName || ticket.client?.companyName || "Cliente"} ${ticket.generator?.name ? `- ${ticket.generator.name}` : ""}`}
        stats={[
          {
            label: "Status",
            value: TICKET_STATUS_LABELS[ticket.status],
            tone: ticketTone(ticket),
          },
          {
            label: "Prioridade",
            value: TICKET_PRIORITY_LABELS[ticket.priority],
            tone: ticketTone(ticket),
          },
          {
            label: "Resposta SLA",
            value: formatTicketDate(ticket.slaResponseDueAt),
            tone: ticket.isResponseOverdue ? "rose" : "blue",
          },
          {
            label: "Solucao SLA",
            value: formatTicketDate(ticket.slaResolutionDueAt),
            tone: ticket.isResolutionOverdue ? "rose" : "emerald",
          },
        ]}
        actions={
          <>
            <Link href="/dashboard/atendimento" className={SECONDARY_BUTTON}>
              Voltar
            </Link>
            {ticket.maintenanceOrder ? (
              <Link
                href={`/dashboard/orders/${ticket.maintenanceOrder.id}`}
                className={PRIMARY_BUTTON}
              >
                Abrir OS vinculada
              </Link>
            ) : null}
          </>
        }
      />

      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {success ? <StatusBanner tone="emerald">{success}</StatusBanner> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          <SectionCard
            title="Historico e comentarios"
            description="Interacoes internas, mensagens do cliente e eventos do sistema."
          >
            <div className="space-y-3">
              {(ticket.comments || []).map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <DataPill
                        tone={
                          item.authorType === "CUSTOMER"
                            ? "blue"
                            : item.authorType === "SYSTEM"
                              ? "slate"
                              : "amber"
                        }
                      >
                        {item.authorType}
                      </DataPill>
                      {item.customerVisible ? (
                        <DataPill tone="emerald">Visivel ao cliente</DataPill>
                      ) : null}
                    </div>
                    <span className="text-xs font-semibold text-slate-500">
                      {formatTicketDate(item.createdAt)}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">
                    {item.message}
                  </p>
                </article>
              ))}
              {!ticket.comments?.length ? (
                <FieldBox className="p-5 text-sm font-semibold text-slate-600">
                  Nenhuma interacao registrada.
                </FieldBox>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            title="Responder"
            description="Comentarios marcados como visiveis aparecem no portal do cliente."
          >
            <form onSubmit={handleComment} className="space-y-4">
              <TextAreaInput
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Escreva a resposta ou nota interna..."
                required
              />
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={customerVisible}
                  onChange={(event) => setCustomerVisible(event.target.checked)}
                />
                Visivel ao cliente
              </label>
              <button
                type="submit"
                className={PRIMARY_BUTTON}
                disabled={saving}
              >
                Registrar comentario
              </button>
            </form>
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard
            title="Classificacao"
            description="Altere status, prioridade e notas internas."
          >
            <form onSubmit={handleUpdate} className="space-y-4">
              <FormField label="Status">
                <select
                  value={selectedStatus}
                  onChange={(event) =>
                    setSelectedStatus(event.target.value as TicketStatus)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {TICKET_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Prioridade">
                <select
                  value={selectedPriority}
                  onChange={(event) =>
                    setSelectedPriority(event.target.value as TicketPriority)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                >
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {TICKET_PRIORITY_LABELS[priority]}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Notas internas">
                <TextAreaInput
                  value={internalNotes}
                  onChange={(event) => setInternalNotes(event.target.value)}
                />
              </FormField>
              <button
                type="submit"
                className={PRIMARY_BUTTON}
                disabled={saving}
              >
                Salvar classificacao
              </button>
            </form>
          </SectionCard>

          <SectionCard
            title="Converter em OS"
            description="A conversao exige equipamento para nao inventar dados operacionais."
          >
            <div className="space-y-4">
              <FormField label="Equipamento da OS">
                <select
                  value={convertGeneratorId}
                  onChange={(event) =>
                    setConvertGeneratorId(event.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                  disabled={Boolean(ticket.maintenanceOrder)}
                >
                  <option value="">Selecione</option>
                  {clientGenerators.map((generator) => (
                    <option key={generator.id} value={generator.id}>
                      {generator.name}{" "}
                      {generator.serialNumber
                        ? `- ${generator.serialNumber}`
                        : ""}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Agendamento">
                <TextInput
                  type="datetime-local"
                  value={scheduledTo}
                  onChange={(event) => setScheduledTo(event.target.value)}
                  disabled={Boolean(ticket.maintenanceOrder)}
                />
              </FormField>
              <button
                type="button"
                className={PRIMARY_BUTTON}
                onClick={() => void handleConvert()}
                disabled={
                  saving ||
                  Boolean(ticket.maintenanceOrder) ||
                  !convertGeneratorId
                }
              >
                Converter para OS
              </button>
              {ticket.maintenanceOrder ? (
                <StatusBanner tone="emerald">
                  Chamado ja convertido para {ticket.maintenanceOrder.title}.
                </StatusBanner>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            title="Acoes finais"
            description="Resolucao, fechamento e cancelamento ficam auditados."
          >
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={saving}
                onClick={() => void handleTransition("resolve")}
              >
                Resolver
              </button>
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={saving}
                onClick={() => void handleTransition("close")}
              >
                Fechar
              </button>
              <button
                type="button"
                className={DANGER_BUTTON}
                disabled={saving || Boolean(ticket.maintenanceOrder)}
                onClick={() => void handleTransition("cancel")}
              >
                Cancelar
              </button>
            </div>
          </SectionCard>
        </div>
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
