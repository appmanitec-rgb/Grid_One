"use client";

import Image from "next/image";
import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { canAccessDashboardPath } from "@/lib/access";
import { apiFetch } from "@/lib/api";
import { decodeJwtPayload, getStoredAccessToken } from "@/lib/auth-session";

export type SidebarAccess = {
  dashboard: boolean;
  proposals: boolean;
  orders: boolean;
  contracts: boolean;
  catalog: boolean;
  clients: boolean;
  equipments: boolean;
  finance: boolean;
  inventory: boolean;
  people: boolean;
  usersControl: boolean;
  studio: boolean;
  tickets: boolean;
  serviceReports: boolean;
  technicianPortal: boolean;
};

type SidebarNavigationProps = {
  pathname: string;
  access: SidebarAccess;
  onLogout: () => void;
};

type NavItem = {
  key: string;
  label: string;
  href?: string;
  enabled?: boolean;
  soon?: boolean;
  badgeKey?:
    | "proposalsQueue"
    | "ordersOpen"
    | "contractsAttention"
    | "teamUnread";
};

type NavSection = {
  id: string;
  title: string;
  icon:
    | "overview"
    | "crm"
    | "ops"
    | "assets"
    | "stock"
    | "finance"
    | "people"
    | "hr"
    | "studio";
  items: NavItem[];
};

type SidebarCounters = {
  proposalsQueue: number;
  ordersOpen: number;
  contractsAttention: number;
  teamUnread: number;
};

