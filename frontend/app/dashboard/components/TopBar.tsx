"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { fetchDashboardNotificationInbox } from "@/lib/dashboard-notifications";
import type { DashboardThemeId } from "@/lib/dashboard-appearance";
import {
  clearAuthSession,
  decodeJwtPayload,
  getStoredAccessToken,
} from "@/lib/auth-session";
import DashboardAppearanceControl from "./DashboardAppearanceControl";

type TopBarProps = {
  onExpandSidebar?: () => void;
  canExpandSidebar?: boolean;
  appearanceTheme: DashboardThemeId;
  onChangeAppearanceTheme: (themeId: DashboardThemeId) => void;
};

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  "/dashboard/client-portal": { title: "Portal do Cliente", subtitle: "Propostas, contratos, ordens e cobrança em uma visão única." },
  "/dashboard/documents": { title: "Central Documental", subtitle: "Versões prontas para imprimir, salvar em PDF e compartilhar." },
  "/dashboard/deliveries": { title: "Histórico de Envios", subtitle: "Rastreamento de compartilhamentos, abertura do link e falhas." },
  "/dashboard/notifications": { title: "Central de Alertas", subtitle: "Aprovações, operação, comercial e financeiro em uma fila única." },
  "/dashboard": { title: "Gestão e Operações", subtitle: "KPIs executivos, pipeline comercial e execução técnica." },
  "/dashboard/opportunities": { title: "Funil de Vendas", subtitle: "Pipeline por fase, temperatura e previsão de receita." },
  "/dashboard/commercial-inspections": { title: "Vistorias Comerciais", subtitle: "Checklists técnicos e mídias para dimensionamento." },
  "/dashboard/proposals": { title: "Central de Propostas", subtitle: "Controle completo por fase e revisões." },
  "/dashboard/orders": { title: "Centro de Ordens", subtitle: "Execução técnica com SLA e prioridade." },
  "/dashboard/contracts": { title: "Gestão de Contratos", subtitle: "Vigência, SLA, faturamento e preventiva automática." },
  "/dashboard/reports": { title: "Relatórios Gerenciais", subtitle: "Indicadores consolidados de performance e operação." },
  "/dashboard/monitoring": { title: "Monitoramento Operacional", subtitle: "Telemetria, alertas, automações e resposta de campo." },
  "/dashboard/dispatch": { title: "Painel de Despacho", subtitle: "Agenda diária/semanal com roteirização e prioridade operacional." },
  "/dashboard/technicians": { title: "Equipe de Técnicos", subtitle: "Capacidade operacional, skills e certificações da equipe." },
  "/dashboard/sites": { title: "Locais e Obras", subtitle: "Mapa de instalações e ativos por local." },
  "/dashboard/inventory": { title: "Controle de Estoque", subtitle: "Inventário, rupturas e valorização." },
  "/dashboard/purchase-orders": { title: "Pedidos de Compra", subtitle: "Solicitações e acompanhamento de compras." },
  "/dashboard/finance/accounts-receivable": { title: "Contas a Receber", subtitle: "Recebimentos de contratos e ordens avulsas." },
  "/dashboard/finance/accounts-payable": { title: "Contas a Pagar", subtitle: "Despesas operacionais, folha e fornecedores." },
  "/dashboard/finance/cash-flow": { title: "Fluxo de Caixa", subtitle: "Previsão de saldo, entradas e saídas do dia." },
  "/dashboard/finance/bank-accounts": { title: "Contas Bancárias & Caixas", subtitle: "Consolidação de saldos por banco e caixa interno." },
  "/dashboard/finance/cost-centers": { title: "Centros de Custo (DRE)", subtitle: "Margem por contrato, ativo e cliente." },
  "/dashboard/hr/collaborators": { title: "Colaboradores", subtitle: "Cadastro geral da equipe tecnica e administrativa." },
  "/dashboard/hr/epis-tools": { title: "EPIs e Ferramentas", subtitle: "Controle de entrega, responsabilidade e rastreabilidade." },
  "/dashboard/hr/time-tracking": { title: "Apontamento e Banco de Horas", subtitle: "Horas de campo, extras e sobreaviso." },
  "/dashboard/hr/commissions": { title: "Comissões e Premiação", subtitle: "Consolidado de variáveis do comercial e operação." },
  "/dashboard/hr/fleet": { title: "Gestão de Frota", subtitle: "Veículos, manutenção, multas e alocação por técnico." },
  "/dashboard/billing": { title: "Faturamento", subtitle: "Recebíveis de contratos e ordens de serviço." },
  "/dashboard/costs": { title: "Custos de Operação", subtitle: "Análise de custos técnicos e margens." },
  "/dashboard/company-settings": { title: "Configurações da Empresa", subtitle: "Cadastros de empresas, CNPJs e identidade visual." },
  "/dashboard/profile": { title: "Meu Perfil", subtitle: "Dados pessoais e preferências do usuário." },
  "/dashboard/clients": { title: "CRM de Clientes", subtitle: "Contatos, máquinas e histórico consolidado." },
  "/dashboard/equipments": { title: "Parque de Equipamentos", subtitle: "Rastreio de ativos e manutenção." },
  "/dashboard/catalog": { title: "Inteligência de Catálogo", subtitle: "Peças, custos, margens e precificação." },
  "/dashboard/suppliers": { title: "Rede de Fornecedores", subtitle: "Compras, SLA e condições comerciais." },
  "/dashboard/management/users": { title: "Área de Gestão (Admin)", subtitle: "Cadastros de usuários, permissões e governança." },
  "/dashboard/management": { title: "Área de Gestão (Admin)", subtitle: "Cadastros de usuários, permissões e governança." },
  "/dashboard/control": { title: "Área de Gestão (Admin)", subtitle: "Cadastros de usuários, permissões e governança." },
  "/dashboard/automation": { title: "Central de Automações", subtitle: "Histórico, saúde e disparos manuais das rotinas agendadas." },
};

