"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";
import { clearAuthSession } from "@/lib/auth-session";
import {
  DataPill,
  EmptyState,
  FieldBox,
  FormField,
  PageHero,
  SectionCard,
  SelectInput,
  StatusBanner,
  TextAreaInput,
  TextInput,
} from "../../components/DashboardPageKit";

type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";
type CostCenterType = "CLIENT" | "CONTRACT" | "GENERATOR" | "INTERNAL";
type EntryType = "REVENUE" | "COST" | "EXPENSE";
type EntrySourceType = "MANUAL" | "RECLASSIFICATION" | "CLOSING";

type ClientOption = {
  id: string;
  companyName: string;
};

type ContractOption = {
  id: string;
  code?: string | null;
  title?: string | null;
  client?: { companyName?: string | null } | null;
};

type GeneratorOption = {
  id: string;
  name?: string | null;
  serialNumber?: string | null;
  client?: { companyName?: string | null } | null;
};

type CostCenter = {
  id: string;
  code: string;
  name: string;
  type: CostCenterType;
  isActive: boolean;
  client?: { id: string; companyName?: string | null } | null;
  contract?: { id: string; code?: string | null } | null;
  generator?: {
    id: string;
    name?: string | null;
    serialNumber?: string | null;
  } | null;
};

type DreEntry = {
  id: string;
  entryType: EntryType;
  sourceType: string;
  sourceId?: string | null;
  amount: number;
  competenceDate: string;
  notes?: string | null;
  createdAt: string;
};

type DreTotals = {
  revenue: number;
  costs: number;
  expenses: number;
  grossMargin: number;
  operationalResult: number;
  marginPercent: number;
  realizedRevenue?: number;
  realizedCosts?: number;
  realizedExpenses?: number;
  realizedOperationalResult?: number;
  realizedMarginPercent?: number;
};

type DrePayload = {
  costCenterId: string;
  period: { from: string; to: string };
  totals: DreTotals;
  entries: DreEntry[];
};

type CostCenterDraft = {
  code: string;
  name: string;
  type: CostCenterType;
  clientId: string;
  contractId: string;
  generatorId: string;
  isActive: boolean;
};

type EntryDraft = {
  entryType: EntryType;
  sourceType: EntrySourceType;
  amount: string;
  competenceDate: string;
  notes: string;
};

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

const TYPE_LABELS: Record<CostCenterType, string> = {
  CLIENT: "Cliente",
  CONTRACT: "Contrato",
  GENERATOR: "Gerador",
  INTERNAL: "Interno",
};

const ENTRY_LABELS: Record<EntryType, string> = {
  REVENUE: "Receita",
  COST: "Custo",
  EXPENSE: "Despesa",
};

const ENTRY_TONE: Record<EntryType, Tone> = {
  REVENUE: "emerald",
  COST: "amber",
  EXPENSE: "rose",
};

