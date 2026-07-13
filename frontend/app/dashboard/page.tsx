"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Dispatch,
  SetStateAction,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getAccessFromToken } from "@/lib/access";
import { apiFetch } from "@/lib/api";
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
} from "./components/DashboardPageKit";

type Proposal = {
  id: string;
  code: string;
  status: string;
  totalValue: number;
  client?: { companyName: string } | null;
  user?: { name: string } | null;
};

type Order = { id: string; status: string };

type Movement = {
  id: string;
  action: string;
  note?: string | null;
  createdAt: string;
  proposal: { id: string; code: string; status: string };
  actorUser?: { name: string; role: string } | null;
};

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  isSystemMaster?: boolean;
};

type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";

type StageColumn = {
  key: string;
  label: string;
};

type DashboardPanelKey =
  | "priorities"
  | "actions"
  | "pipeline"
  | "board"
  | "updates"
  | "governance";

type DashboardPanelsState = Record<DashboardPanelKey, boolean>;

const PIPELINE_COLUMNS: StageColumn[] = [
  { key: "DRAFT", label: "Rascunho" },
  { key: "BOARD_REVIEW", label: "Análise diretoria" },
  { key: "REVISION_REQUIRED", label: "Em revisão" },
  { key: "CLIENT_REVIEW", label: "Análise cliente" },
  { key: "DISCOUNT_REVIEW", label: "Desconto" },
  { key: "WON", label: "Ganhas" },
  { key: "LOST", label: "Perdidas" },
];

const ACTION_TONES: Record<
  Tone,
  { shell: string; badge: string; accent: string; button: string }
> = {
  blue: {
    shell:
      "border-sky-200 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_28%),linear-gradient(180deg,#ffffff_0%,#eef7ff_100%)]",
    badge: "bg-sky-100 text-sky-800",
    accent: "bg-sky-500",
    button:
      "border-sky-200 bg-white text-sky-800 hover:border-sky-300 hover:bg-sky-50",
  },
  emerald: {
    shell:
      "border-emerald-200 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.18),transparent_28%),linear-gradient(180deg,#ffffff_0%,#eefbf4_100%)]",
    badge: "bg-emerald-100 text-emerald-800",
    accent: "bg-emerald-500",
    button:
      "border-emerald-200 bg-white text-emerald-800 hover:border-emerald-300 hover:bg-emerald-50",
  },
  amber: {
    shell:
      "border-amber-200 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.2),transparent_28%),linear-gradient(180deg,#ffffff_0%,#fff7ea_100%)]",
    badge: "bg-amber-100 text-amber-900",
    accent: "bg-amber-500",
    button:
      "border-amber-200 bg-white text-amber-900 hover:border-amber-300 hover:bg-amber-50",
  },
  rose: {
    shell:
      "border-rose-200 bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.18),transparent_28%),linear-gradient(180deg,#ffffff_0%,#fff2f4_100%)]",
    badge: "bg-rose-100 text-rose-800",
    accent: "bg-rose-500",
    button:
      "border-rose-200 bg-white text-rose-800 hover:border-rose-300 hover:bg-rose-50",
  },
  slate: {
    shell:
      "border-slate-200 bg-[radial-gradient(circle_at_top_right,rgba(71,85,105,0.14),transparent_28%),linear-gradient(180deg,#ffffff_0%,#f5f7fa_100%)]",
    badge: "bg-slate-100 text-slate-700",
    accent: "bg-slate-500",
    button:
      "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50",
  },
};

const STAGE_STYLES: Record<
  string,
  { shell: string; badge: string; hover: string; tone: Tone }