function getRouteFamily(pathname: string) {
  if (pathname.startsWith("/dashboard/client-portal")) return "Portal";
  if (pathname.startsWith("/dashboard/documents")) return "Painel";
  if (pathname.startsWith("/dashboard/deliveries")) return "Painel";
  if (pathname.startsWith("/dashboard/notifications")) return "Painel";
  if (pathname.startsWith("/dashboard/finance")) return "Financeiro";
  if (pathname.startsWith("/dashboard/hr")) return "Pessoas";
  if (pathname.startsWith("/dashboard/catalog") || pathname.startsWith("/dashboard/suppliers") || pathname.startsWith("/dashboard/inventory") || pathname.startsWith("/dashboard/purchase-orders")) {
    return "Suprimentos";
  }
  if (pathname.startsWith("/dashboard/clients") || pathname.startsWith("/dashboard/opportunities") || pathname.startsWith("/dashboard/commercial-inspections") || pathname.startsWith("/dashboard/proposals") || pathname.startsWith("/dashboard/contracts")) {
    return "Comercial";
  }
  if (pathname.startsWith("/dashboard/orders") || pathname.startsWith("/dashboard/dispatch") || pathname.startsWith("/dashboard/technicians") || pathname.startsWith("/dashboard/monitoring") || pathname.startsWith("/dashboard/sites") || pathname.startsWith("/dashboard/equipments")) {
    return "Operação";
  }
  if (pathname.startsWith("/dashboard/control") || pathname.startsWith("/dashboard/management") || pathname.startsWith("/dashboard/company-settings") || pathname.startsWith("/dashboard/profile") || pathname.startsWith("/dashboard/automation") || pathname.startsWith("/dashboard/reports")) {
    return "Gestão";
  }
  return "Painel";
}

