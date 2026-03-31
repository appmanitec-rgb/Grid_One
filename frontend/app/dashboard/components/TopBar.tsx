"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
  "/dashboard": { title: "Gestao e Operacoes", subtitle: "KPIs executivos, pipeline comercial e execucao tecnica." },
  "/dashboard/opportunities": { title: "Funil de Vendas", subtitle: "Pipeline por fase, temperatura e previsao de receita." },
  "/dashboard/commercial-inspections": { title: "Vistorias Comerciais", subtitle: "Checklists tecnicos e midias para dimensionamento." },
  "/dashboard/proposals": { title: "Central de Propostas", subtitle: "Controle completo por fase e revisoes." },
  "/dashboard/orders": { title: "Centro de Ordens", subtitle: "Execucao tecnica com SLA e prioridade." },
  "/dashboard/contracts": { title: "Gestao de Contratos", subtitle: "Vigencia, SLA, faturamento e preventiva automatica." },
  "/dashboard/reports": { title: "Relatorios Gerenciais", subtitle: "Indicadores consolidados de performance e operacao." },
  "/dashboard/monitoring": { title: "Monitoramento Operacional", subtitle: "Telemetria, alertas, automacoes e resposta de campo." },
  "/dashboard/dispatch": { title: "Painel de Despacho", subtitle: "Agenda diaria/semanal com roteirizacao e prioridade operacional." },
  "/dashboard/technicians": { title: "Equipe de Tecnicos", subtitle: "Capacidade operacional, skills e certificacoes da equipe." },
  "/dashboard/sites": { title: "Locais e Obras", subtitle: "Mapa de instalacoes e ativos por local." },
  "/dashboard/inventory": { title: "Controle de Estoque", subtitle: "Inventario, rupturas e valorizacao." },
  "/dashboard/purchase-orders": { title: "Pedidos de Compra", subtitle: "Solicitacoes e acompanhamento de compras." },
  "/dashboard/finance/accounts-receivable": { title: "Contas a Receber", subtitle: "Recebimentos de contratos e ordens avulsas." },
  "/dashboard/finance/accounts-payable": { title: "Contas a Pagar", subtitle: "Despesas operacionais, folha e fornecedores." },
  "/dashboard/finance/cash-flow": { title: "Fluxo de Caixa", subtitle: "Previsao de saldo, entradas e saidas do dia." },
  "/dashboard/finance/bank-accounts": { title: "Contas Bancarias & Caixas", subtitle: "Consolidacao de saldos por banco e caixa interno." },
  "/dashboard/finance/cost-centers": { title: "Centros de Custo (DRE)", subtitle: "Margem por contrato, ativo e cliente." },
  "/dashboard/hr/collaborators": { title: "Colaboradores", subtitle: "Cadastro geral da equipe tecnica e administrativa." },
  "/dashboard/hr/epis-tools": { title: "EPIs e Ferramentas", subtitle: "Controle de entrega, responsabilidade e rastreabilidade." },
  "/dashboard/hr/time-tracking": { title: "Apontamento e Banco de Horas", subtitle: "Horas de campo, extras e sobreaviso." },
  "/dashboard/hr/commissions": { title: "Comissoes e Premiacao", subtitle: "Consolidado de variaveis do comercial e operacao." },
  "/dashboard/hr/fleet": { title: "Gestao de Frota", subtitle: "Veiculos, manutencao, multas e alocacao por tecnico." },
  "/dashboard/billing": { title: "Faturamento", subtitle: "Recebiveis de contratos e ordens de servico." },
  "/dashboard/costs": { title: "Custos de Operacao", subtitle: "Analise de custos tecnicos e margens." },
  "/dashboard/company-settings": { title: "Configuracoes da Empresa", subtitle: "Cadastros de empresas, CNPJs e identidade visual." },
  "/dashboard/profile": { title: "Meu Perfil", subtitle: "Dados pessoais e preferencias do usuario." },
  "/dashboard/clients": { title: "CRM de Clientes", subtitle: "Contatos, maquinas e historico consolidado." },
  "/dashboard/equipments": { title: "Parque de Equipamentos", subtitle: "Rastreio de ativos e manutencao." },
  "/dashboard/catalog": { title: "Inteligencia de Catalogo", subtitle: "Pecas, custos, margens e precificacao." },
  "/dashboard/suppliers": { title: "Rede de Fornecedores", subtitle: "Compras, SLA e condicoes comerciais." },
  "/dashboard/management/users": { title: "Area de Gestao (Admin)", subtitle: "Cadastros de usuarios, permissoes e governanca." },
  "/dashboard/management": { title: "Area de Gestao (Admin)", subtitle: "Cadastros de usuarios, permissoes e governanca." },
  "/dashboard/control": { title: "Area de Gestao (Admin)", subtitle: "Cadastros de usuarios, permissoes e governanca." },
  "/dashboard/automation": { title: "Central de Automacoes", subtitle: "Historico, saude e disparos manuais das rotinas agendadas." },
};

function getRouteFamily(pathname: string) {
  if (pathname.startsWith("/dashboard/finance")) return "Financeiro";
  if (pathname.startsWith("/dashboard/hr")) return "Pessoas";
  if (pathname.startsWith("/dashboard/catalog") || pathname.startsWith("/dashboard/suppliers") || pathname.startsWith("/dashboard/inventory") || pathname.startsWith("/dashboard/purchase-orders")) {
    return "Suprimentos";
  }
  if (pathname.startsWith("/dashboard/clients") || pathname.startsWith("/dashboard/opportunities") || pathname.startsWith("/dashboard/commercial-inspections") || pathname.startsWith("/dashboard/proposals") || pathname.startsWith("/dashboard/contracts")) {
    return "Comercial";
  }
  if (pathname.startsWith("/dashboard/orders") || pathname.startsWith("/dashboard/dispatch") || pathname.startsWith("/dashboard/technicians") || pathname.startsWith("/dashboard/monitoring") || pathname.startsWith("/dashboard/sites") || pathname.startsWith("/dashboard/equipments")) {
    return "Operacao";
  }
  if (pathname.startsWith("/dashboard/control") || pathname.startsWith("/dashboard/management") || pathname.startsWith("/dashboard/company-settings") || pathname.startsWith("/dashboard/profile") || pathname.startsWith("/dashboard/automation") || pathname.startsWith("/dashboard/reports")) {
    return "Gestao";
  }
  return "Painel";
}

function getQuickAction(pathname: string) {
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
    return { href: "/dashboard/orders", label: "Agenda tecnica" };
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
  const [userName, setUserName] = useState("Usuario");
  const [userRole, setUserRole] = useState("Operador");

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
      TECHNICIAN: "Tecnico",
      ENGINEER_APPLICATION: "Eng. Aplicacao",
      LOGISTICS: "Logistica",
      CLIENT: "Cliente",
      NORMAL: "Usuario",
    };
    setUserName(payload.name || payload.email || "Usuario");
    setUserRole(roleMap[payload.role || ""] || payload.role || "Usuario");
  }, [router]);

  const heading = useMemo(() => {
    const matched = Object.keys(PAGE_TITLES)
      .sort((a, b) => b.length - a.length)
      .find((key) => pathname.startsWith(key));

    return matched ? PAGE_TITLES[matched] : PAGE_TITLES["/dashboard"];
  }, [pathname]);

  const routeFamily = useMemo(() => getRouteFamily(pathname), [pathname]);
  const quickAction = useMemo(() => getQuickAction(pathname), [pathname]);
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
