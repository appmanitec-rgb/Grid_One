export type NavItem = {
  key: string;
  label: string;
  href?: string;
  enabled?: boolean;
  soon?: boolean;
  group?: string;
  keywords?: string;
  badgeKey?:
    | "proposalsQueue"
    | "ordersOpen"
    | "contractsAttention"
    | "teamUnread";
};
export type NavSection = {
  id: string;
  title: string;
  description?: string;
  icon:
    | "overview"
    | "crm"
    | "ops"
    | "assets"
    | "stock"
    | "finance"
    | "people"
    | "hr"
    | "studio"
    | "contracts"
    | "planning"
    | "warehouse"
    | "admin";
  items: NavItem[];
};

export const MAIN_SECTIONS: NavSection[] = [
  {
    id: "overview",
    title: "Meu espaço",
    icon: "overview",
    description: "Sua rotina, equipe e documentos",
    items: [
      {
        key: "overview_dash",
        label: "Meu painel",
        href: "/dashboard",
        enabled: true,
        group: "Dia a dia",
      },
      {
        key: "overview_team",
        label: "Equipe e mensagens",
        href: "/dashboard/team",
        enabled: true,
        badgeKey: "teamUnread",
        group: "Dia a dia",
      },
      {
        key: "overview_alerts",
        label: "Notificações",
        href: "/dashboard/notifications",
        enabled: true,
        group: "Dia a dia",
      },
      {
        key: "overview_documents",
        label: "Documentos",
        href: "/dashboard/documents",
        enabled: true,
        group: "Documentos e análises",
      },
      {
        key: "overview_deliveries",
        label: "Envios de documentos",
        href: "/dashboard/deliveries",
        enabled: true,
        group: "Documentos e análises",
      },
      {
        key: "overview_reports",
        label: "Relatórios",
        href: "/dashboard/reports",
        enabled: true,
        group: "Documentos e análises",
      },
    ],
  },
  {
    id: "crm",
    title: "Comercial",
    icon: "crm",
    description: "Da oportunidade ao pedido de venda",
    items: [
      {
        key: "crm_funnel",
        label: "Oportunidades",
        href: "/dashboard/opportunities",
        enabled: true,
        group: "Vendas",
      },
      {
        key: "crm_surveys",
        label: "Vistorias comerciais",
        href: "/dashboard/commercial-inspections",
        enabled: true,
        group: "Vendas",
      },
      {
        key: "crm_proposals",
        label: "Propostas",
        href: "/dashboard/proposals",
        enabled: true,
        badgeKey: "proposalsQueue",
        group: "Vendas",
      },
      {
        key: "stock_sales_orders",
        label: "Pedidos de venda",
        href: "/dashboard/sales-orders",
        enabled: true,
        group: "Vendas",
      },
      {
        key: "crm_clients",
        label: "Clientes",
        href: "/dashboard/clients",
        enabled: true,
        group: "Relacionamento",
      },
    ],
  },
  {
    id: "contracts",
    title: "Contratos",
    icon: "contracts",
    description: "Gestão da carteira e continuidade dos contratos",
    items: [
      {
        key: "crm_contracts",
        label: "Contratos",
        href: "/dashboard/contracts",
        enabled: true,
        badgeKey: "contractsAttention",
        group: "Carteira",
      },
      {
        key: "crm_contract_renewals",
        label: "Renovações",
        href: "/dashboard/contracts/renewals",
        enabled: true,
        badgeKey: "contractsAttention",
        group: "Carteira",
      },
    ],
  },
  {
    id: "planning",
    title: "Planejamento",
    icon: "planning",
    description: "Programação, equipe e logística",
    items: [
      {
        key: "ops_dispatch",
        label: "Agenda e programação",
        href: "/dashboard/dispatch",
        enabled: true,
        group: "Distribuição",
      },
      {
        key: "ops_team",
        label: "Equipe técnica",
        href: "/dashboard/technicians",
        enabled: true,
        group: "Distribuição",
      },
      {
        key: "ops_auvo",
        label: "Monitoramento de campo",
        href: "/dashboard/monitoring",
        enabled: true,
        group: "Acompanhamento e logística",
      },
      {
        key: "hr_fleet",
        label: "Frota e veículos",
        href: "/dashboard/hr/fleet",
        enabled: true,
        group: "Acompanhamento e logística",
      },
    ],
  },
  {
    id: "ops",
    title: "Operação",
    icon: "ops",
    description: "Do chamado ao atendimento concluído",
    items: [
      {
        key: "ops_tickets",
        keywords: "chamados tickets solicitacoes suporte",
        label: "Central de atendimento",
        href: "/dashboard/atendimento",
        enabled: true,
        group: "Atendimento e execução",
      },
      {
        key: "ops_orders",
        keywords: "OS O.S. ordem servico",
        label: "Ordens de serviço",
        href: "/dashboard/orders",
        enabled: true,
        badgeKey: "ordersOpen",
        group: "Atendimento e execução",
      },
      {
        key: "ops_field",
        label: "Portal do técnico",
        href: "/dashboard/tecnico",
        enabled: true,
        group: "Atendimento e execução",
      },
      {
        key: "ops_service_reports",
        label: "Laudos técnicos",
        href: "/dashboard/relatorios-tecnicos",
        enabled: true,
        group: "Atendimento e execução",
      },
      {
        key: "ops_downtimes",
        label: "Máquinas paradas",
        href: "/dashboard/operation/downtimes",
        enabled: true,
        group: "Ocorrências",
      },
      {
        key: "ops_warranties",
        label: "Garantias",
        href: "/dashboard/operation/warranties",
        enabled: true,
        group: "Ocorrências",
      },
    ],
  },
  {
    id: "assets",
    title: "Ativos",
    icon: "assets",
    description: "Equipamentos, modelos e locais de instalação",
    items: [
      {
        key: "assets_generators",
        label: "Equipamentos",
        href: "/dashboard/equipments",
        enabled: true,
        group: "Parque instalado",
      },
      {
        key: "assets_models",
        label: "Modelos",
        href: "/dashboard/equipments/models",
        enabled: true,
        group: "Parque instalado",
      },
      {
        key: "assets_sites",
        label: "Locais",
        href: "/dashboard/sites",
        enabled: true,
        group: "Parque instalado",
      },
    ],
  },
  {
    id: "supplies",
    title: "Suprimentos",
    icon: "stock",
    description: "Necessidade, cotação e compra",
    items: [
      {
        key: "purchaseRequests",
        label: "Solicitações de compra",
        href: "/dashboard/purchase-orders/requests",
        enabled: true,
        group: "Processo de compra",
      },
      {
        key: "purchaseQuotations",
        label: "Cotações e comparativo",
        href: "/dashboard/purchase-orders/quotations",
        enabled: true,
        group: "Processo de compra",
      },
      {
        key: "purchasingApprovals",
        label: "Aprovações de compras",
        href: "/dashboard/purchase-orders/approvals",
        enabled: true,
        group: "Processo de compra",
      },
      {
        key: "stock_purchase",
        label: "Pedidos de compra",
        href: "/dashboard/purchase-orders",
        enabled: true,
        group: "Processo de compra",
      },
      {
        key: "stock_suppliers",
        label: "Fornecedores",
        href: "/dashboard/suppliers",
        enabled: true,
        group: "Fornecedores e regras",
      },
      {
        key: "purchasingSettings",
        label: "Regras de compras",
        href: "/dashboard/purchase-orders/settings",
        enabled: true,
        group: "Fornecedores e regras",
      },
    ],
  },
  {
    id: "warehouse",
    title: "Almoxarifado",
    icon: "warehouse",
    description: "Receber, armazenar, separar e repor",
    items: [
      {
        key: "warehouse_operations",
        label: "Recebimento e separação",
        href: "/dashboard/inventory/operations",
        enabled: true,
        keywords: "almoxarifado materiais validade lotes entradas os",
        group: "Rotina do almoxarifado",
      },
      {
        key: "stock_inventory",
        label: "Estoque e reposição",
        href: "/dashboard/inventory",
        enabled: true,
        group: "Rotina do almoxarifado",
      },
      {
        key: "stock_catalog",
        label: "Peças e serviços",
        href: "/dashboard/catalog",
        enabled: true,
        group: "Cadastro de materiais",
      },
    ],
  },
  {
    id: "finance",
    title: "Financeiro",
    icon: "finance",
    description: "Faturamento, pagamentos e controle financeiro",
    items: [
      {
        key: "finance_billing",
        label: "Faturamento",
        href: "/dashboard/billing",
        enabled: true,
        group: "Contas e faturamento",
      },
      {
        key: "finance_receivable",
        label: "Contas a Receber",
        href: "/dashboard/finance/accounts-receivable",
        enabled: true,
        group: "Contas e faturamento",
      },
      {
        key: "finance_payable",
        label: "Contas a Pagar",
        href: "/dashboard/finance/accounts-payable",
        enabled: true,
        group: "Contas e faturamento",
      },
      {
        key: "finance_collections",
        label: "Cobrança e boletos",
        href: "/dashboard/finance/collections",
        enabled: true,
        group: "Contas e faturamento",
      },
      {
        key: "finance_fiscal_documents",
        label: "Notas Fiscais",
        href: "/dashboard/finance/fiscal-documents",
        enabled: true,
        group: "Contas e faturamento",
      },
      {
        key: "finance_cashflow",
        label: "Fluxo de Caixa",
        href: "/dashboard/finance/cash-flow",
        enabled: true,
        group: "Tesouraria",
      },
      {
        key: "finance_statement",
        label: "Movimentações bancárias",
        href: "/dashboard/finance/bank-movements",
        enabled: true,
        group: "Tesouraria",
      },
      {
        key: "finance_reconciliation",
        label: "Conciliação Bancária",
        href: "/dashboard/finance/reconciliation",
        enabled: true,
        group: "Tesouraria",
      },
      {
        key: "finance_banks",
        label: "Contas bancárias e caixas",
        href: "/dashboard/finance/bank-accounts",
        enabled: true,
        group: "Tesouraria",
      },
      {
        key: "finance_dre",
        label: "Centros de custo",
        href: "/dashboard/finance/cost-centers",
        enabled: true,
        group: "Gestão de custos",
      },
      {
        key: "finance_costs",
        label: "Custos operacionais",
        href: "/dashboard/costs",
        enabled: true,
        group: "Gestão de custos",
      },
    ],
  },
  {
    id: "hr",
    title: "Recursos Humanos",
    icon: "hr",
    description: "Pessoas, documentação e jornada",
    items: [
      {
        key: "hr_collaborators",
        label: "Colaboradores",
        href: "/dashboard/hr/collaborators",
        enabled: true,
        group: "Pessoas e conformidade",
      },
      {
        key: "hr_documentation",
        label: "Documentos e certificações",
        href: "/dashboard/hr/documentation",
        enabled: true,
        group: "Pessoas e conformidade",
      },
      {
        key: "hr_epi_tools",
        label: "EPIs e ferramentas",
        href: "/dashboard/hr/epis-tools",
        enabled: true,
        group: "Pessoas e conformidade",
      },
      {
        key: "hr_timesheet",
        label: "Apontamentos e banco de horas",
        href: "/dashboard/hr/time-tracking",
        enabled: true,
        group: "Jornada e remuneração",
      },
      {
        key: "hr_commissions",
        label: "Comissões",
        href: "/dashboard/hr/commissions",
        enabled: true,
        group: "Jornada e remuneração",
      },
      {
        key: "overview_management",
        label: "Usuários e permissões",
        href: "/dashboard/management/users",
        enabled: true,
        group: "Segurança de acesso",
      },
    ],
  },
  {
    id: "admin",
    title: "Administração",
    icon: "admin",
    description: "Configurações da empresa e rotinas automáticas",
    items: [
      {
        key: "overview_company",
        label: "Empresa",
        href: "/dashboard/company-settings",
        enabled: true,
        group: "Configurações",
      },
      {
        key: "overview_automation",
        label: "Automação",
        href: "/dashboard/automation",
        enabled: true,
        group: "Configurações",
      },
    ],
  },
  {
    id: "studio",
    title: "Manitec Studio",
    icon: "studio",
    description: "Dados, documentos e auditoria",
    items: [
      {
        key: "studio_data",
        label: "Dados",
        href: "/dashboard/developer/data",
        enabled: true,
        group: "Ferramentas",
      },
      {
        key: "studio_document_editor",
        label: "Editor de documentos",
        href: "/dashboard/developer/document-editor",
        enabled: true,
        group: "Ferramentas",
      },
      {
        key: "studio_history",
        label: "Histórico e auditoria",
        href: "/dashboard/developer/history",
        enabled: true,
        group: "Auditoria e uso",
      },
      {
        key: "studio_utilization",
        label: "Utilização",
        href: "/dashboard/developer/utilization",
        enabled: true,
        group: "Auditoria e uso",
      },
    ],
  },
];

