"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { getAccessFromToken } from "@/lib/access";
import {
  DataPill,
  EmptyState,
  FormField,
  PageHero,
  SectionCard,
  SelectInput,
  StatusBanner,
  TextAreaInput,
  TextInput,
} from "../components/DashboardPageKit";

type Mode = "downtime" | "warranty";
type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";
type GeneratorOption = {
  id: string;
  code: string;
  name: string;
  brand: string;
  serialNumber?: string | null;
  clientId: string;
  client: { id: string; companyName: string };
  warrantyEndDate?: string | null;
  operationalStatus: string;
};
type Options = {
  generators: GeneratorOption[];
  users: Array<{ id: string; name: string; role: string }>;
  suppliers: Array<{ id: string; companyName: string }>;
  manufacturers: Array<{ id: string; name: string }>;
  orders: Array<{
    id: string;
    title: string;
    status: string;
    generatorId: string;
  }>;
  tickets: Array<{
    id: string;
    code: string;
    title: string;
    generatorId: string;
  }>;
  downtimes: Array<{
    id: string;
    code: string;
    generatorId: string;
    status: string;
  }>;
};
type CaseRecord = {
  id: string;
  code: string;
  status: string;
  priority?: string;
  owner?: string;
  title?: string;
  symptom?: string;
  defectDescription?: string;
  operationalImpact?: string | null;
  failureCategory?: string | null;
  diagnosis?: string | null;
  temporarySolution?: string | null;
  rootCause?: string | null;
  resolution?: string | null;
  coverageDecision?: string | null;
  component?: string | null;
  partNumber?: string | null;
  serialNumber?: string | null;
  externalProtocol?: string | null;
  supplierProtocol?: string | null;
  claimAmount?: number | null;
  approvedAmount?: number | null;
  assignedUserId?: string | null;
  generatorId: string;
  clientId: string;
  maintenanceOrderId?: string | null;
  ticketId?: string | null;
  supplierId?: string | null;
  manufacturerId?: string | null;
  downtimeId?: string | null;
  failureStartedAt?: string;
  reportedAt?: string;
  targetRestoreAt?: string | null;
  restoredAt?: string | null;
  coverageEndsAt?: string | null;
  responseDueAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  createdAt?: string;
  generator: GeneratorOption;
  client: { id: string; companyName: string; code?: string };
  maintenanceOrder?: { id: string; title: string; status: string } | null;
  ticket?: { id: string; code: string; title: string; status: string } | null;
  downtime?: { id: string; code: string; status: string } | null;
  supplier?: { id: string; companyName: string } | null;
  manufacturer?: { id: string; name: string } | null;
  warrantyCases?: Array<{
    id: string;
    code: string;
    title: string;
    status: string;
    owner: string;
  }>;
  _count?: { warrantyCases: number };
  allowedTransitions?: string[];
  events?: Array<{
    id: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    note: string;
    actorName?: string | null;
    createdAt: string;
  }>;
  attachments?: Array<{
    id: string;
    kind: string;
    name: string;
    url: string;
    addedByName?: string | null;
    createdAt: string;
  }>;
};
type CaseList = {
  items: CaseRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: Record<string, number>;
};
type FormValues = Record<string, string>;

