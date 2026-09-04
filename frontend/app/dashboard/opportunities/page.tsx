"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";

const STAGE_ORDER = [
  "PROSPECTION",
  "SITE_SURVEY_SCHEDULED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
] as const;

type Stage = (typeof STAGE_ORDER)[number];

const STAGE_LABEL: Record<Stage, string> = {
  PROSPECTION: "Prospecção",
  SITE_SURVEY_SCHEDULED: "Vistoria Agendada",
  PROPOSAL_SENT: "Proposta Enviada",
  NEGOTIATION: "Em Negociação",
  WON: "Ganho",
  LOST: "Perdido",
};

const TEMPERATURE_LABEL = {
  HOT: "Quente",
  WARM: "Morno",
  COLD: "Frio",
} as const;

type Temperature = keyof typeof TEMPERATURE_LABEL;

const LOSS_REASONS = [
  "PRICE",
  "DEADLINE",
  "COMPETITOR",
  "PROJECT_CANCELED",
  "TECHNICAL_SCOPE",
  "OTHER",
] as const;

type LossReason = (typeof LOSS_REASONS)[number];

const LOSS_REASON_LABEL: Record<LossReason, string> = {
  PRICE: "Preço",
  DEADLINE: "Prazo",
  COMPETITOR: "Concorrente",
  PROJECT_CANCELED: "Projeto cancelado",
  TECHNICAL_SCOPE: "Escopo técnico",
  OTHER: "Outro",
};

const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  BOARD_REVIEW: "Análise Diretoria",
  REVISION_REQUIRED: "Em Revisão",
  CLIENT_REVIEW: "Análise Cliente",
  DISCOUNT_REVIEW: "Aguardando desconto",
  WON: "Ganha",
  LOST: "Perdida",
};

const PIPELINE_ORDER = [
  "COMMERCIAL_01_GENERATORS",
  "COMMERCIAL_02_CONTRACTS",
  "COMMERCIAL_03_PARTS_SERVICES",
] as const;

type CommercialPipeline = (typeof PIPELINE_ORDER)[number];
type PipelineFilter = CommercialPipeline | "ALL";

const PIPELINE_LABEL: Record<CommercialPipeline, string> = {
  COMMERCIAL_01_GENERATORS: "Comercial 01 - Geradores",
  COMMERCIAL_02_CONTRACTS: "Comercial 02 - Contratos",
  COMMERCIAL_03_PARTS_SERVICES: "Comercial 03 - Pecas e Servicos",
};

const OPPORTUNITY_TYPE_LABEL = {
  GENERATOR_SALE: "Venda de gerador",
  GENERATOR_RENTAL: "Locacao de gerador",
  INSTALLATION_RETROFIT: "Instalacao / retrofit",
  MAINTENANCE_CONTRACT: "Contrato de manutencao",
  CONTRACT_RENEWAL: "Renovacao de contrato",
  CONTRACT_EXPANSION: "Expansao de contrato",
  PARTS_SALE: "Venda de pecas",
  FIELD_SERVICE: "Servico avulso",
  EMERGENCY_CORRECTIVE: "Corretiva emergencial",
  OTHER: "Outro",
} as const;

type OpportunityType = keyof typeof OPPORTUNITY_TYPE_LABEL;

const TYPES_BY_PIPELINE: Record<CommercialPipeline, OpportunityType[]> = {
  COMMERCIAL_01_GENERATORS: [
    "GENERATOR_SALE",
    "GENERATOR_RENTAL",
    "INSTALLATION_RETROFIT",
    "OTHER",
  ],
  COMMERCIAL_02_CONTRACTS: [
    "MAINTENANCE_CONTRACT",
    "CONTRACT_RENEWAL",
    "CONTRACT_EXPANSION",
    "OTHER",
  ],
  COMMERCIAL_03_PARTS_SERVICES: [
    "PARTS_SALE",
    "FIELD_SERVICE",
    "EMERGENCY_CORRECTIVE",
    "OTHER",
  ],
};

type Opportunity = {
  id: string;
  title: string;
  stage: Stage;
  pipeline: CommercialPipeline;
  opportunityType: OpportunityType;
  temperature: Temperature;
  estimatedValue: number;
  expectedCloseDate?: string | null;
  lossReason?: LossReason | null;
  lossReasonDetail?: string | null;
  client: { id: string; companyName: string; tradeName?: string | null };
  assignedSeller?: { id: string; name: string } | null;
  inspections?: Array<{ id: string; code: string; status: string }>;
  proposals?: Array<{
    id: string;
    code: string;
    status: string;
    totalValue?: number | null;
    createdAt: string;
  }>;
};

