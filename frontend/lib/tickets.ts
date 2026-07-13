import { apiFetch, readApiErrorMessage } from "./api";
import { customerPortalGet, customerPortalPost } from "./customer-portal";

export type TicketStatus =
  | "OPEN"
  | "TRIAGE"
  | "WAITING_CUSTOMER"
  | "WAITING_INTERNAL"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "CONVERTING_TO_ORDER"
  | "CONVERTED_TO_ORDER"
  | "RESOLVED"
  | "CLOSED"
  | "CANCELED";

export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type TicketCategory =
  | "CORRECTIVE_MAINTENANCE"
  | "PREVENTIVE_REQUEST"
  | "EMERGENCY"
  | "QUOTE_REQUEST"
  | "DOCUMENT_REQUEST"
  | "FINANCIAL"
  | "CONTRACT"
  | "TECHNICAL_SUPPORT"
  | "OTHER";

export type ServiceTicket = {
  id: string;
  code: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  origin: string;
  createdAt: string;
  updatedAt: string;
  slaResponseDueAt?: string | null;
  slaResolutionDueAt?: string | null;
  firstResponseAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  canceledAt?: string | null;
  isResponseOverdue?: boolean;
  isResolutionOverdue?: boolean;
  slaStatus?: "OK" | "WARNING" | "OVERDUE";
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  internalNotes?: string | null;
  client?: {
    id: string;
    companyName: string;
    tradeName?: string | null;
    phone?: string | null;
  };
  generator?: {
    id: string;
    name?: string | null;
    serialNumber?: string | null;
    brand?: string | null;
  } | null;
  site?: { id: string; name?: string | null; code?: string | null } | null;
  contract?: {
    id: string;
    code: string;
    title?: string | null;
    status?: string;
    responseTimeHours?: number | null;
  } | null;
  maintenanceOrder?: {
    id: string;
    title: string;
    status: string;
    scheduledTo?: string | null;
    finishedAt?: string | null;
  } | null;
  assignedToUser?: {
    id: string;
    name: string;
    email?: string | null;
    role?: string | null;
  } | null;
  technician?: {
    id: string;
    user?: { id?: string; name?: string | null; email?: string | null } | null;
  } | null;
  comments?: TicketComment[];
};

export type TicketComment = {
  id: string;
  message: string;
  authorType: "INTERNAL" | "CUSTOMER" | "SYSTEM";
  customerVisible: boolean;
  createdAt: string;
  authorUser?: { id: string; name: string; role?: string | null } | null;
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Aberto",
  TRIAGE: "Triagem",
  WAITING_CUSTOMER: "Aguardando cliente",
  WAITING_INTERNAL: "Aguardando equipe",
  SCHEDULED: "Agendado",
  IN_PROGRESS: "Em atendimento",
  CONVERTING_TO_ORDER: "Convertendo em OS",
  CONVERTED_TO_ORDER: "Convertido em OS",
  RESOLVED: "Resolvido",
  CLOSED: "Fechado",
  CANCELED: "Cancelado",
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: "Baixa",
  MEDIUM: "Media",
  HIGH: "Alta",
  CRITICAL: "Critica",
};

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  CORRECTIVE_MAINTENANCE: "Manutencao corretiva",
  PREVENTIVE_REQUEST: "Solicitacao preventiva",
  EMERGENCY: "Emergencia",
  QUOTE_REQUEST: "Cotacao",
  DOCUMENT_REQUEST: "Documento",
  FINANCIAL: "Financeiro",
  CONTRACT: "Contrato",
  TECHNICAL_SUPPORT: "Suporte tecnico",
  OTHER: "Outro",
};

export async function ticketsGet<T>(path = "") {
  const response = await apiFetch(`/tickets${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, "Falha ao carregar chamados."),
    );
  }
  return (await response.json()) as T;
}

export async function ticketsPost<T>(path: string, body: unknown) {
  const response = await apiFetch(`/tickets${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, "Falha ao executar acao do chamado."),
    );
  }
  return (await response.json()) as T;
}

export async function ticketsPatch<T>(path: string, body: unknown) {
  const response = await apiFetch(`/tickets${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, "Falha ao atualizar chamado."),
    );
  }
  return (await response.json()) as T;
}

export function portalTicketsGet<T>(path = "") {
  return customerPortalGet<T>(`/tickets${path}`);
}

export function portalTicketsPost<T>(path: string, body: unknown) {
  return customerPortalPost<T>(`/tickets${path}`, body);
}

export function formatTicketDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function ticketTone(
  ticket: Pick<ServiceTicket, "slaStatus" | "priority" | "status">,
) {
  if (ticket.status === "CANCELED") return "slate";
  if (ticket.slaStatus === "OVERDUE" || ticket.priority === "CRITICAL")
    return "rose";
  if (ticket.slaStatus === "WARNING" || ticket.priority === "HIGH")
    return "amber";
  if (ticket.status === "RESOLVED" || ticket.status === "CLOSED")
    return "emerald";
  return "blue";
}
