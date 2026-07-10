"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";
import { clearAuthSession } from "@/lib/auth-session";
import {
  DataPill,
  EmptyState,
  FieldBox,
  FormField,
  InlineMessage,
  PageHero,
  SectionCard,
  StatusBanner,
  TextAreaInput,
} from "../../components/DashboardPageKit";

type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";
type OrderStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";

type Order = {
  id: string;
  title: string;
  description?: string | null;
  type?: string | null;
  status: OrderStatus;
  priority?: string | null;
  customerReport?: string | null;
  checklistData?: Record<string, unknown> | null;
  customerSignatureUrl?: string | null;
  auvoId?: string | null;
  auvoLink?: string | null;
  displacementStartedAt?: string | null;
  startedAt?: string | null;
  pausedAt?: string | null;
  finishedAt?: string | null;
  scheduledTo?: string | null;
  laborHours?: number | null;
  hourMeterAfter?: number | null;
  generator?: {
    id: string;
    name?: string | null;
    currentSite?: { id?: string; name?: string | null } | null;
    client?: { id: string; companyName: string } | null;
  } | null;
  site?: { id: string; name?: string | null } | null;
  technician?: {
    id: string;
    user?: {
      id: string;
      name?: string | null;
      email?: string | null;
      skillLevel?: string | null;
      department?: string | null;
    } | null;
  } | null;
  contract?: { id: string; code: string; status: string } | null;
  materials?: Array<{
    id: string;
    quantity: number;
    unitCost?: number | null;
    reservedAt?: string | null;
    warehouse?: { id: string; code?: string | null; name?: string | null } | null;
    catalogItem?: { id: string; name?: string | null; sku?: string | null } | null;
  }>;
};

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export default function OrderDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [workingKey, setWorkingKey] = useState("");
  const [reportDraft, setReportDraft] = useState("");
  const [reportNote, setReportNote] = useState("");

  const handleUnauthorized = useCallback(
    async (res: Response) => {
      if (res.status !== 401) return false;
      clearAuthSession();
      router.replace("/");
      return true;
    },
    [router],
  );

  const loadOrder = useCallback(async () => {
    if (!id) return;

    try {
      const res = await apiFetch(apiUrl(`/maintenance-orders/${id}`), {
        cache: "no-store",
      });
      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Nao foi possivel carregar a O.S."),
        );
      }
      const data = (await res.json()) as Order;
      setOrder(data);
      setReportDraft(data.customerReport || "");
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar a O.S.",
      );
    }
  }, [handleUnauthorized, id]);

  useEffect(() => {
    if (!id) return;
    void loadOrder();
  }, [id, loadOrder]);

  const checklistEntries = useMemo(
    () => summarizeChecklist(order?.checklistData),
    [order?.checklistData],
  );

  const materialCost = useMemo(
    () =>
      (order?.materials || []).reduce(
        (sum, material) =>
          sum + Number(material.quantity || 0) * Number(material.unitCost || 0),
        0,
      ),
    [order?.materials],
  );

  async function runPatch(
    key: string,
    payload: Record<string, unknown>,
    successMessage: string,
  ) {
    if (!id) return;
    setWorkingKey(key);
    setError("");
    setNotice("");

    try {
      const res = await apiFetch(apiUrl(`/maintenance-orders/${id}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "Falha ao atualizar a O.S."));
      }

      setNotice(successMessage);
      await loadOrder();
    } catch (patchError: unknown) {
      setError(
        patchError instanceof Error
          ? patchError.message
          : "Erro ao atualizar a O.S.",
      );
    } finally {
      setWorkingKey("");
    }
  }

  async function submitVisitReport() {
    if (!id) return;
    if (!reportDraft.trim()) {
      setError("Escreva o relatorio antes de enviar para aprovacao.");
      return;
    }

    setWorkingKey("visit-report");
    setError("");
    setNotice("");

    try {
      const res = await apiFetch(apiUrl(`/maintenance-orders/${id}/visit-report/submit`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          report: reportDraft.trim(),
          note: reportNote.trim() || undefined,
        }),
      });
      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Falha ao submeter o relatorio."),
        );
      }

      setNotice("Relatorio de visita enviado para aprovacao com sucesso.");
      setReportNote("");
      await loadOrder();
    } catch (submitError: unknown) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Erro ao enviar relatorio.",
      );
    } finally {
      setWorkingKey("");
    }
  }

  if (!order) {
    return (
      <div className="space-y-4">
        {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
        <EmptyState
          title="Carregando ordem de servico"
          description="Estamos reunindo contexto de execucao, materiais, contrato e relatorio tecnico."
        />
      </div>
    );
  }

  const siteName = order.site?.name || order.generator?.currentSite?.name || "-";
  const needsDispatch = !order.technician?.id;
  const reportPending = !order.customerReport && order.status !== "CANCELED";

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Ordem de servico"
        title={order.title}
        description={`Status ${orderStatusLabel(order.status)}. Esta tela agora concentra contexto de execucao, origem contratual, materiais e envio do relatorio tecnico.`}
        stats={[
          {
            label: "Status",
            value: orderStatusLabel(order.status),
            helper: "Etapa operacional atual da O.S.",
            tone: orderStatusTone(order.status),
          },
          {
            label: "Prioridade",
            value: priorityLabel(order.priority),
            helper: "Nivel de resposta esperado.",
            tone: priorityTone(order.priority),
          },
          {
            label: "Materiais",
            value: String(order.materials?.length || 0),
            helper: "Itens reservados para esta ordem.",
            tone: "blue",
          },
          {
            label: "Custo reservado",
            value: formatCurrency(materialCost),
            helper: "Estimativa com base nos materiais vinculados.",
            tone: "emerald",
          },
        ]}
        actions={
          <>
            <Link href="/dashboard/orders" className={SECONDARY_BUTTON}>
              Voltar para ordens
            </Link>
            <Link
              href={`/dashboard/documents/orders/${order.id}`}
              className={SECONDARY_BUTTON}
            >
              Documento
            </Link>
            {order.contract ? (
              <Link href={`/dashboard/contracts/${order.contract.id}`} className={SECONDARY_BUTTON}>
                Abrir contrato
              </Link>
            ) : null}
            {order.status === "OPEN" ? (
              <button
                type="button"
                onClick={() =>
                  void runPatch(
                    "start-order",
                    {
                      status: "IN_PROGRESS",
                      startedAt: order.startedAt || new Date().toISOString(),
                    },
                    "O.S. iniciada com sucesso.",
                  )
                }
                disabled={Boolean(workingKey)}
                className={PRIMARY_BUTTON}
              >
                Iniciar atendimento
              </button>
            ) : null}
            {order.status === "IN_PROGRESS" ? (
              <button
                type="button"
                onClick={() =>
                  void runPatch(
                    "complete-order",
                    {
                      status: "COMPLETED",
                      finishedAt: new Date().toISOString(),
                    },
                    "O.S. concluida com sucesso.",
                  )
                }
                disabled={Boolean(workingKey)}
                className={PRIMARY_BUTTON}
              >
                Concluir O.S.
              </button>
            ) : null}
            {order.status !== "COMPLETED" && order.status !== "CANCELED" ? (
              <button
                type="button"
                onClick={() =>
                  void runPatch(
                    "cancel-order",
                    { status: "CANCELED" },
                    "O.S. cancelada com sucesso.",
                  )
                }
                disabled={Boolean(workingKey)}
                className={SECONDARY_BUTTON}
              >
                Cancelar O.S.
              </button>
            ) : null}
          </>
        }
        aside={
          <FieldBox className="space-y-4 rounded-[28px] border-white/60 bg-white/80 p-5 shadow-[0_22px_60px_-40px_rgba(15,31,50,0.45)]">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Pulso da execucao
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <DataPill tone={orderStatusTone(order.status)}>
                  {orderStatusLabel(order.status)}
                </DataPill>
                <DataPill tone={priorityTone(order.priority)}>
                  {priorityLabel(order.priority)}
                </DataPill>
                {order.contract ? <DataPill tone="blue">{order.contract.code}</DataPill> : null}
              </div>
            </div>
            <MiniInfo
              label="Tecnico"
              value={order.technician?.user?.name || "Aguardando alocacao"}
              helper={
                order.technician?.user?.skillLevel
                  ? `Senioridade ${skillLabel(order.technician.user.skillLevel)}`
                  : "Fluxo de despacho ainda pendente."
              }
            />
            <MiniInfo
              label="Equipamento"
              value={order.generator?.name || "-"}
              helper={`Cliente ${order.generator?.client?.companyName || "-"} · Site ${siteName}`}
            />
            <MiniInfo
              label="Agenda"
              value={order.scheduledTo ? formatDateTime(order.scheduledTo) : "Sem horario"}
              helper="Data prevista para atendimento."
            />
          </FieldBox>
        }
      />

      {notice ? <StatusBanner tone="emerald">{notice}</StatusBanner> : null}
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {needsDispatch ? (
        <StatusBanner tone="amber">
          Esta O.S. ainda nao possui tecnico atribuido. O fluxo operacional pede despacho antes da execucao em campo.
        </StatusBanner>
      ) : null}
      {reportPending && order.status === "IN_PROGRESS" ? (
        <StatusBanner tone="amber">
          Atendimento em andamento sem relatorio de visita submetido. Vale fechar essa trilha para aprovacao.
        </StatusBanner>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
        <div className="space-y-6">
          <SectionCard
            eyebrow="Escopo operacional"
            title="Descricao e contexto"
            description="Resumo do trabalho, origem e vinculacoes da ordem."
          >
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/85 px-4 py-4">
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {order.description || "Sem descricao operacional registrada."}
              </p>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <Info label="Tipo" value={orderTypeLabel(order.type)} tone="slate" />
              <Info
                label="Contrato"
                value={order.contract?.code || "O.S. avulsa"}
                tone={order.contract ? "blue" : "slate"}
              />
              <Info label="Site" value={siteName} tone="blue" />
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              {order.generator?.id ? (
                <Link
                  href={`/dashboard/equipments/${order.generator.id}`}
                  className="inline-flex text-sm font-semibold text-sky-700 transition hover:text-sky-800 hover:underline"
                >
                  Abrir equipamento
                </Link>
              ) : null}
              {order.contract ? (
                <Link
                  href={`/dashboard/contracts/${order.contract.id}`}
                  className="inline-flex text-sm font-semibold text-sky-700 transition hover:text-sky-800 hover:underline"
                >
                  Abrir contrato vinculado
                </Link>
              ) : null}
              {order.auvoLink ? (
                <a
                  href={order.auvoLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex text-sm font-semibold text-sky-700 transition hover:text-sky-800 hover:underline"
                >
                  Abrir Auvo
                </a>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Relatorio tecnico"
            title="Relatorio de visita e aprovacao"
            description="O backend ja possui esse fluxo; agora ele esta acessivel na tela para fechar a trilha da visita tecnica."
            actions={
              <button
                type="button"
                onClick={() => void submitVisitReport()}
                disabled={workingKey === "visit-report"}
                className={PRIMARY_BUTTON}
              >
                {workingKey === "visit-report" ? "Enviando..." : "Enviar relatorio"}
              </button>
            }
          >
            <div className="grid gap-4">
              <FormField label="Relatorio de visita">
                <TextAreaInput
                  value={reportDraft}
                  onChange={(event) => setReportDraft(event.target.value)}
                  placeholder="Descreva o atendimento, diagnostico, servicos executados e recomendacoes."
                />
              </FormField>
              <FormField label="Observacao para aprovacao">
                <TextAreaInput
                  value={reportNote}
                  onChange={(event) => setReportNote(event.target.value)}
                  placeholder="Opcional: observacoes para o gestor/aprovador."
                  className="min-h-24"
                />
              </FormField>
              {order.customerReport ? (
                <InlineMessage>
                  Ja existe um relatorio salvo nesta O.S. Reenviar atualiza a trilha para aprovacao.
                </InlineMessage>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Materiais reservados"
            title="Insumos vinculados a ordem"
            description="Consulta rapida do que foi separado para a execucao."
          >
            {order.materials && order.materials.length > 0 ? (
              <div className="space-y-3">
                {order.materials.map((material) => (
                  <div
                    key={material.id}
                    className="rounded-[24px] border border-slate-200 bg-slate-50/85 px-4 py-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {material.catalogItem?.name || "Material"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          SKU: {material.catalogItem?.sku || "-"} · Almoxarifado{" "}
                          {material.warehouse?.code || material.warehouse?.name || "-"}
                        </p>
                      </div>
                      <DataPill tone="blue">{material.quantity} un.</DataPill>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">
                      Custo unitario: {formatCurrency(Number(material.unitCost || 0))}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Sem materiais vinculados"
                description="Esta O.S. nao possui reserva de insumos registrada."
              />
            )}
          </SectionCard>

          <SectionCard
            eyebrow="Checklist e evidencias"
            title="Requisitos tecnicos"
            description="Resumo do checklist associado, quando houver."
          >
            {checklistEntries.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {checklistEntries.map((entry) => (
                  <div
                    key={entry.label}
                    className="rounded-[24px] border border-slate-200 bg-slate-50/85 px-4 py-4"
                  >
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                      {entry.label}
                    </p>
                    <p className="mt-2 text-sm text-slate-800">{entry.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Sem checklist estruturado"
                description="Nenhum requisito tecnico detalhado foi anexado a esta ordem."
              />
            )}

            {order.customerSignatureUrl ? (
              <div className="mt-5">
                <a
                  href={order.customerSignatureUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex text-sm font-semibold text-sky-700 transition hover:text-sky-800 hover:underline"
                >
                  Abrir assinatura do cliente
                </a>
              </div>
            ) : null}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard
            eyebrow="Resumo executivo"
            title="Leitura da O.S."
            description="Pontos centrais para execucao, despacho e encerramento."
          >
            <div className="grid gap-3">
              <Info label="Status" value={orderStatusLabel(order.status)} tone={orderStatusTone(order.status)} />
              <Info label="Prioridade" value={priorityLabel(order.priority)} tone={priorityTone(order.priority)} />
              <Info label="Tecnico" value={order.technician?.user?.name || "Nao atribuido"} tone={order.technician?.id ? "emerald" : "amber"} />
              <Info label="Cliente" value={order.generator?.client?.companyName || "-"} />
              <Info label="Equipamento" value={order.generator?.name || "-"} />
              <Info label="Site" value={siteName} />
              <Info label="Agenda" value={order.scheduledTo ? formatDateTime(order.scheduledTo) : "Sem agenda"} tone={order.scheduledTo ? "blue" : "amber"} />
              <Info label="Horas apontadas" value={order.laborHours != null ? `${order.laborHours}h` : "Nao informado"} />
              <Info label="Horimetro final" value={order.hourMeterAfter != null ? String(order.hourMeterAfter) : "Nao informado"} />
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Linha do tempo"
            title="Marcos da execucao"
            description="Ajuda a validar se a ordem realmente percorreu todas as etapas necessarias."
          >
            <div className="space-y-3">
              <Info label="Deslocamento" value={order.displacementStartedAt ? formatDateTime(order.displacementStartedAt) : "Nao iniciado"} tone={order.displacementStartedAt ? "blue" : "slate"} />
              <Info label="Inicio" value={order.startedAt ? formatDateTime(order.startedAt) : "Nao iniciado"} tone={order.startedAt ? "blue" : "slate"} />
              <Info label="Pausa" value={order.pausedAt ? formatDateTime(order.pausedAt) : "Sem pausa"} />
              <Info label="Conclusao" value={order.finishedAt ? formatDateTime(order.finishedAt) : "Nao concluido"} tone={order.finishedAt ? "emerald" : "amber"} />
              {order.auvoId ? <Info label="Referencia Auvo" value={order.auvoId} /> : null}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function MiniInfo({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-600">{helper}</p>
    </div>
  );
}

function Info({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50/85 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </p>
        <DataPill tone={tone}>{value}</DataPill>
      </div>
      <p className="mt-3 break-words text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

function summarizeChecklist(checklistData?: Record<string, unknown> | null) {
  if (!checklistData) return [];

  return Object.entries(checklistData)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 10)
    .map(([key, value]) => ({
      label: humanizeKey(key),
      value: formatChecklistValue(value),
    }));
}

function humanizeKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatChecklistValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Sim" : "Nao";
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function orderStatusTone(status?: string | null): Tone {
  if (status === "IN_PROGRESS") return "blue";
  if (status === "COMPLETED") return "emerald";
  if (status === "CANCELED") return "rose";
  return "amber";
}

function orderStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    OPEN: "Aberta",
    IN_PROGRESS: "Em andamento",
    COMPLETED: "Concluida",
    CANCELED: "Cancelada",
  };
  return labels[status || "OPEN"] || status || "Aberta";
}

function priorityTone(priority?: string | null): Tone {
  if (priority === "URGENT") return "rose";
  if (priority === "HIGH") return "amber";
  if (priority === "LOW") return "slate";
  return "blue";
}

function priorityLabel(priority?: string | null) {
  const labels: Record<string, string> = {
    URGENT: "Urgente",
    HIGH: "Alta",
    NORMAL: "Normal",
    LOW: "Baixa",
  };
  return labels[priority || "NORMAL"] || priority || "Normal";
}

function orderTypeLabel(type?: string | null) {
  const labels: Record<string, string> = {
    PREVENTIVE: "Preventiva",
    CORRECTIVE: "Corretiva",
    INSTALLATION: "Instalacao",
    DEMOBILIZATION: "Desmobilizacao",
    REFUELING: "Abastecimento",
  };
  return labels[type || ""] || type || "Nao definido";
}

function skillLabel(level?: string | null) {
  const labels: Record<string, string> = {
    TRAINEE: "Trainee",
    JUNIOR: "Junior",
    PLENO: "Pleno",
    SENIOR: "Senior",
    MASTER: "Master",
  };
  return labels[level || ""] || level || "-";
}

function formatDateTime(value?: string | null) {
  if (!value) return "Sem data";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}