> = {
  DRAFT: {
    shell:
      "border-slate-200 bg-[radial-gradient(circle_at_top_right,rgba(71,85,105,0.14),transparent_28%),linear-gradient(180deg,#ffffff_0%,#f5f7f9_100%)]",
    badge: "bg-slate-900 text-white",
    hover: "hover:border-slate-300",
    tone: "slate",
  },
  BOARD_REVIEW: {
    shell:
      "border-amber-200 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.18),transparent_28%),linear-gradient(180deg,#ffffff_0%,#fff8eb_100%)]",
    badge: "bg-amber-500 text-amber-950",
    hover: "hover:border-amber-300",
    tone: "amber",
  },
  REVISION_REQUIRED: {
    shell:
      "border-rose-200 bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.18),transparent_28%),linear-gradient(180deg,#ffffff_0%,#fff2f4_100%)]",
    badge: "bg-rose-500 text-white",
    hover: "hover:border-rose-300",
    tone: "rose",
  },
  CLIENT_REVIEW: {
    shell:
      "border-sky-200 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_28%),linear-gradient(180deg,#ffffff_0%,#eef7ff_100%)]",
    badge: "bg-sky-500 text-white",
    hover: "hover:border-sky-300",
    tone: "blue",
  },
  DISCOUNT_REVIEW: {
    shell:
      "border-amber-200 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.2),transparent_28%),linear-gradient(180deg,#ffffff_0%,#fff3df_100%)]",
    badge: "bg-amber-500 text-amber-950",
    hover: "hover:border-amber-300",
    tone: "amber",
  },
  WON: {
    shell:
      "border-emerald-200 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.18),transparent_28%),linear-gradient(180deg,#ffffff_0%,#eefbf4_100%)]",
    badge: "bg-emerald-500 text-white",
    hover: "hover:border-emerald-300",
    tone: "emerald",
  },
  LOST: {
    shell:
      "border-zinc-200 bg-[linear-gradient(180deg,#ffffff_0%,#f5f5f5_100%)]",
    badge: "bg-zinc-500 text-white",
    hover: "hover:border-zinc-300",
    tone: "slate",
  },
};

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#f04b54_0%,#da2d3b_54%,#a91c27_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_-18px_rgba(218,45,59,0.55)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_42px_-18px_rgba(218,45,59,0.6)]";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white/96 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.26)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0";
const PANEL_TOGGLE_BUTTON =
  "inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-[0_12px_24px_-22px_rgba(15,23,42,0.28)] transition hover:border-slate-300 hover:bg-slate-50";
const DASHBOARD_PANELS_STORAGE_KEY = "manitec_dashboard_home_panels";
const DEFAULT_DASHBOARD_PANELS: DashboardPanelsState = {
  priorities: true,
  actions: true,
  pipeline: true,
  board: true,
  updates: true,
  governance: true,
};