type PipelineRow = {
  stage: Stage;
  count: number;
  estimatedValue: number;
};

type ClientOption = {
  id: string;
  companyName: string;
  tradeName?: string | null;
  cnpj?: string | null;
  city?: string | null;
  state?: string | null;
};

type Collaborator = {
  id: string;
  name: string;
  email?: string | null;
  department?: string | null;
};

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [pipeline, setPipeline] = useState<PipelineRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [sellers, setSellers] = useState<Collaborator[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingStageId, setChangingStageId] = useState("");
  const [activePipeline, setActivePipeline] = useState<PipelineFilter>("ALL");

  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [assignedSellerId, setAssignedSellerId] = useState("");
  const [formPipeline, setFormPipeline] = useState<CommercialPipeline>(
    "COMMERCIAL_03_PARTS_SERVICES",
  );
  const [opportunityType, setOpportunityType] =
    useState<OpportunityType>("FIELD_SERVICE");
  const [clientSearch, setClientSearch] = useState("");
  const [sellerSearch, setSellerSearch] = useState("");
  const [clientLookupOpen, setClientLookupOpen] = useState(false);
  const [sellerLookupOpen, setSellerLookupOpen] = useState(false);
  const [clientLookupLoading, setClientLookupLoading] = useState(false);
  const [sellerLookupLoading, setSellerLookupLoading] = useState(false);
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickClientSaving, setQuickClientSaving] = useState(false);
  const [quickClient, setQuickClient] = useState({
    companyName: "",
    tradeName: "",
    cnpj: "",
    phone: "",
    email: "",
    contactName: "",
    address: "",
    city: "",
    state: "",
  });
  const [temperature, setTemperature] = useState<Temperature>("WARM");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [highlightedOpportunityId, setHighlightedOpportunityId] = useState("");

  const pipelineMap = useMemo(() => {
    const map = new Map<Stage, PipelineRow>();
    for (const row of pipeline) map.set(row.stage, row);
    return map;
  }, [pipeline]);

  const availableOpportunityTypes = useMemo(
    () => TYPES_BY_PIPELINE[formPipeline],
    [formPipeline],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const params = new URLSearchParams();
      if (activePipeline !== "ALL") params.set("pipeline", activePipeline);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const [opportunitiesRes, pipelineRes] = await Promise.all([
        apiFetch(`/crm/opportunities${suffix}`, {
          cache: "no-store",
        }),
        apiFetch(`/crm/opportunities/pipeline${suffix}`, {
          cache: "no-store",
        }),
      ]);

      if (!opportunitiesRes.ok || !pipelineRes.ok) {
        throw new Error("Falha ao carregar dados do funil.");
      }

      setOpportunities((await opportunitiesRes.json()) as Opportunity[]);
      setPipeline((await pipelineRes.json()) as PipelineRow[]);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar dados do funil.",
      );
    } finally {
      setLoading(false);
    }
  }, [activePipeline]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({ take: "10" });
      if (clientSearch.trim()) params.set("q", clientSearch.trim());

      setClientLookupLoading(true);
      apiFetch(`/clients/lookup?${params.toString()}`, { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) throw new Error("Falha ao buscar clientes.");
          setClients((await res.json()) as ClientOption[]);
        })
        .catch(() => {
          setClients([]);
        })
        .finally(() => setClientLookupLoading(false));
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [clientSearch]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({
        take: "20",
        pipeline: formPipeline,
      });
      if (sellerSearch.trim()) params.set("q", sellerSearch.trim());

      setSellerLookupLoading(true);
      apiFetch(`/crm/sellers?${params.toString()}`, { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) throw new Error("Falha ao buscar vendedores.");
          setSellers((await res.json()) as Collaborator[]);
        })
        .catch(() => {
          setSellers([]);
        })
        .finally(() => setSellerLookupLoading(false));
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [formPipeline, sellerSearch]);

  useEffect(() => {
    const opportunityIdFromUrl = new URLSearchParams(window.location.search).get("opportunityId");
    if (opportunityIdFromUrl) {
      setHighlightedOpportunityId(opportunityIdFromUrl);
    }
  }, []);

  useEffect(() => {
    const clientIdFromUrl = new URLSearchParams(window.location.search).get(
      "clientId",
    );
    if (!clientIdFromUrl) return;

    apiFetch(`/clients/${clientIdFromUrl}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Cliente nao encontrado.");
        const client = (await res.json()) as ClientOption;
        setClientId(client.id);
        setClientSearch(formatClientOption(client));
      })
      .catch(() => {
        setError("Nao foi possivel carregar o cliente da oportunidade.");
      });
  }, []);

  async function handleCreateOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !clientId) {
      setError("Informe título e cliente para criar a oportunidade.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const res = await apiFetch("/crm/opportunities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          clientId,
          assignedSellerId: assignedSellerId || undefined,
          pipeline: formPipeline,
          opportunityType,
          temperature,
          estimatedValue: estimatedValue ? Number(estimatedValue) : 0,
          expectedCloseDate: expectedCloseDate || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Falha ao criar oportunidade."),
        );
      }

      setTitle("");
      setClientId("");
      setAssignedSellerId("");
      setClientSearch("");
      setSellerSearch("");
      setFormPipeline("COMMERCIAL_03_PARTS_SERVICES");
      setOpportunityType("FIELD_SERVICE");
      setTemperature("WARM");
      setEstimatedValue("");
      setExpectedCloseDate("");
      setMessage("Oportunidade criada com sucesso.");
      await loadAll();
    } catch (createError: unknown) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Falha ao criar oportunidade.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateQuickClient() {
    const state = quickClient.state.trim().toUpperCase();
    if (
      !quickClient.companyName.trim() ||
      onlyDigits(quickClient.cnpj).length < 11 ||
      !quickClient.phone.trim() ||
      !quickClient.address.trim() ||
      !quickClient.city.trim() ||
      state.length !== 2
    ) {
      setError(
        "Informe nome, CPF/CNPJ, telefone, endereco, cidade e UF para cadastrar o cliente.",
      );
      return;
    }

    setQuickClientSaving(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        companyName: quickClient.companyName.trim(),
        tradeName: quickClient.tradeName.trim() || undefined,
        cnpj: onlyDigits(quickClient.cnpj),
        email: quickClient.email.trim() || undefined,
        phone: quickClient.phone.trim(),
        address: quickClient.address.trim(),
        city: quickClient.city.trim(),
        state,
        clientType: "NO_CONTRACT",
        addresses: [
          {
            type: "INSTALLATION",
            street: quickClient.address.trim(),
            city: quickClient.city.trim(),
            state,
            country: "Brasil",
          },
        ],
        contacts: quickClient.contactName.trim()
          ? [
              {
                name: quickClient.contactName.trim(),
                status: "ACTIVE",
                role: "Contato comercial",
                phone: quickClient.phone.trim(),
                email: quickClient.email.trim() || undefined,
              },
            ]
          : undefined,
      };

      const res = await apiFetch("/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Falha ao cadastrar cliente."),
        );
      }

      const created = (await res.json()) as ClientOption;
      setClientId(created.id);
      setClientSearch(formatClientOption(created));
      setClients((current) => [created, ...current]);
      setQuickClient({
        companyName: "",
        tradeName: "",
        cnpj: "",
        phone: "",
        email: "",
        contactName: "",
        address: "",
        city: "",
        state: "",
      });
      setQuickClientOpen(false);
      setMessage("Cliente cadastrado e selecionado na oportunidade.");
    } catch (createError: unknown) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Falha ao cadastrar cliente.",
      );
    } finally {
      setQuickClientSaving(false);
    }
  }

  async function handleStageChange(item: Opportunity, nextStage: Stage) {
    if (item.stage === nextStage) return;

    const payload: {
      stage: Stage;
      lossReason?: LossReason;
      lossReasonDetail?: string;
    } = { stage: nextStage };

    if (nextStage === "LOST") {
      const reasonInput = window
        .prompt(
          "Informe o motivo da perda (PRICE, DEADLINE, COMPETITOR, PROJECT_CANCELED, TECHNICAL_SCOPE, OTHER):",
          "PRICE",
        )
        ?.trim()
        .toUpperCase();
      if (!reasonInput) return;

      if (!LOSS_REASONS.includes(reasonInput as LossReason)) {
        setError("Motivo de perda inválido.");
        return;
      }

      payload.lossReason = reasonInput as LossReason;
      if (payload.lossReason === "OTHER") {
        payload.lossReasonDetail = window
          .prompt("Descreva o motivo da perda:", "")
          ?.trim();
      }
    }

    setError("");
    setMessage("");
    setChangingStageId(item.id);
    try {
      const res = await apiFetch(`/crm/opportunities/${item.id}/stage`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "Falha ao atualizar fase."));
      }

      setMessage("Fase da oportunidade atualizada.");
      await loadAll();
    } catch (updateError: unknown) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Falha ao atualizar fase.",
      );
    } finally {
      setChangingStageId("");
    }
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Comercial
            </p>
            <h1 className="mt-2 text-2xl font-bold text-zinc-900">
              Funil de Vendas
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Kanban comercial com fases, valores, responsáveis e próximos passos.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MiniMetric label="Oportunidades" value={String(opportunities.length)} />
            <MiniMetric
              label="Pipeline"
              value={`R$ ${pipeline
                .reduce((sum, row) => sum + Number(row.estimatedValue || 0), 0)
                .toLocaleString("pt-BR")}`}
            />
            <MiniMetric
              label="Abertas"
              value={String(
                opportunities.filter(
                  (item) => !["WON", "LOST"].includes(item.stage),
                ).length,
              )}
            />
          </div>
        </div>
      </header>

      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <PipelineFilterButton
            active={activePipeline === "ALL"}
            label="Todos"
            onClick={() => setActivePipeline("ALL")}
          />
          {PIPELINE_ORDER.map((pipelineOption) => (
            <PipelineFilterButton
              key={pipelineOption}
              active={activePipeline === pipelineOption}
              label={PIPELINE_LABEL[pipelineOption]}
              onClick={() => setActivePipeline(pipelineOption)}
            />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold text-zinc-900">Nova Oportunidade</h2>
        <form
          onSubmit={(event) => void handleCreateOpportunity(event)}
          className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-6"
        >
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Título da oportunidade"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm md:col-span-2"
            required
          />
          <select
            value={formPipeline}
            onChange={(event) => {
              const nextPipeline = event.target.value as CommercialPipeline;
              setFormPipeline(nextPipeline);
              setOpportunityType(TYPES_BY_PIPELINE[nextPipeline][0]);
              setAssignedSellerId("");
              setSellerSearch("");
            }}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          >
            {PIPELINE_ORDER.map((pipelineOption) => (
              <option key={pipelineOption} value={pipelineOption}>
                {PIPELINE_LABEL[pipelineOption]}
              </option>
            ))}
          </select>
          <select
            value={opportunityType}
            onChange={(event) =>
              setOpportunityType(event.target.value as OpportunityType)
            }
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          >
            {availableOpportunityTypes.map((typeOption) => (
              <option key={typeOption} value={typeOption}>
                {OPPORTUNITY_TYPE_LABEL[typeOption]}
              </option>
            ))}
          </select>
          <div className="relative">
            <input
              value={clientSearch}
              onChange={(event) => {
                setClientSearch(event.target.value);
                setClientId("");
                setClientLookupOpen(true);
              }}
              onFocus={() => setClientLookupOpen(true)}
              onBlur={() =>
                window.setTimeout(() => setClientLookupOpen(false), 120)
              }
              placeholder="Buscar cliente"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              aria-label="Buscar cliente da oportunidade"
              required
            />
            {clientLookupOpen && !clientId ? (
              <LookupPanel
                loading={clientLookupLoading}
                emptyLabel="Nenhum cliente encontrado."
              >
                {clients.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setClientId(client.id);
                      setClientSearch(formatClientOption(client));
                      setClientLookupOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-sky-50"
                  >
                    <span className="block font-semibold text-zinc-900">
                      {client.companyName}
                    </span>
                    <span className="block text-xs text-zinc-500">
                      {[
                        client.tradeName,
                        client.cnpj,
                        client.city && client.state
                          ? `${client.city}/${client.state}`
                          : client.city || client.state,
                      ]
                        .filter(Boolean)
                        .join(" | ")}
                    </span>
                  </button>
                ))}
              </LookupPanel>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setQuickClientOpen((current) => !current)}
            className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
          >
            {quickClientOpen ? "Fechar cliente" : "Cliente rapido"}
          </button>
          {quickClientOpen ? (
            <div className="grid gap-3 rounded-xl border border-sky-100 bg-sky-50/70 p-3 md:col-span-6 md:grid-cols-6">
              <QuickInput
                value={quickClient.companyName}
                onChange={(value) =>
                  setQuickClient((current) => ({
                    ...current,
                    companyName: value,
                  }))
                }
                placeholder="Razao social / Nome"
                className="md:col-span-2"
                required
              />
              <QuickInput
                value={quickClient.tradeName}
                onChange={(value) =>
                  setQuickClient((current) => ({ ...current, tradeName: value }))
                }
                placeholder="Nome fantasia"
              />
              <QuickInput
                value={quickClient.cnpj}
                onChange={(value) =>
                  setQuickClient((current) => ({ ...current, cnpj: value }))
                }
                placeholder="CPF/CNPJ"
                required
              />
              <QuickInput
                value={quickClient.phone}
                onChange={(value) =>
                  setQuickClient((current) => ({ ...current, phone: value }))
                }
                placeholder="Telefone"
                required
              />
              <QuickInput
                value={quickClient.email}
                onChange={(value) =>
                  setQuickClient((current) => ({ ...current, email: value }))
                }
                placeholder="Email"
              />
              <QuickInput
                value={quickClient.contactName}
                onChange={(value) =>
                  setQuickClient((current) => ({
                    ...current,
                    contactName: value,
                  }))
                }
                placeholder="Contato"
              />
              <QuickInput
                value={quickClient.address}
                onChange={(value) =>
                  setQuickClient((current) => ({ ...current, address: value }))
                }
                placeholder="Endereco principal"
                className="md:col-span-2"
                required
              />
              <QuickInput
                value={quickClient.city}
                onChange={(value) =>
                  setQuickClient((current) => ({ ...current, city: value }))
                }
                placeholder="Cidade"
                required
              />
              <QuickInput
                value={quickClient.state}
                onChange={(value) =>
                  setQuickClient((current) => ({
                    ...current,
                    state: value.toUpperCase().slice(0, 2),
                  }))
                }
                placeholder="UF"
                required
              />
              <button
                type="button"
                disabled={quickClientSaving}
                onClick={() => void handleCreateQuickClient()}
                className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {quickClientSaving ? "Cadastrando..." : "Salvar cliente"}
              </button>
            </div>
          ) : null}
          <div className="relative">
            <input
              value={sellerSearch}
              onChange={(event) => {
                setSellerSearch(event.target.value);
                setAssignedSellerId("");
                setSellerLookupOpen(true);
              }}
              onFocus={() => setSellerLookupOpen(true)}
              onBlur={() =>
                window.setTimeout(() => setSellerLookupOpen(false), 120)
              }
              placeholder="Buscar vendedor comercial"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              aria-label="Buscar vendedor responsavel"
            />
            {sellerLookupOpen && !assignedSellerId ? (
              <LookupPanel
                loading={sellerLookupLoading}
                emptyLabel="Nenhum vendedor comercial encontrado."
              >
                {sellers.map((seller) => (
                  <button
                    key={seller.id}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setAssignedSellerId(seller.id);
                      setSellerSearch(formatSellerOption(seller));
                      setSellerLookupOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-sky-50"
                  >
                    <span className="block font-semibold text-zinc-900">
                      {seller.name}
                    </span>
                    <span className="block text-xs text-zinc-500">
                      {[seller.department, seller.email]
                        .filter(Boolean)
                        .join(" | ")}
                    </span>
                  </button>
                ))}
              </LookupPanel>
            ) : null}
          </div>
          <select
            value={temperature}
            onChange={(event) => setTemperature(event.target.value as Temperature)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="HOT">Quente</option>
            <option value="WARM">Morno</option>
            <option value="COLD">Frio</option>
          </select>
          <input
            value={estimatedValue}
            onChange={(event) => setEstimatedValue(event.target.value)}
            type="number"
            min="0"
            step="0.01"
            placeholder="Valor estimado"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            value={expectedCloseDate}
            onChange={(event) => setExpectedCloseDate(event.target.value)}
            type="date"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg border border-blue-200 bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Criar oportunidade"}
          </button>
        </form>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {STAGE_ORDER.map((stage) => {
          const row = pipelineMap.get(stage);
          return (
            <article key={stage} className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                {STAGE_LABEL[stage]}
              </p>
              <p className="mt-1 text-lg font-black text-zinc-900">
                R$ {Number(row?.estimatedValue || 0).toLocaleString("pt-BR")}
              </p>
              <p className="text-xs text-zinc-500">{row?.count || 0} oportunidades</p>
            </article>
          );
        })}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
            Carregando oportunidades...
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {STAGE_ORDER.map((stage) => (
            <div key={stage} className="min-h-[18rem] rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <h2 className="mb-2 text-sm font-bold text-zinc-800">{STAGE_LABEL[stage]}</h2>
              <div className="space-y-2">
                {opportunities.filter((item) => item.stage === stage).length === 0 && !loading ? (
                  <div className="rounded-lg border border-dashed border-zinc-300 bg-white/80 px-3 py-4 text-sm text-zinc-500">
                    Nenhuma oportunidade nesta etapa.
                  </div>
                ) : null}
                {opportunities
                  .filter((item) => item.stage === stage)
                  .map((item) => (
                    <article
                      key={item.id}
                      className={`rounded-lg border bg-white p-3 transition ${
                        highlightedOpportunityId === item.id
                          ? "border-sky-300 shadow-[0_0_0_3px_rgba(14,165,233,0.14)]"
                          : "border-zinc-200"
                      }`}
                    >
                      <p className="text-sm font-bold text-zinc-900">{item.title}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-indigo-700">
                          {PIPELINE_LABEL[item.pipeline]}
                        </span>
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                          {OPPORTUNITY_TYPE_LABEL[item.opportunityType]}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-700">
                        {item.client?.tradeName || item.client?.companyName}
                      </p>
                      <p className="text-xs text-zinc-600">
                        Vendedor: {item.assignedSeller?.name || "Não definido"}
                      </p>
                      <p className="text-xs text-zinc-600">
                        Temperatura: {TEMPERATURE_LABEL[item.temperature]}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-zinc-800">
                        R$ {Number(item.estimatedValue || 0).toLocaleString("pt-BR")}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-600">
                          {(item.inspections || []).length} vistoria(s)
                        </span>
                        <span className="rounded-full bg-sky-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-700">
                          {(item.proposals || []).length} proposta(s)
                        </span>
                      </div>
                      {item.proposals?.[0] ? (
                        <p className="mt-2 text-xs text-zinc-500">
                          Última proposta: {item.proposals[0].code} | {PROPOSAL_STATUS_LABEL[item.proposals[0].status] || item.proposals[0].status}
                        </p>
                      ) : null}
                      {item.lossReason ? (
                        <p className="mt-1 text-xs font-semibold text-amber-700">
                          Motivo: {LOSS_REASON_LABEL[item.lossReason]}
                          {item.lossReasonDetail ? ` - ${item.lossReasonDetail}` : ""}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          href={`/dashboard/proposals/new?opportunityId=${item.id}`}
                          className="inline-flex rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500"
                        >
                          {(item.proposals || []).length > 0 ? "Nova proposta vinculada" : "Gerar proposta"}
                        </Link>
                        {item.proposals?.[0] ? (
                          <Link
                            href={`/dashboard/proposals/${item.proposals[0].id}`}
                            className="inline-flex rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
                          >
                            Abrir {item.proposals[0].code}
                          </Link>
                        ) : null}
                      </div>
                      <select
                        value={item.stage}
                        disabled={changingStageId === item.id}
                        onChange={(event) =>
                          void handleStageChange(item, event.target.value as Stage)
                        }
                        className="mt-3 w-full rounded-md border border-zinc-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {STAGE_ORDER.map((stageOption) => (
                          <option key={stageOption} value={stageOption}>
                            {STAGE_LABEL[stageOption]}
                          </option>
                        ))}
                      </select>
                      {changingStageId === item.id ? (
                        <p className="mt-2 text-xs font-semibold text-sky-700">
                          Atualizando etapa...
                        </p>
                      ) : null}
                    </article>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function PipelineFilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
        active
          ? "border-sky-300 bg-sky-100 text-sky-800"
          : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
      }`}
    >
      {label}
    </button>
  );
}

function LookupPanel({
  children,
  emptyLabel,
  loading,
}: {
  children: ReactNode;
  emptyLabel: string;
  loading: boolean;
}) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <div className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-30 max-h-64 overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
      {loading ? (
        <p className="px-3 py-2 text-sm font-semibold text-slate-500">
          Buscando...
        </p>
      ) : null}
      {!loading && hasItems ? children : null}
      {!loading && !hasItems ? (
        <p className="px-3 py-2 text-sm text-zinc-500">{emptyLabel}</p>
      ) : null}
    </div>
  );
}

function QuickInput({
  className = "",
  onChange,
  placeholder,
  required = false,
  type = "text",
  value,
}: {
  className?: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      type={type}
      aria-required={required}
      className={`rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm ${className}`}
    />
  );
}

function formatClientOption(client: ClientOption) {
  return `${client.companyName}${client.tradeName ? ` (${client.tradeName})` : ""}`;
}

function formatSellerOption(seller: Collaborator) {
  return `${seller.name}${seller.department ? ` - ${seller.department}` : ""}`;
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}
