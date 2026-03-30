"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
  SelectInput,
  StatusBanner,
  TextAreaInput,
  TextInput,
} from "../components/DashboardPageKit";

type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";
type OrderStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";

type DispatchOrder = {
  id: string;
  title: string;
  description?: string | null;
  status: OrderStatus;
  type?: string | null;
  priority?: string | null;
  scheduledTo?: string | null;
  openedAt?: string | null;
  displacementStartedAt?: string | null;
  technicianId?: string | null;
  contract?: { id: string; code: string; status: string } | null;
  materials?: Array<{ id: string }>;
  site?: {
    id: string;
    name: string;
    city?: string | null;
    state?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  generator?: {
    id: string;
    name?: string | null;
    client?: { id: string; companyName?: string | null } | null;
    currentSite?: {
      id: string;
      name?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    } | null;
  } | null;
  technician?: {
    id: string;
    user?: {
      id: string;
      name?: string | null;
      skillLevel?: string | null;
      department?: string | null;
    } | null;
  } | null;
};

type DispatchTechnician = {
  id: string;
  userId: string;
  skills: string[];
  latitude?: number | null;
  longitude?: number | null;
  orders?: Array<{
    id: string;
    status?: OrderStatus | null;
    priority?: string | null;
    scheduledTo?: string | null;
  }>;
  certifications?: Array<{
    id: string;
    code: string;
    validUntil: string;
    issuer?: string | null;
  }>;
  user: {
    id: string;
    name: string;
    email: string;
    isActive: boolean;
    department?: string | null;
    branch?: string | null;
  };
};

type GeneratorOption = {
  id: string;
  name: string;
  currentSite?: {
    id: string;
    name?: string | null;
  } | null;
  client?: {
    id: string;
    companyName?: string | null;
  } | null;
};

type DispatchDraft = {
  technicianId: string;
  status: OrderStatus;
  scheduledTo: string;
  assignmentJustification: string;
  assignmentOverrideApprovalId: string;
  certificationJustification: string;
};

type CreateOrderForm = {
  title: string;
  description: string;
  generatorId: string;
  technicianId: string;
  type: string;
  priority: string;
  scheduledTo: string;
  assignmentJustification: string;
  assignmentOverrideApprovalId: string;
  certificationJustification: string;
};

type DispatchMutationResponse = DispatchOrder & {
  dispatchWarnings?: string[];
};

type DispatchSuggestion = {
  technician: DispatchTechnician;
  skillHits: number;
  openCount: number;
  distanceKm: number;
};

const API_ROOT = apiUrl("");

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

const EMPTY_CREATE_FORM: CreateOrderForm = {
  title: "",
  description: "",
  generatorId: "",
  technicianId: "",
  type: "CORRECTIVE",
  priority: "NORMAL",
  scheduledTo: "",
  assignmentJustification: "",
  assignmentOverrideApprovalId: "",
  certificationJustification: "",
};

const ORDER_STATUS_OPTIONS: OrderStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELED",
];

const STATUS_LABEL: Record<OrderStatus, string> = {
  OPEN: "Aberta",
  IN_PROGRESS: "Em execucao",
  COMPLETED: "Finalizada",
  CANCELED: "Cancelada",
};

const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

const PRIORITY_LABEL: Record<string, string> = {
  URGENT: "Urgente",
  HIGH: "Alta",
  NORMAL: "Normal",
  LOW: "Baixa",
};

const ORDER_TYPE_OPTIONS = [
  "PREVENTIVE",
  "CORRECTIVE",
  "INSTALLATION",
  "DEMOBILIZATION",
  "REFUELING",
];

