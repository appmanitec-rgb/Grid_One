"use client";

import Image from "next/image";
import {
  MAIN_SECTIONS,
  navigationContext,
  isNavigationItemActive,
  searchNavigation,
  type NavItem,
  type NavSection,
} from "@/lib/dashboard-navigation";
export { MAIN_SECTIONS } from "@/lib/dashboard-navigation";
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

type SidebarCounters = {
  proposalsQueue: number;
  ordersOpen: number;
  contractsAttention: number;
  teamUnread: number;
};

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
          return {
            ...section,
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
            isItemAllowed("/dashboard/proposals", access)
              ? apiFetch("/proposals", { cache: "no-store" })
              : Promise.resolve(new Response(null, { status: 204 })),
            userRole !== "CLIENT" && isItemAllowed("/dashboard/orders", access)
              ? apiFetch("/maintenance-orders", { cache: "no-store" })
              : Promise.resolve(new Response(null, { status: 204 })),
            userRole !== "CLIENT" &&
            isItemAllowed("/dashboard/contracts", access)
              ? apiFetch("/contracts", { cache: "no-store" })
              : Promise.resolve(new Response(null, { status: 204 })),
            userRole !== "CLIENT" && isItemAllowed("/dashboard/team", access)
              ? apiFetch("/team/channels", { cache: "no-store" })
              : Promise.resolve(new Response(null, { status: 204 })),
          ]);

        const next: SidebarCounters = {
          proposalsQueue: 0,
          ordersOpen: 0,
          contractsAttention: 0,
          teamUnread: 0,
        };

        if (
          proposalsRes.status === "fulfilled" &&
          proposalsRes.value.status === 200
        ) {
          const proposals = await proposalsRes.value.json();
          next.proposalsQueue = (proposals || []).filter((p: any) =>
            userRole === "CLIENT"
              ? p.status === "CLIENT_REVIEW" || p.status === "REVISION_REQUIRED"
              : p.status === "BOARD_REVIEW" || p.status === "DISCOUNT_REVIEW",
          ).length;
        }

        if (
          ordersRes.status === "fulfilled" &&
          ordersRes.value.status === 200
        ) {
          const orders = await ordersRes.value.json();
          next.ordersOpen = (orders || []).filter(
            (o: any) => o.status === "OPEN" || o.status === "IN_PROGRESS",
          ).length;
        }

        if (
          contractsRes.status === "fulfilled" &&
          contractsRes.value.status === 200
        ) {
          const contracts = await contractsRes.value.json();
          next.contractsAttention = (contracts || []).filter(
            (c: any) => c.status === "SUSPENDED" || c.status === "RENEWAL",
          ).length;
        }

        if (teamRes.status === "fulfilled" && teamRes.value.status === 200) {
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
  }, [userRole, access]);

  const favoriteItems = useMemo(() => {
    const map = new Map(allAllowedItems.map((item) => [item.key, item]));
    return favoriteKeys.map((key) => map.get(key)).filter(Boolean) as NavItem[];
  }, [favoriteKeys, allAllowedItems]);

  const activeSectionId =
    navigationContext(pathname, filteredSections)?.section.id || null;
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
              data-area={section.id}
              data-active={active}
              type="button"
              aria-label={section.title}
              aria-expanded={false}
              title={section.title}
              onClick={() => onSelect(section.id)}
              className="dashboard-nav-section dashboard-sidebar-toggle relative mx-auto flex h-11 w-12 items-center justify-center rounded-xl border border-white/10 text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
            >
              <span
                className={
                  "dashboard-nav-icon inline-flex h-9 w-9 items-center justify-center rounded-xl " +
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
  const [search, setSearch] = useState({ pathname, value: "" });
  const query = search.pathname === pathname ? search.value : "";
  const results = searchNavigation(sections, query);
  return (
    <>
      <div className="dashboard-menu-search shrink-0 px-3 pb-2 pt-4">
        <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          Navegação por área
        </p>
        <div className="relative">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <input
            aria-label="Pesquisar no menu"
            type="search"
            value={query}
            onChange={(e) => setSearch({ pathname, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setSearch({ pathname, value: "" });
              }
            }}
            placeholder="Pesquisar uma rotina..."
            className="dashboard-menu-search-input h-10 w-full rounded-xl border border-white/10 bg-white/[0.05] pl-9 pr-3 text-xs text-slate-100 outline-none placeholder:text-slate-400 focus:border-sky-300/60 focus:ring-2 focus:ring-sky-300/10"
          />
        </div>
      </div>
      <nav
        aria-label="Áreas e rotinas"
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-2"
      >
        {query.trim() ? (
          <div aria-live="polite" className="space-y-1">
            <p className="px-2 py-2 text-xs text-slate-400">
              {results.total
                ? results.total + " rotina(s) encontrada(s)"
                : "Nenhuma rotina encontrada."}
              {results.total > 10 ? " Mostrando 10; refine a busca." : ""}
            </p>
            {results.items.map(({ section, item }) => (
              <Link
                key={item.key}
                href={item.href!}
                aria-current={
                  isItemActive(pathname, item.href) ? "page" : undefined
                }
                className="dashboard-menu-result block rounded-xl border border-white/10 px-3 py-3 text-slate-100 hover:bg-white/[0.07]"
              >
                <span className="block text-[10px] text-slate-400">
                  {section.title} · {item.group}
                </span>
                <span className="mt-1 block text-sm font-semibold">
                  {item.label}
                </span>
              </Link>
            ))}
            {!results.total ? (
              <button
                type="button"
                onClick={() => setSearch({ pathname, value: "" })}
                className="px-2 py-3 text-xs font-semibold text-sky-300"
              >
                Limpar busca e ver áreas
              </button>
            ) : null}
          </div>
        ) : null}
        {!query.trim() && favoriteItems.length > 0 ? (
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
                  <span className="min-w-0 break-words leading-5">
                    {item.label}
                  </span>
                  <span className="text-amber-300" aria-hidden="true">
                    ★
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
        {!query.trim() &&
          sections.map((section) => {
            const active = section.items.some((item) =>
              isItemActive(pathname, item.href),
            );
            const open = openSectionId === section.id;
            return (
              <div
                key={section.id}
                data-area={section.id}
                data-active={active}
                className="dashboard-nav-section mb-1 rounded-xl"
              >
                <button
                  type="button"
                  onClick={() => onToggleSection(section.id)}
                  aria-label={section.title}
                  title={section.description}
                  aria-expanded={open}
                  aria-controls={"sidebar-section-" + section.id}
                  className="dashboard-nav-heading flex min-h-12 w-full items-center justify-between gap-2 rounded-xl px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-300"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={
                        "dashboard-nav-icon inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg " +
                        (active
                          ? "dashboard-accent-surface text-white"
                          : "bg-white/[0.08] text-slate-100")
                      }
                    >
                      <SidebarIcon icon={section.icon} />
                    </span>
                    <span className="truncate text-[13px] font-semibold text-slate-100">
                      {section.title}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      title={section.items.length + " rotinas disponíveis"}
                      className="text-[10px] font-medium tabular-nums text-slate-400"
                    >
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
                  className="px-1 pb-2"
                >
                  <div className="dashboard-nav-children ml-5 border-l border-white/10 pl-2">
                    {section.items.map((item, index) => {
                      const itemActive = isItemActive(pathname, item.href);
                      const count = item.badgeKey ? counters[item.badgeKey] : 0;
                      const favorite = favoriteKeys.includes(item.key);
                      return (
                        <div
                          key={item.key}
                          className="group flex flex-wrap items-center gap-1"
                        >
                          {item.group &&
                          (index === 0 ||
                            section.items[index - 1].group !== item.group) ? (
                            <p className="w-full px-2 pb-1 pt-3 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                              {item.group}
                            </p>
                          ) : null}
                          <Link
                            href={item.href || "/dashboard"}
                            aria-current={itemActive ? "page" : undefined}
                            className={
                              "dashboard-nav-link flex min-w-0 flex-1 items-center justify-between rounded-lg border border-transparent px-2.5 py-2 text-[13px] " +
                              (itemActive
                                ? "dashboard-accent-surface font-semibold text-white"
                                : "text-slate-300 hover:bg-white/[0.06] hover:text-white")
                            }
                          >
                            <span className="min-w-0 break-words leading-5">
                              {item.label}
                            </span>
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
      </nav>
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

const isItemActive = isNavigationItemActive;

function getSectionBadgeValue(section: NavSection, counters: SidebarCounters) {
  return [
    ...new Set(
      section.items.flatMap((item) => (item.badgeKey ? [item.badgeKey] : [])),
    ),
  ].reduce((sum, key) => sum + counters[key], 0);
}

function isItemAllowed(href: string | undefined, access: SidebarAccess) {
  if (!href) return true;
  return canAccessDashboardPath(href, access);
}

function SidebarIcon({ icon }: { icon: NavSection["icon"] }) {
  const common = "h-4 w-4";
  switch (icon) {
    case "planning":
      return (
        <svg
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2m-8 3h2" />
        </svg>
      );
    case "warehouse":
      return (
        <svg
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m3 10 9-7 9 7v11H3zM3 10h18M8 21v-7h8v7m-4-7v7" />
        </svg>
      );
    case "contracts":
      return (
        <svg
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 12h8m-8 4h5" />
        </svg>
      );
    case "admin":
      return (
        <svg
          viewBox="0 0 24 24"
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z" />
          <path d="m8 12 3 3 5-6" />
        </svg>
      );
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
