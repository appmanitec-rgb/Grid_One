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
  type: string;
  origin?: "MANITEC" | "EXTERNAL";
  externalReference?: string | null;
  externalCurrency?: string | null;
  createdAt?: string | null;
  postSaleGeneratorId?: string | null;
  generatedContract?: { id: string; code: string; status: string } | null;
  client?: { companyName?: string | null } | null;
  generator?: { name?: string | null } | null;
  commercialGenerator?: {
    model?: string | null;
    manufacturer?: string | null;
    internalCode?: string | null;
  } | null;
};

const GOVERNED_REVISION_STATUSES = new Set([
  "REVISION_REQUIRED",
  "REJECTED",
  "REVISED",
]);

type ViewMode = "list" | "kanban";
type ProposalCategory = "ALL" | "GENERATORS" | "PARTS_SERVICES" | "CONTRACTS";
type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";

type FlowColumnSummary = {
  key: string;
  label: string;
  tone: string;
  items: ProposalListItem[];
  totalValue: number;
  foreignCount: number;
};

const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

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
  const [category, setCategory] = useState<ProposalCategory>("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("RECENT");
  const [page, setPage] = useState(1);
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

  const loadProposals = useCallback(async (clearNotice = true) => {
    setLoading(true);
    setError("");
    if (clearNotice) setNotice("");

    try {
      const res = await apiFetch(apiUrl("/proposals"), { cache: "no-store" });
      if (await handleUnauthorized(res)) return false;
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "Falha ao carregar propostas."));
      }
      setProposals((await res.json()) as ProposalListItem[]);
      return true;
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Nao foi possivel carregar propostas.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);
  useEffect(() => {
    const saved = localStorage.getItem(
      "manitec_view_proposals",
    ) as ViewMode | null;
    if (saved === "list" || saved === "kanban") {
      setViewMode(saved);
    }
  }, []);

  useEffect(() => {
    const requestedCategory = new URLSearchParams(window.location.search).get(
      "category",
    );
    if (
      requestedCategory === "GENERATORS" ||
      requestedCategory === "PARTS_SERVICES" ||
      requestedCategory === "CONTRACTS"
    ) {
      setCategory(requestedCategory);
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
      setError("Fluxo inválido: " + statusLabel(current.status) + " → " + statusLabel(nextStatus) + ".");
      setNotice("");
      setDropTarget(null);
      setDraggingId(null);
      return;
    }

    const snapshot = proposals;
    setMovingId(proposalId);
    setError("");
    setNotice("");
    setProposals((prev) => prev.map((proposal) =>
      proposal.id === proposalId ? { ...proposal, status: nextStatus } : proposal,
    ));

    try {
      const res = await apiFetch(apiUrl("/proposals/" + proposalId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "Falha ao mover proposta."));
      }
      if (await loadProposals(false)) {
        setNotice("Proposta " + current.code + " movida para " + statusLabel(nextStatus) + ".");
      }
    } catch (moveError: unknown) {
      setProposals(snapshot);
      setError(moveError instanceof Error ? moveError.message : "Nao foi possivel mover a proposta.");
    } finally {
      setMovingId(null);
      setDropTarget(null);
      setDraggingId(null);
    }
  }
  const filteredProposals = useMemo(() => {
    const term = query.trim().toLowerCase();

    return proposals.filter((proposal) => {
      if (category !== "ALL" && proposalCategory(proposal.type) !== category) {
        return false;
      }
      const proposalStep = statusToFlowStep(proposal.status);
      if (
        statusFilter !== "ALL" &&
        proposalStep !== statusFilter
      ) {
        return false;
      }
      if (!term) return true;

      return (
        proposal.code.toLowerCase().includes(term) ||
        (proposal.externalReference || "").toLowerCase().includes(term) ||
        (proposal.client?.companyName || "").toLowerCase().includes(term) ||
        proposalEquipmentLabel(proposal).toLowerCase().includes(term) ||
        statusLabel(proposal.status).toLowerCase().includes(term)
      );
    });
  }, [category, statusFilter, proposals, query]);

  useEffect(() => {
    setPage(1);
  }, [category, query, sortBy, statusFilter, viewMode]);

  const sortedProposals = useMemo(() => {
    return [...filteredProposals].sort((a, b) => {
      if (sortBy === "VALUE_DESC") return Number(b.totalValue || 0) - Number(a.totalValue || 0);
      if (sortBy === "VALUE_ASC") return Number(a.totalValue || 0) - Number(b.totalValue || 0);
      if (sortBy === "CLIENT") return (a.client?.companyName || "").localeCompare(b.client?.companyName || "", "pt-BR");
      const difference = new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      return sortBy === "OLDEST" ? -difference : difference;
    });
  }, [filteredProposals, sortBy]);

  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(sortedProposals.length / pageSize));
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);
  const visibleProposals = sortedProposals.slice((page - 1) * pageSize, page * pageSize);

  const categoryCounts = useMemo(
    () => ({
      ALL: proposals.length,
      GENERATORS: proposals.filter(
        (proposal) => proposalCategory(proposal.type) === "GENERATORS",
      ).length,
      PARTS_SERVICES: proposals.filter(
        (proposal) => proposalCategory(proposal.type) === "PARTS_SERVICES",
      ).length,
      CONTRACTS: proposals.filter(
        (proposal) => proposalCategory(proposal.type) === "CONTRACTS",
      ).length,
    }),
    [proposals],
  );

  const flowColumns = useMemo(
    () => buildFlowColumns(sortedProposals),
    [sortedProposals],
  );
  const draggingProposal = useMemo(
    () => proposals.find((proposal) => proposal.id === draggingId) || null,
    [proposals, draggingId],
  );

  const stats = useMemo(() => {
    const active = proposals.filter((proposal) => {
      const step = statusToFlowStep(proposal.status);
      return !["WON", "LOST", "REJECTED", "REVISED"].includes(step);
    });
    return {
      total: proposals.length,
      active: active.length,
      activeValue: active.filter(isBrlProposal).reduce(
        (sum, proposal) => sum + Number(proposal.totalValue || 0), 0,
      ),
      boardReview: proposals.filter(
        (proposal) => statusToFlowStep(proposal.status) === "BOARD_REVIEW",
      ).length,
      clientReview: proposals.filter(
        (proposal) => statusToFlowStep(proposal.status) === "CLIENT_REVIEW",
      ).length,
      wonValue: proposals
        .filter((proposal) => proposal.status === "WON" && isBrlProposal(proposal))
        .reduce((sum, proposal) => sum + Number(proposal.totalValue || 0), 0),
      foreignCount: proposals.filter((proposal) => !isBrlProposal(proposal)).length,
    };
  }, [proposals]);
  const commercialHandoffs = useMemo(
    () =>
      proposals.flatMap((proposal) => {
        if (
          proposal.status === "WON" &&
          proposal.type === "CONTRACT" &&
          !proposal.generatedContract
        ) {
          return [{ proposal, action: "Revisar e converter contrato" }];
        }
        if (
          proposal.status === "WON" &&
          proposal.type === "GENERATOR_SALE" &&
          !proposal.postSaleGeneratorId
        ) {
          return [{ proposal, action: "Preparar pós-venda" }];
        }
        return [];
      }),
    [proposals],
  );

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
            helper: stats.foreignCount ? "Soma em BRL; propostas em outra moeda ficam fora do total." : "Soma das propostas abertas em BRL.",
            tone: "emerald",
          },
          {
            label: "Fechado ganho",
            value: formatCurrency(stats.wonValue),
            helper: stats.foreignCount ? "Soma em BRL; propostas em outra moeda ficam fora do total." : "Valor das propostas ganhas em BRL.",
            tone: "amber",
          },
        ]}
        actions={
          <>
            {!isClient ? (
              <Link href="/dashboard/proposals/new" className="inline-flex items-center justify-center rounded-2xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-sky-700">
                + Nova proposta
              </Link>
            ) : null}
            <button type="button" onClick={() => void loadProposals()} disabled={loading} className={SECONDARY_BUTTON}>
              {loading ? "Atualizando..." : "Atualizar carteira"}
            </button>
          </>
        }
        compact
      />

      {!isClient ? (
        <section aria-label="Prioridades comerciais" className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => { setCategory("ALL"); setQuery(""); setStatusFilter("BOARD_REVIEW"); setViewMode("list"); }} className="flex items-center justify-between gap-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-left transition hover:border-sky-400 hover:bg-sky-100">
            <span><span className="block text-xs font-bold uppercase tracking-[0.14em] text-sky-700">Aguardando diretoria</span><span className="mt-1 block text-sm text-slate-700">Inclui revisão de desconto</span></span>
            <span className="text-2xl font-black text-sky-950">{stats.boardReview}</span>
          </button>
          <button type="button" onClick={() => { setCategory("ALL"); setQuery(""); setStatusFilter("CLIENT_REVIEW"); setViewMode("list"); }} className="flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left transition hover:border-amber-400 hover:bg-amber-100">
            <span><span className="block text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Aguardando cliente</span><span className="mt-1 block text-sm text-slate-700">Propostas em análise externa</span></span>
            <span className="text-2xl font-black text-amber-950">{stats.clientReview}</span>
          </button>
        </section>
      ) : null}

      {!isClient ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_54px_-40px_rgba(15,23,42,0.24)] sm:p-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700">Começar</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">Qual proposta você vai preparar?</h2>
              <p className="mt-1 text-sm text-slate-600">Escolha o fluxo certo e continue com os dados comerciais.</p>
            </div>
            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">4 formatos disponíveis</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CreateProposalCard index="01" title="Peças e serviços" description="Manutenção, materiais e atendimento." href="/dashboard/proposals/new" />
            <CreateProposalCard index="02" title="Gerador" description="Venda de equipamento e acessórios." href="/dashboard/proposals/new/generator" />
            <CreateProposalCard index="03" title="Contrato" description="Cobertura e serviços recorrentes." href="/dashboard/proposals/new?proposalType=CONTRACT" />
            <CreateProposalCard index="04" title="Proposta externa" description="Registre uma venda de origem externa." href="/dashboard/proposals/new/external" />
          </div>
        </section>
      ) : null}
      {notice ? <StatusBanner tone="emerald">{notice}</StatusBanner> : null}
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}

      {!isClient && commercialHandoffs.length > 0 ? (
        <SectionCard
          eyebrow="Passagem comercial"
          title="Vendas ganhas aguardando o próximo passo"
          description="O aceite do cliente atualiza a proposta. A continuidade aparece aqui até o contrato ou o pré-cadastro de pós-venda estar vinculado."
          actions={<DataPill tone="amber">{commercialHandoffs.length} pendente(s)</DataPill>}
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {commercialHandoffs.slice(0, 6).map(({ proposal, action }) => (
              <Link
                key={proposal.id}
                href={`/dashboard/proposals/${proposal.id}`}
                className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 transition hover:border-amber-400 hover:bg-amber-50"
              >
                <span>
                  <span className="block text-sm font-bold text-slate-900">
                    {proposal.code} · {proposal.client?.companyName || "Cliente sem nome"}
                  </span>
                  <span className="mt-1 block text-xs text-slate-600">{action}</span>
                </span>
                <span className="text-xs font-bold text-amber-800 group-hover:underline">
                  Abrir proposta →
                </span>
              </Link>
            ))}
          </div>
          {commercialHandoffs.length > 6 ? (
            <p className="mt-3 text-xs text-slate-500">
              Mostrando as 6 mais recentes. As demais seguem identificadas na carteira abaixo.
            </p>
          ) : null}
        </SectionCard>
      ) : null}

      <SectionCard
        eyebrow={
          viewMode === "list" ? "Vista de carteira" : "Vista de operacao"
        }
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
          <div className="flex w-full flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <ViewModeButton active={viewMode === "list"} onClick={() => setViewMode("list")}>Lista</ViewModeButton>
              {!isClient ? <ViewModeButton active={viewMode === "kanban"} onClick={() => setViewMode("kanban")}>Kanban</ViewModeButton> : null}
              <span className="ml-auto rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
                {filteredProposals.length} de {proposals.length} propostas
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_200px_180px_auto]">
              <label className="sr-only" htmlFor="proposal-search">Pesquisar propostas</label>
              <TextInput
                id="proposal-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Código, cliente, referência ou equipamento"
                className="min-w-0"
              />
              <label className="sr-only" htmlFor="proposal-status-filter">Filtrar por etapa</label>
              <select id="proposal-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 min-w-0 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                <option value="ALL">Todas as etapas</option>
                {KANBAN_COLUMNS.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}
              </select>
              <label className="sr-only" htmlFor="proposal-sort">Ordenar propostas</label>
              <select id="proposal-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="h-11 min-w-0 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                <option value="RECENT">Mais recentes</option>
                <option value="OLDEST">Mais antigas</option>
                <option value="VALUE_DESC">Maior valor</option>
                <option value="VALUE_ASC">Menor valor</option>
                <option value="CLIENT">Cliente A–Z</option>
              </select>
              <button type="button" onClick={() => { setQuery(""); setStatusFilter("ALL"); setSortBy("RECENT"); setCategory("ALL"); }} disabled={!query && statusFilter === "ALL" && sortBy === "RECENT" && category === "ALL"} className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                Limpar filtros
              </button>
            </div>
          </div>
        }
      >
        <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-4">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Tipo</span>
          <CategoryButton label="Todas" count={categoryCounts.ALL} active={category === "ALL"} onClick={() => setCategory("ALL")} />
          <CategoryButton label="Geradores" count={categoryCounts.GENERATORS} active={category === "GENERATORS"} onClick={() => setCategory("GENERATORS")} />
          <CategoryButton label="Peças e serviços" count={categoryCounts.PARTS_SERVICES} active={category === "PARTS_SERVICES"} onClick={() => setCategory("PARTS_SERVICES")} />
          <CategoryButton label="Contratos" count={categoryCounts.CONTRACTS} active={category === "CONTRACTS"} onClick={() => setCategory("CONTRACTS")} />
        </div>
        {loading ? (
          <div role="status" className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-10 text-sm text-slate-500">
            Carregando propostas...
          </div>
        ) : null}

        {!loading && viewMode === "list" ? (
          filteredProposals.length > 0 ? (
            <div className="space-y-3">
              {visibleProposals.map((proposal) => (
                <ProposalPortfolioCard key={proposal.id} proposal={proposal} />
              ))}
              {pageCount > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                  <p className="text-sm text-slate-600">Página {page} de {pageCount} · {sortedProposals.length} propostas</p>
                  <div className="flex gap-2">
                    <button type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)} className={SECONDARY_BUTTON}>Anterior</button>
                    <button type="button" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)} className={SECONDARY_BUTTON}>Próxima</button>
                  </div>
                </div>
              ) : null}
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
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Etapas do funil</p>
                    <p className="mt-1 text-sm text-slate-600">Arraste um cartão para uma etapa permitida.</p>
                  </div>
                  <DataPill tone="blue">{filteredProposals.length} propostas no quadro</DataPill>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                  {flowColumns.map((column, index) => (
                    <KanbanStepCard key={column.key} index={index + 1} label={column.label} count={column.items.length} tone={column.tone} />
                  ))}
                </div>
              </div>
              <DashboardKanban ariaLabel="Kanban comercial de propostas">
                {flowColumns.map((column) => {
                  const canReceiveDrop = draggingProposal
                    ? column.key !== "OTHER" &&
                      !GOVERNED_REVISION_STATUSES.has(
                        draggingProposal.status,
                      ) &&
                      !GOVERNED_REVISION_STATUSES.has(column.key) &&
                      (isAdmin ||
                        canMoveForward(draggingProposal.status, column.key))
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
                        setDropTarget((prev) =>
                          prev === column.key ? null : prev,
                        )
                      }
                      onDrop={(event) => {
                        if (!canReceiveDrop) return;
                        event.preventDefault();
                        const proposalId =
                          event.dataTransfer.getData("text/proposal-id") ||
                          draggingId;

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
                          <div className="text-right">
                            <DataPill tone={statusTone(column.key)}>{formatCurrency(column.totalValue)} em BRL</DataPill>
                            {column.foreignCount > 0 ? <p className="mt-1 text-[11px] font-medium text-slate-600">{column.foreignCount} em outra moeda</p> : null}
                          </div>
                        </div>
                      </div>

                      <div className="dashboard-kanban-column-scroll mt-4 space-y-3 pr-1">
                        {column.items.map((proposal) => (
                          <KanbanProposalCard
                            key={proposal.id}
                            proposal={proposal}
                            disabled={
                              Boolean(movingId) ||
                              GOVERNED_REVISION_STATUSES.has(proposal.status)
                            }
                            onDragStart={(event) => {
                              if (movingId) return;

                              setDraggingId(proposal.id);
                              event.dataTransfer.setData(
                                "text/proposal-id",
                                proposal.id,
                              );
                              event.dataTransfer.effectAllowed = "move";

                              const ghost = document.createElement("div");
                              ghost.style.padding = "10px 12px";
                              ghost.style.borderRadius = "14px";
                              ghost.style.background = "#ffffff";
                              ghost.style.border = "1px solid #dbe3ee";
                              ghost.style.boxShadow =
                                "0 18px 36px rgba(15,31,50,0.18)";
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
                            blocked={
                              Boolean(draggingProposal) &&
                              !canReceiveDrop &&
                              !isAdmin
                            }
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

function CreateProposalCard({ index, title, description, href }: { index: string; title: string; description: string; href: string }) {
  return (
    <Link href={href} className="group flex min-h-32 flex-col justify-between rounded-2xl border border-slate-200 bg-[linear-gradient(145deg,#f8fbff,#ffffff)] p-4 transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_18px_36px_-28px_rgba(2,132,199,0.42)]">
      <div className="flex items-start justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-xs font-black text-sky-700 shadow-sm">{index}</span>
        <span aria-hidden="true" className="text-lg font-bold text-sky-600 transition group-hover:translate-x-1">↗</span>
      </div>
      <div>
        <h3 className="text-sm font-bold text-slate-950">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
      </div>
    </Link>
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

function CategoryButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={active
        ? "inline-flex items-center gap-2 rounded-full border border-sky-500 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-900"
        : "inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50"}
    >
      <span>{label}</span>
      <span className={active ? "rounded-full bg-sky-600 px-2 py-0.5 text-[11px] text-white" : "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"}>{count}</span>
    </button>
  );
}
function ProposalPortfolioCard({ proposal }: { proposal: ProposalListItem }) {
  const step = statusToFlowStep(proposal.status);

  return (
    <article className="group rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow-[0_18px_42px_-30px_rgba(15,31,50,0.35)] sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-lg font-black text-sky-700">
            {proposalTypeLabel(proposal.type).slice(0, 1)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={'/dashboard/proposals/' + proposal.id} className="dashboard-record-link text-base font-bold" title="Abrir proposta">
                {proposal.code}
              </Link>
              <DataPill tone={statusTone(proposal.status)}>{statusLabel(proposal.status)}</DataPill>
              {proposal.origin === "EXTERNAL" ? <DataPill tone="amber">Externa</DataPill> : null}
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-slate-800" title={proposal.client?.companyName || ""}>
              {proposal.client?.companyName || "Cliente não vinculado"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {proposalTypeLabel(proposal.type)} · {proposalEquipmentLabel(proposal)}
            </p>
          </div>
        </div>
        <div className="flex items-end justify-between gap-4 border-t border-slate-100 pt-3 lg:flex-col lg:items-end lg:border-0 lg:pt-0">
          <div className="lg:text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Valor da proposta</p>
            <p className="mt-1 text-xl font-bold text-slate-950">
              {formatCurrency(Number(proposal.totalValue || 0), proposal.externalCurrency || "BRL")}
            </p>
          </div>
          <Link href={'/dashboard/proposals/' + proposal.id} className="inline-flex shrink-0 items-center rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white transition hover:bg-sky-700">
            Abrir proposta <span aria-hidden="true" className="ml-2">→</span>
          </Link>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
        <span><strong className="font-semibold text-slate-800">Etapa:</strong> {stepLabel(step)}</span>
        {proposal.createdAt ? <span><strong className="font-semibold text-slate-800">Criada:</strong> {formatDate(proposal.createdAt)}</span> : null}
        {proposal.externalReference ? <span><strong className="font-semibold text-slate-800">Referência:</strong> {proposal.externalReference}</span> : null}
        {proposal.type === "CONTRACT" && proposal.status === "WON" && !proposal.generatedContract ? <span className="font-semibold text-amber-700">Contrato pendente</span> : null}
        {proposal.type === "GENERATOR_SALE" && proposal.status === "WON" && !proposal.postSaleGeneratorId ? <span className="font-semibold text-amber-700">Pós-venda pendente</span> : null}
      </div>
    </article>
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
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-grab active:cursor-grabbing"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href={`/dashboard/proposals/${proposal.id}`} draggable={false} className="dashboard-record-link text-sm font-bold" title="Abrir proposta">
            {proposal.code}
          </Link>
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
            {proposalEquipmentLabel(proposal)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Valor
          </p>
          <p className="mt-2 text-lg font-bold text-slate-950">
            {formatCurrency(
              Number(proposal.totalValue || 0),
              proposal.externalCurrency || "BRL",
            )}
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
        {blocked
          ? "Transicao bloqueada para esta proposta"
          : "Coluna pronta para receber"}
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
      totalValue: items.filter(isBrlProposal).reduce(
        (sum, proposal) => sum + Number(proposal.totalValue || 0), 0,
      ),
      foreignCount: items.filter((proposal) => !isBrlProposal(proposal)).length,
    };
  });
}

function isBrlProposal(proposal: ProposalListItem) {
  return !proposal.externalCurrency || proposal.externalCurrency.trim().toUpperCase() === "BRL";
}
function proposalCategory(type: string): ProposalCategory {
  if (type === "GENERATOR_SALE") return "GENERATORS";
  if (type === "CONTRACT") return "CONTRACTS";
  return "PARTS_SERVICES";
}

function proposalTypeLabel(type: string) {
  if (type === "GENERATOR_SALE") return "Gerador";
  if (type === "CONTRACT") return "Contrato";
  if (type === "PARTS") return "Pecas";
  if (type === "SERVICES") return "Servicos";
  return "Pecas e servicos";
}

function proposalEquipmentLabel(proposal: ProposalListItem) {
  if (proposal.commercialGenerator?.model) {
    const model = proposal.commercialGenerator.model.trim();
    const manufacturer = proposal.commercialGenerator.manufacturer?.trim();
    return manufacturer && !model.toLowerCase().startsWith(manufacturer.toLowerCase())
      ? manufacturer + " " + model
      : model;
  }
  return proposal.generator?.name || "Sem equipamento vinculado";
}
function stepLabel(step: string) {
  return KANBAN_COLUMNS.find((column) => column.key === step)?.label || step;
}

function statusTone(status: string): Tone {
  const step = statusToFlowStep(status);

  if (step === "REVISION_REQUIRED") return "amber";
  if (step === "REJECTED") return "rose";
  if (step === "BOARD_REVIEW") return "blue";
  if (step === "CLIENT_REVIEW") return "amber";
  if (step === "WON") return "emerald";
  if (step === "LOST") return "rose";
  return "slate";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data indisponível" : date.toLocaleDateString("pt-BR");
}

function formatCurrency(value: number, currency = "BRL") {
  const amount = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + currency;
  }
}