export default function DispatchPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<DispatchOrder[]>([]);
  const [technicians, setTechnicians] = useState<DispatchTechnician[]>([]);
  const [generators, setGenerators] = useState<GeneratorOption[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DispatchDraft>>({});

  const [loading, setLoading] = useState(true);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [approvalHintId, setApprovalHintId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | OrderStatus>("ALL");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [createForm, setCreateForm] = useState<CreateOrderForm>(EMPTY_CREATE_FORM);

  const clearFeedback = useCallback(() => {
    setSuccessMessage("");
    setError("");
    setWarnings([]);
    setApprovalHintId(null);
  }, []);

  const handleUnauthorized = useCallback(
    async (res: Response) => {
      if (res.status !== 401) return false;
      clearAuthSession();
      router.replace("/");
      return true;
    },
    [router],
  );

  const openOrderCountByTech = useMemo(() => {
    const map = new Map<string, number>();
    for (const order of orders) {
      if (!order.technicianId) continue;
      if (order.status !== "OPEN" && order.status !== "IN_PROGRESS") continue;
      map.set(order.technicianId, (map.get(order.technicianId) || 0) + 1);
    }
    return map;
  }, [orders]);

  const activeQueue = useMemo(
    () =>
      orders.filter(
        (order) => order.status === "OPEN" || order.status === "IN_PROGRESS",
      ),
    [orders],
  );

  const coverageReadyCount = useMemo(
    () =>
      activeQueue.filter((order) =>
        Boolean(suggestTechnician(order, technicians, openOrderCountByTech)),
      ).length,
    [activeQueue, openOrderCountByTech, technicians],
  );

  const selectedGenerator = useMemo(
    () => generators.find((item) => item.id === createForm.generatorId) || null,
    [createForm.generatorId, generators],
  );

  const kpis = useMemo(() => {
    const open = orders.filter((order) => order.status === "OPEN").length;
    const inProgress = orders.filter(
      (order) => order.status === "IN_PROGRESS",
    ).length;
    const unassigned = orders.filter(
      (order) =>
        (order.status === "OPEN" || order.status === "IN_PROGRESS") &&
        !order.technicianId,
    ).length;
    return { open, inProgress, unassigned };
  }, [orders]);

  const technicianCoverage = useMemo(() => {
    return technicians
      .map((technician) => {
        const activeAssignments = (technician.orders || []).filter(
          (order) => order.status === "OPEN" || order.status === "IN_PROGRESS",
        );
        const urgentAssignments = activeAssignments.filter(
          (order) => order.priority === "URGENT" || order.priority === "HIGH",
        ).length;
        const nextCertification = [...(technician.certifications || [])].sort(
          (a, b) =>
            new Date(a.validUntil).getTime() - new Date(b.validUntil).getTime(),
        )[0];

        return {
          technician,
          activeAssignments,
          urgentAssignments,
          nextCertification,
        };
      })
      .sort((a, b) => {
        if (a.activeAssignments.length !== b.activeAssignments.length) {
          return a.activeAssignments.length - b.activeAssignments.length;
        }
        if (a.urgentAssignments !== b.urgentAssignments) {
          return a.urgentAssignments - b.urgentAssignments;
        }
        return a.technician.user.name.localeCompare(b.technician.user.name);
      });
  }, [technicians]);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();

    return [...orders]
      .filter((order) => {
        if (statusFilter !== "ALL" && order.status !== statusFilter) return false;
        if (
          onlyUnassigned &&
          (order.technicianId || !["OPEN", "IN_PROGRESS"].includes(order.status))
        ) {
          return false;
        }
        if (!term) return true;

        const source = [
          order.title,
          order.description || "",
          order.generator?.name || "",
          order.generator?.client?.companyName || "",
          order.site?.name || order.generator?.currentSite?.name || "",
          order.technician?.user?.name || "",
          order.contract?.code || "",
          order.priority || "",
          order.status,
        ]
          .join(" ")
          .toLowerCase();

        return source.includes(term);
      })
      .sort((a, b) => {
        const aPriority = PRIORITY_ORDER[a.priority || "NORMAL"] ?? 9;
        const bPriority = PRIORITY_ORDER[b.priority || "NORMAL"] ?? 9;
        if (aPriority !== bPriority) return aPriority - bPriority;

        const aDate = a.scheduledTo
          ? new Date(a.scheduledTo).getTime()
          : Number.MAX_SAFE_INTEGER;
        const bDate = b.scheduledTo
          ? new Date(b.scheduledTo).getTime()
          : Number.MAX_SAFE_INTEGER;
        if (aDate !== bDate) return aDate - bDate;

        const aOpen = a.openedAt ? new Date(a.openedAt).getTime() : 0;
        const bOpen = b.openedAt ? new Date(b.openedAt).getTime() : 0;
        return bOpen - aOpen;
      });
  }, [onlyUnassigned, orders, search, statusFilter]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [ordersRes, techniciansRes, generatorsRes] = await Promise.all([
        apiFetch(`${API_ROOT}/maintenance-orders`, { cache: "no-store" }),
        apiFetch(`${API_ROOT}/technicians`, { cache: "no-store" }),
        apiFetch(`${API_ROOT}/generators`, { cache: "no-store" }),
      ]);

      const failed = [
        { response: ordersRes, fallback: "Falha ao carregar a fila de despacho." },
        { response: techniciansRes, fallback: "Falha ao carregar a equipe tecnica." },
        { response: generatorsRes, fallback: "Falha ao carregar os equipamentos." },
      ].find((entry) => !entry.response.ok);

      if (failed) {
        if (await handleUnauthorized(failed.response)) return;
        throw new Error(await readApiErrorMessage(failed.response, failed.fallback));
      }

      const [nextOrders, nextTechs, nextGenerators] = (await Promise.all([
        ordersRes.json(),
        techniciansRes.json(),
        generatorsRes.json(),
      ])) as [DispatchOrder[], DispatchTechnician[], GeneratorOption[]];

      setOrders(nextOrders);
      setTechnicians(nextTechs.filter((item) => item.user?.isActive));
      setGenerators(nextGenerators);
      setDrafts(buildDrafts(nextOrders));
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar painel de despacho.",
      );
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function setApiError(message: string) {
    setError(message);
    setApprovalHintId(extractApprovalId(message));
  }

  function applySuccess(message: string, nextWarnings?: string[]) {
    setSuccessMessage(message);
    setWarnings(nextWarnings || []);
    setError("");
    setApprovalHintId(null);
  }

  function updateDraft(orderId: string, patch: Partial<DispatchDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] || emptyDraft()),
        ...patch,
      },
    }));
  }

  async function handleCreateOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();

    if (!createForm.title.trim() || !createForm.generatorId) {
      setApiError("Informe titulo e equipamento para abrir a O.S.");
      return;
    }

    setCreating(true);

    try {
      const payload = {
        title: createForm.title.trim(),
        description: createForm.description.trim() || undefined,
        generatorId: createForm.generatorId,
        technicianId: createForm.technicianId || undefined,
        type: createForm.type,
        status: "OPEN",
        priority: createForm.priority,
        scheduledTo: createForm.scheduledTo
          ? new Date(createForm.scheduledTo).toISOString()
          : undefined,
        siteId: selectedGenerator?.currentSite?.id,
        ...serializeExceptionFields({
          assignmentJustification: createForm.assignmentJustification,
          assignmentOverrideApprovalId: createForm.assignmentOverrideApprovalId,
          certificationJustification: createForm.certificationJustification,
        }),
      };

      const res = await apiFetch(`${API_ROOT}/maintenance-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "Nao foi possivel criar a O.S."));
      }

      const created = (await res.json()) as DispatchMutationResponse;
      setCreateForm(EMPTY_CREATE_FORM);
      applySuccess("O.S. criada e enviada para a fila de despacho.", created.dispatchWarnings);
      await loadData();
    } catch (createError: unknown) {
      setApiError(
        createError instanceof Error
          ? createError.message
          : "Nao foi possivel criar a O.S.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveOrder(order: DispatchOrder) {
    const draft = drafts[order.id];
    if (!draft) return;

    clearFeedback();

    const payload: Record<string, unknown> = {
      ...serializeExceptionFields(draft),
    };

    if (draft.technicianId && draft.technicianId !== order.technicianId) {
      payload.technicianId = draft.technicianId;
    }

    if (draft.status !== order.status) {
      payload.status = draft.status;
    }

    const currentSchedule = order.scheduledTo ? toInputDateTime(order.scheduledTo) : "";
    if (draft.scheduledTo !== currentSchedule) {
      payload.scheduledTo = draft.scheduledTo
        ? new Date(draft.scheduledTo).toISOString()
        : null;
    }

    if (Object.keys(payload).length === 0) {
      setSuccessMessage(`Nenhuma alteracao pendente para a O.S. ${order.title}.`);
      return;
    }

    await patchOrder(order.id, payload, "Despacho atualizado com sucesso.");
  }

  async function handleQuickDispatch(order: DispatchOrder) {
    const draft = drafts[order.id] || emptyDraft(order);
    const suggestion = suggestTechnician(order, technicians, openOrderCountByTech);
    const technicianId = draft.technicianId || suggestion?.technician.id || order.technicianId;

    clearFeedback();

    if (!technicianId) {
      setApiError("Nao ha tecnico disponivel para despacho rapido nesta O.S.");
      return;
    }

    await patchOrder(
      order.id,
      {
        technicianId,
        status: "IN_PROGRESS",
        displacementStartedAt: new Date().toISOString(),
        ...(draft.scheduledTo
          ? { scheduledTo: new Date(draft.scheduledTo).toISOString() }
          : {}),
        ...serializeExceptionFields(draft),
      },
      "Despacho rapido executado com sucesso.",
    );
  }

  async function patchOrder(
    orderId: string,
    payload: Record<string, unknown>,
    successMessage: string,
  ) {
    setSavingOrderId(orderId);

    try {
      const res = await apiFetch(`${API_ROOT}/maintenance-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Nao foi possivel atualizar a O.S."),
        );
      }

      const updated = (await res.json()) as DispatchMutationResponse;
      applySuccess(successMessage, updated.dispatchWarnings);
      await loadData();
    } catch (patchError: unknown) {
      setApiError(
        patchError instanceof Error
          ? patchError.message
          : "Nao foi possivel atualizar a O.S.",
      );
    } finally {
      setSavingOrderId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Despacho e agenda"
        title="Central de despacho com fila, cobertura tecnica e excecoes guiadas."
        description="A operacao agora consegue abrir O.S., alocar tecnico, ajustar agenda e tratar bloqueios de senioridade ou competencia no mesmo fluxo. A pagina tambem passou a respeitar sessao, feedback de API e warnings devolvidos pelo backend."
        stats={[
          {
            label: "Abertas",
            value: String(kpis.open),
            helper: "Itens aguardando tracao ou definicao de agenda.",
            tone: "amber",
          },
          {
            label: "Em execucao",
            value: String(kpis.inProgress),
            helper: "Atendimentos que ja sairam da fila.",
            tone: "blue",
          },
          {
            label: "Sem tecnico",
            value: String(kpis.unassigned),
            helper: "Ordens que ainda pedem alocacao.",
            tone: "rose",
          },
          {
            label: "Cobertas por sugestao",
            value: String(coverageReadyCount),
            helper: "Ordens com indicacao automatica de tecnico.",
            tone: "emerald",
          },
        ]}
        actions={
          <>
            <button type="button" onClick={() => void loadData()} className={SECONDARY_BUTTON}>
              Atualizar painel
            </button>
            <Link href="/dashboard/orders" className={PRIMARY_BUTTON}>
              Abrir carteira de O.S.
            </Link>
          </>
        }
        aside={
          <FieldBox className="space-y-4 rounded-[28px] border-white/70 bg-white/85 p-5 shadow-[0_22px_60px_-42px_rgba(15,31,50,0.4)]">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Verificacao de fluxo
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                O despacho agora reconhece quando a alocacao precisa de justificativa,
                quando depende de aprovacao do gestor e quando segue com ressalva de
                certificacao.
              </p>
            </div>
            <MiniRadar
              label="Equipe ativa"
              value={`${technicians.length} tecnico(s)`}
              helper="Base disponivel para alocacao e replanejamento."
              tone="blue"
            />
            <MiniRadar
              label="Fila sem cobertura"
              value={`${Math.max(activeQueue.length - coverageReadyCount, 0)} ordem(ns)`}
              helper="Itens que ainda nao encontram sugestao automatica confiavel."
              tone="amber"
            />
          </FieldBox>
        }
      />

      {successMessage ? <StatusBanner tone="emerald">{successMessage}</StatusBanner> : null}
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {approvalHintId ? (
        <StatusBanner tone="amber">
          Aprovacao de excecao identificada: use o ID <strong>{approvalHintId}</strong> no campo
          &quot;ID da aprovacao&quot; depois que o gestor liberar o override.
        </StatusBanner>
      ) : null}
      {warnings.length > 0 ? (
        <StatusBanner tone="amber">
          <div className="space-y-1">
            <p className="font-semibold">O backend confirmou o despacho com ressalvas:</p>
            {warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        </StatusBanner>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
        <SectionCard
          eyebrow="Abertura operacional"
          title="Nova O.S. avulsa"
          description="Abre a demanda com prioridade, agenda e tecnico opcional. Se a alocacao exigir excecao, a justificativa ja nasce no mesmo formulario."
        >
          <form onSubmit={(event) => void handleCreateOrder(event)} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FormField label="Titulo">
                <TextInput
                  value={createForm.title}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  placeholder="Falha de transferencia, preventiva, partida..."
                  required
                />
              </FormField>

              <FormField label="Equipamento">
                <SelectInput
                  value={createForm.generatorId}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, generatorId: event.target.value }))
                  }
                  required
                >
                  <option value="">Selecionar equipamento</option>
                  {generators.map((generator) => (
                    <option key={generator.id} value={generator.id}>
                      {generator.name} - {generator.client?.companyName || "Sem cliente"}
                    </option>
                  ))}
                </SelectInput>
              </FormField>

              <FormField label="Tecnico">
                <SelectInput
                  value={createForm.technicianId}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, technicianId: event.target.value }))
                  }
                >
                  <option value="">Definir depois</option>
                  {technicians.map((technician) => (
                    <option key={technician.id} value={technician.id}>
                      {technician.user.name} ({openOrderCountByTech.get(technician.id) || 0} ativas)
                    </option>
                  ))}
                </SelectInput>
              </FormField>

              <FormField label="Agenda">
                <TextInput
                  value={createForm.scheduledTo}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, scheduledTo: event.target.value }))
                  }
                  type="datetime-local"
                />
              </FormField>

              <FormField label="Tipo">
                <SelectInput
                  value={createForm.type}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, type: event.target.value }))
                  }
                >
                  {ORDER_TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>
                      {orderTypeLabel(type)}
                    </option>
                  ))}
                </SelectInput>
              </FormField>

              <FormField label="Prioridade">
                <SelectInput
                  value={createForm.priority}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, priority: event.target.value }))
                  }
                >
                  {Object.keys(PRIORITY_LABEL).map((priority) => (
                    <option key={priority} value={priority}>
                      {PRIORITY_LABEL[priority]}
                    </option>
                  ))}
                </SelectInput>
              </FormField>

              <div className="md:col-span-2 xl:col-span-2">
                <FormField label="Descricao" hint="Contexto da ocorrencia">
                  <TextAreaInput
                    value={createForm.description}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                    placeholder="Descreva sintoma, risco ou motivo da visita."
                    className="min-h-[132px]"
                  />
                </FormField>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <FieldBox className="space-y-3 rounded-[24px] border-slate-200/90 bg-slate-50/80 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Contexto da abertura
                </p>
                <div className="grid gap-3 md:grid-cols-3">
                  <InfoTile
                    label="Cliente"
                    value={selectedGenerator?.client?.companyName || "A definir"}
                    helper="Conta vinculada ao equipamento escolhido."
                    tone="blue"
                  />
                  <InfoTile
                    label="Site"
                    value={selectedGenerator?.currentSite?.name || "Sem site vinculado"}
                    helper="O site e reaproveitado como contexto da O.S."
                    tone="slate"
                  />
                  <InfoTile
                    label="Status de abertura"
                    value={createForm.technicianId ? "Ja sai com alocacao" : "Entra na fila"}
                    helper="Voce pode deixar a equipe definir o despacho depois."
                    tone={createForm.technicianId ? "emerald" : "amber"}
                  />
                </div>
              </FieldBox>

              <div className="flex flex-col justify-between gap-3 rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-[0_18px_46px_-38px_rgba(15,31,50,0.35)]">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                    Comando
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    A abertura ja conversa com as regras reais do backend. Se houver
                    bloqueio de senioridade ou competencia, o formulario aceita a
                    justificativa e o ID da aprovacao sem sair da tela.
                  </p>
                </div>
                <button type="submit" disabled={creating} className={PRIMARY_BUTTON}>
                  {creating ? "Criando..." : "Abrir O.S."}
                </button>
              </div>
            </div>

            {createForm.technicianId ? (
              <FieldBox className="space-y-4 rounded-[24px] border-amber-200 bg-amber-50/80 p-4">
                <InlineMessage tone="warning">
                  Use este bloco apenas quando a alocacao exigir excecao de senioridade,
                  aprovacao do gestor ou justificativa de certificacao.
                </InlineMessage>
                <div className="grid gap-4 xl:grid-cols-3">
                  <FormField label="Justificativa da excecao">
                    <TextAreaInput
                      value={createForm.assignmentJustification}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          assignmentJustification: event.target.value,
                        }))
                      }
                      placeholder="Explique por que a alocacao fora do minimo ainda e necessaria."
                      className="min-h-[112px]"
                    />
                  </FormField>
                  <FormField label="ID da aprovacao" hint="Preencha apos liberacao">
                    <TextInput
                      value={createForm.assignmentOverrideApprovalId}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          assignmentOverrideApprovalId: event.target.value,
                        }))
                      }
                      placeholder="UUID da aprovacao do gestor"
                    />
                  </FormField>
                  <FormField label="Justificativa de certificacao">
                    <TextAreaInput
                      value={createForm.certificationJustification}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          certificationJustification: event.target.value,
                        }))
                      }
                      placeholder="Detalhe a ressalva quando faltar certificacao ou especialidade."
                      className="min-h-[112px]"
                    />
                  </FormField>
                </div>
              </FieldBox>
            ) : null}
          </form>
        </SectionCard>

        <SectionCard
          eyebrow="Cobertura da equipe"
          title="Radar tecnico"
          description="Mostra carga ativa, urgencias por tecnico e a proxima certificacao a vencer para apoiar a distribuicao da fila."
        >
          {technicianCoverage.length === 0 ? (
            <EmptyState
              title="Nenhum tecnico ativo encontrado"
              description="Cadastre ou reative a equipe para usar o despacho assistido."
            />
          ) : (
            <div className="space-y-3">
              {technicianCoverage.slice(0, 5).map((entry) => (
                <TechnicianRadarCard
                  key={entry.technician.id}
                  technician={entry.technician}
                  activeAssignments={entry.activeAssignments.length}
                  urgentAssignments={entry.urgentAssignments}
                  nextCertification={entry.nextCertification}
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        eyebrow="Fila operacional"
        title="Ordens em despacho"
        description="Filtre a fila, veja a melhor sugestao de tecnico, ajuste agenda e trate excecoes sem depender de uma tabela densa e pouco guiada."
        actions={
          <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[760px] xl:flex-row xl:items-center xl:justify-end">
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por O.S., cliente, equipamento, tecnico ou contrato..."
              className="xl:min-w-[340px]"
            />
            <SelectInput
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "ALL" | OrderStatus)}
              className="xl:w-[210px]"
            >
              <option value="ALL">Todos os status</option>
              {ORDER_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </SelectInput>
            <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={onlyUnassigned}
                onChange={(event) => setOnlyUnassigned(event.target.checked)}
              />
              Somente sem tecnico
            </label>
          </div>
        }
      >
        {loading ? (
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-10 text-sm text-slate-500">
            Carregando fila de despacho...
          </div>
        ) : null}

        {!loading && filteredOrders.length === 0 ? (
          <EmptyState
            title="Nenhuma ordem encontrada"
            description="Ajuste os filtros ou abra uma nova O.S. avulsa na central acima."
          />
        ) : null}

        {!loading && filteredOrders.length > 0 ? (
          <div className="space-y-4">
            {filteredOrders.map((order) => (
              <DispatchOrderCard
                key={order.id}
                order={order}
                draft={drafts[order.id] || emptyDraft(order)}
                technicians={technicians}
                openOrderCountByTech={openOrderCountByTech}
                saving={savingOrderId === order.id}
                onDraftChange={updateDraft}
                onSave={handleSaveOrder}
                onQuickDispatch={handleQuickDispatch}
              />
            ))}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

function DispatchOrderCard({
  order,
  draft,
  technicians,
  openOrderCountByTech,
  saving,
  onDraftChange,
  onSave,
  onQuickDispatch,
}: {
  order: DispatchOrder;
  draft: DispatchDraft;
  technicians: DispatchTechnician[];
  openOrderCountByTech: Map<string, number>;
  saving: boolean;
  onDraftChange: (orderId: string, patch: Partial<DispatchDraft>) => void;
  onSave: (order: DispatchOrder) => Promise<void>;
  onQuickDispatch: (order: DispatchOrder) => Promise<void>;
}) {
  const suggestion = suggestTechnician(order, technicians, openOrderCountByTech);
  const siteName = order.site?.name || order.generator?.currentSite?.name || "Sem local";
  const needsAttention =
    !order.technician?.id ||
    !order.scheduledTo ||
    order.status === "OPEN" ||
    order.priority === "URGENT" ||
    order.priority === "HIGH";
  const hasExceptionFields =
    Boolean(draft.technicianId || order.technicianId) ||
    Boolean(
      draft.assignmentJustification ||
        draft.assignmentOverrideApprovalId ||
        draft.certificationJustification,
    );

  return (
    <article className="rounded-[28px] border border-slate-200 bg-white/92 px-5 py-5 shadow-[0_24px_60px_-48px_rgba(15,31,50,0.35)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-bold text-slate-950">{order.title}</p>
            <DataPill tone={orderStatusTone(order.status)}>
              {STATUS_LABEL[order.status]}
            </DataPill>
            <DataPill tone={priorityTone(order.priority)}>
              {priorityLabel(order.priority)}
            </DataPill>
            {order.contract ? <DataPill tone="blue">{order.contract.code}</DataPill> : null}
            {needsAttention ? <DataPill tone="amber">Pede atencao</DataPill> : null}
          </div>

          <p className="max-w-4xl text-sm leading-6 text-slate-600">
            {order.description || "Sem descricao operacional registrada."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/dashboard/orders/${order.id}`} className={PRIMARY_BUTTON}>
            Abrir O.S.
          </Link>
          {order.contract ? (
            <Link
              href={`/dashboard/contracts/${order.contract.id}`}
              className="inline-flex text-sm font-semibold text-sky-700 transition hover:text-sky-800 hover:underline"
            >
              Abrir contrato
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-4">
        <InfoTile
          label="Cliente"
          value={order.generator?.client?.companyName || "-"}
          helper="Conta impactada pela ordem."
          tone="slate"
        />
        <InfoTile
          label="Equipamento"
          value={order.generator?.name || "-"}
          helper={`Site: ${siteName}`}
          tone="blue"
        />
        <InfoTile
          label="Alocacao atual"
          value={order.technician?.user?.name || "Aguardando definicao"}
          helper={
            order.technician?.user?.skillLevel
              ? `Senioridade registrada: ${skillLabel(order.technician.user.skillLevel)}`
              : "Despacho ainda nao concluido."
          }
          tone={order.technician?.id ? "emerald" : "amber"}
        />
        <InfoTile
          label="Agenda"
          value={order.scheduledTo ? formatDateTime(order.scheduledTo) : "Sem agenda"}
          helper={
            order.materials?.length
              ? `${order.materials.length} material(is) reservado(s).`
              : "Sem material reservado."
          }
          tone={order.scheduledTo ? "emerald" : "rose"}
        />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_320px]">
        <FieldBox className="space-y-4 rounded-[24px] border-slate-200/90 bg-slate-50/85 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Editor de despacho
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Ajuste agenda, tecnico e status sem sair da fila.
              </p>
            </div>
            <DataPill tone={needsAttention ? "amber" : "emerald"}>
              {needsAttention ? "Fila quente" : "Fluxo estabilizado"}
            </DataPill>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <FormField label="Tecnico">
              <SelectInput
                value={draft.technicianId}
                onChange={(event) =>
                  onDraftChange(order.id, { technicianId: event.target.value })
                }
              >
                <option value="">Selecionar tecnico</option>
                {technicians.map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.user.name} ({openOrderCountByTech.get(technician.id) || 0} ativas)
                  </option>
                ))}
              </SelectInput>
            </FormField>

            <FormField label="Agenda">
              <TextInput
                value={draft.scheduledTo}
                onChange={(event) =>
                  onDraftChange(order.id, { scheduledTo: event.target.value })
                }
                type="datetime-local"
              />
            </FormField>

            <FormField label="Status">
              <SelectInput
                value={draft.status}
                onChange={(event) =>
                  onDraftChange(order.id, {
                    status: event.target.value as OrderStatus,
                  })
                }
              >
                {ORDER_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABEL[status]}
                  </option>
                ))}
              </SelectInput>
            </FormField>
          </div>

          {hasExceptionFields ? (
            <div className="space-y-4 rounded-[22px] border border-amber-200 bg-amber-50/80 p-4">
              <InlineMessage tone="warning">
                Se o backend bloquear a alocacao por senioridade ou competencia,
                registre a justificativa aqui, solicite a aprovacao e reenvie com o ID
                retornado.
              </InlineMessage>
              <div className="grid gap-4 xl:grid-cols-3">
                <FormField label="Justificativa da excecao">
                  <TextAreaInput
                    value={draft.assignmentJustification}
                    onChange={(event) =>
                      onDraftChange(order.id, {
                        assignmentJustification: event.target.value,
                      })
                    }
                    placeholder="Explique por que este tecnico precisa assumir a ordem."
                    className="min-h-[108px]"
                  />
                </FormField>
                <FormField label="ID da aprovacao" hint="UUID liberado pelo gestor">
                  <TextInput
                    value={draft.assignmentOverrideApprovalId}
                    onChange={(event) =>
                      onDraftChange(order.id, {
                        assignmentOverrideApprovalId: event.target.value,
                      })
                    }
                    placeholder="Cole aqui o ID da aprovacao"
                  />
                </FormField>
                <FormField label="Justificativa de certificacao">
                  <TextAreaInput
                    value={draft.certificationJustification}
                    onChange={(event) =>
                      onDraftChange(order.id, {
                        certificationJustification: event.target.value,
                      })
                    }
                    placeholder="Descreva a ressalva quando faltar certificacao ou especialidade."
                    className="min-h-[108px]"
                  />
                </FormField>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void onSave(order)}
              disabled={saving}
              className={SECONDARY_BUTTON}
            >
              {saving ? "Salvando..." : "Salvar ajustes"}
            </button>
            <button
              type="button"
              onClick={() => void onQuickDispatch(order)}
              disabled={saving}
              className={PRIMARY_BUTTON}
            >
              {saving ? "Despachando..." : "Despacho rapido"}
            </button>
          </div>
        </FieldBox>

        <FieldBox className="space-y-4 rounded-[24px] border-slate-200/90 bg-white/85 p-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Melhor sugestao
            </p>
            <p className="mt-1 text-sm text-slate-600">
              O algoritmo combina aderencia de skills, carga ativa e distancia.
            </p>
          </div>

          {suggestion ? (
            <>
              <div className="rounded-[20px] border border-sky-200 bg-sky-50/80 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-slate-950">
                      {suggestion.technician.user.name}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {suggestion.technician.user.department || "Campo"}
                      {suggestion.technician.user.branch
                        ? ` - ${suggestion.technician.user.branch}`
                        : ""}
                    </p>
                  </div>
                  <DataPill tone="blue">
                    {suggestion.openCount} ativa(s)
                  </DataPill>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <DataPill tone={suggestion.skillHits > 0 ? "emerald" : "slate"}>
                    {suggestion.skillHits > 0
                      ? `${suggestion.skillHits} skill(s) aderente(s)`
                      : "Sem match explicito de skill"}
                  </DataPill>
                  <DataPill tone={Number.isFinite(suggestion.distanceKm) ? "amber" : "slate"}>
                    {formatDistance(suggestion.distanceKm)}
                  </DataPill>
                </div>
                {suggestion.technician.skills.length > 0 ? (
                  <p className="mt-4 text-sm leading-6 text-slate-600">
                    Skills: {suggestion.technician.skills.slice(0, 4).join(", ")}
                    {suggestion.technician.skills.length > 4 ? "..." : ""}
                  </p>
                ) : null}
              </div>
              <p className="text-sm leading-6 text-slate-600">
                O despacho rapido usa este tecnico por padrao se voce ainda nao tiver
                escolhido outro no editor.
              </p>
            </>
          ) : (
            <EmptyState
              title="Sem sugestao automatica"
              description="A fila nao encontrou tecnico com cobertura suficiente. Vale revisar skills, disponibilidade ou tratar a ordem manualmente."
            />
          )}
        </FieldBox>
      </div>
    </article>
  );
}

function TechnicianRadarCard({
  technician,
  activeAssignments,
  urgentAssignments,
  nextCertification,
}: {
  technician: DispatchTechnician;
  activeAssignments: number;
  urgentAssignments: number;
  nextCertification?: NonNullable<DispatchTechnician["certifications"]>[number];
}) {
  const nextCertificationLabel = nextCertification
    ? formatDate(nextCertification.validUntil)
    : "Sem certificacao registrada";
  const nextCertificationTone =
    nextCertification && daysUntil(nextCertification.validUntil) <= 30 ? "amber" : "slate";

  return (
    <article className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-950">{technician.user.name}</p>
          <p className="mt-1 text-sm text-slate-600">
            {technician.user.department || "Campo"}
            {technician.user.branch ? ` - ${technician.user.branch}` : ""}
          </p>
        </div>
        <DataPill tone={activeAssignments === 0 ? "emerald" : "blue"}>
          {activeAssignments} ativa(s)
        </DataPill>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <InfoTile
          label="Urgencias"
          value={String(urgentAssignments)}
          helper="Ordens altas ou urgentes no colo deste tecnico."
          tone={urgentAssignments > 0 ? "amber" : "emerald"}
        />
        <InfoTile
          label="Skills"
          value={technician.skills.length ? technician.skills.slice(0, 2).join(", ") : "Nao mapeadas"}
          helper="A base do match automatico usa esse cadastro."
          tone="slate"
        />
        <InfoTile
          label="Certificacao"
          value={nextCertificationLabel}
          helper={
            nextCertification
              ? `Codigo ${nextCertification.code}`
              : "Convem completar a trilha da equipe."
          }
          tone={nextCertificationTone}
        />
      </div>
    </article>
  );
}

function MiniRadar({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: Tone;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </p>
        <DataPill tone={tone}>{value}</DataPill>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{helper}</p>
    </div>
  );
}

function InfoTile({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: Tone;
}) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
          {label}
        </p>
        <DataPill tone={tone}>{value}</DataPill>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{helper}</p>
    </div>
  );
}

function buildDrafts(orders: DispatchOrder[]) {
  const draftMap: Record<string, DispatchDraft> = {};
  for (const order of orders) {
    draftMap[order.id] = emptyDraft(order);
  }
  return draftMap;
}

function emptyDraft(order?: DispatchOrder): DispatchDraft {
  return {
    technicianId: order?.technicianId || "",
    status: order?.status || "OPEN",
    scheduledTo: order?.scheduledTo ? toInputDateTime(order.scheduledTo) : "",
    assignmentJustification: "",
    assignmentOverrideApprovalId: "",
    certificationJustification: "",
  };
}

function serializeExceptionFields(input: {
  assignmentJustification?: string;
  assignmentOverrideApprovalId?: string;
  certificationJustification?: string;
}) {
  const payload: Record<string, string> = {};

  if (input.assignmentJustification?.trim()) {
    payload.assignmentJustification = input.assignmentJustification.trim();
  }

  if (input.assignmentOverrideApprovalId?.trim()) {
    payload.assignmentOverrideApprovalId = input.assignmentOverrideApprovalId.trim();
  }

  if (input.certificationJustification?.trim()) {
    payload.certificationJustification = input.certificationJustification.trim();
  }

  return payload;
}

function extractApprovalId(message: string) {
  const match = /ID:\s*([a-z0-9-]+)/i.exec(message);
  return match?.[1] || null;
}

function toInputDateTime(value: string) {
  const date = new Date(value);
  const tzOffsetMinutes = date.getTimezoneOffset();
  const local = new Date(date.getTime() - tzOffsetMinutes * 60000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(new Date(value));
}

function daysUntil(value: string) {
  const diff = new Date(value).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function orderStatusTone(status: OrderStatus): Tone {
  if (status === "OPEN") return "amber";
  if (status === "IN_PROGRESS") return "blue";
  if (status === "COMPLETED") return "emerald";
  return "slate";
}

function priorityTone(priority?: string | null): Tone {
  if (priority === "URGENT") return "rose";
  if (priority === "HIGH") return "amber";
  if (priority === "LOW") return "slate";
  return "blue";
}

function priorityLabel(priority?: string | null) {
  if (!priority) return "Normal";
  return PRIORITY_LABEL[priority] || priority;
}

function orderTypeLabel(type?: string | null) {
  if (!type) return "-";

  const labels: Record<string, string> = {
    PREVENTIVE: "Preventiva",
    CORRECTIVE: "Corretiva",
    INSTALLATION: "Instalacao",
    DEMOBILIZATION: "Desmobilizacao",
    REFUELING: "Abastecimento",
  };

  return labels[type] || type;
}

function skillLabel(level: string) {
  const labels: Record<string, string> = {
    TRAINEE: "Trainee",
    JUNIOR: "Junior",
    PLENO: "Pleno",
    SENIOR: "Senior",
    SPECIALIST: "Especialista",
  };

  return labels[level] || level;
}

function formatDistance(distanceKm: number) {
  if (!Number.isFinite(distanceKm)) return "Sem georreferencia";
  if (distanceKm < 1) return "Menos de 1 km";
  return `${distanceKm.toFixed(1)} km`;
}

function suggestTechnician(
  order: DispatchOrder,
  technicians: DispatchTechnician[],
  openOrderCountByTech: Map<string, number>,
): DispatchSuggestion | null {
  const orderText = `${order.title} ${order.description || ""}`.toLowerCase();
  const siteLatitude = order.site?.latitude ?? order.generator?.currentSite?.latitude;
  const siteLongitude = order.site?.longitude ?? order.generator?.currentSite?.longitude;

  const ranked = technicians
    .filter((technician) => technician.user.isActive)
    .map((technician) => {
      const skillHits = technician.skills.reduce((acc, skill) => {
        if (!skill) return acc;
        return orderText.includes(skill.toLowerCase()) ? acc + 1 : acc;
      }, 0);

      const openCount = openOrderCountByTech.get(technician.id) || 0;
      const distanceKm =
        siteLatitude !== undefined &&
        siteLatitude !== null &&
        siteLongitude !== undefined &&
        siteLongitude !== null &&
        technician.latitude !== undefined &&
        technician.latitude !== null &&
        technician.longitude !== undefined &&
        technician.longitude !== null
          ? haversineKm(
              siteLatitude,
              siteLongitude,
              technician.latitude,
              technician.longitude,
            )
          : Number.POSITIVE_INFINITY;

      return {
        technician,
        skillHits,
        openCount,
        distanceKm,
      } satisfies DispatchSuggestion;
    })
    .sort((a, b) => {
      if (a.skillHits !== b.skillHits) return b.skillHits - a.skillHits;
      if (a.openCount !== b.openCount) return a.openCount - b.openCount;
      return a.distanceKm - b.distanceKm;
    });

  return ranked[0] || null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}
