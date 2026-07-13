import { apiFetch, readApiErrorMessage } from "./api";
import { ServiceTicket } from "./tickets";

export type TechnicianWorkSession = {
  id: string;
  maintenanceOrderId: string;
  technicianId: string;
  userId: string;
  status: "OPEN" | "CLOSED" | "CANCELED";
  startedAt: string;
  finishedAt?: string | null;
  startLatitude?: number | null;
  startLongitude?: number | null;
  endLatitude?: number | null;
  endLongitude?: number | null;
  startNote?: string | null;
  endNote?: string | null;
  timeEntryId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TechnicianOrder = {
  id: string;
  title: string;
  description?: string | null;
  status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";
  type: string;
  priority?: string | null;
  scheduledTo?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  generator?: {
    id: string;
    name?: string | null;
    serialNumber?: string | null;
    brand?: string | null;
    client?: {
      id: string;
      companyName: string;
      tradeName?: string | null;
      phone?: string | null;
      contactName?: string | null;
    };
    currentSite?: {
      id: string;
      name?: string | null;
      address?: string | null;
      city?: string | null;
      state?: string | null;
    } | null;
  } | null;
  site?: {
    id: string;
    name?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
  } | null;
  contract?: {
    id: string;
    code: string;
    title?: string | null;
    status?: string;
  } | null;
  serviceReport?: {
    id: string;
    code: string;
    status: string;
    customerVisible: boolean;
    releasedToCustomerAt?: string | null;
  } | null;
  materials?: Array<{
    id: string;
    quantity: number;
    reservedAt?: string | null;
    appliedAt?: string | null;
    catalogItem?: { id: string; name: string; sku?: string | null };
    warehouse?: { id: string; code: string; name: string } | null;
  }>;
  workSessions?: TechnicianWorkSession[];
};

export type TechnicianDashboardPayload = {
  orders: TechnicianOrder[];
  tickets: ServiceTicket[];
};

export async function technicianGet<T>(path: string) {
  const response = await apiFetch(`/technician${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, "Falha ao carregar area tecnica."),
    );
  }
  return (await response.json()) as T;
}

export async function technicianPost<T>(path: string, body: unknown = {}) {
  const response = await apiFetch(`/technician${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, "Falha ao executar acao tecnica."),
    );
  }
  return (await response.json()) as T;
}

export function formatFieldDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function orderStatusLabel(status: TechnicianOrder["status"]) {
  const labels: Record<TechnicianOrder["status"], string> = {
    OPEN: "Aberta",
    IN_PROGRESS: "Em andamento",
    COMPLETED: "Concluida",
    CANCELED: "Cancelada",
  };
  return labels[status] ?? status;
}

export function hasOpenWorkSession(order?: Pick<TechnicianOrder, "workSessions">) {
  return Boolean(order?.workSessions?.some((session) => session.status === "OPEN"));
}