function getQuickAction(pathname: string, roleCode: string) {
  if (pathname.startsWith("/dashboard/client-portal")) {
    return { href: "/dashboard/proposals", label: "Minhas propostas" };
  }
  if (pathname.startsWith("/dashboard/documents")) {
    return roleCode === "CLIENT"
      ? { href: "/dashboard/client-portal", label: "Voltar ao portal" }
      : { href: "/dashboard", label: "Voltar ao painel" };
  }
  if (pathname.startsWith("/dashboard/deliveries")) {
    return roleCode === "CLIENT"
      ? { href: "/dashboard/client-portal", label: "Voltar ao portal" }
      : { href: "/dashboard/documents", label: "Central documental" };
  }
  if (pathname.startsWith("/dashboard/notifications")) {
    return roleCode === "CLIENT"
      ? { href: "/dashboard/client-portal", label: "Voltar ao portal" }
      : { href: "/dashboard", label: "Voltar ao painel" };
  }
  if (roleCode === "CLIENT" && pathname.startsWith("/dashboard/proposals")) {
    return { href: "/dashboard/client-portal", label: "Voltar ao portal" };
  }
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/proposals")) {
    return { href: "/dashboard/proposals/new", label: "Nova proposta" };
  }
  if (pathname.startsWith("/dashboard/clients")) {
    return { href: "/dashboard/clients/new", label: "Novo cliente" };
  }
  if (pathname.startsWith("/dashboard/contracts")) {
    return { href: "/dashboard/contracts/new", label: "Novo contrato" };
  }
  if (pathname.startsWith("/dashboard/billing")) {
    return { href: "/dashboard/finance/accounts-receivable", label: "Contas a receber" };
  }
  if (pathname.startsWith("/dashboard/finance/accounts-receivable")) {
    return { href: "/dashboard/billing", label: "Ver faturamento" };
  }
  if (pathname.startsWith("/dashboard/finance/accounts-payable")) {
    return { href: "/dashboard/finance/cash-flow", label: "Ver fluxo de caixa" };
  }
  if (pathname.startsWith("/dashboard/finance/cash-flow")) {
    return { href: "/dashboard/finance/accounts-receivable", label: "Ver recebiveis" };
  }
  if (pathname.startsWith("/dashboard/finance/bank-accounts")) {
    return { href: "/dashboard/finance/cash-flow", label: "Ver fluxo de caixa" };
  }
  if (pathname.startsWith("/dashboard/finance/cost-centers")) {
    return { href: "/dashboard/finance/cash-flow", label: "Ver fluxo de caixa" };
  }
  if (pathname.startsWith("/dashboard/orders") || pathname.startsWith("/dashboard/dispatch") || pathname.startsWith("/dashboard/technicians")) {
    return { href: "/dashboard/orders", label: "Agenda técnica" };
  }
  if (pathname.startsWith("/dashboard/monitoring")) {
    return { href: "/dashboard/dispatch", label: "Abrir despacho" };
  }
  if (pathname.startsWith("/dashboard/suppliers")) {
    return { href: "/dashboard/suppliers/new", label: "Novo fornecedor" };
  }
  if (pathname.startsWith("/dashboard/catalog")) {
    return { href: "/dashboard/catalog/new", label: "Novo item" };
  }
  return null;
}