export function navigationSearchKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}
const cleanPath = (value: string) => value.split(/[?#]/)[0].replace(/\/$/, "");
export function navigationContext(
  pathname: string,
  sections: NavSection[] = MAIN_SECTIONS,
) {
  const path = cleanPath(pathname);
  const matches = sections.flatMap((section) =>
    section.items
      .filter(
        (item) =>
          item.href &&
          (path === cleanPath(item.href) ||
            (item.href != "/dashboard" &&
              path.startsWith(cleanPath(item.href) + "/"))),
      )
      .map((item) => ({ section, item })),
  );
  return matches.sort(
    (a, b) => (b.item.href?.length || 0) - (a.item.href?.length || 0),
  )[0];
}
export function isNavigationItemActive(pathname: string, href?: string) {
  return !!href && navigationContext(pathname)?.item.href === href;
}
export function searchNavigation(
  sections: NavSection[],
  query: string,
  limit = 10,
) {
  const terms = navigationSearchKey(query).split(/\s+/).filter(Boolean);
  const matches = sections.flatMap((section) =>
    section.items
      .filter((item) =>
        terms.every((term) =>
          navigationSearchKey(
            [
              section.title,
              section.description,
              section.id === "hr" ? "RH" : section.id,
              item.group,
              item.label,
              item.keywords,
            ]
              .filter(Boolean)
              .join(" "),
          ).includes(term),
        ),
      )
      .map((item) => ({ section, item })),
  );
  return {
    total: matches.length,
    items: matches.slice(0, Math.min(10, Math.max(0, limit))),
  };
}