export const MAIN_SECTIONS: NavSection[] = [
  {
    id: "overview",
    title: "Painel",
    icon: "overview",
    items: [
      {
        key: "overview_dash",
        label: "Dashboard",
        href: "/dashboard",
        enabled: true,
      },
      {
        key: "overview_team",
        label: "Equipe · Feed e chat",
        href: "/dashboard/team",
        enabled: true,
        badgeKey: "teamUnread",
      },
      {
        key: "overview_documents",
        label: "Documentos",
        href: "/dashboard/documents",
        enabled: true,
      },
      {
        key: "overview_deliveries",
        label: "Envios",
        href: "/dashboard/deliveries",
        enabled: true,
      },
      {
        key: "overview_alerts",
        label: "Alertas",
        href: "/dashboard/notifications",
        enabled: true,
      },
      {
        key: "overview_reports",
        label: "Relatórios",
        href: "/dashboard/reports",
        enabled: true,
      },
      {
        key: "overview_management",
        label: "Gestão",
        href: "/dashboard/management/users",
        enabled: true,
      },
      {
        key: "overview_automation",
        label: "Automação",
        href: "/dashboard/automation",
        enabled: true,
      },
      {
        key: "overview_company",
        label: "Empresa",
        href: "/dashboard/company-settings",
        enabled: true,
      },
    ],
  },
  {
    id: "crm",
    title: "Comercial",
    icon: "crm",
    items: [
      {
        key: "crm_funnel",
        label: "Oportunidades",
        href: "/dashboard/opportunities",
        enabled: true,
      },
      {
        key: "crm_clients",
        label: "Clientes",
        href: "/dashboard/clients",
        enabled: true,
      },
      {
        key: "crm_surveys",
        label: "Vistorias Comerciais",
        href: "/dashboard/commercial-inspections",
        enabled: true,
      },
      {
        key: "crm_proposals",
        label: "Propostas",
        href: "/dashboard/proposals",
        enabled: true,
        badgeKey: "proposalsQueue",
      },
      {
        key: "crm_contracts",
        label: "Contratos",
        href: "/dashboard/contracts",
        enabled: true,
        badgeKey: "contractsAttention",
      },
      {
        key: "crm_contract_renewals",
        label: "Renovações",
        href: "/dashboard/contracts/renewals",
        enabled: true,
        badgeKey: "contractsAttention",
      },
    ],
  },
  {
    id: "ops",
    title: "Operação",
    icon: "ops",
    items: [
      {
        key: "ops_orders",
        label: "Ordens",
        href: "/dashboard/orders",
        enabled: true,
        badgeKey: "ordersOpen",
      },
      {
        key: "ops_downtimes",
        label: "Máquinas paradas",
        href: "/dashboard/operation/downtimes",
        enabled: true,
      },
      {
        key: "ops_warranties",
        label: "Garantias",
        href: "/dashboard/operation/warranties",
        enabled: true,
      },
      {
        key: "ops_field",
        label: "Campo",
        href: "/dashboard/tecnico",
        enabled: true,
      },
      {
        key: "ops_tickets",
        label: "Atendimento",
        href: "/dashboard/atendimento",
        enabled: true,
      },
      {
        key: "ops_service_reports",
        label: "Laudos",
        href: "/dashboard/relatorios-tecnicos",
        enabled: true,
      },
      {
        key: "ops_dispatch",
        label: "Programação",
        href: "/dashboard/dispatch",
        enabled: true,
      },
      {
        key: "ops_team",
        label: "Técnicos",
        href: "/dashboard/technicians",
        enabled: true,
      },
      {
        key: "ops_auvo",
        label: "Monitoramento",
        href: "/dashboard/monitoring",
        enabled: true,
      },
    ],
  },
  {
    id: "assets",
    title: "Ativos",
    icon: "assets",
    items: [
      {
        key: "assets_generators",
        label: "Equipamentos",
        href: "/dashboard/equipments",
        enabled: true,
      },
      {
        key: "assets_models",
        label: "Modelos",
        href: "/dashboard/equipments/models",
        enabled: true,
      },
      {
        key: "assets_sites",
        label: "Locais",
        href: "/dashboard/sites",
        enabled: true,
      },
    ],
  },
  {
    id: "stock",
    title: "Suprimentos",
    icon: "stock",
    items: [
      {
        key: "stock_catalog",
        label: "Catálogo",
        href: "/dashboard/catalog",
        enabled: true,
      },
      {
        key: "stock_inventory",
        label: "Estoque",
        href: "/dashboard/inventory",
        enabled: true,
      },
      {
        key: "stock_sales_orders",
        label: "Pedidos de venda",
        href: "/dashboard/sales-orders",
        enabled: true,
      },
      {
        key: "purchaseRequests",
        label: "Solicitações de compra",
        href: "/dashboard/purchase-orders/requests",
        enabled: true,
      },
      {
        key: "purchaseQuotations",
        label: "Cotações e comparativo",
        href: "/dashboard/purchase-orders/quotations",
        enabled: true,
      },
      {
        key: "purchasingApprovals",
        label: "Aprovações de compras",
        href: "/dashboard/purchase-orders/approvals",
        enabled: true,
      },
      {
        key: "purchasingSettings",
        label: "Regras de compras",
        href: "/dashboard/purchase-orders/settings",
        enabled: true,
      },
      {
        key: "stock_purchase",
        label: "Compras",
        href: "/dashboard/purchase-orders",
        enabled: true,
      },
      {
        key: "stock_suppliers",
        label: "Fornecedores",
        href: "/dashboard/suppliers",
        enabled: true,
      },
    ],
  },
  {
    id: "finance",
    title: "Financeiro",
    icon: "finance",
    items: [
      {
        key: "finance_receivable",
        label: "Contas a Receber",
        href: "/dashboard/finance/accounts-receivable",
        enabled: true,
      },
      {
        key: "finance_collections",
        label: "Cobrança Santander",
        href: "/dashboard/finance/collections",
        enabled: true,
      },
      {
        key: "finance_fiscal_documents",
        label: "Notas Fiscais",
        href: "/dashboard/finance/fiscal-documents",
        enabled: true,
      },
      {
        key: "finance_payable",
        label: "Contas a Pagar",
        href: "/dashboard/finance/accounts-payable",
        enabled: true,
      },
      {
        key: "finance_cashflow",
        label: "Fluxo de Caixa",
        href: "/dashboard/finance/cash-flow",
        enabled: true,
      },
      {
        key: "finance_statement",
        label: "Extrato Financeiro",
        href: "/dashboard/finance/bank-movements",
        enabled: true,
      },
      {
        key: "finance_reconciliation",
        label: "Conciliação Bancária",
        href: "/dashboard/finance/reconciliation",
        enabled: true,
      },
      {
        key: "finance_banks",
        label: "Contas Bancárias & Caixas",
        href: "/dashboard/finance/bank-accounts",
        enabled: true,
      },
      {
        key: "finance_dre",
        label: "Centros de Custo (DRE)",
        href: "/dashboard/finance/cost-centers",
        enabled: true,
      },
    ],
  },
  {
    id: "hr",
    title: "Recursos Humanos",
    icon: "hr",
    items: [
      {
        key: "hr_collaborators",
        label: "Colaboradores e acessos",
        href: "/dashboard/hr/collaborators",
        enabled: true,
      },
      {
        key: "hr_documentation",
        label: "Documentação",
        href: "/dashboard/hr/documentation",
        enabled: true,
      },
      {
        key: "hr_epi_tools",
        label: "EPIs e Ferramentas",
        href: "/dashboard/hr/epis-tools",
        enabled: true,
      },
      {
        key: "hr_timesheet",
        label: "Banco de Horas",
        href: "/dashboard/hr/time-tracking",
        enabled: true,
      },
      {
        key: "hr_commissions",
        label: "Comissões",
        href: "/dashboard/hr/commissions",
        enabled: true,
      },
      {
        key: "hr_fleet",
        label: "Frota",
        href: "/dashboard/hr/fleet",
        enabled: true,
      },
    ],
  },
  {
    id: "studio",
    title: "Manitec Studio",
    icon: "studio",
    items: [
      {
        key: "studio_data",
        label: "Dados",
        href: "/dashboard/developer/data",
        enabled: true,
      },
      {
        key: "studio_document_editor",
        label: "Editor de documentos",
        href: "/dashboard/developer/document-editor",
        enabled: true,
      },
      {
        key: "studio_history",
        label: "Historico",
        href: "/dashboard/developer/history",
        enabled: true,
      },
      {
        key: "studio_utilization",
        label: "Utilizacao",
        href: "/dashboard/developer/utilization",
        enabled: true,
      },
    ],
  },
];