export default function DashboardPage() {
  const router = useRouter();
  const pipelineScrollRef = useRef<HTMLDivElement | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [boardPending, setBoardPending] = useState<Proposal[]>([]);
  const [myUpdates, setMyUpdates] = useState<Movement[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isBoard, setIsBoard] = useState(false);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [canCreateProposal, setCanCreateProposal] = useState(false);
  const [canCreateClient, setCanCreateClient] = useState(false);
  const [canCreateContract, setCanCreateContract] = useState(false);
  const [canViewOrders, setCanViewOrders] = useState(false);
  const [apiWarning, setApiWarning] = useState("");
  const [uiNotice, setUiNotice] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [canScrollPipelineLeft, setCanScrollPipelineLeft] = useState(false);
  const [canScrollPipelineRight, setCanScrollPipelineRight] = useState(false);
  const [panelsReady, setPanelsReady] = useState(false);
  const [panelState, setPanelState] = useState<DashboardPanelsState>(
    DEFAULT_DASHBOARD_PANELS,
  );

  const stats = useMemo(() => {
    const won = proposals.filter((proposal) => proposal.status === "WON").length;
    const lost = proposals.filter((proposal) => proposal.status === "LOST").length;
    const openOrders = orders.filter(
      (order) => order.status === "OPEN" || order.status === "IN_PROGRESS",
    ).length;
    const discountQueue = proposals.filter(
      (proposal) => proposal.status === "DISCOUNT_REVIEW",
    ).length;
    const active = proposals.filter(
      (proposal) => proposal.status !== "WON" && proposal.status !== "LOST",
    ).length;
    const conversion =
      won + lost > 0 ? ((won / (won + lost)) * 100).toFixed(1) : "0.0";

    return {
      total: proposals.length,
      won,
      lost,
      openOrders,
      discountQueue,
      active,
      conversion,
    };
  }, [orders, proposals]);

  const totalPipelineValue = useMemo(
    () =>
      proposals.reduce(
        (sum, proposal) =>
          sum + (Number.isFinite(proposal.totalValue) ? proposal.totalValue : 0),
        0,
      ),
    [proposals],
  );

  const adminStats = useMemo(
    () => ({
      total: adminUsers.length,
      active: adminUsers.filter((user) => user.isActive).length,
      inactive: adminUsers.filter((user) => !user.isActive).length,
      admins: adminUsers.filter((user) => user.role === "ADMIN").length,
      masters: adminUsers.filter((user) => user.isSystemMaster).length,
    }),
    [adminUsers],
  );

  const pipelineCounts = useMemo(
    () =>
      PIPELINE_COLUMNS.map((column) => ({
        ...column,
        total: proposals.filter((proposal) => proposal.status === column.key).length,
        items: proposals.filter((proposal) => proposal.status === column.key),
      })),
    [proposals],
  );

  const topStages = useMemo(
    () =>
      pipelineCounts
        .filter(
          (column) =>
            column.total > 0 && column.key !== "WON" && column.key !== "LOST",
        )
        .sort((a, b) => b.total - a.total)
        .slice(0, 4),
    [pipelineCounts],
  );

  const quickActions = useMemo(() => {
    const items = [
      canCreateProposal
        ? {
            href: "/dashboard/proposals/new",
            title: "Nova proposta",
            subtitle: "Abrir proposta comercial.",
            tone: "blue" as Tone,
          }
        : null,
      canViewOrders
        ? {
            href: "/dashboard/orders",
            title: "Ordens",
            subtitle: "Ver execução e fila técnica.",
            tone: "emerald" as Tone,
          }
        : null,
      canCreateClient
        ? {
            href: "/dashboard/clients/new",
            title: "Novo cliente",
            subtitle: "Cadastrar conta e contatos.",
            tone: "slate" as Tone,
          }
        : null,
      canCreateContract
        ? {
            href: "/dashboard/contracts/new",
            title: "Novo contrato",
            subtitle: "Criar contrato.",
            tone: "amber" as Tone,
          }
        : null,
    ].filter(Boolean) as Array<{
      href: string;
      title: string;
      subtitle: string;
      tone: Tone;
    }>;

    if (canManageUsers) {
      items.unshift({
        href: "/dashboard/control",
        title: "Acessos",
        subtitle: "Usuários e permissões.",
        tone: "rose" as Tone,
      });
    }

    return items.slice(0, 5);
  }, [
    canCreateClient,
    canCreateContract,
    canCreateProposal,
    canManageUsers,
    canViewOrders,
  ]);

  useEffect(() => {
    setHydrated(true);
    const token = getStoredAccessToken();
    if (!token) {
      setIsBoard(false);
      setCanManageUsers(false);
      setCanCreateProposal(false);
      setCanCreateClient(false);
      setCanCreateContract(false);
      setCanViewOrders(false);
      return;
    }

    const payload = decodeJwtPayload<{ role?: string }>(token);
    if (!payload) {
      setIsBoard(false);
      setCanManageUsers(false);
      setCanCreateProposal(false);
      setCanCreateClient(false);
      setCanCreateContract(false);
      setCanViewOrders(false);
      return;
    }

    const access = getAccessFromToken();
    setIsBoard(payload.role === "ADMIN");
    setCanManageUsers(access.users.manage);
    setCanCreateProposal(access.proposals.create);
    setCanCreateClient(access.clients.create);
    setCanCreateContract(access.contracts.create);
    setCanViewOrders(access.orders.view);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const saved = localStorage.getItem(DASHBOARD_PANELS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<DashboardPanelsState>;
        setPanelState((current) => ({ ...current, ...parsed }));
      }
    } catch {
      // ignore invalid cache
    } finally {
      setPanelsReady(true);
    }
  }, []);

  useEffect(() => {
    if (!panelsReady || typeof window === "undefined") return;
    localStorage.setItem(
      DASHBOARD_PANELS_STORAGE_KEY,
      JSON.stringify(panelState),
    );
  }, [panelState, panelsReady]);

  useEffect(() => {
    if (!hydrated) return;

    (async () => {
      setApiWarning("");
      setBoardPending([]);
      setAdminUsers([]);

      try {
        const [proposalsResult, ordersResult, updatesResult, boardResult, usersResult] =
          await Promise.allSettled([
            apiFetch("/proposals", { cache: "no-store" }),
            apiFetch("/maintenance-orders", { cache: "no-store" }),
            apiFetch("/proposals/my/updates", { cache: "no-store" }),
            isBoard
              ? apiFetch("/proposals/board/pending", {
                  cache: "no-store",
                })
              : Promise.resolve(new Response(null, { status: 204 })),
            canManageUsers
              ? apiFetch("/users", { cache: "no-store" })
              : Promise.resolve(new Response(null, { status: 204 })),
          ]);

        const responses = [
          proposalsResult,
          ordersResult,
          updatesResult,
          boardResult,
          usersResult,
        ].filter(
          (result): result is PromiseFulfilledResult<Response> =>
            result.status === "fulfilled",
        );

        if (responses.some((result) => result.value.status === 401)) {
          clearAuthSession();
          router.replace("/");
          return;
        }

        if (proposalsResult.status === "fulfilled" && proposalsResult.value.ok) {
          setProposals((await proposalsResult.value.json()) as Proposal[]);
        }
        if (ordersResult.status === "fulfilled" && ordersResult.value.ok) {
          setOrders((await ordersResult.value.json()) as Order[]);
        }
        if (updatesResult.status === "fulfilled" && updatesResult.value.ok) {
          setMyUpdates((await updatesResult.value.json()) as Movement[]);
        }
        if (isBoard && boardResult.status === "fulfilled" && boardResult.value.ok) {
          setBoardPending((await boardResult.value.json()) as Proposal[]);
        }
        if (
          canManageUsers &&
          usersResult.status === "fulfilled" &&
          usersResult.value.ok
        ) {
          setAdminUsers((await usersResult.value.json()) as AdminUser[]);
        }

        const hasNetworkFailure =
          proposalsResult.status === "rejected" ||
          ordersResult.status === "rejected" ||
          updatesResult.status === "rejected" ||
          (isBoard && boardResult.status === "rejected") ||
          (canManageUsers && usersResult.status === "rejected");

        const hasApiFailure = [
          proposalsResult,
          ordersResult,
          updatesResult,
          boardResult,
          usersResult,
        ].some(
          (result) =>
            result.status === "fulfilled" &&
            result.value.status >= 500 &&
            result.value.status !== 204,
        );

        if (hasNetworkFailure || hasApiFailure) {
          setApiWarning(
            "Não foi possível carregar todo o cockpit agora. Verifique a conexão com a API e tente novamente.",
          );
        }
      } catch {
        setApiWarning(
          "Falha ao carregar o dashboard. Verifique a conexão com a API.",
        );
      }
    })().catch(() => {
      setApiWarning("Falha ao carregar o dashboard. Verifique a conexão com a API.");
    });
  }, [hydrated, isBoard, canManageUsers, router]);

  useEffect(() => {
    const element = pipelineScrollRef.current;
    if (!element) return;

    const syncScrollState = () => {
      const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
      setCanScrollPipelineLeft(element.scrollLeft > 12);
      setCanScrollPipelineRight(
        maxScrollLeft > 12 && element.scrollLeft < maxScrollLeft - 12,
      );
    };

    syncScrollState();
    element.addEventListener("scroll", syncScrollState, { passive: true });

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncScrollState) : null;
    resizeObserver?.observe(element);
    window.addEventListener("resize", syncScrollState);

    return () => {
      element.removeEventListener("scroll", syncScrollState);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncScrollState);
    };
  }, []);

  function scrollPipeline(direction: "left" | "right") {
    const element = pipelineScrollRef.current;
    if (!element) return;

    const amount = Math.max(320, Math.round(element.clientWidth * 0.78));
    element.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  }

  async function moveProposalToStatus(proposalId: string, nextStatus: string) {
    const current = proposals.find((proposal) => proposal.id === proposalId);
    if (!current || current.status === nextStatus) return;

    const snapshot = proposals;
    setProposals((prev) =>
      prev.map((proposal) =>
        proposal.id === proposalId ? { ...proposal, status: nextStatus } : proposal,
      ),
    );

    try {
      const res = await apiFetch(`/proposals/${proposalId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          clearAuthSession();
          router.replace("/");
        }
        throw new Error("Falha ao mover proposta.");
      }
    } catch {
      setProposals(snapshot);
      setApiWarning("Não foi possível mover a proposta no dashboard.");
    } finally {
      setDraggingId(null);
      setDropTarget(null);
    }
  }

  function togglePanel(panel: DashboardPanelKey) {
    setPanelState((current) => ({ ...current, [panel]: !current[panel] }));
    setUiNotice("");
  }

  function setAllPanels(expanded: boolean) {
    setPanelState({
      priorities: expanded,
      actions: expanded,
      pipeline: expanded,
      board: expanded,
      updates: expanded,
      governance: expanded,
    });
    setUiNotice(expanded ? "Home expandida." : "Home compactada.");
  }

  const allPanelsExpanded = Object.values(panelState).every(Boolean);
  const allPanelsCollapsed = Object.values(panelState).every((value) => !value);

  return (
    <div className="space-y-6 pb-10">
      {apiWarning ? <StatusBanner tone="amber">{apiWarning}</StatusBanner> : null}
      {uiNotice ? <StatusBanner tone="emerald">{uiNotice}</StatusBanner> : null}

      <PageHero
        compact
        eyebrow="Dashboard"
        title="Resumo comercial e operacional."
        description="Visão rápida do que exige decisão agora."
        stats={[
          {
            label: "Propostas",
            value: String(stats.total),
            helper: "carteira",
            tone: "slate",
          },
          {
            label: "Ativas",
            value: String(stats.active),
            helper: "em andamento",
            tone: "blue",
          },
          {
            label: "Pipeline",
            value: formatCurrency(totalPipelineValue),
            helper: "valor total",
            tone: "emerald",
          },
          {
            label: "Conversão",
            value: `${stats.conversion}%`,
            helper: `${stats.won} ganhas`,
            tone: "amber",
          },
        ]}
        actions={
          <>
            {canCreateProposal ? (
              <Link href="/dashboard/proposals/new" className={PRIMARY_BUTTON}>
                Nova proposta
              </Link>
            ) : null}
            {canViewOrders ? (
              <Link href="/dashboard/orders" className={SECONDARY_BUTTON}>
                Ver ordens
              </Link>
            ) : null}
            {canManageUsers ? (
              <Link href="/dashboard/control" className={SECONDARY_BUTTON}>
                Abrir acessos
              </Link>
            ) : null}
            {!canCreateProposal && !canViewOrders && !canManageUsers ? (
              <span className="inline-flex items-center rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm font-semibold text-slate-600">
                Atalhos limitados pelo seu perfil
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setAllPanels(false)}
              disabled={allPanelsCollapsed}
              className={SECONDARY_BUTTON}
            >
              {allPanelsCollapsed ? "Home compacta" : "Compactar seções"}
            </button>
            <button
              type="button"
              onClick={() => setAllPanels(true)}
              disabled={allPanelsExpanded}
              className={SECONDARY_BUTTON}
            >
              {allPanelsExpanded ? "Home expandida" : "Expandir seções"}
            </button>
          </>
        }
        aside={
          <DailySnapshotPanel
            isBoard={isBoard}
            stats={stats}
            boardPending={boardPending.length}
            updates={myUpdates.length}
            openOrders={stats.openOrders}
          />
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(330px,0.95fr)]">
        <DashboardSection
          panelKey="priorities"
          expanded={panelState.priorities}
          onToggle={togglePanel}
          eyebrow="Hoje"
          title="Prioridades"
          description="Fila do dia."
          summary={`Ativas ${stats.active}  |  Desconto ${stats.discountQueue}  |  O.S. ${stats.openOrders}`}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
            <div className="grid gap-3 sm:grid-cols-2">
              <PriorityCard
                title="Ativas"
                value={String(stats.active)}
                subtitle="pipeline"
                tone="blue"
              />
              <PriorityCard
                title="Desconto"
                value={String(stats.discountQueue)}
                subtitle="pendentes"
                tone="amber"
              />
              <PriorityCard
                title={isBoard ? "Board" : "Atualizacoes"}
                value={String(isBoard ? boardPending.length : myUpdates.length)}
                subtitle={
                  isBoard
                    ? "aguardando decisao"
                    : "novos registros"
                }
                tone={isBoard ? "rose" : "slate"}
              />
              <PriorityCard
                title="Ordens"
                value={String(stats.openOrders)}
                subtitle="em andamento"
                tone="emerald"
              />
            </div>

            <FieldBox className="space-y-4 bg-white/90">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Pipeline
                </p>
                <h3 className="mt-2 text-lg font-bold text-slate-950">
                  Etapas com maior volume
                </h3>
              </div>

              {topStages.length === 0 ? (
                <EmptyState
                  title="Sem etapas ativas"
                  description="O resumo aparece quando houver propostas em andamento."
                />
              ) : (
                <div className="space-y-3">
                  {topStages.map((stage) => (
                    <div
                      key={stage.key}
                      className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {stage.label}
                          </p>
                          <p className="text-xs text-slate-500">
                            {stage.total} proposta(s)
                          </p>
                        </div>
                        <DataPill tone={STAGE_STYLES[stage.key].tone}>
                          {stage.total}
                        </DataPill>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </FieldBox>
          </div>
        </DashboardSection>

        <DashboardSection
          panelKey="actions"
          expanded={panelState.actions}
          onToggle={togglePanel}
          eyebrow="Atalhos"
          title="Acoes rapidas"
          description="Entradas principais."
          summary={`${quickActions.length} atalhos`}
        >
          <div className="grid gap-3">
            {quickActions.map((action) => (
              <QuickActionCard key={action.href} {...action} />
            ))}
          </div>
        </DashboardSection>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.62fr)_380px]">
        <DashboardSection
          panelKey="pipeline"
          expanded={panelState.pipeline}
          onToggle={togglePanel}
          eyebrow="Pipeline"
          title="Propostas por etapa"
          description="Lista e arraste."
          summary={`${stats.total} propostas  |  ${topStages[0]?.label || "Sem fila"}`}
          actions={
            <div className="flex flex-wrap gap-2">
              {pipelineCounts
                .filter((column) => column.total > 0)
                .slice(0, 4)
                .map((column) => (
                  <DataPill key={column.key} tone={STAGE_STYLES[column.key].tone}>
                    {column.label}: {column.total}
                  </DataPill>
                ))}
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm leading-6 text-slate-600">
                Arraste entre etapas ou role lateralmente.
              </p>
              <div className="flex items-center gap-2">
                {canScrollPipelineLeft ? (
                  <PipelineScrollButton
                    direction="left"
                    label="Ver etapas anteriores"
                    onClick={() => scrollPipeline("left")}
                  />
                ) : null}
                {canScrollPipelineRight ? (
                  <PipelineScrollButton
                    direction="right"
                    label="Ver proximas etapas"
                    onClick={() => scrollPipeline("right")}
                  />
                ) : null}
              </div>
            </div>

            <div className="relative">
              <div
                className={`pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-16 bg-gradient-to-r from-[#edf1f4] via-[#edf1f4]/88 to-transparent transition duration-200 sm:block ${
                  canScrollPipelineLeft ? "opacity-100" : "opacity-0"
                }`}
              />
              <div
                className={`pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-16 bg-gradient-to-l from-[#edf1f4] via-[#edf1f4]/88 to-transparent transition duration-200 sm:block ${
                  canScrollPipelineRight ? "opacity-100" : "opacity-0"
                }`}
              />

              <div
                ref={pipelineScrollRef}
                className="scrollbar-hide flex snap-x snap-proximity gap-4 overflow-x-auto scroll-smooth px-1 pb-2"
              >
                {pipelineCounts.map((column) => (
                  <PipelineColumnCard
                    key={column.key}
                    column={column}
                    draggingId={draggingId}
                    dropTarget={dropTarget}
                    onDragStart={(proposalId) => setDraggingId(proposalId)}
                    onDragTargetChange={setDropTarget}
                    onMove={moveProposalToStatus}
                  />
                ))}
              </div>
            </div>
          </div>
        </DashboardSection>

        <div className="space-y-6">
          {isBoard ? (
            <BoardPendingCard
              boardPending={boardPending}
              collapsed={!panelState.board}
              onToggle={() => togglePanel("board")}
            />
          ) : null}
          <UpdatesFeedCard
            updates={myUpdates}
            collapsed={!panelState.updates}
            onToggle={() => togglePanel("updates")}
          />
          {canManageUsers ? (
            <GovernanceSnapshotCard
              adminStats={adminStats}
              adminUsers={adminUsers}
              collapsed={!panelState.governance}
              onToggle={() => togglePanel("governance")}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DailySnapshotPanel({
  isBoard,
  stats,
  boardPending,
  updates,
  openOrders,
}: {
  isBoard: boolean;
  stats: {
    total: number;
    won: number;
    lost: number;
    openOrders: number;
    discountQueue: number;
    active: number;
    conversion: string;
  };
  boardPending: number;
  updates: number;
  openOrders: number;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-200">
        Resumo
      </p>
      <div className="mt-4 space-y-3">
        <SnapshotLine
          label="Desconto"
          value={String(stats.discountQueue)}
          helper="pendentes"
          tone="amber"
        />
        <SnapshotLine
          label={isBoard ? "Board" : "Feed"}
          value={String(isBoard ? boardPending : updates)}
          helper={isBoard ? "aguardando decisao" : "novidades"}
          tone={isBoard ? "rose" : "slate"}
        />
        <SnapshotLine
          label="Ordens"
          value={String(openOrders)}
          helper="abertas"
          tone="emerald"
        />
        <SnapshotLine
          label="Win rate"
          value={`${stats.conversion}%`}
          helper={`${stats.won} ganhas`}
          tone="blue"
        />
      </div>
    </div>
  );
}

function SnapshotLine({
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
    <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-200">
          {label}
        </p>
        <DataPill tone={tone}>{value}</DataPill>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-200">{helper}</p>
    </div>
  );
}

function PriorityCard({
  title,
  value,
  subtitle,
  tone,
}: {
  title: string;
  value: string;
  subtitle: string;
  tone: Tone;
}) {
  const style = ACTION_TONES[tone];

  return (
    <article
      className={`relative overflow-hidden rounded-[24px] border px-4 py-4 shadow-[0_22px_42px_-34px_rgba(15,23,42,0.3)] ${style.shell}`}
    >
      <div className={`absolute inset-x-0 top-0 h-1.5 ${style.accent}`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
            {title}
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
        </div>
        <span className={`mt-1 h-3 w-3 rounded-full ${style.accent}`} />
      </div>
      <p className="mt-3 text-sm text-slate-600">{subtitle}</p>
    </article>
  );
}

function QuickActionCard({
  href,
  title,
  subtitle,
  tone,
}: {
  href: string;
  title: string;
  subtitle: string;
  tone: Tone;
}) {
  const style = ACTION_TONES[tone];

  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-[24px] border px-4 py-4 shadow-[0_18px_40px_-34px_rgba(15,31,50,0.28)] transition hover:-translate-y-1 ${style.shell}`}
    >
      <div className={`absolute inset-y-0 left-0 w-1.5 ${style.accent}`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-950">{title}</p>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>
        <span className={`mt-1 h-3 w-3 rounded-full ${style.accent} shadow-[0_0_0_6px_rgba(255,255,255,0.45)]`} />
      </div>
      <span
        className={`mt-4 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${style.badge}`}
      >
        Abrir
      </span>
    </Link>
  );
}

function PipelineColumnCard({
  column,
  draggingId,
  dropTarget,
  onDragStart,
  onDragTargetChange,
  onMove,
}: {
  column: StageColumn & { total: number; items: Proposal[] };
  draggingId: string | null;
  dropTarget: string | null;
  onDragStart: (proposalId: string) => void;
  onDragTargetChange: Dispatch<SetStateAction<string | null>>;
  onMove: (proposalId: string, nextStatus: string) => Promise<void>;
}) {
  const style = STAGE_STYLES[column.key] ?? STAGE_STYLES.DRAFT;

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        onDragTargetChange(column.key);
      }}
      onDragLeave={() =>
        onDragTargetChange((current) => (current === column.key ? null : current))
      }
      onDrop={(event) => {
        event.preventDefault();
        const proposalId = event.dataTransfer.getData("text/proposal-id") || draggingId;
        if (proposalId) void onMove(proposalId, column.key);
      }}
      className={`flex h-[520px] min-w-[292px] snap-start flex-col rounded-[24px] border p-4 transition md:h-[560px] ${
        style.shell
      } ${dropTarget === column.key ? "ring-2 ring-sky-300" : ""}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900">{column.label}</p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            {column.total} item(ns)
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${style.badge}`}
        >
          {column.total}
        </span>
      </div>

      <div className="space-y-3 overflow-y-auto pr-1">
        {column.items.map((item) => (
          <article
            key={item.id}
            draggable
            onDragStart={(event) => {
              onDragStart(item.id);
              event.dataTransfer.setData("text/proposal-id", item.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            className={`rounded-2xl border border-white/80 bg-white/96 p-3.5 text-sm shadow-[0_14px_28px_-24px_rgba(15,23,42,0.22)] transition hover:-translate-y-0.5 ${style.hover}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-950">{item.code}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                  {item.client?.companyName || "Sem cliente vinculado"}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Drag
              </span>
            </div>

            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Valor
                </p>
                <p className="mt-1 text-base font-bold text-slate-950">
                  {formatCurrency(item.totalValue || 0)}
                </p>
              </div>
              <Link
                href={`/dashboard/proposals/${item.id}`}
                draggable={false}
                className="inline-flex rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Abrir
              </Link>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Responsável: {item.user?.name || "Não informado"}
            </p>
          </article>
        ))}

        {column.total === 0 ? (
          <EmptyState
            title="Etapa vazia"
            description="Nenhuma proposta nesta etapa no momento."
          />
        ) : null}
      </div>
    </div>
  );
}

function BoardPendingCard({
  boardPending,
  collapsed,
  onToggle,
}: {
  boardPending: Proposal[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <SectionCard
      eyebrow="Board"
      title="Pendencias"
      description="Itens aguardando aprovação."
      actions={<PanelToggleButton collapsed={collapsed} onClick={onToggle} />}
    >
      {collapsed ? (
        <CollapsedSectionSummary summary={`${boardPending.length} em fila`} />
      ) : (
        <div className="space-y-3">
          {boardPending.length === 0 ? (
            <EmptyState
              title="Fila limpa"
              description="Nenhuma proposta aguardando diretoria."
            />
          ) : (
            boardPending.slice(0, 6).map((proposal) => (
              <Link
                key={proposal.id}
                href={`/dashboard/proposals/${proposal.id}`}
                className="block rounded-2xl border border-stone-200 bg-[linear-gradient(180deg,#fffdf9_0%,#ffffff_100%)] p-4 transition hover:-translate-y-0.5 hover:border-stone-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-950">
                      {proposal.code}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {proposal.client?.companyName || "Sem cliente"} |{" "}
                      {statusLabel(proposal.status)}
                    </p>
                  </div>
                  <DataPill tone="amber">Board</DataPill>
                </div>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Valor
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {formatCurrency(proposal.totalValue || 0)}
                </p>
              </Link>
            ))
          )}
        </div>
      )}
    </SectionCard>
  );
}

function UpdatesFeedCard({
  updates,
  collapsed,
  onToggle,
}: {
  updates: Movement[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <SectionCard
      eyebrow="Feed"
      title="Atualizacoes"
      description="Movimentos recentes."
      actions={<PanelToggleButton collapsed={collapsed} onClick={onToggle} />}
    >
      {collapsed ? (
        <CollapsedSectionSummary summary={`${updates.length} atualização(ões)`} />
      ) : (
        <div className="space-y-3">
          {updates.length === 0 ? (
            <EmptyState
              title="Sem atualizacoes"
              description="Nenhum movimento recente."
            />
          ) : (
            updates.slice(0, 8).map((update) => (
              <Link
                key={update.id}
                href={`/dashboard/proposals/${update.proposal.id}`}
                className="block rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f7f9fb_100%)] p-4 transition hover:-translate-y-0.5 hover:border-slate-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-950">
                      {update.proposal.code}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {statusLabel(update.proposal.status)}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
                    {update.actorUser?.name || "Sistema"}
                  </span>
                </div>
                {update.note ? (
                  <p className="mt-3 text-sm leading-6 text-slate-700">{update.note}</p>
                ) : null}
                <p className="mt-3 text-xs text-slate-500">
                  {new Date(update.createdAt).toLocaleString("pt-BR")}
                </p>
              </Link>
            ))
          )}
        </div>
      )}
    </SectionCard>
  );
}

function GovernanceSnapshotCard({
  adminStats,
  adminUsers,
  collapsed,
  onToggle,
}: {
  adminStats: {
    total: number;
    active: number;
    inactive: number;
    admins: number;
    masters: number;
  };
  adminUsers: AdminUser[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <SectionCard
      eyebrow="Governanca"
      title="Usuarios e acessos"
      description="Resumo administrativo."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/control" className={SECONDARY_BUTTON}>
            Abrir painel
          </Link>
          <PanelToggleButton collapsed={collapsed} onClick={onToggle} />
        </div>
      }
    >
      {collapsed ? (
        <CollapsedSectionSummary
          summary={`Ativos ${adminStats.active}  |  Admins ${adminStats.admins}`}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <SnapshotLine
              label="Ativos"
              value={String(adminStats.active)}
              helper="disponiveis"
              tone="emerald"
            />
            <SnapshotLine
              label="Inativos"
              value={String(adminStats.inactive)}
              helper="bloqueados"
              tone="amber"
            />
            <SnapshotLine
              label="Admins"
              value={String(adminStats.admins)}
              helper="com gestao"
              tone="blue"
            />
            <SnapshotLine
              label="Masters"
              value={String(adminStats.masters)}
              helper="protegidos"
              tone="slate"
            />
          </div>

          <div className="mt-4 space-y-3">
            {adminUsers.length === 0 ? (
              <EmptyState
                title="Nenhum usuario"
                description="Os perfis aparecem aqui quando a base carregar."
              />
            ) : (
              adminUsers.slice(0, 4).map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {user.name}
                    </p>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                  </div>
                  <span
                    className={`ml-3 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      user.isActive
                        ? "bg-stone-100 text-stone-700"
                        : "bg-zinc-200 text-zinc-600"
                    }`}
                  >
                    {user.isActive ? user.role : "INATIVO"}
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </SectionCard>
  );
}

function DashboardSection({
  panelKey,
  expanded,
  onToggle,
  summary,
  actions,
  eyebrow,
  title,
  description,
  children,
}: {
  panelKey: DashboardPanelKey;
  expanded: boolean;
  onToggle: (panel: DashboardPanelKey) => void;
  summary: string;
  actions?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <SectionCard
      eyebrow={eyebrow}
      title={title}
      description={description}
      actions={
        <div className="flex flex-wrap gap-2">
          {actions}
          <PanelToggleButton
            collapsed={!expanded}
            onClick={() => onToggle(panelKey)}
          />
        </div>
      }
    >
      {expanded ? children : <CollapsedSectionSummary summary={summary} />}
    </SectionCard>
  );
}

function PanelToggleButton({
  collapsed,
  onClick,
}: {
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={PANEL_TOGGLE_BUTTON}>
      <span>{collapsed ? "Expandir" : "Recolher"}</span>
      <span
        className={`transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
      >
        v
      </span>
    </button>
  );
}

function CollapsedSectionSummary({ summary }: { summary: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
      {summary}
    </div>
  );
}

function PipelineScrollButton({
  direction,
  label,
  onClick,
}: {
  direction: "left" | "right";
  label: string;
  onClick: () => void;
}) {
  const isLeft = direction === "left";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white/96 text-slate-700 shadow-[0_18px_38px_-22px_rgba(15,31,50,0.28)] backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-4 w-4 transition-transform duration-200 ${
          isLeft ? "group-hover:-translate-x-0.5" : "group-hover:translate-x-0.5"
        }`}
        aria-hidden="true"
      >
        <path d={isLeft ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
      </svg>
    </button>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    DRAFT: "Rascunho",
    BOARD_REVIEW: "Análise diretoria",
    REVISION_REQUIRED: "Em revisão",
    CLIENT_REVIEW: "Análise cliente",
    DISCOUNT_REVIEW: "Análise desconto",
    WON: "Ganho",
    LOST: "Perdido",
  };

  return map[status] || status;
}