const DOWNTIME_STATUS: Record<string, string> = {
  REPORTED: "Registrada",
  TRIAGE: "Triagem",
  IN_REPAIR: "Em reparo",
  WAITING_PARTS: "Aguardando peças",
  WAITING_SUPPLIER: "Aguardando fornecedor",
  MONITORING: "Em observação",
  RESTORED: "Operação restaurada",
  CLOSED: "Encerrada",
  CANCELED: "Cancelada",
};
const WARRANTY_STATUS: Record<string, string> = {
  OPEN: "Aberta",
  TRIAGE: "Análise de cobertura",
  WAITING_DOCUMENTS: "Aguardando documentos",
  WAITING_SUPPLIER: "Nossa · aguardando fornecedor",
  WAITING_MANUFACTURER: "Aguardando fábrica",
  APPROVED: "Cobertura aprovada",
  REJECTED: "Cobertura recusada",
  REPAIRING: "Em execução",
  RESOLVED: "Resolvida",
  CLOSED: "Encerrada",
  CANCELED: "Cancelada",
};
const PRIORITY: Record<string, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};
const ATTACHMENT_KIND: Record<string, string> = {
  PHOTO: "Foto",
  REPORT: "Laudo",
  INVOICE: "Nota fiscal",
  PROTOCOL: "Protocolo",
  OTHER: "Outro",
};
const PRIMARY =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function localDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function duration(start?: string, end?: string | null) {
  if (!start) return "—";
  const hours = Math.max(
    0,
    Math.round(
      ((end ? new Date(end) : new Date()).getTime() -
        new Date(start).getTime()) /
        3_600_000,
    ),
  );
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function statusTone(status: string): Tone {
  if (["CANCELED", "REJECTED"].includes(status)) return "rose";
  if (["RESTORED", "RESOLVED", "CLOSED", "APPROVED"].includes(status))
    return "emerald";
  if (status.startsWith("WAITING")) return "amber";
  return "blue";
}

function fieldLabel(label: string, children: React.ReactNode) {
  return <FormField label={label}>{children}</FormField>;
}

function casePath(mode: Mode) {
  return mode === "downtime"
    ? "/operations/downtimes"
    : "/operations/warranties";
}

function initialForm(mode: Mode): FormValues {
  const now = new Date();
  return mode === "downtime"
    ? {
        generatorId: "",
        symptom: "",
        operationalImpact: "",
        failureCategory: "",
        priority: "HIGH",
        failureStartedAt: localDateTime(now.toISOString()),
        responseDueAt: localDateTime(
          new Date(now.getTime() + 4 * 3_600_000).toISOString(),
        ),
        targetRestoreAt: "",
        assignedUserId: "",
        maintenanceOrderId: "",
        ticketId: "",
      }
    : {
        generatorId: "",
        owner: "OUR",
        title: "",
        defectDescription: "",
        component: "",
        partNumber: "",
        serialNumber: "",
        responseDueAt: localDateTime(
          new Date(now.getTime() + 7 * 86_400_000).toISOString(),
        ),
        claimAmount: "",
        assignedUserId: "",
        downtimeId: "",
        maintenanceOrderId: "",
        supplierId: "",
        manufacturerId: "",
      };
}

function editForm(record: CaseRecord, mode: Mode): FormValues {
  const common = {
    assignedUserId: record.assignedUserId || "",
    responseDueAt: localDateTime(record.responseDueAt),
    maintenanceOrderId: record.maintenanceOrderId || "",
  };
  return mode === "downtime"
    ? {
        ...common,
        priority: record.priority || "HIGH",
        ticketId: record.ticketId || "",
        targetRestoreAt: localDateTime(record.targetRestoreAt),
        operationalImpact: record.operationalImpact || "",
        diagnosis: record.diagnosis || "",
        temporarySolution: record.temporarySolution || "",
        rootCause: record.rootCause || "",
        resolution: record.resolution || "",
      }
    : {
        ...common,
        owner: record.owner || "OUR",
        supplierId: record.supplierId || "",
        manufacturerId: record.manufacturerId || "",
        downtimeId: record.downtimeId || "",
        claimAmount: record.claimAmount?.toString() || "",
        approvedAmount: record.approvedAmount?.toString() || "",
        diagnosis: record.diagnosis || "",
        coverageDecision: record.coverageDecision || "",
        resolution: record.resolution || "",
        externalProtocol: record.externalProtocol || "",
        supplierProtocol: record.supplierProtocol || "",
      };
}

export default function OperationalCasesWorkspace({ mode }: { mode: Mode }) {
  const isDowntime = mode === "downtime";
  const base = casePath(mode);
  const labels = isDowntime ? DOWNTIME_STATUS : WARRANTY_STATUS;
  const [access, setAccess] = useState(() => getAccessFromToken());
  const [options, setOptions] = useState<Options | null>(null);
  const [list, setList] = useState<CaseList | null>(null);
  const [detail, setDetail] = useState<CaseRecord | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<FormValues>(() => initialForm(mode));
  const [draft, setDraft] = useState<FormValues>({});
  const [generatorSearch, setGeneratorSearch] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [transition, setTransition] = useState("");
  const [note, setNote] = useState("");
  const [attachment, setAttachment] = useState({
    name: "",
    url: "",
    kind: "PHOTO",
  });
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setAccess(getAccessFromToken());
    const params = new URLSearchParams(window.location.search);
    setSelectedId(params.get("case") || "");
    if (mode === "warranty" && params.get("generatorId")) {
      setForm((current) => ({
        ...current,
        generatorId: params.get("generatorId") || "",
        downtimeId: params.get("downtimeId") || "",
      }));
      setCreateOpen(true);
    }
  }, [mode]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let alive = true;
    void apiFetch("/operations/options", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            await readApiErrorMessage(response, "Falha ao carregar opções."),
          );
        return response.json() as Promise<Options>;
      })
      .then((data) => {
        if (alive) setOptions(data);
      })
      .catch((cause: unknown) => {
        if (alive)
          setError(
            cause instanceof Error
              ? cause.message
              : "Falha ao carregar opções.",
          );
      });
    return () => {
      alive = false;
    };
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "25",
      });
      if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
      if (status !== "ALL") params.set("status", status);
      const response = await apiFetch(`${base}?${params}`, {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          await readApiErrorMessage(response, "Falha ao carregar casos."),
        );
      setList((await response.json()) as CaseList);
      setError("");
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao carregar casos.",
      );
    } finally {
      setLoading(false);
    }
  }, [base, debouncedSearch, page, status]);

  useEffect(() => {
    void loadList();
  }, [loadList, reload]);

  const loadDetail = useCallback(
    async (id: string) => {
      if (!id) return;
      try {
        const response = await apiFetch(`${base}/${id}`, { cache: "no-store" });
        if (!response.ok)
          throw new Error(
            await readApiErrorMessage(response, "Falha ao abrir o caso."),
          );
        const record = (await response.json()) as CaseRecord;
        setDetail(record);
        setDraft(editForm(record, mode));
        setTransition(record.status);
        setNote("");
      } catch (cause: unknown) {
        setError(
          cause instanceof Error ? cause.message : "Falha ao abrir o caso.",
        );
      }
    },
    [base, mode],
  );

  useEffect(() => {
    void loadDetail(selectedId);
  }, [loadDetail, selectedId]);

  const selectedGenerator = options?.generators.find(
    (item) => item.id === form.generatorId,
  );
  const filteredGenerators = useMemo(() => {
    const q = generatorSearch.trim().toLocaleLowerCase("pt-BR");
    return (options?.generators || [])
      .filter(
        (item) =>
          !q ||
          `${item.code} ${item.name} ${item.client.companyName} ${item.serialNumber || ""}`
            .toLocaleLowerCase("pt-BR")
            .includes(q),
      )
      .slice(0, 120);
  }, [generatorSearch, options]);
  const formOrders = (options?.orders || []).filter(
    (item) => item.generatorId === form.generatorId,
  );
  const formTickets = (options?.tickets || []).filter(
    (item) => item.generatorId === form.generatorId,
  );
  const formDowntimes = (options?.downtimes || []).filter(
    (item) => item.generatorId === form.generatorId,
  );
  const linkedOrders = (options?.orders || []).filter(
    (item) => item.generatorId === detail?.generatorId,
  );
  const linkedTickets = (options?.tickets || []).filter(
    (item) => item.generatorId === detail?.generatorId,
  );
  const linkedDowntimes = (options?.downtimes || []).filter(
    (item) => item.generatorId === detail?.generatorId,
  );

  function selectCase(id: string) {
    setSelectedId(id);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?case=${encodeURIComponent(id)}`,
    );
  }

  async function submitCreate() {
    if (!form.generatorId) {
      setError("Selecione um equipamento.");
      return;
    }
    setBusy("create");
    setError("");
    try {
      const payload: Record<string, unknown> = isDowntime
        ? {
            generatorId: form.generatorId,
            symptom: form.symptom,
            failureStartedAt: toIso(form.failureStartedAt),
            priority: form.priority,
            operationalImpact: form.operationalImpact || undefined,
            failureCategory: form.failureCategory || undefined,
            responseDueAt: toIso(form.responseDueAt) || undefined,
            targetRestoreAt: toIso(form.targetRestoreAt) || undefined,
            assignedUserId: form.assignedUserId || undefined,
            maintenanceOrderId: form.maintenanceOrderId || undefined,
            ticketId: form.ticketId || undefined,
          }
        : {
            generatorId: form.generatorId,
            owner: form.owner,
            title: form.title,
            defectDescription: form.defectDescription,
            component: form.component || undefined,
            partNumber: form.partNumber || undefined,
            serialNumber: form.serialNumber || undefined,
            claimAmount: form.claimAmount
              ? Number(form.claimAmount)
              : undefined,
            responseDueAt: toIso(form.responseDueAt) || undefined,
            assignedUserId: form.assignedUserId || undefined,
            downtimeId: form.downtimeId || undefined,
            maintenanceOrderId: form.maintenanceOrderId || undefined,
            supplierId: form.supplierId || undefined,
            manufacturerId: form.manufacturerId || undefined,
          };
      const response = await apiFetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok)
        throw new Error(
          await readApiErrorMessage(response, "Não foi possível abrir o caso."),
        );
      const created = (await response.json()) as CaseRecord;
      setCreateOpen(false);
      setForm(initialForm(mode));
      setNotice(`${created.code} criado e incluído na fila.`);
      setReload((value) => value + 1);
      selectCase(created.id);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível abrir o caso.",
      );
    } finally {
      setBusy("");
    }
  }

  async function submitUpdate() {
    if (!detail) return;
    setBusy("update");
    setError("");
    try {
      const common = {
        status: transition !== detail.status ? transition : undefined,
        note: note.trim() || undefined,
        assignedUserId: draft.assignedUserId || null,
        maintenanceOrderId: draft.maintenanceOrderId || null,
        responseDueAt: toIso(draft.responseDueAt),
      };
      const payload = isDowntime
        ? {
            ...common,
            priority: draft.priority,
            ticketId: draft.ticketId || null,
            targetRestoreAt: toIso(draft.targetRestoreAt),
            operationalImpact: draft.operationalImpact || null,
            diagnosis: draft.diagnosis || null,
            temporarySolution: draft.temporarySolution || null,
            rootCause: draft.rootCause || null,
            resolution: draft.resolution || null,
          }
        : {
            ...common,
            owner: draft.owner,
            supplierId: draft.supplierId || null,
            manufacturerId: draft.manufacturerId || null,
            downtimeId: draft.downtimeId || null,
            claimAmount: draft.claimAmount ? Number(draft.claimAmount) : null,
            approvedAmount: draft.approvedAmount
              ? Number(draft.approvedAmount)
              : null,
            diagnosis: draft.diagnosis || null,
            coverageDecision: draft.coverageDecision || null,
            resolution: draft.resolution || null,
            externalProtocol: draft.externalProtocol || null,
            supplierProtocol: draft.supplierProtocol || null,
          };
      const response = await apiFetch(`${base}/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok)
        throw new Error(
          await readApiErrorMessage(
            response,
            "Não foi possível salvar o caso.",
          ),
        );
      const updated = (await response.json()) as CaseRecord;
      setDetail(updated);
      setDraft(editForm(updated, mode));
      setTransition(updated.status);
      setNote("");
      setNotice(`${updated.code} atualizado. Histórico registrado.`);
      setReload((value) => value + 1);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o caso.",
      );
    } finally {
      setBusy("");
    }
  }

  async function openOrder() {
    if (!detail) return;
    setBusy("order");
    setError("");
    try {
      const response = await apiFetch(`${base}/${detail.id}/open-order`, {
        method: "POST",
      });
      if (!response.ok)
        throw new Error(
          await readApiErrorMessage(response, "Não foi possível abrir a OS."),
        );
      const updated = (await response.json()) as CaseRecord;
      setDetail(updated);
      setDraft(editForm(updated, mode));
      setNotice("OS corretiva criada e vinculada à parada.");
      setReload((value) => value + 1);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível abrir a OS.",
      );
    } finally {
      setBusy("");
    }
  }

  async function addAttachment() {
    if (!detail) return;
    setBusy("attachment");
    setError("");
    try {
      const response = await apiFetch(`${base}/${detail.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attachment),
      });
      if (!response.ok)
        throw new Error(
          await readApiErrorMessage(
            response,
            "Não foi possível anexar o link.",
          ),
        );
      const updated = (await response.json()) as CaseRecord;
      setDetail(updated);
      setAttachment({ name: "", url: "", kind: "PHOTO" });
      setNotice("Documento vinculado ao histórico do caso.");
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível anexar o link.",
      );
    } finally {
      setBusy("");
    }
  }

  async function removeAttachment(attachmentId: string) {
    if (!detail) return;
    setBusy(`attachment-${attachmentId}`);
    setError("");
    try {
      const response = await apiFetch(
        `${base}/${detail.id}/attachments/${attachmentId}`,
        { method: "DELETE" },
      );
      if (!response.ok)
        throw new Error(
          await readApiErrorMessage(
            response,
            "Não foi possível remover o link.",
          ),
        );
      setDetail((await response.json()) as CaseRecord);
      setNotice("Link removido; o evento permanece no histórico.");
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível remover o link.",
      );
    } finally {
      setBusy("");
    }
  }

  const canCreate = access.orders.create;
  const canManage = access.orders.update;
  const metrics = isDowntime
    ? [
        {
          label: "Em aberto",
          value: list?.summary.active ?? 0,
          tone: "blue" as Tone,
        },
        {
          label: "Críticas",
          value: list?.summary.critical ?? 0,
          tone: "rose" as Tone,
        },
        {
          label: "SLA vencido",
          value: list?.summary.overdue ?? 0,
          tone: "amber" as Tone,
        },
        {
          label: "Restauradas",
          value: list?.summary.restored ?? 0,
          tone: "emerald" as Tone,
        },
      ]
    : [
        {
          label: "Garantia nossa",
          value: list?.summary.ours ?? 0,
          tone: "blue" as Tone,
        },
        {
          label: "Da fábrica",
          value: list?.summary.factory ?? 0,
          tone: "slate" as Tone,
        },
        {
          label: "Nossa · no fornecedor",
          value: list?.summary.waitingSupplier ?? 0,
          tone: "amber" as Tone,
        },
        {
          label: "Prazo vencido",
          value: list?.summary.overdue ?? 0,
          tone: "rose" as Tone,
        },
      ];

  return (
    <main className="mx-auto w-full max-w-[1800px] space-y-5 p-4 pb-12 sm:p-6 lg:p-8">
      <PageHero
        eyebrow="Operação · Fluxo rastreável"
        title={isDowntime ? "Máquinas paradas" : "Gestão de garantias"}
        description={
          isDowntime
            ? "Da primeira falha ao retorno da operação: prioridade, SLA, plano de ação, OS, evidências e causa raiz em um só lugar."
            : "Acompanhe coberturas da Manitec e da fábrica, inclusive casos nossos em espera de fornecedor, até a decisão e solução."
        }
        stats={metrics.map((item) => ({
          label: item.label,
          value: String(item.value),
          tone: item.tone,
        }))}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              className="rounded-xl border border-white/25 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
              href={
                isDowntime
                  ? "/dashboard/operation/warranties"
                  : "/dashboard/operation/downtimes"
              }
            >
              {isDowntime ? "Ver garantias" : "Ver máquinas paradas"}
            </Link>
            {canCreate ? (
              <button
                className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-950 hover:bg-slate-100"
                type="button"
                onClick={() => setCreateOpen((value) => !value)}
              >
                {createOpen
                  ? "Fechar cadastro"
                  : isDowntime
                    ? "+ Registrar parada"
                    : "+ Abrir garantia"}
              </button>
            ) : null}
          </div>
        }
      />

      {error ? (
        <StatusBanner tone="rose">
          <strong>Atenção:</strong> {error}
        </StatusBanner>
      ) : null}
      {notice ? (
        <StatusBanner tone="emerald">
          <strong>Concluído:</strong> {notice}
        </StatusBanner>
      ) : null}

      {createOpen && canCreate ? (
        <SectionCard
          eyebrow="Novo processo"
          title={
            isDowntime
              ? "Registrar máquina parada"
              : "Abrir processo de garantia"
          }
          description="Preencha os dados iniciais. A etapa será registrada automaticamente no histórico."
          actions={
            <button
              className={SECONDARY}
              type="button"
              onClick={() => setCreateOpen(false)}
            >
              Cancelar
            </button>
          }
        >
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {fieldLabel(
              "Buscar equipamento",
              <TextInput
                value={generatorSearch}
                onChange={(event) => setGeneratorSearch(event.target.value)}
                placeholder="Nome, código, cliente ou número de série"
              />,
            )}
            {fieldLabel(
              "Equipamento *",
              <SelectInput
                value={form.generatorId || ""}
                onChange={(event) =>
                  setForm((old) => ({
                    ...old,
                    generatorId: event.target.value,
                    maintenanceOrderId: "",
                    ticketId: "",
                    downtimeId: "",
                  }))
                }
              >
                <option value="">Selecione</option>
                {filteredGenerators.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} · {item.name} · {item.client.companyName}
                  </option>
                ))}
              </SelectInput>,
            )}
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <p className="font-semibold">
                {selectedGenerator?.client.companyName ||
                  "Cliente do equipamento"}
              </p>
              <p className="mt-1 text-xs">
                {selectedGenerator
                  ? `${selectedGenerator.brand} · Série ${selectedGenerator.serialNumber || "não informada"}`
                  : "Selecione um equipamento para identificar cliente e cobertura."}
              </p>
              {selectedGenerator?.warrantyEndDate ? (
                <p className="mt-1 text-xs">
                  Garantia cadastrada até{" "}
                  {formatDate(selectedGenerator.warrantyEndDate)}
                </p>
              ) : null}
            </div>
            {isDowntime ? (
              <>
                {fieldLabel(
                  "Início da parada *",
                  <TextInput
                    type="datetime-local"
                    value={form.failureStartedAt || ""}
                    onChange={(event) =>
                      setForm((old) => ({
                        ...old,
                        failureStartedAt: event.target.value,
                      }))
                    }
                  />,
                )}
                {fieldLabel(
                  "Prioridade",
                  <SelectInput
                    value={form.priority || "HIGH"}
                    onChange={(event) =>
                      setForm((old) => ({
                        ...old,
                        priority: event.target.value,
                      }))
                    }
                  >
                    {Object.entries(PRIORITY).map(([key, value]) => (
                      <option key={key} value={key}>
                        {value}
                      </option>
                    ))}
                  </SelectInput>,
                )}
                {fieldLabel(
                  "Prazo de resposta",
                  <TextInput
                    type="datetime-local"
                    value={form.responseDueAt || ""}
                    onChange={(event) =>
                      setForm((old) => ({
                        ...old,
                        responseDueAt: event.target.value,
                      }))
                    }
                  />,
                )}
                {fieldLabel(
                  "Previsão de retorno",
                  <TextInput
                    type="datetime-local"
                    value={form.targetRestoreAt || ""}
                    onChange={(event) =>
                      setForm((old) => ({
                        ...old,
                        targetRestoreAt: event.target.value,
                      }))
                    }
                  />,
                )}
                {fieldLabel(
                  "Tipo de falha",
                  <TextInput
                    value={form.failureCategory || ""}
                    onChange={(event) =>
                      setForm((old) => ({
                        ...old,
                        failureCategory: event.target.value,
                      }))
                    }
                    placeholder="Ex.: motor, alternador, automação"
                  />,
                )}
                {fieldLabel(
                  "OS existente",
                  <SelectInput
                    value={form.maintenanceOrderId || ""}
                    onChange={(event) =>
                      setForm((old) => ({
                        ...old,
                        maintenanceOrderId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Vincular depois</option>
                    {formOrders.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} · {item.status}
                      </option>
                    ))}
                  </SelectInput>,
                )}
                {fieldLabel(
                  "Chamado de origem",
                  <SelectInput
                    value={form.ticketId || ""}
                    onChange={(event) =>
                      setForm((old) => ({
                        ...old,
                        ticketId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Sem chamado</option>
                    {formTickets.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} · {item.title}
                      </option>
                    ))}
                  </SelectInput>,
                )}
                <div className="lg:col-span-2 2xl:col-span-3">
                  {fieldLabel(
                    "Sintoma / ocorrência *",
                    <TextAreaInput
                      rows={3}
                      value={form.symptom || ""}
                      onChange={(event) =>
                        setForm((old) => ({
                          ...old,
                          symptom: event.target.value,
                        }))
                      }
                      placeholder="O que parou, quando e em quais condições?"
                    />,
                  )}
                </div>
                <div className="lg:col-span-2">
                  {fieldLabel(
                    "Impacto operacional",
                    <TextAreaInput
                      rows={2}
                      value={form.operationalImpact || ""}
                      onChange={(event) =>
                        setForm((old) => ({
                          ...old,
                          operationalImpact: event.target.value,
                        }))
                      }
                      placeholder="Produção afetada, carga crítica, unidade sem redundância..."
                    />,
                  )}
                </div>
              </>
            ) : (
              <>
                {fieldLabel(
                  "Responsável pela cobertura *",
                  <SelectInput
                    value={form.owner || "OUR"}
                    onChange={(event) =>
                      setForm((old) => ({ ...old, owner: event.target.value }))
                    }
                  >
                    <option value="OUR">Garantia Manitec</option>
                    <option value="MANUFACTURER">Garantia da fábrica</option>
                  </SelectInput>,
                )}
                {fieldLabel(
                  "Prazo de resposta",
                  <TextInput
                    type="datetime-local"
                    value={form.responseDueAt || ""}
                    onChange={(event) =>
                      setForm((old) => ({
                        ...old,
                        responseDueAt: event.target.value,
                      }))
                    }
                  />,
                )}
                {fieldLabel(
                  "Título do caso *",
                  <TextInput
                    value={form.title || ""}
                    onChange={(event) =>
                      setForm((old) => ({ ...old, title: event.target.value }))
                    }
                    placeholder="Ex.: falha prematura no módulo"
                  />,
                )}
                {fieldLabel(
                  "Componente",
                  <TextInput
                    value={form.component || ""}
                    onChange={(event) =>
                      setForm((old) => ({
                        ...old,
                        component: event.target.value,
                      }))
                    }
                  />,
                )}
                {fieldLabel(
                  "Part number",
                  <TextInput
                    value={form.partNumber || ""}
                    onChange={(event) =>
                      setForm((old) => ({
                        ...old,
                        partNumber: event.target.value,
                      }))
                    }
                  />,
                )}
                {fieldLabel(
                  "Nº de série da peça",
                  <TextInput
                    value={form.serialNumber || ""}
                    onChange={(event) =>
                      setForm((old) => ({
                        ...old,
                        serialNumber: event.target.value,
                      }))
                    }
                  />,
                )}
                {fieldLabel(
                  "Valor solicitado (R$)",
                  <TextInput
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.claimAmount || ""}
                    onChange={(event) =>
                      setForm((old) => ({
                        ...old,
                        claimAmount: event.target.value,
                      }))
                    }
                  />,
                )}
                {fieldLabel(
                  "Fornecedor",
                  <SelectInput
                    value={form.supplierId || ""}
                    onChange={(event) =>
                      setForm((old) => ({
                        ...old,
                        supplierId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Definir depois</option>
                    {options?.suppliers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.companyName}
                      </option>
                    ))}
                  </SelectInput>,
                )}
                {fieldLabel(
                  "Fabricante",
                  <SelectInput
                    value={form.manufacturerId || ""}
                    onChange={(event) =>
                      setForm((old) => ({
                        ...old,
                        manufacturerId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Definir depois</option>
                    {options?.manufacturers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </SelectInput>,
                )}
                {fieldLabel(
                  "Parada relacionada",
                  <SelectInput
                    value={form.downtimeId || ""}
                    onChange={(event) =>
                      setForm((old) => ({
                        ...old,
                        downtimeId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Sem parada vinculada</option>
                    {formDowntimes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} · {DOWNTIME_STATUS[item.status]}
                      </option>
                    ))}
                  </SelectInput>,
                )}
                {fieldLabel(
                  "OS relacionada",
                  <SelectInput
                    value={form.maintenanceOrderId || ""}
                    onChange={(event) =>
                      setForm((old) => ({
                        ...old,
                        maintenanceOrderId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Sem OS vinculada</option>
                    {formOrders.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </SelectInput>,
                )}
                <div className="lg:col-span-2 2xl:col-span-3">
                  {fieldLabel(
                    "Defeito apresentado *",
                    <TextAreaInput
                      rows={3}
                      value={form.defectDescription || ""}
                      onChange={(event) =>
                        setForm((old) => ({
                          ...old,
                          defectDescription: event.target.value,
                        }))
                      }
                      placeholder="Descreva a falha e as condições de ocorrência."
                    />,
                  )}
                </div>
              </>
            )}
            {fieldLabel(
              "Responsável interno",
              <SelectInput
                value={form.assignedUserId || ""}
                onChange={(event) =>
                  setForm((old) => ({
                    ...old,
                    assignedUserId: event.target.value,
                  }))
                }
              >
                <option value="">A definir</option>
                {options?.users.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.role}
                  </option>
                ))}
              </SelectInput>,
            )}
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={PRIMARY}
              disabled={busy === "create"}
              onClick={() => void submitCreate()}
            >
              {busy === "create"
                ? "Registrando..."
                : isDowntime
                  ? "Registrar máquina parada"
                  : "Abrir garantia"}
            </button>
          </div>
        </SectionCard>
      ) : null}

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.4fr)] 2xl:items-start">
        <SectionCard
          eyebrow="Fila operacional"
          title={isDowntime ? "Ocorrências e retorno" : "Casos e coberturas"}
          description={`${list?.total ?? 0} registro(s) no filtro atual. Selecione um caso para acompanhar o processo.`}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_190px]">
            {fieldLabel(
              "Buscar",
              <TextInput
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder={
                  isDowntime
                    ? "Código, equipamento, cliente, sintoma"
                    : "Código, título, protocolo, cliente"
                }
              />,
            )}
            {fieldLabel(
              "Etapa",
              <SelectInput
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">Todas</option>
                {Object.entries(labels).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
              </SelectInput>,
            )}
          </div>
          <div className="mt-4 space-y-2">
            {loading ? (
              <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                Carregando fila...
              </p>
            ) : null}
            {!loading && !list?.items.length ? (
              <EmptyState
                title="Nenhum caso encontrado"
                description="Ajuste o filtro ou abra um novo processo."
              />
            ) : null}
            {list?.items.map((item) => {
              const overdue = isDowntime
                ? (item.status === "REPORTED" &&
                    !!item.responseDueAt &&
                    new Date(item.responseDueAt).getTime() < Date.now()) ||
                  (!["CLOSED", "CANCELED", "RESTORED"].includes(item.status) &&
                    !!item.targetRestoreAt &&
                    new Date(item.targetRestoreAt).getTime() < Date.now())
                : ![
                    "CLOSED",
                    "CANCELED",
                    "APPROVED",
                    "REJECTED",
                    "RESOLVED",
                  ].includes(item.status) &&
                  !!item.responseDueAt &&
                  new Date(item.responseDueAt).getTime() < Date.now();
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => selectCase(item.id)}
                  aria-pressed={selectedId === item.id}
                  className={`w-full rounded-2xl border p-4 text-left transition hover:border-sky-300 hover:bg-sky-50/50 ${selectedId === item.id ? "border-sky-400 bg-sky-50 ring-1 ring-sky-100" : "border-slate-200 bg-white"}`}
                >
                  <span className="flex flex-wrap items-start justify-between gap-2">
                    <span className="text-xs font-bold tracking-[0.08em] text-slate-500">
                      {item.code}
                    </span>
                    <DataPill tone={statusTone(item.status)}>
                      {labels[item.status] || item.status}
                    </DataPill>
                  </span>
                  <span className="mt-2 block text-sm font-bold text-slate-950">
                    {isDowntime ? item.generator.name : item.title}
                  </span>
                  <span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-600">
                    {isDowntime ? item.symptom : item.defectDescription}
                  </span>
                  <span className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <span>{item.client.companyName}</span>
                    <span>·</span>
                    <span>
                      {isDowntime
                        ? PRIORITY[item.priority || ""] || "—"
                        : item.owner === "OUR"
                          ? "Manitec"
                          : "Fábrica"}
                    </span>
                    {overdue ? (
                      <span className="font-bold text-rose-700">
                        · Prazo vencido
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-600">
            <span>
              Página {page} de {Math.max(1, Math.ceil((list?.total || 0) / 25))}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className={SECONDARY}
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Anterior
              </button>
              <button
                type="button"
                className={SECONDARY}
                disabled={page * 25 >= (list?.total || 0)}
                onClick={() => setPage((value) => value + 1)}
              >
                Próxima
              </button>
            </div>
          </div>
        </SectionCard>

        {detail ? (
          <div className="min-w-0 space-y-5">
            <SectionCard
              eyebrow={detail.code}
              title={
                isDowntime ? detail.generator.name : detail.title || "Garantia"
              }
              description={`${detail.client.companyName} · ${detail.generator.code} · ${detail.generator.brand}`}
              actions={
                <DataPill tone={statusTone(detail.status)}>
                  {labels[detail.status] || detail.status}
                </DataPill>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Info
                  label="Abertura"
                  value={formatDate(detail.reportedAt || detail.createdAt)}
                />
                <Info
                  label={
                    isDowntime ? "Tempo de parada" : "Cobertura cadastrada"
                  }
                  value={
                    isDowntime
                      ? duration(detail.failureStartedAt, detail.restoredAt)
                      : formatDate(detail.coverageEndsAt)
                  }
                />
                <Info
                  label="Prazo de resposta"
                  value={formatDate(detail.responseDueAt)}
                />
                <Info
                  label="Responsável"
                  value={
                    options?.users.find(
                      (item) => item.id === detail.assignedUserId,
                    )?.name || "A definir"
                  }
                />
              </div>
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-800">
                {isDowntime ? detail.symptom : detail.defectDescription}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                <Link
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50"
                  href={`/dashboard/equipments/${detail.generatorId}`}
                >
                  Abrir equipamento ↗
                </Link>
                {detail.maintenanceOrder ? (
                  <Link
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50"
                    href={`/dashboard/orders/${detail.maintenanceOrder.id}`}
                  >
                    Abrir OS ↗
                  </Link>
                ) : null}
                {detail.ticket ? (
                  <Link
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50"
                    href={`/dashboard/atendimento/${detail.ticket.id}`}
                  >
                    Abrir chamado ↗
                  </Link>
                ) : null}
                {detail.downtime ? (
                  <Link
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50"
                    href={`/dashboard/operation/downtimes?case=${detail.downtime.id}`}
                  >
                    Abrir parada ↗
                  </Link>
                ) : null}
                {isDowntime && canCreate ? (
                  <Link
                    className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sky-800 hover:bg-sky-100"
                    href={`/dashboard/operation/warranties?generatorId=${detail.generatorId}&downtimeId=${detail.id}`}
                  >
                    + Abrir garantia relacionada
                  </Link>
                ) : null}
              </div>
              {isDowntime && detail.warrantyCases?.length ? (
                <div className="mt-4 rounded-2xl border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Garantias relacionadas
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {detail.warrantyCases.map((item) => (
                      <Link
                        key={item.id}
                        className="text-sm font-semibold text-sky-700 hover:underline"
                        href={`/dashboard/operation/warranties?case=${item.id}`}
                      >
                        {item.code} · {item.title}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </SectionCard>

            {canManage ? (
              <SectionCard
                eyebrow="Gestão do caso"
                title="Próxima ação"
                description="Cada mudança de etapa fica registrada com autor, data e justificativa."
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  {fieldLabel(
                    "Etapa",
                    <SelectInput
                      value={transition}
                      onChange={(event) => setTransition(event.target.value)}
                    >
                      <option value={detail.status}>
                        {labels[detail.status]}
                      </option>
                      {detail.allowedTransitions
                        ?.filter(
                          (item) =>
                            (access.orders.finish ||
                              !["RESTORED", "RESOLVED", "CLOSED"].includes(
                                item,
                              )) &&
                            (access.orders.cancel || item !== "CANCELED"),
                        )
                        .map((item) => (
                          <option key={item} value={item}>
                            {labels[item]}
                          </option>
                        ))}
                    </SelectInput>,
                  )}
                  {fieldLabel(
                    "Responsável interno",
                    <SelectInput
                      value={draft.assignedUserId || ""}
                      onChange={(event) =>
                        setDraft((old) => ({
                          ...old,
                          assignedUserId: event.target.value,
                        }))
                      }
                    >
                      <option value="">A definir</option>
                      {options?.users.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </SelectInput>,
                  )}
                  {fieldLabel(
                    "Prazo de resposta",
                    <TextInput
                      type="datetime-local"
                      value={draft.responseDueAt || ""}
                      onChange={(event) =>
                        setDraft((old) => ({
                          ...old,
                          responseDueAt: event.target.value,
                        }))
                      }
                    />,
                  )}
                  {fieldLabel(
                    "OS vinculada",
                    <SelectInput
                      value={draft.maintenanceOrderId || ""}
                      onChange={(event) =>
                        setDraft((old) => ({
                          ...old,
                          maintenanceOrderId: event.target.value,
                        }))
                      }
                    >
                      <option value="">Nenhuma</option>
                      {linkedOrders.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                    </SelectInput>,
                  )}
                  {isDowntime ? (
                    <>
                      {fieldLabel(
                        "Prioridade",
                        <SelectInput
                          value={draft.priority || "HIGH"}
                          onChange={(event) =>
                            setDraft((old) => ({
                              ...old,
                              priority: event.target.value,
                            }))
                          }
                        >
                          {Object.entries(PRIORITY).map(([key, value]) => (
                            <option key={key} value={key}>
                              {value}
                            </option>
                          ))}
                        </SelectInput>,
                      )}
                      {fieldLabel(
                        "Previsão de retorno",
                        <TextInput
                          type="datetime-local"
                          value={draft.targetRestoreAt || ""}
                          onChange={(event) =>
                            setDraft((old) => ({
                              ...old,
                              targetRestoreAt: event.target.value,
                            }))
                          }
                        />,
                      )}
                      {fieldLabel(
                        "Chamado de origem",
                        <SelectInput
                          value={draft.ticketId || ""}
                          onChange={(event) =>
                            setDraft((old) => ({
                              ...old,
                              ticketId: event.target.value,
                            }))
                          }
                        >
                          <option value="">Nenhum</option>
                          {linkedTickets.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.code} · {item.title}
                            </option>
                          ))}
                        </SelectInput>,
                      )}
                      <div className="lg:col-span-2">
                        {fieldLabel(
                          "Impacto operacional",
                          <TextAreaInput
                            rows={2}
                            value={draft.operationalImpact || ""}
                            onChange={(event) =>
                              setDraft((old) => ({
                                ...old,
                                operationalImpact: event.target.value,
                              }))
                            }
                          />,
                        )}
                      </div>
                      <div className="lg:col-span-2">
                        {fieldLabel(
                          "Diagnóstico",
                          <TextAreaInput
                            rows={2}
                            value={draft.diagnosis || ""}
                            onChange={(event) =>
                              setDraft((old) => ({
                                ...old,
                                diagnosis: event.target.value,
                              }))
                            }
                          />,
                        )}
                      </div>
                      <div className="lg:col-span-2">
                        {fieldLabel(
                          "Solução temporária / contingência",
                          <TextAreaInput
                            rows={2}
                            value={draft.temporarySolution || ""}
                            onChange={(event) =>
                              setDraft((old) => ({
                                ...old,
                                temporarySolution: event.target.value,
                              }))
                            }
                          />,
                        )}
                      </div>
                      <div className="lg:col-span-2">
                        {fieldLabel(
                          "Causa raiz",
                          <TextAreaInput
                            rows={2}
                            value={draft.rootCause || ""}
                            onChange={(event) =>
                              setDraft((old) => ({
                                ...old,
                                rootCause: event.target.value,
                              }))
                            }
                          />,
                        )}
                      </div>
                      <div className="lg:col-span-2">
                        {fieldLabel(
                          "Solução definitiva / retorno",
                          <TextAreaInput
                            rows={2}
                            value={draft.resolution || ""}
                            onChange={(event) =>
                              setDraft((old) => ({
                                ...old,
                                resolution: event.target.value,
                              }))
                            }
                          />,
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      {fieldLabel(
                        "Cobertura",
                        <SelectInput
                          value={draft.owner || "OUR"}
                          onChange={(event) =>
                            setDraft((old) => ({
                              ...old,
                              owner: event.target.value,
                            }))
                          }
                          disabled={!["OPEN", "TRIAGE"].includes(detail.status)}
                        >
                          <option value="OUR">Manitec</option>
                          <option value="MANUFACTURER">Fábrica</option>
                        </SelectInput>,
                      )}
                      {fieldLabel(
                        "Fornecedor",
                        <SelectInput
                          value={draft.supplierId || ""}
                          onChange={(event) =>
                            setDraft((old) => ({
                              ...old,
                              supplierId: event.target.value,
                            }))
                          }
                        >
                          <option value="">Nenhum</option>
                          {options?.suppliers.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.companyName}
                            </option>
                          ))}
                        </SelectInput>,
                      )}
                      {fieldLabel(
                        "Fabricante",
                        <SelectInput
                          value={draft.manufacturerId || ""}
                          onChange={(event) =>
                            setDraft((old) => ({
                              ...old,
                              manufacturerId: event.target.value,
                            }))
                          }
                        >
                          <option value="">Nenhum</option>
                          {options?.manufacturers.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </SelectInput>,
                      )}
                      {fieldLabel(
                        "Parada vinculada",
                        <SelectInput
                          value={draft.downtimeId || ""}
                          onChange={(event) =>
                            setDraft((old) => ({
                              ...old,
                              downtimeId: event.target.value,
                            }))
                          }
                        >
                          <option value="">Nenhuma</option>
                          {linkedDowntimes.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.code}
                            </option>
                          ))}
                        </SelectInput>,
                      )}
                      {fieldLabel(
                        "Protocolo fábrica",
                        <TextInput
                          value={draft.externalProtocol || ""}
                          onChange={(event) =>
                            setDraft((old) => ({
                              ...old,
                              externalProtocol: event.target.value,
                            }))
                          }
                        />,
                      )}
                      {fieldLabel(
                        "Protocolo fornecedor",
                        <TextInput
                          value={draft.supplierProtocol || ""}
                          onChange={(event) =>
                            setDraft((old) => ({
                              ...old,
                              supplierProtocol: event.target.value,
                            }))
                          }
                        />,
                      )}
                      {fieldLabel(
                        "Valor solicitado (R$)",
                        <TextInput
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.claimAmount || ""}
                          onChange={(event) =>
                            setDraft((old) => ({
                              ...old,
                              claimAmount: event.target.value,
                            }))
                          }
                        />,
                      )}
                      {fieldLabel(
                        "Valor aprovado (R$)",
                        <TextInput
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.approvedAmount || ""}
                          onChange={(event) =>
                            setDraft((old) => ({
                              ...old,
                              approvedAmount: event.target.value,
                            }))
                          }
                        />,
                      )}
                      <div className="lg:col-span-2">
                        {fieldLabel(
                          "Diagnóstico técnico",
                          <TextAreaInput
                            rows={2}
                            value={draft.diagnosis || ""}
                            onChange={(event) =>
                              setDraft((old) => ({
                                ...old,
                                diagnosis: event.target.value,
                              }))
                            }
                          />,
                        )}
                      </div>
                      <div className="lg:col-span-2">
                        {fieldLabel(
                          "Decisão de cobertura / motivo",
                          <TextAreaInput
                            rows={2}
                            value={draft.coverageDecision || ""}
                            onChange={(event) =>
                              setDraft((old) => ({
                                ...old,
                                coverageDecision: event.target.value,
                              }))
                            }
                          />,
                        )}
                      </div>
                      <div className="lg:col-span-2">
                        {fieldLabel(
                          "Solução final",
                          <TextAreaInput
                            rows={2}
                            value={draft.resolution || ""}
                            onChange={(event) =>
                              setDraft((old) => ({
                                ...old,
                                resolution: event.target.value,
                              }))
                            }
                          />,
                        )}
                      </div>
                    </>
                  )}
                  <div className="lg:col-span-2">
                    {fieldLabel(
                      "Registro / justificativa da ação",
                      <TextAreaInput
                        rows={2}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Obrigatório ao mudar de etapa; aparece na linha do tempo."
                      />,
                    )}
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                  {isDowntime &&
                  !detail.maintenanceOrderId &&
                  canCreate &&
                  !["CLOSED", "CANCELED", "RESTORED"].includes(
                    detail.status,
                  ) ? (
                    <button
                      type="button"
                      className={SECONDARY}
                      disabled={Boolean(busy)}
                      onClick={() => void openOrder()}
                    >
                      {busy === "order"
                        ? "Criando OS..."
                        : "+ Abrir OS corretiva"}
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    className={PRIMARY}
                    disabled={Boolean(busy)}
                    onClick={() => void submitUpdate()}
                  >
                    {busy === "update"
                      ? "Salvando..."
                      : "Salvar e registrar evento"}
                  </button>
                </div>
              </SectionCard>
            ) : null}

            <div className="grid gap-5 xl:grid-cols-2">
              <SectionCard
                eyebrow="Comprovação"
                title="Fotos e documentos"
                description="Vincule fotos, laudos, notas fiscais e protocolos por URL ou caminho interno."
              >
                {canManage ? (
                  <div className="grid gap-2 sm:grid-cols-[145px_1fr]">
                    <SelectInput
                      value={attachment.kind}
                      onChange={(event) =>
                        setAttachment((old) => ({
                          ...old,
                          kind: event.target.value,
                        }))
                      }
                    >
                      {Object.entries(ATTACHMENT_KIND).map(([key, value]) => (
                        <option key={key} value={key}>
                          {value}
                        </option>
                      ))}
                    </SelectInput>
                    <TextInput
                      value={attachment.name}
                      onChange={(event) =>
                        setAttachment((old) => ({
                          ...old,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Nome do documento"
                    />
                    <div className="sm:col-span-2">
                      <TextInput
                        value={attachment.url}
                        onChange={(event) =>
                          setAttachment((old) => ({
                            ...old,
                            url: event.target.value,
                          }))
                        }
                        placeholder="https://... ou /api/..."
                      />
                    </div>
                    <div className="sm:col-span-2 flex justify-end">
                      <button
                        type="button"
                        className={SECONDARY}
                        disabled={
                          Boolean(busy) ||
                          !attachment.name.trim() ||
                          !attachment.url.trim()
                        }
                        onClick={() => void addAttachment()}
                      >
                        Vincular documento
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="mt-4 space-y-2">
                  {detail.attachments?.length ? (
                    detail.attachments.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <a
                            className="block truncate font-semibold text-sky-700 hover:underline"
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {item.name} ↗
                          </a>
                          <p className="text-xs text-slate-500">
                            {ATTACHMENT_KIND[item.kind]} ·{" "}
                            {formatDate(item.createdAt)}
                          </p>
                        </div>
                        {canManage ? (
                          <button
                            type="button"
                            className="text-xs font-semibold text-rose-700 hover:underline"
                            disabled={Boolean(busy)}
                            onClick={() => void removeAttachment(item.id)}
                          >
                            Remover
                          </button>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">
                      Nenhum documento vinculado.
                    </p>
                  )}
                </div>
              </SectionCard>
              <SectionCard
                eyebrow="Rastreabilidade"
                title="Linha do tempo"
                description="Histórico de etapas, atualizações e responsáveis."
              >
                <ol className="max-h-[440px] space-y-3 overflow-y-auto pr-1">
                  {detail.events?.map((event) => (
                    <li
                      key={event.id}
                      className="border-l-2 border-sky-200 py-1 pl-4"
                    >
                      <p className="text-sm font-semibold text-slate-900">
                        {event.toStatus
                          ? labels[event.toStatus] || event.toStatus
                          : "Atualização"}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                        {event.note}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {event.actorName || "Sistema"} ·{" "}
                        {formatDate(event.createdAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              </SectionCard>
            </div>
          </div>
        ) : (
          <SectionCard
            eyebrow="Detalhes"
            title="Selecione um processo"
            description="Os dados completos e a linha do tempo serão exibidos aqui."
          >
            <EmptyState
              title="Nenhum caso selecionado"
              description="Abra um item da fila para continuar."
            />
          </SectionCard>
        )}
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
