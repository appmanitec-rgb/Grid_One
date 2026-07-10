import { apiFetch, apiUrl, readApiErrorMessage } from "./api";

export type DashboardNotificationTone =
  | "blue"
  | "emerald"
  | "amber"
  | "rose"
  | "slate";

export type DashboardNotificationPriority = "high" | "medium" | "low";

export type DashboardNotificationCategory =
  | "approval"
  | "proposal"
  | "contract"
  | "order"
  | "finance"
  | "update";

export type DashboardNotificationItem = {
  id: string;
  category: DashboardNotificationCategory;
  title: string;
  message: string;
  createdAt: string;
  href: string;
  entityType: string;
  entityId: string;
  tone: DashboardNotificationTone;
  priority: DashboardNotificationPriority;
  statusLabel?: string;
  actionLabel?: string;
};

export type DashboardNotificationSummary = {
  total: number;
  actionRequired: number;
  highPriority: number;
  byCategory: Record<DashboardNotificationCategory, number>;
};

export type DashboardNotificationInbox = {
  userRole: string;
  summary: DashboardNotificationSummary;
  items: DashboardNotificationItem[];
};

export type DashboardNotificationApiError = Error & {
  status?: number;
};

export async function fetchDashboardNotificationInbox(limit = 24) {
  const response = await apiFetch(apiUrl(`/notifications/inbox?limit=${limit}`), {
    cache: "no-store",
  });

  if (!response.ok) {
    const error = new Error(
      await readApiErrorMessage(
        response,
        "Nao foi possivel carregar as notificacoes.",
      ),
    ) as DashboardNotificationApiError;
    error.status = response.status;
    throw error;
  }

  return (await response.json()) as DashboardNotificationInbox;
}

export function labelDashboardNotificationCategory(
  category: DashboardNotificationCategory,
) {
  const labels: Record<DashboardNotificationCategory, string> = {
    approval: "Aprovacao",
    proposal: "Proposta",
    contract: "Contrato",
    order: "Ordem",
    finance: "Financeiro",
    update: "Atualizacao",
  };

  return labels[category];
}

export function labelDashboardNotificationPriority(
  priority: DashboardNotificationPriority,
) {
  const labels: Record<DashboardNotificationPriority, string> = {
    high: "Alta",
    medium: "Media",
    low: "Baixa",
  };

  return labels[priority];
}