export default function TopBar({
  onExpandSidebar,
  canExpandSidebar = false,
  appearanceTheme,
  onChangeAppearanceTheme,
}: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState("Usuário");
  const [userRole, setUserRole] = useState("Operador");
  const [userRoleCode, setUserRoleCode] = useState("NORMAL");
  const [notificationSummary, setNotificationSummary] = useState({
    total: 0,
    actionRequired: 0,
    highPriority: 0,
  });

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }

    const payload = decodeJwtPayload<{ name?: string; email?: string; role?: string }>(token);
    if (!payload) {
      clearAuthSession();
      router.replace("/");
      return;
    }

    const roleMap: Record<string, string> = {
      ADMIN: "Administrador",
      SALES: "Comercial",
      TECHNICIAN: "Técnico",
      ENGINEER_APPLICATION: "Eng. Aplicação",
      LOGISTICS: "Logística",
      CLIENT: "Cliente",
      NORMAL: "Usuário",
    };
    setUserName(payload.name || payload.email || "Usuário");
    setUserRoleCode(payload.role || "NORMAL");
    setUserRole(roleMap[payload.role || ""] || payload.role || "Usuário");
  }, [router]);

  useEffect(() => {
    let active = true;

    async function loadNotifications() {
      try {
        const payload = await fetchDashboardNotificationInbox(12);
        if (!active) return;

        setNotificationSummary({
          total: payload.summary.total,
          actionRequired: payload.summary.actionRequired,
          highPriority: payload.summary.highPriority,
        });
      } catch (error: unknown) {
        if ((error as { status?: number })?.status === 401) {
          clearAuthSession();
          router.replace("/");
        }
      }
    }

    const handleRefresh = () => {
      if (document.visibilityState === "visible") {
        void loadNotifications();
      }
    };

    void loadNotifications();
    const intervalId = window.setInterval(() => {
      void loadNotifications();
    }, 60_000);

    window.addEventListener("focus", handleRefresh);
    document.addEventListener("visibilitychange", handleRefresh);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleRefresh);
      document.removeEventListener("visibilitychange", handleRefresh);
    };
  }, [router]);

  const heading = useMemo(() => {
    const matched = Object.keys(PAGE_TITLES)
      .sort((a, b) => b.length - a.length)
      .find((key) => pathname.startsWith(key));

    return matched ? PAGE_TITLES[matched] : PAGE_TITLES["/dashboard"];
  }, [pathname]);

  const routeFamily = useMemo(() => getRouteFamily(pathname), [pathname]);
  const quickAction = useMemo(
    () => getQuickAction(pathname, userRoleCode),
    [pathname, userRoleCode],
  );
  const isNotificationsPage = pathname.startsWith("/dashboard/notifications");
  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "short",
      }).format(new Date()),
    [],
  );

  const initials = userName.trim().charAt(0).toUpperCase() || "U";

  return (
    <header className="dashboard-topbar sticky top-0 z-20 border-b border-white/70 bg-white/80 shadow-[0_16px_32px_-24px_rgba(15,31,50,0.3)] backdrop-blur-xl">
      <div className="dashboard-container flex items-center justify-between gap-4 px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          {canExpandSidebar && (
            <button
              type="button"
              onClick={onExpandSidebar}
              className="dashboard-topbar-control hidden rounded-xl border border-slate-200 bg-white/90 px-2.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-white md:inline-flex"
              title="Expandir menu"
            >
              <span>&gt;</span>
            </button>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="dashboard-topbar-chip inline-flex rounded-full border border-slate-200 bg-slate-100/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-100">
                {routeFamily}
              </span>
            </div>
            <h2 className="mt-2 truncate text-base font-bold text-white md:text-lg">
              {heading.title}
            </h2>
            <p className="hidden max-w-2xl text-xs text-slate-200 md:block">
              {heading.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <div className="dashboard-topbar-chip hidden rounded-2xl border border-slate-200 bg-white/72 px-3 py-2 text-right shadow-sm md:block">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-200/80">
              Hoje
            </p>
            <p className="mt-1 text-sm font-semibold text-white">{todayLabel}</p>
          </div>

          <DashboardAppearanceControl
            themeId={appearanceTheme}
            onChange={onChangeAppearanceTheme}
          />

          <Link
            href="/dashboard/notifications"
            className={`dashboard-topbar-chip hidden items-center gap-3 rounded-2xl border px-3 py-2 shadow-sm transition hover:border-white/20 md:inline-flex ${
              isNotificationsPage ? "dashboard-accent-surface" : ""
            }`}
          >
            <div className="text-left">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-200/80">
                Alertas
              </p>
              <p className="mt-1 text-sm font-semibold text-white">
                {notificationSummary.highPriority > 0
                  ? "Prioridade alta"
                  : notificationSummary.actionRequired > 0
                    ? "Requer ação"
                    : "Tudo em dia"}
              </p>
            </div>
            <span
              className={`inline-flex min-w-8 items-center justify-center rounded-full px-2 py-1 text-xs font-bold ${
                isNotificationsPage
                  ? "bg-white/18 text-white"
                  : notificationSummary.highPriority > 0
                    ? "bg-rose-500/20 text-rose-100"
                    : "bg-white/10 text-white"
              }`}
            >
              {notificationSummary.actionRequired}
            </span>
          </Link>

          {quickAction ? (
            <Link
              href={quickAction.href}
              className="dashboard-topbar-primary hidden rounded-2xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white shadow-[0_18px_30px_-24px_rgba(15,31,50,0.8)] transition hover:bg-slate-800 md:inline-flex"
            >
              {quickAction.label}
            </Link>
          ) : null}

          <div className="dashboard-topbar-profile flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/88 px-2 py-1.5 shadow-sm">
            <div className="hidden text-right md:block">
              <p className="text-sm font-bold text-white">{userName}</p>
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-200/80">
                {userRole}
              </p>
            </div>
            <div className="dashboard-topbar-avatar flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-sm font-bold text-white">
              {initials}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
