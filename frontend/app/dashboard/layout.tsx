"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import TopBar from "./components/TopBar";
import SidebarNavigation, {
  SidebarAccess,
} from "./components/SidebarNavigation";
import { canAccessDashboardPath, getAccessFromToken } from "@/lib/access";
import {
  applyDashboardTheme,
  clearAppliedDashboardTheme,
  readStoredDashboardTheme,
  saveStoredDashboardTheme,
  type DashboardThemeId,
} from "@/lib/dashboard-appearance";
import {
  clearAuthSession,
  decodeJwtPayload,
  ensureValidSession,
  getStoredAccessToken,
} from "@/lib/auth-session";

type VisiblePages = SidebarAccess;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [accessReady, setAccessReady] = useState(false);
  const [appearanceTheme, setAppearanceTheme] =
    useState<DashboardThemeId>("mist");
  const [currentRole, setCurrentRole] = useState("NORMAL");
  const [visiblePages, setVisiblePages] = useState<VisiblePages>({
    dashboard: true,
    proposals: true,
    orders: true,
    contracts: true,
    catalog: true,
    clients: true,
    equipments: true,
    finance: false,
    inventory: false,
    people: false,
    usersControl: false,
    tickets: false,
    serviceReports: false,
    technicianPortal: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function bootstrapAccess() {
      const hasSession = await ensureValidSession();
      const token = getStoredAccessToken();

      if (cancelled) return;

      if (!hasSession || !token) {
        clearAuthSession();
        router.replace("/");
        return;
      }

      try {
        const payload = decodeJwtPayload<{ role?: string }>(token);
        setCurrentRole(payload?.role || "NORMAL");
        const access = getAccessFromToken();
        setVisiblePages({
          ...(access.pages as VisiblePages),
          usersControl: access.pages.usersControl || access.users.manage,
        });
        setAccessReady(true);
      } catch {
        clearAuthSession();
        router.replace("/");
      }
    }

    void bootstrapAccess();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!accessReady) return;
    if (!canAccessDashboardPath(pathname, visiblePages)) {
      router.replace(currentRole === "CLIENT" ? "/portal" : "/dashboard");
    }
  }, [accessReady, currentRole, pathname, router, visiblePages]);

  useEffect(() => {
    if (!accessReady || currentRole !== "CLIENT") return;
    if (pathname.startsWith("/dashboard")) {
      router.replace("/portal");
    }
  }, [accessReady, currentRole, pathname, router]);

  useEffect(() => {
    if (!accessReady || currentRole === "CLIENT") return;
    if (pathname.startsWith("/dashboard/client-portal")) {
      router.replace("/dashboard");
    }
  }, [accessReady, currentRole, pathname, router]);

  useEffect(() => {
    if (!accessReady) return;

    let cancelled = false;

    async function syncSession() {
      const hasSession = await ensureValidSession();
      const token = getStoredAccessToken();
      if (cancelled) return;

      if (!hasSession || !token) {
        clearAuthSession();
        router.replace("/");
        return;
      }

      try {
        const payload = decodeJwtPayload<{ role?: string }>(token);
        setCurrentRole(payload?.role || "NORMAL");
        const access = getAccessFromToken();
        setVisiblePages({
          ...(access.pages as VisiblePages),
          usersControl: access.pages.usersControl || access.users.manage,
        });
      } catch {
        clearAuthSession();
        router.replace("/");
      }
    }

    const intervalId = window.setInterval(() => {
      void syncSession();
    }, 60_000);
    const handleFocus = () => {
      void syncSession();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncSession();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [accessReady, router]);

  useEffect(() => {
    const saved = localStorage.getItem("manitec_sidebar_collapsed");
    setIsSidebarCollapsed(saved === "1");
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "manitec_sidebar_collapsed",
      isSidebarCollapsed ? "1" : "0",
    );
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const savedTheme = readStoredDashboardTheme();
    setAppearanceTheme(savedTheme);
    applyDashboardTheme(savedTheme);

    return () => {
      clearAppliedDashboardTheme();
    };
  }, []);

  useEffect(() => {
    applyDashboardTheme(appearanceTheme);
  }, [appearanceTheme]);

  const navItems = useMemo(
    () => [
      {
        href: currentRole === "CLIENT" ? "/portal" : "/dashboard",
        label: currentRole === "CLIENT" ? "Portal" : "Dashboard",
        mobileLabel: currentRole === "CLIENT" ? "Portal" : "Painel",
        icon: "OV",
        enabled: visiblePages.dashboard,
      },
      {
        href: "/dashboard/documents",
        label: "Documentos",
        mobileLabel: "Docs",
        icon: "DC",
        enabled: visiblePages.dashboard,
      },
      {
        href: "/dashboard/deliveries",
        label: "Envios",
        mobileLabel: "Envios",
        icon: "EV",
        enabled: visiblePages.dashboard,
      },
      {
        href: "/dashboard/notifications",
        label: "Alertas",
        mobileLabel: "Alertas",
        icon: "AL",
        enabled: visiblePages.dashboard,
      },
      {
        href: "/dashboard/proposals",
        label: "Propostas",
        mobileLabel: "Propostas",
        icon: "PP",
        enabled: visiblePages.proposals,
      },
      {
        href: "/dashboard/orders",
        label: "Ordens",
        mobileLabel: "Ordens",
        icon: "OS",
        enabled: visiblePages.orders,
      },
      {
        href: "/dashboard/tecnico",
        label: "Campo",
        mobileLabel: "Campo",
        icon: "TC",
        enabled: visiblePages.technicianPortal,
      },
      {
        href: "/dashboard/relatorios-tecnicos",
        label: "Laudos",
        mobileLabel: "Laudos",
        icon: "LD",
        enabled: visiblePages.serviceReports,
      },
      {
        href: "/dashboard/contracts",
        label: "Contratos",
        mobileLabel: "Contratos",
        icon: "CT",
        enabled: visiblePages.contracts,
      },
      {
        href: "/dashboard/clients",
        label: "Clientes",
        mobileLabel: "Clientes",
        icon: "CL",
        enabled: visiblePages.clients,
      },
      {
        href: "/dashboard/equipments",
        label: "Equipamentos",
        mobileLabel: "Ativos",
        icon: "EQ",
        enabled: visiblePages.equipments,
      },
      {
        href: "/dashboard/catalog",
        label: "Catalogo",
        mobileLabel: "Catalogo",
        icon: "CG",
        enabled: visiblePages.catalog,
      },
      {
        href: "/dashboard/suppliers",
        label: "Fornecedores",
        mobileLabel: "Parceiros",
        icon: "FR",
        enabled: visiblePages.catalog,
      },
      {
        href: "/dashboard/finance/cash-flow",
        label: "Financeiro",
        mobileLabel: "Financeiro",
        icon: "FN",
        enabled: visiblePages.finance,
      },
      {
        href: "/dashboard/hr/collaborators",
        label: "RH",
        mobileLabel: "Pessoas",
        icon: "RH",
        enabled: visiblePages.people,
      },
      {
        href: "/dashboard/automation",
        label: "Automacoes",
        mobileLabel: "Automacao",
        icon: "AU",
        enabled: visiblePages.usersControl,
      },
      {
        href: "/dashboard/control",
        label: "Gestao",
        mobileLabel: "Gestao",
        icon: "AC",
        enabled: visiblePages.usersControl,
      },
    ],
    [currentRole, visiblePages],
  );

  const allowedItems = navItems.filter((item) => item.enabled);

  function logout() {
    clearAuthSession();
    router.replace("/");
  }

  function handleThemeChange(nextTheme: DashboardThemeId) {
    setAppearanceTheme(nextTheme);
    saveStoredDashboardTheme(nextTheme);
  }

  if (!accessReady) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-6 text-sm font-semibold text-zinc-500"
        style={{ background: "var(--app-body-background)" }}
      >
        Validando sessao...
      </div>
    );
  }

  return (
    <div className="dashboard-shell relative flex h-screen overflow-hidden bg-transparent text-zinc-900">
      <SidebarNavigation
        pathname={pathname}
        collapsed={isSidebarCollapsed}
        access={visiblePages}
        onToggleCollapsed={() => setIsSidebarCollapsed((prev) => !prev)}
        onLogout={logout}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          onExpandSidebar={() => setIsSidebarCollapsed(false)}
          canExpandSidebar={isSidebarCollapsed}
          appearanceTheme={appearanceTheme}
          onChangeAppearanceTheme={handleThemeChange}
        />
        <main className="dashboard-main flex-1 overflow-y-auto px-4 pb-24 pt-5 md:px-6 md:pb-10 md:pt-6">
          <div className="dashboard-container w-full">
            <div className="slide-fade-in">{children}</div>
          </div>
        </main>
      </div>

      <nav className="glass-surface fixed inset-x-4 bottom-3 z-30 flex gap-2 overflow-x-auto rounded-[24px] p-2 md:hidden">
        {allowedItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`min-w-[92px] rounded-2xl px-2 py-2 text-center text-[11px] font-semibold ${
                active
                  ? "bg-slate-950 text-white shadow-[0_16px_28px_-22px_rgba(15,31,50,0.65)]"
                  : "bg-slate-100/90 text-slate-600"
              }`}
              aria-label={item.label}
            >
              {item.mobileLabel}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
