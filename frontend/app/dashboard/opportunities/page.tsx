"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
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
  PROSPECTION: "Prospeccao",
  SITE_SURVEY_SCHEDULED: "Vistoria Agendada",
  PROPOSAL_SENT: "Proposta Enviada",
  NEGOTIATION: "Em Negociacao",
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
  PRICE: "Preco",
  DEADLINE: "Prazo",
  COMPETITOR: "Concorrente",
  PROJECT_CANCELED: "Projeto cancelado",
  TECHNICAL_SCOPE: "Escopo tecnico",
  OTHER: "Outro",
};

const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  BOARD_REVIEW: "Analise Diretoria",
  REVISION_REQUIRED: "Em Revisao",
  CLIENT_REVIEW: "Analise Cliente",
  DISCOUNT_REVIEW: "Aguardando desconto",
  WON: "Ganha",
  LOST: "Perdida",
};

type Opportunity = {
  id: string;
  title: string;
  stage: Stage;
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
};

type Collaborator = {
  id: string;
  name: string;
};

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [pipeline, setPipeline] = useState<PipelineRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [sellers, setSellers] = useState<Collaborator[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [assignedSellerId, setAssignedSellerId] = useState("");
  const [temperature, setTemperature] = useState<Temperature>("WARM");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [highlightedOpportunityId, setHighlightedOpportunityId] = useState("");

  const pipelineMap = useMemo(() => {
    const map = new Map<Stage, PipelineRow>();
    for (const row of pipeline) map.set(row.stage, row);
    return map;
  }, [pipeline]);

  async function loadAll() {
    setError("");
    setMessage("");
    try {
      const [opportunitiesRes, pipelineRes, clientsRes, sellersRes] =
        await Promise.all([
          apiFetch("/crm/opportunities", {
            cache: "no-store",
          }),
          apiFetch("/crm/opportunities/pipeline", {
            cache: "no-store",
          }),
          apiFetch("/clients", {
            cache: "no-store",
          }),
          apiFetch("/hr-admin/collaborators", {
            cache: "no-store",
          }),
        ]);

      if (!opportunitiesRes.ok || !pipelineRes.ok || !clientsRes.ok || !sellersRes.ok) {
        throw new Error("Falha ao carregar dados do funil.");
      }

      setOpportunities((await opportunitiesRes.json()) as Opportunity[]);
      setPipeline((await pipelineRes.json()) as PipelineRow[]);
      setClients((await clientsRes.json()) as ClientOption[]);
      const collaborators = (await sellersRes.json()) as Collaborator[];
      setSellers(collaborators);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar dados do funil.",
      );
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    const opportunityIdFromUrl = new URLSearchParams(window.location.search).get("opportunityId");
    if (opportunityIdFromUrl) {
      setHighlightedOpportunityId(opportunityIdFromUrl);
    }
  }, []);

  async function handleCreateOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !clientId) {
      setError("Informe titulo e cliente para criar a oportunidade.");
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
        setError("Motivo de perda invalido.");
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
    }
  }

  return (
    <div className="space-y-6 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-zinc-900">Funil de Vendas (Oportunidades)</h1>
        <p className="text-sm text-zinc-600">
          Controle comercial em Kanban com fases, valores e inteligencia de motivos de perda.
        </p>
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

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-lg font-bold text-zinc-900">Nova Oportunidade</h2>
        <form
          onSubmit={(event) => void handleCreateOpportunity(event)}
          className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-6"
        >
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Titulo da oportunidade"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm md:col-span-2"
            required
          />
          <select
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            required
          >
            <option value="">Cliente</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.companyName}
                {client.tradeName ? ` (${client.tradeName})` : ""}
              </option>
            ))}
          </select>
          <select
            value={assignedSellerId}
            onChange={(event) => setAssignedSellerId(event.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">Vendedor responsavel</option>
            {sellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
              </option>
            ))}
          </select>
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

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {STAGE_ORDER.map((stage) => {
          const row = pipelineMap.get(stage);
          return (
            <article key={stage} className="rounded-xl border border-zinc-200 bg-white p-3">
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

      <section className="overflow-x-auto rounded-xl border border-zinc-200 bg-white p-4">
        <div className="grid min-w-[1220px] grid-cols-6 gap-3">
          {STAGE_ORDER.map((stage) => (
            <div key={stage} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <h2 className="mb-2 text-sm font-bold text-zinc-800">{STAGE_LABEL[stage]}</h2>
              <div className="space-y-2">
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
                      <p className="mt-1 text-xs text-zinc-700">
                        {item.client?.tradeName || item.client?.companyName}
                      </p>
                      <p className="text-xs text-zinc-600">
                        Vendedor: {item.assignedSeller?.name || "Nao definido"}
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
                          Ultima proposta: {item.proposals[0].code} | {PROPOSAL_STATUS_LABEL[item.proposals[0].status] || item.proposals[0].status}
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
                        onChange={(event) =>
                          void handleStageChange(item, event.target.value as Stage)
                        }
                        className="mt-3 w-full rounded-md border border-zinc-300 px-2 py-1 text-xs"
                      >
                        {STAGE_ORDER.map((stageOption) => (
                          <option key={stageOption} value={stageOption}>
                            {STAGE_LABEL[stageOption]}
                          </option>
                        ))}
                      </select>
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
