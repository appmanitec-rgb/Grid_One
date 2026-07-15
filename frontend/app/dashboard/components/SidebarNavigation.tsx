"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  tickets: boolean;
  serviceReports: boolean;
  technicianPortal: boolean;
};

type SidebarNavigationProps = {
  pathname: string;
  collapsed: boolean;
  access: SidebarAccess;
  onToggleCollapsed: () => void;
  onLogout: () => void;
};

type NavItem = {
  key: string;
  label: string;
  href?: string;
  enabled?: boolean;
  soon?: boolean;
  badgeKey?: "proposalsQueue" | "ordersOpen" | "contractsAttention";
};

type NavSection = {
  id: string;
  title: string;
  icon: "overview" | "crm" | "ops" | "assets" | "stock" | "finance" | "people";
  items: NavItem[];
};

type SidebarCounters = {
  proposalsQueue: number;
  ordersOpen: number;
  contractsAttention: number;
};

const MAIN_SECTIONS: NavSection[] = [
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
        href: "/dashboard/control",
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
        label: "Despacho",
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
    title: "Pessoas",
    icon: "people",
    items: [
      {
        key: "hr_collaborators",
        label: "Colaboradores",
        href: "/dashboard/hr/collaborators",
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
  collapsed,
  access,
  onToggleCollapsed,
  onLogout,
}: SidebarNavigationProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);
  const [userRole, setUserRole] = useState("NORMAL");
  const [counters, setCounters] = useState<SidebarCounters>({
    proposalsQueue: 0,
    ordersOpen: 0,
    contractsAttention: 0,
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
    const saved = localStorage.getItem("manitec_sidebar_sections");
    if (saved) {
      try {
        setOpenSections(JSON.parse(saved));
        return;
      } catch {
        // ignore invalid cache
      }
    }

    const defaults: Record<string, boolean> = {};
    for (const section of filteredSections) {
      defaults[section.id] = section.items.some((item) =>
        isItemActive(pathname, item.href),
      );
    }
    setOpenSections(defaults);
  }, [filteredSections, pathname]);

  useEffect(() => {
    localStorage.setItem(
      "manitec_sidebar_sections",
      JSON.stringify(openSections),
    );
  }, [openSections]);

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
        const [proposalsRes, ordersRes, contractsRes] =
          await Promise.allSettled([
            apiFetch("/proposals", { cache: "no-store" }),
            userRole === "CLIENT"
              ? Promise.resolve(new Response("[]", { status: 204 }))
              : apiFetch("/maintenance-orders", { cache: "no-store" }),
            userRole === "CLIENT"
              ? Promise.resolve(new Response("[]", { status: 204 }))
              : apiFetch("/contracts", { cache: "no-store" }),
          ]);

        const next: SidebarCounters = {
          proposalsQueue: 0,
          ordersOpen: 0,
          contractsAttention: 0,
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

  function toggleSection(sectionId: string) {
    setOpenSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  }

  function toggleFavorite(itemKey: string) {
    setFavoriteKeys((prev) => {
      if (prev.includes(itemKey)) return prev.filter((key) => key !== itemKey);
      return [...prev, itemKey].slice(0, 6);
    });
  }

  return (
    <aside
      className={`dashboard-sidebar z-20 hidden border-r border-white/10 bg-[linear-gradient(180deg,#0c2034_0%,#102844_48%,#132d47_100%)] shadow-[14px_0_34px_-24px_rgba(2,8,20,0.78)] transition-[width] duration-300 md:flex md:flex-col ${
        collapsed ? "w-24" : "w-[18.5rem]"
      }`}
    >
      <div
        className={`flex h-[78px] items-center border-b border-white/10 ${collapsed ? "justify-center px-3" : "gap-3 px-4"}`}
      >
        <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/95 shadow-sm">
          <Image
            src="/brand/manitec-logo-transparent.png"
            alt="Manitec"
            width={40}
            height={40}
            className="h-8 w-8 object-contain"
          />
        </div>

        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black tracking-tight text-white">
              MANITEC
            </p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">
              Operação integrada
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onToggleCollapsed}
          className="dashboard-sidebar-toggle rounded-xl border border-white/10 bg-white/8 px-2.5 py-1.5 text-xs font-bold text-slate-100 hover:bg-white/14"
          title={collapsed ? "Expandir menu" : "Minimizar menu"}
        >
          {collapsed ? ">" : "<"}
        </button>
      </div>

      <div
        className={`flex-1 overflow-y-auto py-4 ${collapsed ? "px-2.5" : "px-3"}`}
      >
        {!collapsed && favoriteItems.length > 0 && (
          <section className="dashboard-sidebar-panel mb-4 rounded-[22px] border border-white/10 bg-white/[0.04] p-2.5">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-300">
                Atalhos
              </p>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-200">
                {favoriteItems.length}
              </span>
            </div>
            <div className="space-y-1">
              {favoriteItems.map((item) => {
                const active = isItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.key}
                    href={item.href || "/dashboard"}
                    className={`flex items-center justify-between rounded-2xl border px-3 py-2.5 text-sm ${
                      active
                        ? "dashboard-accent-surface text-white"
                        : "border-white/10 bg-white/[0.06] text-slate-100 hover:border-white/18 hover:bg-white/[0.09]"
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    <span className="text-[12px] text-amber-300">★</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {filteredSections.map((section) => {
          const hasActive = section.items.some((item) =>
            isItemActive(pathname, item.href),
          );
          const open = openSections[section.id] ?? hasActive;

          if (collapsed) {
            return (
              <div key={section.id} className="mb-2">
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className={`dashboard-sidebar-toggle flex w-full items-center justify-center rounded-xl border px-2 py-3 ${
                    hasActive
                      ? "dashboard-accent-surface text-white"
                      : "border-white/10 bg-white/[0.05] text-slate-200 hover:bg-white/[0.1]"
                  }`}
                  title={section.title}
                >
                  <SidebarIcon icon={section.icon} />
                </button>
              </div>
            );
          }

          return (
            <div
              key={section.id}
              className="dashboard-sidebar-panel mb-2 rounded-[22px] border border-white/10 bg-white/[0.04]"
            >
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="flex w-full items-center justify-between rounded-[22px] px-3 py-3 text-left"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${hasActive ? "dashboard-accent-surface text-white" : "bg-white/[0.08] text-slate-100"}`}
                  >
                    <SidebarIcon icon={section.icon} />
                  </span>
                  <span className="text-sm font-bold text-slate-100">
                    {section.title}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-200">
                    {section.items.length}
                  </span>
                  <span
                    className={`text-xs font-bold text-slate-400 transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
                  >
                    ⌄
                  </span>
                </span>
              </button>

              <div
                className={`overflow-hidden px-2 transition-all duration-300 ${open ? "max-h-[520px] pb-2 opacity-100" : "max-h-0 pb-0 opacity-0"}`}
              >
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const active = isItemActive(pathname, item.href);
                    const badgeValue = item.badgeKey
                      ? counters[item.badgeKey]
                      : 0;
                    const content = (
                      <span
                        className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-sm transition ${active ? "dashboard-accent-surface font-semibold text-white" : "border-white/10 bg-white/[0.05] text-slate-100 hover:border-white/16 hover:bg-white/[0.08]"}`}
                      >
                        <span className="truncate">{item.label}</span>
                        <span className="ml-2 flex items-center gap-1">
                          {badgeValue > 0 && !item.soon ? (
                            <span className="rounded-full bg-white/85 px-1.5 py-0.5 text-[10px] font-bold text-slate-900">
                              {badgeValue}
                            </span>
                          ) : null}
                          {item.soon ? (
                            <span className="rounded bg-white/12 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-100">
                              Em breve
                            </span>
                          ) : null}
                        </span>
                      </span>
                    );

                    return (
                      <div
                        key={item.key}
                        className="group flex items-center gap-1"
                      >
                        {item.href ? (
                          <Link href={item.href} className="min-w-0 flex-1">
                            {content}
                          </Link>
                        ) : (
                          <div className="min-w-0 flex-1">{content}</div>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleFavorite(item.key)}
                          className={`rounded-xl border px-1.5 py-1.5 text-[12px] transition ${favoriteKeys.includes(item.key) ? "border-amber-300 bg-amber-300/20 text-amber-200 opacity-100" : "border-white/10 bg-white/[0.04] text-slate-300 opacity-0 group-hover:opacity-100 hover:text-amber-200"}`}
                          title={
                            favoriteKeys.includes(item.key)
                              ? "Remover dos favoritos"
                              : "Adicionar aos favoritos"
                          }
                        >
                          {favoriteKeys.includes(item.key) ? "★" : "☆"}
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

      <div
        className={`dashboard-sidebar-footer border-t border-white/10 bg-black/10 ${collapsed ? "px-2.5 py-3" : "p-3"}`}
      >
        {collapsed ? (
          <div className="space-y-2">
            {ADMIN_ITEMS.filter((item) => isItemAllowed(item.href, access)).map(
              (item) => (
                <Link
                  key={item.key}
                  href={item.href || "/dashboard/profile"}
                  title={item.label}
                  className={`flex h-10 items-center justify-center rounded-xl border ${isItemActive(pathname, item.href) ? "dashboard-accent-surface text-white" : "border-white/10 bg-white/[0.05] text-slate-100"}`}
                >
                  <SidebarIcon icon="overview" />
                </Link>
              ),
            )}
          </div>
        ) : (
          <>
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-300">
              Conta
            </p>
            <div className="space-y-1">
              {ADMIN_ITEMS.filter((item) =>
                isItemAllowed(item.href, access),
              ).map((item) => (
                <Link
                  key={item.key}
                  href={item.href || "/dashboard/profile"}
                  className={`flex items-center justify-between rounded-2xl border px-3 py-2.5 text-sm ${isItemActive(pathname, item.href) ? "dashboard-accent-surface font-semibold text-white" : "border-white/10 bg-white/[0.05] text-slate-100 hover:border-white/16"}`}
                >
                  <span>{item.label}</span>
                  {item.soon ? (
                    <span className="rounded bg-white/12 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-100">
                      Em breve
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onLogout}
          className={`mt-3 w-full rounded-2xl border border-red-300/60 bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-100 hover:bg-red-500/18 ${collapsed ? "text-xs" : ""}`}
        >
          {collapsed ? "Sair" : "Encerrar sessão"}
        </button>
      </div>
    </aside>
  );
}

function isItemActive(pathname: string, href?: string) {
  if (!href) return false;
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
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
    default:
      return null;
  }
}