const SOURCE_LABELS: Record<EntrySourceType, string> = {
  MANUAL: "Manual",
  RECLASSIFICATION: "Reclassificacao",
  CLOSING: "Fechamento",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("pt-BR");
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function emptyCenterDraft(): CostCenterDraft {
  return {
    code: "",
    name: "",
    type: "INTERNAL",
    clientId: "",
    contractId: "",
    generatorId: "",
    isActive: true,
  };
}

function emptyEntryDraft(): EntryDraft {
  return {
    entryType: "EXPENSE",
    sourceType: "MANUAL",
    amount: "",
    competenceDate: new Date().toISOString().slice(0, 10),
    notes: "",
  };
}

function centerDraftFromCenter(center: CostCenter): CostCenterDraft {
  return {
    code: center.code,
    name: center.name,
    type: center.type,
    clientId: center.client?.id || "",
    contractId: center.contract?.id || "",
    generatorId: center.generator?.id || "",
    isActive: center.isActive,
  };
}

function parseMoneyInput(value: string) {
  return Number(value.replace(",", ".").trim());
}

function buildDreQuery(fromDate: string, toDate: string) {
  const params = new URLSearchParams();
  if (fromDate) params.set("from", fromDate);
  if (toDate) params.set("to", toDate);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function describeCenterAnchor(center?: CostCenter | null) {
  if (!center) return "Nenhum centro selecionado";
  if (center.contract?.code) return `Contrato ${center.contract.code}`;
  if (center.generator?.name || center.generator?.serialNumber) {
    return `Gerador ${center.generator?.name || center.generator?.serialNumber}`;
  }
  if (center.client?.companyName) return center.client.companyName;
  return "Centro interno";
}

function describeContractOption(option: ContractOption) {
  const contractCode = option.code || option.id.slice(0, 8);
  const contractTitle = option.title?.trim();
  const clientName = option.client?.companyName?.trim();

  return [contractCode, contractTitle, clientName].filter(Boolean).join(" - ");
}

function describeGeneratorOption(option: GeneratorOption) {
  const generatorName = option.name?.trim();
  const serialNumber = option.serialNumber?.trim();
  const clientName = option.client?.companyName?.trim();

  return [generatorName || option.id.slice(0, 8), serialNumber, clientName]
    .filter(Boolean)
    .join(" - ");
}

export default function CostCentersPage() {
  const router = useRouter();
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [generators, setGenerators] = useState<GeneratorOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dre, setDre] = useState<DrePayload | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [centerDraft, setCenterDraft] =
    useState<CostCenterDraft>(emptyCenterDraft);
  const [entryDraft, setEntryDraft] = useState<EntryDraft>(emptyEntryDraft);
  const [loading, setLoading] = useState(true);
  const [dreLoading, setDreLoading] = useState(false);
  const [savingCenter, setSavingCenter] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleUnauthorized = useCallback(
    async (response: Response) => {
      if (response.status !== 401) return false;
      clearAuthSession();
      router.replace("/");
      return true;
    },
    [router],
  );

  const loadBaseData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [centersRes, clientsRes, contractsRes, generatorsRes] =
        await Promise.all([
          apiFetch(apiUrl("/finance/cost-centers"), { cache: "no-store" }),
          apiFetch(apiUrl("/clients"), { cache: "no-store" }),
          apiFetch(apiUrl("/contracts"), { cache: "no-store" }),
          apiFetch(apiUrl("/generators"), { cache: "no-store" }),
        ]);

      const failed = [
        {
          response: centersRes,
          fallback: "Nao foi possivel carregar os centros de custo.",
        },
        {
          response: clientsRes,
          fallback: "Nao foi possivel carregar os clientes.",
        },
        {
          response: contractsRes,
          fallback: "Nao foi possivel carregar os contratos.",
        },
        {
          response: generatorsRes,
          fallback: "Nao foi possivel carregar os geradores.",
        },
      ].find((entry) => !entry.response.ok);

      if (failed) {
        if (await handleUnauthorized(failed.response)) return;
        throw new Error(
          await readApiErrorMessage(failed.response, failed.fallback),
        );
      }

      const [nextCenters, nextClients, nextContracts, nextGenerators] =
        (await Promise.all([
          centersRes.json(),
          clientsRes.json(),
          contractsRes.json(),
          generatorsRes.json(),
        ])) as [
          CostCenter[],
          ClientOption[],
          ContractOption[],
          GeneratorOption[],
        ];

      setCenters(nextCenters);
      setClients(nextClients);
      setContracts(nextContracts);
      setGenerators(nextGenerators);
      setSelectedId((current) => {
        if (current && nextCenters.some((item) => item.id === current))
          return current;
        return (
          nextCenters.find((item) => item.isActive)?.id ||
          nextCenters[0]?.id ||
          ""
        );
      });
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar centros de custo.",
      );
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  const loadDre = useCallback(
    async (centerId: string) => {
      if (!centerId) {
        setDre(null);
        return;
      }

      setDreLoading(true);
      try {
        const response = await apiFetch(
          apiUrl(
            `/finance/cost-centers/${centerId}/dre${buildDreQuery(fromDate, toDate)}`,
          ),
          { cache: "no-store" },
        );

        if (await handleUnauthorized(response)) return;
        if (!response.ok) {
          throw new Error(
            await readApiErrorMessage(response, "Falha ao carregar DRE."),
          );
        }

        setDre((await response.json()) as DrePayload);
      } catch (dreError: unknown) {
        setError(
          dreError instanceof Error
            ? dreError.message
            : "Falha ao carregar DRE.",
        );
      } finally {
        setDreLoading(false);
      }
    },
    [fromDate, handleUnauthorized, toDate],
  );

  useEffect(() => {
    void loadBaseData();
  }, [loadBaseData]);

  useEffect(() => {
    if (!selectedId) return;
    void loadDre(selectedId);
  }, [loadDre, selectedId]);

  const selectedCenter = useMemo(
    () => centers.find((item) => item.id === selectedId) || null,
    [centers, selectedId],
  );

  const stats = useMemo(() => {
    const activeCount = centers.filter((item) => item.isActive).length;
    const inactiveCount = centers.length - activeCount;
    const negativeCenters =
      dre && dre.totals.operationalResult < 0 && selectedCenter ? 1 : 0;

    return {
      activeCount,
      inactiveCount,
      negativeCenters,
    };
  }, [centers, dre, selectedCenter]);

  function resetCenterDraft() {
    setCenterDraft(emptyCenterDraft());
    setEditingId(null);
  }

  function startEditing(center: CostCenter) {
    setCenterDraft(centerDraftFromCenter(center));
    setEditingId(center.id);
    setSelectedId(center.id);
    setError("");
    setSuccessMessage("");
  }

  function updateCenterDraft<K extends keyof CostCenterDraft>(
    key: K,
    value: CostCenterDraft[K],
  ) {
    setCenterDraft((current) => {
      const next = { ...current, [key]: value };

      if (key === "type") {
        if (value === "INTERNAL") {
          next.clientId = "";
          next.contractId = "";
          next.generatorId = "";
        }
        if (value === "CLIENT") {
          next.contractId = "";
          next.generatorId = "";
        }
        if (value === "CONTRACT") {
          next.clientId = "";
          next.generatorId = "";
        }
        if (value === "GENERATOR") {
          next.clientId = "";
          next.contractId = "";
        }
      }

      return next;
    });
  }

  async function handleCenterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!centerDraft.code.trim() || !centerDraft.name.trim()) {
      setError("Informe codigo e nome do centro de custo.");
      return;
    }

    if (centerDraft.type === "CLIENT" && !centerDraft.clientId) {
      setError("Selecione um cliente para centros do tipo cliente.");
      return;
    }
    if (centerDraft.type === "CONTRACT" && !centerDraft.contractId) {
      setError("Selecione um contrato para centros do tipo contrato.");
      return;
    }
    if (centerDraft.type === "GENERATOR" && !centerDraft.generatorId) {
      setError("Selecione um gerador para centros do tipo gerador.");
      return;
    }

    setSavingCenter(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(
        apiUrl(
          editingId
            ? `/finance/cost-centers/${editingId}`
            : "/finance/cost-centers",
        ),
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: centerDraft.code.trim(),
            name: centerDraft.name.trim(),
            type: centerDraft.type,
            clientId: centerDraft.clientId || undefined,
            contractId: centerDraft.contractId || undefined,
            generatorId: centerDraft.generatorId || undefined,
            isActive: editingId ? centerDraft.isActive : undefined,
          }),
        },
      );

      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(
            response,
            editingId
              ? "Falha ao atualizar centro de custo."
              : "Falha ao criar centro de custo.",
          ),
        );
      }

      const payload = (await response.json()) as CostCenter;
      setSuccessMessage(
        editingId
          ? "Centro de custo atualizado com sucesso."
          : "Centro de custo criado com sucesso.",
      );
      resetCenterDraft();
      setSelectedId(payload.id);
      await loadBaseData();
      await loadDre(payload.id);
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Falha ao salvar centro de custo.",
      );
    } finally {
      setSavingCenter(false);
    }
  }

  async function handleEntrySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedCenter) {
      setError(
        "Selecione um centro de custo antes de lancar a entrada manual.",
      );
      return;
    }
    if (!selectedCenter.isActive) {
      setError("Centro inativo nao pode receber novos lancamentos.");
      return;
    }

    const amount = parseMoneyInput(entryDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Informe um valor valido para o lancamento.");
      return;
    }

    const competenceDate = new Date(entryDraft.competenceDate);
    if (Number.isNaN(competenceDate.getTime())) {
      setError("Informe uma data de competencia valida.");
      return;
    }

    setSavingEntry(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(apiUrl("/finance/cost-centers/entries"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          costCenterId: selectedCenter.id,
          entryType: entryDraft.entryType,
          sourceType: entryDraft.sourceType,
          amount,
          competenceDate: competenceDate.toISOString(),
          notes: entryDraft.notes.trim() || undefined,
        }),
      });

      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha ao criar lancamento."),
        );
      }

      setSuccessMessage("Lancamento manual registrado no DRE.");
      setEntryDraft(emptyEntryDraft());
      await loadDre(selectedCenter.id);
    } catch (entryError: unknown) {
      setError(
        entryError instanceof Error
          ? entryError.message
          : "Falha ao criar lancamento.",
      );
    } finally {
      setSavingEntry(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Margem e rentabilidade"
        title="Centros de custo com DRE vivo, governanca de origem e lancamento manual."
        description="A central agora conecta cliente, contrato e gerador ao DRE operacional, em vez de deixar o centro de custo como uma tela isolada de consulta."
        stats={[
          {
            label: "Centros ativos",
            value: String(stats.activeCount),
            helper: "Centros prontos para receber novos lancamentos.",
            tone: "blue",
          },
          {
            label: "Receita do periodo",
            value: dre ? formatCurrency(dre.totals.revenue) : "-",
            helper: "Centro selecionado na janela filtrada.",
            tone: "emerald",
          },
          {
            label: "Resultado operacional",
            value: dre ? formatCurrency(dre.totals.operationalResult) : "-",
            helper: "Leitura final depois de custos e despesas.",
            tone: dre
              ? dre.totals.operationalResult < 0
                ? "rose"
                : "amber"
              : "slate",
          },
          {
            label: "Margem %",
            value: dre ? formatPercent(dre.totals.marginPercent) : "-",
            helper: "Centro selecionado no filtro atual.",
            tone: dre
              ? dre.totals.marginPercent < 0
                ? "rose"
                : "blue"
              : "slate",
          },
        ]}
        aside={
          <div className="space-y-3">
            <FieldBox>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Radar do modulo
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div>
                  <p className="text-xs text-slate-500">Centros inativos</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">
                    {stats.inactiveCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Centro sob pressao</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">
                    {stats.negativeCenters}
                  </p>
                </div>
              </div>
            </FieldBox>

            <StatusBanner
              tone={selectedCenter?.isActive === false ? "amber" : "blue"}
            >
              {selectedCenter
                ? `${selectedCenter.code} · ${selectedCenter.name}${selectedCenter.isActive ? " esta ativo para novos lancamentos." : " esta inativo e so deve ser lido historicamente."}`
                : "Selecione um centro para ler o DRE e operar o modulo."}
            </StatusBanner>
          </div>
        }
      />

      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {successMessage ? (
        <StatusBanner tone="emerald">{successMessage}</StatusBanner>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_380px]">
        <div className="space-y-6">
          <SectionCard
            eyebrow="Carteira de centros"
            title="Selecionar centro e ler o DRE"
            description="Escolha o centro correto e acompanhe o resultado com filtro de periodo e historico de lancamentos."
          >
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_140px]">
              <FormField label="Centro selecionado">
                <SelectInput
                  value={selectedId}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  <option value="">Selecione um centro de custo</option>
                  {centers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} - {item.name} ({TYPE_LABELS[item.type]})
                    </option>
                  ))}
                </SelectInput>
              </FormField>

              <FormField label="De">
                <TextInput
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              </FormField>

              <FormField label="Ate">
                <TextInput
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
              </FormField>

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => void loadDre(selectedId)}
                  className={PRIMARY_BUTTON}
                  disabled={!selectedId || dreLoading}
                >
                  {dreLoading ? "Atualizando..." : "Aplicar"}
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {dreLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={`dre-loading-${index}`}
                    className="animate-pulse rounded-[22px] border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <div className="h-4 w-20 rounded-full bg-slate-200" />
                    <div className="mt-3 h-8 rounded-full bg-slate-200" />
                  </div>
                ))
              ) : dre ? (
                <>
                  <FieldBox>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      Receita
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {formatCurrency(dre.totals.revenue)}
                    </p>
                  </FieldBox>
                  <FieldBox>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      Custos
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {formatCurrency(dre.totals.costs)}
                    </p>
                  </FieldBox>
                  <FieldBox>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      Despesas
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {formatCurrency(dre.totals.expenses)}
                    </p>
                  </FieldBox>
                  <FieldBox>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      Margem bruta
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {formatCurrency(dre.totals.grossMargin)}
                    </p>
                  </FieldBox>
                  <FieldBox>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      Resultado
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {formatCurrency(dre.totals.operationalResult)}
                    </p>
                  </FieldBox>
                  <FieldBox>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      Margem %
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {formatPercent(dre.totals.marginPercent)}
                    </p>
                  </FieldBox>
                </>
              ) : (
                <div className="md:col-span-3 xl:col-span-6">
                  <EmptyState
                    title="Nenhum centro selecionado"
                    description="Escolha um centro para ler o DRE do periodo."
                  />
                </div>
              )}
            </div>

            {dre ? (
              <StatusBanner tone="blue">
                Realizado por baixas no periodo: receitas{" "}
                {formatCurrency(Number(dre.totals.realizedRevenue || 0))},
                despesas{" "}
                {formatCurrency(Number(dre.totals.realizedExpenses || 0))} e
                resultado{" "}
                {formatCurrency(
                  Number(dre.totals.realizedOperationalResult || 0),
                )}
                .
              </StatusBanner>
            ) : null}

            <div className="mt-5 space-y-4">
              {loading ? (
                <div className="animate-pulse rounded-[26px] border border-slate-200 bg-slate-50/80 p-5">
                  <div className="h-5 w-32 rounded-full bg-slate-200" />
                  <div className="mt-3 h-24 rounded-2xl bg-slate-200" />
                </div>
              ) : centers.length === 0 ? (
                <EmptyState
                  title="Nenhum centro de custo cadastrado"
                  description="Crie o primeiro centro para começar a usar o DRE operacional."
                />
              ) : (
                centers.map((center) => (
                  <article
                    key={center.id}
                    className={`w-full rounded-[24px] border p-4 text-left transition ${
                      selectedId === center.id
                        ? "border-slate-900 bg-slate-950 text-white shadow-[0_24px_44px_-34px_rgba(15,31,50,0.92)]"
                        : "border-slate-200 bg-white/92 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <DataPill
                            tone={center.isActive ? "emerald" : "slate"}
                          >
                            {center.isActive ? "Ativo" : "Inativo"}
                          </DataPill>
                          <DataPill tone="blue">
                            {TYPE_LABELS[center.type]}
                          </DataPill>
                        </div>
                        <p className="mt-3 text-sm font-semibold">
                          {center.code} · {center.name}
                        </p>
                        <p
                          className={`mt-1 text-sm ${
                            selectedId === center.id
                              ? "text-slate-200"
                              : "text-slate-500"
                          }`}
                        >
                          {describeCenterAnchor(center)}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedId(center.id)}
                          className={`rounded-2xl px-3 py-2 text-xs font-semibold ${
                            selectedId === center.id
                              ? "bg-white text-slate-900"
                              : "bg-slate-950 text-white"
                          }`}
                        >
                          {selectedId === center.id
                            ? "Selecionado"
                            : "Selecionar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditing(center)}
                          className={`rounded-2xl px-3 py-2 text-xs font-semibold ${
                            selectedId === center.id
                              ? "bg-white/16 text-white"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Historico contabil"
            title="Lancamentos do periodo selecionado"
            description="Toda entrada registrada aqui alimenta o DRE do centro escolhido e deixa claro se a origem foi manual, reclassificacao ou fechamento."
          >
            {!selectedCenter ? (
              <EmptyState
                title="Nenhum centro selecionado"
                description="Selecione um centro para analisar os lancamentos e a composicao da margem."
              />
            ) : dreLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`entry-loading-${index}`}
                    className="animate-pulse rounded-[24px] border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <div className="h-4 w-36 rounded-full bg-slate-200" />
                    <div className="mt-3 h-14 rounded-2xl bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : dre && dre.entries.length > 0 ? (
              <div className="space-y-3">
                {dre.entries.map((entry) => (
                  <article
                    key={entry.id}
                    className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4 shadow-[0_18px_42px_-36px_rgba(15,31,50,0.55)]"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <DataPill tone={ENTRY_TONE[entry.entryType]}>
                            {ENTRY_LABELS[entry.entryType]}
                          </DataPill>
                          <DataPill tone="slate">
                            {SOURCE_LABELS[
                              entry.sourceType as EntrySourceType
                            ] || entry.sourceType}
                          </DataPill>
                          <DataPill tone="blue">
                            {formatDate(entry.competenceDate)}
                          </DataPill>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-600">
                          {entry.notes?.trim()
                            ? entry.notes
                            : "Lancamento sem observacao complementar."}
                        </p>
                      </div>

                      <div className="min-w-[180px] rounded-[22px] border border-white/80 bg-white/90 px-4 py-3 text-right shadow-sm">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          Valor
                        </p>
                        <p className="mt-2 text-lg font-bold text-slate-950">
                          {formatCurrency(entry.amount)}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          Criado em {formatDateTime(entry.createdAt)}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Sem lancamentos no periodo"
                description="Registre receitas, custos e despesas para transformar o DRE em leitura operacional de margem."
              />
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard
            eyebrow="Cadastro e governanca"
            title={
              editingId
                ? "Editar centro de custo"
                : "Criar novo centro de custo"
            }
            description="O tipo do centro define a ancora do DRE. Contrato e gerador herdam o cliente automaticamente para evitar vinculos quebrados."
            actions={
              editingId ? (
                <button
                  type="button"
                  onClick={resetCenterDraft}
                  className={SECONDARY_BUTTON}
                >
                  Novo centro
                </button>
              ) : null
            }
          >
            <form className="space-y-4" onSubmit={handleCenterSubmit}>
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Codigo">
                  <TextInput
                    value={centerDraft.code}
                    onChange={(event) =>
                      updateCenterDraft("code", event.target.value)
                    }
                    placeholder="Ex.: CTR-ALPHA"
                    maxLength={24}
                  />
                </FormField>

                <FormField label="Tipo">
                  <SelectInput
                    value={centerDraft.type}
                    onChange={(event) =>
                      updateCenterDraft(
                        "type",
                        event.target.value as CostCenterType,
                      )
                    }
                  >
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </SelectInput>
                </FormField>
              </div>

              <FormField label="Nome do centro">
                <TextInput
                  value={centerDraft.name}
                  onChange={(event) =>
                    updateCenterDraft("name", event.target.value)
                  }
                  placeholder="Ex.: Contrato Hospital Alpha"
                />
              </FormField>

              {centerDraft.type === "CLIENT" ? (
                <FormField
                  label="Cliente"
                  hint="Obrigatorio para centros do tipo cliente"
                >
                  <SelectInput
                    value={centerDraft.clientId}
                    onChange={(event) =>
                      updateCenterDraft("clientId", event.target.value)
                    }
                  >
                    <option value="">Selecione um cliente</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.companyName}
                      </option>
                    ))}
                  </SelectInput>
                </FormField>
              ) : null}

              {centerDraft.type === "CONTRACT" ? (
                <FormField
                  label="Contrato"
                  hint="Cliente sera herdado automaticamente"
                >
                  <SelectInput
                    value={centerDraft.contractId}
                    onChange={(event) =>
                      updateCenterDraft("contractId", event.target.value)
                    }
                  >
                    <option value="">Selecione um contrato</option>
                    {contracts.map((contract) => (
                      <option key={contract.id} value={contract.id}>
                        {describeContractOption(contract)}
                      </option>
                    ))}
                  </SelectInput>
                </FormField>
              ) : null}

              {centerDraft.type === "GENERATOR" ? (
                <FormField
                  label="Gerador"
                  hint="Cliente sera herdado automaticamente"
                >
                  <SelectInput
                    value={centerDraft.generatorId}
                    onChange={(event) =>
                      updateCenterDraft("generatorId", event.target.value)
                    }
                  >
                    <option value="">Selecione um gerador</option>
                    {generators.map((generator) => (
                      <option key={generator.id} value={generator.id}>
                        {describeGeneratorOption(generator)}
                      </option>
                    ))}
                  </SelectInput>
                </FormField>
              ) : null}

              {editingId ? (
                <FormField label="Status operacional">
                  <SelectInput
                    value={centerDraft.isActive ? "active" : "inactive"}
                    onChange={(event) =>
                      updateCenterDraft(
                        "isActive",
                        event.target.value === "active",
                      )
                    }
                  >
                    <option value="active">Ativo para novos lancamentos</option>
                    <option value="inactive">
                      Inativo somente para historico
                    </option>
                  </SelectInput>
                </FormField>
              ) : null}

              <StatusBanner tone="slate">
                {centerDraft.type === "INTERNAL"
                  ? "Centros internos nao ficam presos a contrato, cliente ou gerador."
                  : centerDraft.type === "CLIENT"
                    ? "Use este formato quando a margem precisa consolidar por cliente."
                    : centerDraft.type === "CONTRACT"
                      ? "Contrato so pode ter um unico centro vinculado e o cliente sera derivado automaticamente."
                      : "Gerador so pode ter um unico centro vinculado e o cliente sera derivado automaticamente."}
              </StatusBanner>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  className={PRIMARY_BUTTON}
                  disabled={savingCenter}
                >
                  {savingCenter
                    ? editingId
                      ? "Salvando..."
                      : "Criando..."
                    : editingId
                      ? "Salvar centro"
                      : "Criar centro"}
                </button>

                <button
                  type="button"
                  onClick={resetCenterDraft}
                  className={SECONDARY_BUTTON}
                  disabled={savingCenter}
                >
                  Limpar formulario
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard
            eyebrow="Lancar no DRE"
            title="Entrada manual no centro selecionado"
            description="Receitas, custos e despesas entram no DRE do centro ativo e respeitam o periodo filtrado para leitura da margem."
          >
            {selectedCenter ? (
              <div className="space-y-4">
                <FieldBox className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <DataPill
                      tone={selectedCenter.isActive ? "emerald" : "amber"}
                    >
                      {selectedCenter.isActive
                        ? "Centro apto"
                        : "Centro inativo"}
                    </DataPill>
                    <DataPill tone="blue">
                      {TYPE_LABELS[selectedCenter.type]}
                    </DataPill>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {selectedCenter.code} - {selectedCenter.name}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {describeCenterAnchor(selectedCenter)}
                    </p>
                  </div>
                </FieldBox>

                {!selectedCenter.isActive ? (
                  <StatusBanner tone="amber">
                    Este centro foi inativado e agora pode ser usado apenas para
                    leitura historica do DRE.
                  </StatusBanner>
                ) : null}

                <form className="space-y-4" onSubmit={handleEntrySubmit}>
                  <div className="grid gap-3 md:grid-cols-2">
                    <FormField label="Tipo de entrada">
                      <SelectInput
                        value={entryDraft.entryType}
                        onChange={(event) =>
                          setEntryDraft((current) => ({
                            ...current,
                            entryType: event.target.value as EntryType,
                          }))
                        }
                        disabled={!selectedCenter.isActive || savingEntry}
                      >
                        {Object.entries(ENTRY_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </SelectInput>
                    </FormField>

                    <FormField label="Origem contabil">
                      <SelectInput
                        value={entryDraft.sourceType}
                        onChange={(event) =>
                          setEntryDraft((current) => ({
                            ...current,
                            sourceType: event.target.value as EntrySourceType,
                          }))
                        }
                        disabled={!selectedCenter.isActive || savingEntry}
                      >
                        {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </SelectInput>
                    </FormField>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <FormField label="Valor">
                      <TextInput
                        value={entryDraft.amount}
                        onChange={(event) =>
                          setEntryDraft((current) => ({
                            ...current,
                            amount: event.target.value,
                          }))
                        }
                        placeholder="0,00"
                        inputMode="decimal"
                        disabled={!selectedCenter.isActive || savingEntry}
                      />
                    </FormField>

                    <FormField label="Competencia">
                      <TextInput
                        type="date"
                        value={entryDraft.competenceDate}
                        onChange={(event) =>
                          setEntryDraft((current) => ({
                            ...current,
                            competenceDate: event.target.value,
                          }))
                        }
                        disabled={!selectedCenter.isActive || savingEntry}
                      />
                    </FormField>
                  </div>

                  <FormField
                    label="Observacoes"
                    hint="Opcional, mas ajuda na leitura futura"
                  >
                    <TextAreaInput
                      value={entryDraft.notes}
                      onChange={(event) =>
                        setEntryDraft((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      placeholder="Descreva o motivo ou a origem do lancamento."
                      disabled={!selectedCenter.isActive || savingEntry}
                    />
                  </FormField>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="submit"
                      className={PRIMARY_BUTTON}
                      disabled={!selectedCenter.isActive || savingEntry}
                    >
                      {savingEntry ? "Lancando..." : "Registrar no DRE"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setEntryDraft(emptyEntryDraft())}
                      className={SECONDARY_BUTTON}
                      disabled={savingEntry}
                    >
                      Limpar lancamento
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <EmptyState
                title="Selecione um centro primeiro"
                description="O modulo precisa saber qual ancora do negocio recebera a receita, o custo ou a despesa."
              />
            )}
          </SectionCard>

          <SectionCard
            eyebrow="Fluxo validado"
            title="O que esta protegido neste modulo"
            description="A tela foi alinhada com as regras reais do backend para evitar DREs soltos ou centros mal ancorados."
          >
            <div className="space-y-3">
              <FieldBox>
                Contratos e geradores agora carregam o cliente por heranca, e
                cada ancora aceita apenas um centro de custo vinculado.
              </FieldBox>
              <FieldBox>
                Centros inativos continuam disponiveis para leitura historica,
                mas ficam bloqueados para novos lancamentos.
              </FieldBox>
              <FieldBox>
                Lancamentos manuais entram no DRE do centro selecionado e
                reaparecem no historico com data de competencia, tipo e origem
                contabil.
              </FieldBox>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