const CLIENT_SECTIONS: NavSection[] = [
  {
    id: "client_portal",
    title: "Portal",
    icon: "overview",
    items: [
      {
        key: "client_home",
        label: "Visão geral",
        href: "/dashboard/client-portal",
        enabled: true,
      },
      {
        key: "client_documents",
        label: "Documentos",
        href: "/dashboard/documents",
        enabled: true,
      },
      {
        key: "client_deliveries",
        label: "Envios",
        href: "/dashboard/deliveries",
        enabled: true,
      },
      {
        key: "client_alerts",
        label: "Alertas",
        href: "/dashboard/notifications",
        enabled: true,
      },
      {
        key: "client_proposals",
        label: "Minhas propostas",
        href: "/dashboard/proposals",
        enabled: true,
        badgeKey: "proposalsQueue",
      },
    ],
  },
];

const ADMIN_ITEMS: NavItem[] = [
  {
    key: "admin_profile",
    label: "Meu Perfil",
    href: "/dashboard/profile",
    enabled: true,
  },
];

export default function SidebarNavigation({
  pathname,
  access,
  onLogout,
}: SidebarNavigationProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [hasKeyboardFocus, setHasKeyboardFocus] = useState(false);
  const [isTouchNavigation, setIsTouchNavigation] = useState(false);
  const [sectionChoice, setSectionChoice] = useState<{
    pathname: string;
    id: string | null;
  } | null>(null);
  const collapsed = !(isHovered || hasKeyboardFocus || isTouchNavigation);
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);
  const [userRole, setUserRole] = useState("NORMAL");
  const [counters, setCounters] = useState<SidebarCounters>({
    proposalsQueue: 0,
    ordersOpen: 0,
    contractsAttention: 0,
    teamUnread: 0,
  });

  const filteredSections = useMemo(
    () =>
      (userRole === "CLIENT" ? CLIENT_SECTIONS : MAIN_SECTIONS)
        .map((section) => {
          const dynamicTitle =
            section.id === "overview" && access.usersControl
              ? "Painel & Acesso"
              : section.title;

          return {
            ...section,
            title: dynamicTitle,
            items: section.items.filter((item) =>
              isItemAllowed(item.href, access),
            ),
          };
        })
        .filter((section) => section.items.length > 0),
    [access, userRole],
  );

  const allAllowedItems = useMemo(
    () => [
      ...filteredSections.flatMap((section) => section.items),
      ...ADMIN_ITEMS.filter((item) => isItemAllowed(item.href, access)),
    ],
    [filteredSections, access],
  );

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) return;
    const payload = decodeJwtPayload<{ role?: string }>(token);
    setUserRole(payload?.role || "NORMAL");
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(hover: none), (pointer: coarse)");
    const update = () => setIsTouchNavigation(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("manitec_sidebar_favorites");
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        setFavoriteKeys(parsed.filter((key) => typeof key === "string"));
      }
    } catch {
      // ignore invalid cache
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "manitec_sidebar_favorites",
      JSON.stringify(favoriteKeys),
    );
  }, [favoriteKeys]);

  useEffect(() => {
    let mounted = true;

    async function loadCounters() {
      const token = localStorage.getItem("manitec_token");
      if (!token) return;

      try {
        const [proposalsRes, ordersRes, contractsRes, teamRes] =
          await Promise.allSettled([
            apiFetch("/proposals", { cache: "no-store" }),
            userRole === "CLIENT"
              ? Promise.resolve(new Response("[]", { status: 204 }))
              : apiFetch("/maintenance-orders", { cache: "no-store" }),
            userRole === "CLIENT"
              ? Promise.resolve(new Response("[]", { status: 204 }))
              : apiFetch("/contracts", { cache: "no-store" }),
            userRole === "CLIENT"
              ? Promise.resolve(new Response("[]", { status: 204 }))
              : apiFetch("/team/channels", { cache: "no-store" }),
          ]);

        const next: SidebarCounters = {
          proposalsQueue: 0,
          ordersOpen: 0,
          contractsAttention: 0,
          teamUnread: 0,
        };

        if (proposalsRes.status === "fulfilled" && proposalsRes.value.ok) {
          const proposals = await proposalsRes.value.json();
          next.proposalsQueue = (proposals || []).filter((p: any) =>
            userRole === "CLIENT"
              ? p.status === "CLIENT_REVIEW" || p.status === "REVISION_REQUIRED"
              : p.status === "BOARD_REVIEW" || p.status === "DISCOUNT_REVIEW",
          ).length;
        }

        if (ordersRes.status === "fulfilled" && ordersRes.value.ok) {
          const orders = await ordersRes.value.json();
          next.ordersOpen = (orders || []).filter(
            (o: any) => o.status === "OPEN" || o.status === "IN_PROGRESS",
          ).length;
        }

        if (contractsRes.status === "fulfilled" && contractsRes.value.ok) {
          const contracts = await contractsRes.value.json();
          next.contractsAttention = (contracts || []).filter(
            (c: any) => c.status === "SUSPENDED" || c.status === "RENEWAL",
          ).length;
        }

        if (teamRes.status === "fulfilled" && teamRes.value.ok) {
          const channels = (await teamRes.value.json()) as Array<{
            unreadCount?: number;
          }>;
          next.teamUnread = channels.reduce(
            (sum, channel) =>
              sum + Math.max(0, Number(channel.unreadCount) || 0),
            0,
          );
        }

        if (mounted) setCounters(next);
      } catch {
        // keep defaults
      }
    }

    void loadCounters();
    const interval = setInterval(() => {
      void loadCounters();
    }, 60000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [userRole]);

  const favoriteItems = useMemo(() => {
    const map = new Map(allAllowedItems.map((item) => [item.key, item]));
    return favoriteKeys.map((key) => map.get(key)).filter(Boolean) as NavItem[];
  }, [favoriteKeys, allAllowedItems]);

  const activeSectionId =
    filteredSections.find((section) =>
      section.items.some((item) => isItemActive(pathname, item.href)),
    )?.id || null;
  const openSectionId =
    sectionChoice?.pathname === pathname ? sectionChoice.id : activeSectionId;

  const toggleSection = useCallback(
    (sectionId: string) => {
      setSectionChoice({
        pathname,
        id: openSectionId === sectionId ? null : sectionId,
      });
    },
    [pathname, openSectionId],
  );

  const selectRailSection = useCallback(
    (sectionId: string) => {
      setIsHovered(true);
      setSectionChoice({ pathname, id: sectionId });
    },
    [pathname],
  );

  const toggleFavorite = useCallback((itemKey: string) => {
    setFavoriteKeys((prev) => {
      if (prev.includes(itemKey)) return prev.filter((key) => key !== itemKey);
      return [...prev, itemKey].slice(0, 6);
    });
  }, []);

  return (
    <aside
      aria-label="Navegação principal"
      data-expanded={!collapsed}
      data-touch={isTouchNavigation}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={(event) => {
        if (event.target.matches(":focus-visible")) setHasKeyboardFocus(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setHasKeyboardFocus(false);
      }}
      onPointerDownCapture={(event) => {
        if (event.pointerType === "mouse") setHasKeyboardFocus(false);
      }}
      className="dashboard-sidebar relative z-30 hidden shrink-0 flex-col border-r border-white/10 md:flex"
    >
      <div className="dashboard-sidebar-brand flex shrink-0 items-center justify-center border-b border-white/10 px-3">
        <Link
          href="/dashboard"
          aria-label="Manitec — página inicial"
          className="flex h-11 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white px-2 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          <Image
            src="/brand/manitec-logo-transparent.png"
            alt="Manitec"
            width={160}
            height={44}
            loading="eager"
            className="h-auto w-10 object-contain"
          />
        </Link>
      </div>
      <div
        aria-hidden={!collapsed}
        inert={!collapsed}
        className="dashboard-sidebar-rail flex min-h-0 flex-1 flex-col"
      >
        <SidebarRail
          sections={filteredSections}
          pathname={pathname}
          counters={counters}
          access={access}
          onSelect={selectRailSection}
          onLogout={onLogout}
        />
      </div>
      <div
        className="dashboard-sidebar-drawer"
        aria-hidden={collapsed}
        inert={collapsed}
      >
        <SidebarPanel
          sections={filteredSections}
          favoriteItems={favoriteItems}
          favoriteKeys={favoriteKeys}
          pathname={pathname}
          openSectionId={openSectionId}
          counters={counters}
          access={access}
          onToggleSection={toggleSection}
          onToggleFavorite={toggleFavorite}
          onLogout={onLogout}
        />
      </div>
    </aside>
  );
}

type SidebarMenuProps = {
  sections: NavSection[];
  pathname: string;
  counters: SidebarCounters;
  access: SidebarAccess;
  onLogout: () => void;
};

const SidebarRail = memo(function SidebarRail({
  sections,
  pathname,
  counters,
  access,
  onSelect,
  onLogout,
}: SidebarMenuProps & { onSelect: (sectionId: string) => void }) {
  return (
    <>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-2 py-3">
        {sections.map((section) => {
          const active = section.items.some((item) =>
            isItemActive(pathname, item.href),
          );
          const count = getSectionBadgeValue(section, counters);
          return (
            <button
              key={section.id}
              type="button"
              aria-label={section.title}
              aria-expanded={false}
              title={section.title}
              onClick={() => onSelect(section.id)}
              className="dashboard-sidebar-toggle relative mx-auto flex h-11 w-12 items-center justify-center rounded-xl border border-white/10 text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
            >
              <span
                className={
                  "inline-flex h-9 w-9 items-center justify-center rounded-xl " +
                  (active
                    ? "dashboard-accent-surface text-white"
                    : "bg-white/[0.08]")
                }
              >
                <SidebarIcon icon={section.icon} />
              </span>
              {count > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[9px] font-bold text-slate-900"
                >
                  {count > 9 ? "9+" : count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="dashboard-sidebar-footer shrink-0 border-t border-white/10 px-2 py-3">
        {ADMIN_ITEMS.filter((item) => isItemAllowed(item.href, access)).map(
          (item) => (
            <Link
              key={item.key}
              href={item.href || "/dashboard/profile"}
              title={item.label}
              aria-label={item.label}
              className={
                "mx-auto flex h-10 w-12 items-center justify-center rounded-xl border " +
                (isItemActive(pathname, item.href)
                  ? "dashboard-accent-surface text-white"
                  : "border-white/10 bg-white/[0.05] text-slate-100")
              }
            >
              <SidebarIcon icon="overview" />
            </Link>
          ),
        )}
        <button
          type="button"
          onClick={onLogout}
          className="mt-3 w-full rounded-xl border border-red-300/60 bg-red-500/10 px-2 py-2 text-xs font-semibold text-red-100 hover:bg-red-500/18"
        >
          Sair
        </button>
      </div>
    </>
  );
});

const SidebarPanel = memo(function SidebarPanel({
  sections,
  favoriteItems,
  favoriteKeys,
  pathname,
  openSectionId,
  counters,
  access,
  onToggleSection,
  onToggleFavorite,
  onLogout,
}: SidebarMenuProps & {
  favoriteItems: NavItem[];
  favoriteKeys: string[];
  openSectionId: string | null;
  onToggleSection: (sectionId: string) => void;
  onToggleFavorite: (itemKey: string) => void;
}) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
        {favoriteItems.length > 0 ? (
          <section className="dashboard-sidebar-panel mb-3 rounded-2xl border border-white/10 p-2.5">
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
              Atalhos
            </p>
            <div className="space-y-1">
              {favoriteItems.map((item) => (
                <Link
                  key={item.key}
                  href={item.href || "/dashboard"}
                  className={
                    "flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm " +
                    (isItemActive(pathname, item.href)
                      ? "dashboard-accent-surface text-white"
                      : "border-white/10 bg-white/[0.06] text-slate-100 hover:bg-white/[0.09]")
                  }
                >
                  <span className="truncate">{item.label}</span>
                  <span className="text-amber-300" aria-hidden="true">
                    ★
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
        {sections.map((section) => {
          const active = section.items.some((item) =>
            isItemActive(pathname, item.href),
          );
          const open = openSectionId === section.id;
          return (
            <div
              key={section.id}
              className="dashboard-sidebar-panel mb-2 rounded-2xl border border-white/10"
            >
              <button
                type="button"
                onClick={() => onToggleSection(section.id)}
                aria-label={section.title}
                aria-expanded={open}
                aria-controls={"sidebar-section-" + section.id}
                className="flex h-12 w-full items-center justify-between rounded-2xl px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-300"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className={
                      "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl " +
                      (active
                        ? "dashboard-accent-surface text-white"
                        : "bg-white/[0.08] text-slate-100")
                    }
                  >
                    <SidebarIcon icon={section.icon} />
                  </span>
                  <span className="truncate text-sm font-bold text-slate-100">
                    {section.title}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-200">
                    {section.items.length}
                  </span>
                  <span
                    aria-hidden="true"
                    className={
                      "text-xs font-bold text-slate-400 " +
                      (open ? "" : "-rotate-90")
                    }
                  >
                    ⌄
                  </span>
                </span>
              </button>
              <div
                id={"sidebar-section-" + section.id}
                hidden={!open}
                className="px-2 pb-2"
              >
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const itemActive = isItemActive(pathname, item.href);
                    const count = item.badgeKey ? counters[item.badgeKey] : 0;
                    const favorite = favoriteKeys.includes(item.key);
                    return (
                      <div
                        key={item.key}
                        className="group flex items-center gap-1"
                      >
                        <Link
                          href={item.href || "/dashboard"}
                          aria-current={itemActive ? "page" : undefined}
                          className={
                            "flex min-w-0 flex-1 items-center justify-between rounded-xl border px-3 py-2.5 text-sm " +
                            (itemActive
                              ? "dashboard-accent-surface font-semibold text-white"
                              : "border-white/10 bg-white/[0.05] text-slate-100 hover:bg-white/[0.08]")
                          }
                        >
                          <span className="truncate">{item.label}</span>
                          {count > 0 && !item.soon ? (
                            <span className="ml-2 shrink-0 rounded-full bg-white/85 px-1.5 py-0.5 text-[10px] font-bold text-slate-900">
                              {count}
                            </span>
                          ) : null}
                          {item.soon ? (
                            <span className="ml-2 rounded bg-white/12 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-100">
                              Em breve
                            </span>
                          ) : null}
                        </Link>
                        <button
                          type="button"
                          onClick={() => onToggleFavorite(item.key)}
                          aria-label={
                            (favorite
                              ? "Remover dos favoritos: "
                              : "Adicionar aos favoritos: ") + item.label
                          }
                          title={
                            favorite
                              ? "Remover dos favoritos"
                              : "Adicionar aos favoritos"
                          }
                          className={
                            "rounded-lg border px-1.5 py-1.5 text-xs " +
                            (favorite
                              ? "border-amber-300 bg-amber-300/20 text-amber-200"
                              : "border-white/10 bg-white/[0.04] text-slate-300 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-amber-200")
                          }
                        >
                          {favorite ? "★" : "☆"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="dashboard-sidebar-footer shrink-0 border-t border-white/10 p-3">
        <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
          Conta
        </p>
        {ADMIN_ITEMS.filter((item) => isItemAllowed(item.href, access)).map(
          (item) => (
            <Link
              key={item.key}
              href={item.href || "/dashboard/profile"}
              className={
                "flex items-center rounded-xl border px-3 py-2.5 text-sm " +
                (isItemActive(pathname, item.href)
                  ? "dashboard-accent-surface font-semibold text-white"
                  : "border-white/10 bg-white/[0.05] text-slate-100 hover:border-white/16")
              }
            >
              {item.label}
            </Link>
          ),
        )}
        <button
          type="button"
          onClick={onLogout}
          className="mt-3 w-full rounded-xl border border-red-300/60 bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-100 hover:bg-red-500/18"
        >
          Encerrar sessão
        </button>
      </div>
    </>
  );
});

function isItemActive(pathname: string, href?: string) {
  if (!href) return false;
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getSectionBadgeValue(section: NavSection, counters: SidebarCounters) {
  return section.items.reduce((sum, item) => {
    if (!item.badgeKey) return sum;
    return sum + counters[item.badgeKey];
  }, 0);
}

function isItemAllowed(href: string | undefined, access: SidebarAccess) {
  if (!href) return true;
  return canAccessDashboardPath(href, access);
}

function SidebarIcon({ icon }: { icon: NavSection["icon"] }) {
  const common = "h-4 w-4";
  switch (icon) {
    case "overview":
      return (
        <svg
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 13h8V3H3zM13 21h8v-6h-8zM13 11h8V3h-8zM3 21h8v-6H3z" />
        </svg>
      );
    case "crm":
      return (
        <svg
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <path d="M20 8v6M23 11h-6" />
        </svg>
      );
    case "ops":
      return (
        <svg
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M14.7 6.3a1 1 0 0 0-1.4-1.4l-8 8a1 1 0 0 0 1.4 1.4z" />
          <path d="M18.4 2.6a3 3 0 1 1 3 3L14 13l-3-3z" />
          <path d="M8 14l3 3-2 5-3-3z" />
        </svg>
      );
    case "assets":
      return (
        <svg
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M7 6V4h10v2M7 18v2h10v-2" />
        </svg>
      );
    case "stock":
      return (
        <svg
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <path d="M3.3 7 12 12l8.7-5M12 22V12" />
        </svg>
      );
    case "finance":
      return (
        <svg
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 1v22M17 5H9a4 4 0 0 0 0 8h6a4 4 0 0 1 0 8H7" />
        </svg>
      );
    case "people":
      return (
        <svg
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <path d="M20 8v6M17 11h6" />
        </svg>
      );
    case "hr":
      return (
        <svg
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <path d="M3 6h.01" />
          <path d="M3 12h.01" />
          <path d="M3 18h.01" />
        </svg>
      );
    case "studio":
      return (
        <svg
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M4 4h16v16H4z" />
          <path d="M8 8h8M8 12h5M8 16h8" />
        </svg>
      );
    default:
      return null;
  }
}
