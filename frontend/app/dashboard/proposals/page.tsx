"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DragEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";
import {
  clearAuthSession,
  decodeJwtPayload,
  getStoredAccessToken,
} from "@/lib/auth-session";
import {
  DataPill,
  EmptyState,
  FieldBox,
  PageHero,
  SectionCard,
  StatusBanner,
  TextInput,
} from "../components/DashboardPageKit";
import { DashboardKanban } from "../components/DashboardKanban";
import {
  KANBAN_COLUMNS,
  canMoveForward,
  statusLabel,
  statusToFlowStep,
} from "./flow";

type ProposalListItem = {
  id: string;
  code: string;
  status: string;
  totalValue?: number | null;
  client?: { companyName?: string | null } | null;
  generator?: { name?: string | null } | null;
};

type ViewMode = "list" | "kanban";
type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";

type FlowColumnSummary = {
  key: string;
  label: string;
  tone: string;
  items: ProposalListItem[];
  totalValue: number;
};

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50";

export default function ProposalsPage() {
  const router = useRouter();
  const [proposals, setProposals] = useState<ProposalListItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kanbanStatusFilter, setKanbanStatusFilter] = useState("ALL");
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const viewerRole = useMemo(() => {
    const token = getStoredAccessToken();
    if (!token) return "NORMAL";
    const payload = decodeJwtPayload<{ role?: string }>(token);
    return payload?.role || "NORMAL";
  }, []);
  const isAdmin = viewerRole === "ADMIN";
  const isClient = viewerRole === "CLIENT";

  const handleUnauthorized = useCallback(
    async (res: Response) => {
      if (res.status !== 401) return false;
      clearAuthSession();
      router.replace("/");
      return true;
    },
    [router],
  );

  const loadProposals = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const res = await apiFetch(apiUrl("/proposals"), { cache: "no-store" });
      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Falha ao carregar propostas."),
        );
      }
      setProposals((await res.json()) as ProposalListItem[]);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Nao foi possivel carregar propostas.",
      );
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    const saved = localStorage.getItem("manitec_view_proposals") as ViewMode | null;
    if (saved === "list" || saved === "kanban") {
      setViewMode(saved);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("manitec_view_proposals", viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (isClient && viewMode !== "list") {
      setViewMode("list");
    }
  }, [isClient, viewMode]);

  useEffect(() => {
    void loadProposals();
  }, [loadProposals]);

  async function moveProposalToStatus(proposalId: string, nextStatus: string) {
    if (isClient) {
      setError("O portal do cliente movimenta propostas apenas pela tela de detalhe.");
      setNotice("");
      return;
    }

    if (movingId) return;

    const current = proposals.find((proposal) => proposal.id === proposalId);
    if (!current || current.status === nextStatus) return;

    if (!isAdmin && !canMoveForward(current.status, nextStatus)) {
      setError(
        `Fluxo invalido: ${statusLabel(current.status)} -> ${statusLabel(nextStatus)}.`,
      );
      setNotice("");
      setDropTarget(null);
      setDraggingId(null);
      return;
    }

    const snapshot = proposals;
    setMovingId(proposalId);
    setError("");
    setNotice("");
    setProposals((prev) =>
      prev.map((proposal) =>
        proposal.id === proposalId ? { ...proposal, status: nextStatus } : proposal,
      ),
    );

    try {
      const res = await apiFetch(apiUrl(`/proposals/${proposalId}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "Falha ao mover proposta."));
      }

      setNotice(
        `Proposta ${current.code} movida para ${statusLabel(nextStatus)}.`,
      );
    } catch (moveError: unknown) {
      setProposals(snapshot);
      setError(
        moveError instanceof Error
          ? moveError.message
          : "Nao foi possivel mover a proposta.",
      );
    } finally {
      setMovingId(null);
      setDropTarget(null);
      setDraggingId(null);
    }
  }

  const filteredProposals = useMemo(() => {
    const term = query.trim().toLowerCase();

    return proposals.filter((proposal) => {
      const proposalStep = statusToFlowStep(proposal.status);
      if (
        viewMode === "kanban" &&
        kanbanStatusFilter !== "ALL" &&
        proposalStep !== kanbanStatusFilter
      ) {
        return false;
      }
      if (!term) return true;

      return (
        proposal.code.toLowerCase().includes(term) ||
        (proposal.client?.companyName || "").toLowerCase().includes(term) ||
        (proposal.generator?.name || "").toLowerCase().includes(term) ||
        statusLabel(proposal.status).toLowerCase().includes(term)
      );
    });
  }, [kanbanStatusFilter, proposals, query, viewMode]);

  const flowColumns = useMemo(
    () => buildFlowColumns(filteredProposals),
    [filteredProposals],
  );
  const portfolioColumns = useMemo(() => buildFlowColumns(proposals), [proposals]);

  const draggingProposal = useMemo(
    () => proposals.find((proposal) => proposal.id === draggingId) || null,
    [proposals, draggingId],
  );

  const stats = useMemo(() => {
    const active = proposals.filter((proposal) => {
      const step = statusToFlowStep(proposal.status);
      return step !== "WON" && step !== "LOST";
    });
    const boardReview = proposals.filter(
      (proposal) => statusToFlowStep(proposal.status) === "BOARD_REVIEW",
    ).length;
    const clientReview = proposals.filter(
      (proposal) => statusToFlowStep(proposal.status) === "CLIENT_REVIEW",
    ).length;
    const wonValue = proposals
      .filter((proposal) => statusToFlowStep(proposal.status) === "WON")
      .reduce((sum, proposal) => sum + Number(proposal.totalValue || 0), 0);

    return {
      total: proposals.length,
      active: active.length,
      activeValue: active.reduce(
        (sum, proposal) => sum + Number(proposal.totalValue || 0),
        0,
      ),
      boardReview,
      clientReview,
      wonValue,
    };
  }, [proposals]);

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Modulo comercial"
        title={isClient ? "Minhas propostas" : "Central de propostas"}
        description={
          isClient
            ? "Acompanhe suas propostas, revisoes e itens prontos para decisao."
            : "Carteira comercial organizada por etapa, valor e prioridade de aprovacao."
        }
        stats={[
          {
            label: "Carteira total",
            value: String(stats.total),
            helper: "Todas as propostas registradas no modulo.",
            tone: "slate",
          },
          {
            label: "Em andamento",
            value: String(stats.active),
            helper: "Itens que ainda estao no funil comercial.",
            tone: "blue",
          },
          {
            label: "Volume no funil",
            value: formatCurrency(stats.activeValue),
            helper: "Soma financeira das oportunidades abertas.",
            tone: "emerald",
          },
          {
            label: "Fechado ganho",
            value: formatCurrency(stats.wonValue),
            helper: "Receita potencial ja convertida em propostas ganhas.",
            tone: "amber",
          },
        ]}
        actions={
          <>
            <ViewModeButton
              active={viewMode === "list"}
              onClick={() => setViewMode("list")}
            >
              Lista executiva
            </ViewModeButton>
            {!isClient ? (
              <ViewModeButton
                active={viewMode === "kanban"}
                onClick={() => setViewMode("kanban")}
              >
                Kanban comercial
              </ViewModeButton>
            ) : null}
            <button
              type="button"
              onClick={() => void loadProposals()}
              className={SECONDARY_BUTTON}
            >
              Atualizar carteira
            </button>
            {!isClient ? (
              <Link href="/dashboard/proposals/new" className={PRIMARY_BUTTON}>
                Nova proposta
              </Link>
            ) : null}
          </>
        }
        asideLayout="stacked"
        aside={
          <FieldBox className="rounded-[24px] border-white/60 bg-white/82 p-4 shadow-[0_18px_48px_-38px_rgba(15,31,50,0.4)]">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)_minmax(260px,0.7fr)] lg:items-center">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Pulso do modulo
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Diretoria e cliente concentram as etapas mais sensiveis. A leitura abaixo
                  ajuda a antecipar gargalos sem entulhar a tela.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <PulseStat
                  label="Diretoria"
                  value={String(stats.boardReview)}
                  helper="Itens aguardando decisao interna."
                  tone="blue"
                />
                <PulseStat
                  label="Cliente"
                  value={String(stats.clientReview)}
                  helper="Itens em analise ou fechamento externo."
                  tone="amber"
                />
              </div>
              {isAdmin ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
                  Modo admin ativo: a movimentacao no kanban aceita override manual de etapa.
                </div>
              ) : isClient ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                  O portal concentra leitura e decisao final. Para aprovar ou recusar, abra a proposta.
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                  Usuarios comuns seguem apenas as transicoes permitidas do fluxo comercial.
                </div>
              )}
            </div>
          </FieldBox>
        }
      />

      {notice ? <StatusBanner tone="emerald">{notice}</StatusBanner> : null}
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}

      <SectionCard
        eyebrow="Radar do funil"
        title="Leitura rapida das etapas do fluxo"
        description="Cada bloco resume quantidade e valor por etapa. Quando a busca estiver ativa, os indicadores abaixo refletem somente o recorte filtrado."
        actions={
          <div className="flex flex-wrap gap-2">
            <DataPill tone="slate">
              {filteredProposals.length} resultado(s)
            </DataPill>
            {query.trim() ? (
              <DataPill tone="blue">Filtro: {query.trim()}</DataPill>
            ) : (
              <DataPill tone="emerald">Sem filtro ativo</DataPill>
            )}
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {flowColumns.map((column) => (
            <FlowSummaryCard
              key={column.key}
              label={column.label}
              count={column.items.length}
              value={column.totalValue}
              tone={statusTone(column.key)}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow={viewMode === "list" ? "Vista de carteira" : "Vista de operacao"}
        title={
          viewMode === "list"
            ? isClient
              ? "Minhas propostas"
              : "Carteira de propostas"
            : "Kanban de aprovacao"
        }
        description={
          viewMode === "list"
            ? isClient
              ? "Acompanhe revisoes, liberacoes e propostas prontas para sua decisao sem entrar no fluxo interno."
              : "Uma leitura mais limpa para navegar pelo portfolio comercial sem a poluicao de uma tabela pesada."
            : "Arraste as propostas entre as colunas permitidas para manter o funil vivo e visivel."
        }
        actions={
          <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[640px] xl:flex-row xl:items-center xl:justify-end">
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por codigo, cliente ou equipamento..."
              className="xl:min-w-[320px]"
            />
            {viewMode === "kanban" && !isClient ? (
              <select
                value={kanbanStatusFilter}
                onChange={(event) => setKanbanStatusFilter(event.target.value)}
                className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              >
                <option value="ALL">Todas as etapas</option>
                {KANBAN_COLUMNS.map((column) => (
                  <option key={column.key} value={column.key}>
                    {column.label}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        }
      >
        {loading ? (
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-10 text-sm text-slate-500">
            Carregando propostas...
          </div>
        ) : null}

        {!loading && viewMode === "list" ? (
          filteredProposals.length > 0 ? (
            <div className="space-y-3">
              {filteredProposals.map((proposal) => (
                <ProposalPortfolioCard key={proposal.id} proposal={proposal} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nenhuma proposta encontrada"
              description="Ajuste a busca ou cadastre uma nova proposta para alimentar a carteira."
            />
          )
        ) : null}

        {!loading && viewMode === "kanban" ? (
          filteredProposals.length > 0 ? (
            <div className="space-y-4">
              <div className="grid gap-3">
                <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(145deg,#f8fbff_0%,#eef5ff_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                  <div className="grid gap-3 md:grid-cols-5">
                    {flowColumns.map((column, index) => (
                      <KanbanStepCard
                        key={column.key}
                        index={index + 1}
                        label={column.label}
                        count={column.items.length}
                        tone={column.tone}
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-200 bg-slate-50/85 p-5 shadow-[0_24px_60px_-48px_rgba(15,31,50,0.38)]">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                        Leitura da operacao
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Encoste nas laterais do quadro para andar horizontalmente. Cada coluna tem rolagem propria para evitar listas longas.
                      </p>
                    </div>
                    <DataPill tone={query.trim() || kanbanStatusFilter !== "ALL" ? "blue" : "emerald"}>
                      {filteredProposals.length} resultado(s)
                    </DataPill>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    {portfolioColumns
                      .filter((column) => column.items.length > 0)
                      .slice(0, 3)
                      .map((column) => (
                        <div
                          key={column.key}
                          className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-900">
                              {column.label}
                            </p>
                            <DataPill tone={statusTone(column.key)}>
                              {column.items.length} itens
                            </DataPill>
                          </div>
                          <p className="mt-2 text-sm text-slate-600">
                            Volume atual: {formatCurrency(column.totalValue)}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              <DashboardKanban ariaLabel="Kanban comercial de propostas">
                  {flowColumns.map((column) => {
                    const canReceiveDrop = draggingProposal
                      ? isAdmin || canMoveForward(draggingProposal.status, column.key)
                      : false;

                    return (
                      <section
                        key={column.key}
                        onDragOver={(event) => {
                          if (!canReceiveDrop) return;
                          event.preventDefault();
                          setDropTarget(column.key);
                        }}
                        onDragLeave={() =>
                          setDropTarget((prev) => (prev === column.key ? null : prev))
                        }
                        onDrop={(event) => {
                          if (!canReceiveDrop) return;
                          event.preventDefault();
                          const proposalId =
                            event.dataTransfer.getData("text/proposal-id") || draggingId;

                          if (proposalId) {
                            void moveProposalToStatus(proposalId, column.key);
                          }
                        }}
                        className={`dashboard-kanban-column flex min-w-[320px] snap-start flex-col rounded-[28px] border p-4 transition ${
                          dropTarget === column.key
                            ? "border-sky-400 bg-sky-50 shadow-[0_0_0_3px_rgba(14,165,233,0.16)]"
                            : canReceiveDrop
                              ? "border-emerald-300 bg-emerald-50/40 shadow-[0_22px_55px_-42px_rgba(16,185,129,0.45)]"
                              : "border-slate-200 bg-white/90 shadow-[0_22px_55px_-42px_rgba(15,31,50,0.32)]"
                        }`}
                      >
                        <div
                          className={`rounded-[24px] border border-white/60 bg-gradient-to-r ${column.tone} px-4 py-4`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600">
                                {column.label}
                              </p>
                              <p className="mt-2 text-2xl font-bold text-slate-950">
                                {column.items.length}
                              </p>
                            </div>
                            <DataPill tone={statusTone(column.key)}>
                              {formatCurrency(column.totalValue)}
                            </DataPill>
                          </div>
                        </div>

                        <div className="dashboard-kanban-column-scroll mt-4 space-y-3 pr-1">
                          {column.items.map((proposal) => (
                            <KanbanProposalCard
                              key={proposal.id}
                              proposal={proposal}
                              disabled={Boolean(movingId)}
                              onDragStart={(event) => {
                                if (movingId) return;

                                setDraggingId(proposal.id);
                                event.dataTransfer.setData("text/proposal-id", proposal.id);
                                event.dataTransfer.effectAllowed = "move";

                                const ghost = document.createElement("div");
                                ghost.style.padding = "10px 12px";
                                ghost.style.borderRadius = "14px";
                                ghost.style.background = "#ffffff";
                                ghost.style.border = "1px solid #dbe3ee";
                                ghost.style.boxShadow = "0 18px 36px rgba(15,31,50,0.18)";
                                ghost.style.fontSize = "12px";
                                ghost.style.fontWeight = "700";
                                ghost.style.color = "#0f172a";
                                ghost.innerText = `${proposal.code} - ${proposal.client?.companyName || "Sem cliente"}`;
                                document.body.appendChild(ghost);
                                event.dataTransfer.setDragImage(ghost, 20, 20);
                                requestAnimationFrame(() => {
                                  if (document.body.contains(ghost)) {
                                    document.body.removeChild(ghost);
                                  }
                                });
                              }}
                              onDragEnd={() => {
                                setDraggingId(null);
                                setDropTarget(null);
                              }}
                            />
                          ))}

                          {column.items.length === 0 ? (
                            <EmptyDropZone
                              blocked={Boolean(draggingProposal) && !canReceiveDrop && !isAdmin}
                            />
                          ) : null}
                        </div>
                      </section>
                    );
                  })}
              </DashboardKanban>
            </div>
          ) : (
            <EmptyState
              title="Nenhuma proposta para exibir no kanban"
              description="Experimente limpar a busca ou criar uma nova proposta para alimentar o fluxo."
            />
          )
        ) : null}
      </SectionCard>
    </div>
  );
}

function ViewModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
        active
          ? "bg-sky-600 text-white shadow-[0_18px_40px_-24px_rgba(2,132,199,0.5)]"
          : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function PulseStat({
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
      <p className="mt-3 text-xs leading-5 text-slate-600">{helper}</p>
    </div>
  );
}

function FlowSummaryCard({
  label,
  count,
  value,
  tone,
}: {
  label: string;
  count: number;
  value: number;
  tone: Tone;
}) {
  return (
    <article className="rounded-[24px] border border-slate-200 bg-slate-50/85 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </p>
        <DataPill tone={tone}>{count} itens</DataPill>
      </div>
      <p className="mt-3 text-2xl font-bold text-slate-950">{formatCurrency(value)}</p>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        Valor acumulado para esta etapa do fluxo.
      </p>
    </article>
  );
}

function ProposalPortfolioCard({ proposal }: { proposal: ProposalListItem }) {
  const step = statusToFlowStep(proposal.status);
  const statusToneValue = statusTone(proposal.status);

  return (
    <article className="rounded-[28px] border border-slate-200 bg-white/92 px-5 py-5 shadow-[0_24px_60px_-48px_rgba(15,31,50,0.35)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-bold text-slate-950">{proposal.code}</p>
            <DataPill tone={statusToneValue}>{statusLabel(proposal.status)}</DataPill>
            {proposal.status !== step ? (
              <DataPill tone="amber">Retorno para diretoria</DataPill>
            ) : null}
          </div>
          <p className="text-sm font-medium text-slate-700">
            {proposal.client?.companyName || "Sem cliente vinculado"}
          </p>
          <p className="text-sm text-slate-500">
            Equipamento: {proposal.generator?.name || "Sem equipamento vinculado"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Valor total
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-950">
              {formatCurrency(Number(proposal.totalValue || 0))}
            </p>
          </div>
          <Link
            href={`/dashboard/proposals/${proposal.id}`}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Abrir detalhes
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <MiniPortfolioInfo
          label="Etapa do fluxo"
          value={stepLabel(step)}
          helper="Posicao macro no kanban comercial."
        />
        <MiniPortfolioInfo
          label="Status operacional"
          value={statusLabel(proposal.status)}
          helper="Leitura detalhada do momento atual."
        />
        <MiniPortfolioInfo
          label="Acompanhamento"
          value={proposal.client?.companyName ? "Cliente vinculado" : "Revisar cadastro"}
          helper="Base usada para comunicacao e proposta."
        />
      </div>
    </article>
  );
}

function MiniPortfolioInfo({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-600">{helper}</p>
    </div>
  );
}

function KanbanStepCard({
  index,
  label,
  count,
  tone,
}: {
  index: number;
  label: string;
  count: number;
  tone: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white/90 p-3 shadow-[0_16px_36px_-32px_rgba(15,31,50,0.35)]">
      <div className={`rounded-2xl bg-gradient-to-r ${tone} px-3 py-3`}>
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-[11px] font-bold text-white">
            {index}
          </span>
          <DataPill tone="slate">{count}</DataPill>
        </div>
        <p className="mt-3 text-sm font-semibold text-slate-900">{label}</p>
      </div>
    </div>
  );
}

function KanbanProposalCard({
  proposal,
  disabled,
  onDragStart,
  onDragEnd,
}: {
  proposal: ProposalListItem;
  disabled: boolean;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  return (
    <article
      draggable={!disabled}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-[0_22px_40px_-34px_rgba(15,31,50,0.34)] transition hover:border-sky-300 hover:bg-sky-50/35 ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-grab active:cursor-grabbing"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-950">{proposal.code}</p>
          <p className="mt-1 text-sm text-slate-700">
            {proposal.client?.companyName || "Sem cliente"}
          </p>
        </div>
        <DataPill tone={statusTone(proposal.status)}>
          {statusLabel(proposal.status)}
        </DataPill>
      </div>

      <div className="mt-4 space-y-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Equipamento
          </p>
          <p className="mt-2 text-sm text-slate-800">
            {proposal.generator?.name || "Sem equipamento"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Valor
          </p>
          <p className="mt-2 text-lg font-bold text-slate-950">
            {formatCurrency(Number(proposal.totalValue || 0))}
          </p>
        </div>
      </div>

      <Link
        href={`/dashboard/proposals/${proposal.id}`}
        draggable={false}
        className="mt-4 inline-flex text-sm font-semibold text-sky-700 transition hover:text-sky-800 hover:underline"
      >
        Abrir detalhes
      </Link>
    </article>
  );
}

function EmptyDropZone({ blocked }: { blocked: boolean }) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/85 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-slate-700">
        {blocked ? "Transicao bloqueada para esta proposta" : "Coluna pronta para receber"}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        {blocked
          ? "O fluxo atual nao permite esta movimentacao com o perfil logado."
          : "Arraste uma proposta para esta etapa quando quiser atualizar o funil."}
      </p>
    </div>
  );
}

function buildFlowColumns(proposals: ProposalListItem[]): FlowColumnSummary[] {
  return KANBAN_COLUMNS.map((column) => {
    const items = proposals.filter(
      (proposal) => statusToFlowStep(proposal.status) === column.key,
    );

    return {
      ...column,
      items,
      totalValue: items.reduce(
        (sum, proposal) => sum + Number(proposal.totalValue || 0),
        0,
      ),
    };
  });
}

function stepLabel(step: string) {
  return KANBAN_COLUMNS.find((column) => column.key === step)?.label || step;
}

function statusTone(status: string): Tone {
  const step = statusToFlowStep(status);

  if (step === "BOARD_REVIEW") return "blue";
  if (step === "CLIENT_REVIEW") return "amber";
  if (step === "WON") return "emerald";
  if (step === "LOST") return "rose";
  return "slate";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}
