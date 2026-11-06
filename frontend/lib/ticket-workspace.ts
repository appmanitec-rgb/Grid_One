import {
  ServiceTicket,
  TicketStatus,
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  formatTicketDate,
} from "./tickets";

export type TicketBucket =
  | "ALL"
  | "ACTIVE"
  | "NEW"
  | "UNASSIGNED"
  | "WAITING"
  | "OVERDUE"
  | "DUE_SOON"
  | "MINE";
export type TicketColumnKey =
  | "NEW"
  | "IN_PROGRESS"
  | "WAITING"
  | "SCHEDULED"
  | "ORDER"
  | "DONE";
export type TicketAssignee = { id: string; name: string };
export type TicketColumn = {
  key: TicketColumnKey;
  label: string;
  total: number;
  page: number;
  hasMore: boolean;
  items: ServiceTicket[];
};
export type TicketWorkspace = {
  items: ServiceTicket[];
  total: number;
  page: number;
  pageSize: number;
  summary: Partial<Record<TicketBucket, number>>;
  columns: TicketColumn[];
};
export const EDITABLE_TICKET_STATUSES: TicketStatus[] = [
  "OPEN",
  "TRIAGE",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "WAITING_INTERNAL",
  "SCHEDULED",
];
export const TICKET_ORIGIN_LABELS: Record<string, string> = {
  CUSTOMER_PORTAL: "Central do cliente",
  INTERNAL: "Equipe interna",
  PHONE: "Telefone",
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
  COMMERCIAL: "Comercial",
  MONITORING: "Monitoramento",
};
export const TICKET_BUCKET_LABELS: Record<TicketBucket, string> = {
  ALL: "Todos os chamados",
  ACTIVE: "Em aberto",
  NEW: "Sem atendimento",
  UNASSIGNED: "Sem responsável",
  WAITING: "Aguardando retorno",
  OVERDUE: "Prazo vencido",
  DUE_SOON: "Vencem em 24h",
  MINE: "Meus chamados",
};
export function isTicketActive(ticket: Pick<ServiceTicket, "status">) {
  return ![
    "CONVERTING_TO_ORDER",
    "CONVERTED_TO_ORDER",
    "RESOLVED",
    "CLOSED",
    "CANCELED",
  ].includes(ticket.status);
}
export function ticketSlaDisplay(ticket: ServiceTicket): {
  label: string;
  detail: string;
  dueAt?: string;
  tone: "blue" | "amber" | "rose" | "emerald" | "slate";
} {
  if (
    ticket.status === "CONVERTED_TO_ORDER" ||
    ticket.status === "CONVERTING_TO_ORDER"
  )
    return {
      label: "Encaminhado para O.S.",
      detail: "Acompanhe o prazo na ordem de serviço.",
      tone: "slate",
    };
  if (!isTicketActive(ticket))
    return {
      label: ticket.status === "CANCELED" ? "Cancelado" : "Finalizado",
      detail: "Atendimento concluído.",
      tone: ticket.status === "CANCELED" ? "slate" : "emerald",
    };
  const dates = [
    !ticket.firstResponseAt && ticket.slaResponseDueAt
      ? { value: ticket.slaResponseDueAt, name: "Resposta" }
      : null,
    !ticket.resolvedAt && ticket.slaResolutionDueAt
      ? { value: ticket.slaResolutionDueAt, name: "Solução" }
      : null,
  ]
    .filter(
      (item): item is { value: string; name: string } =>
        !!item && Number.isFinite(new Date(item.value).getTime()),
    )
    .sort((a, b) => new Date(a.value).getTime() - new Date(b.value).getTime());
  const next = dates[0];
  if (!next)
    return {
      label: "Sem prazo definido",
      detail: "Nenhum prazo pendente.",
      tone: "slate",
    };
  const remaining = new Date(next.value).getTime() - Date.now();
  return {
    label:
      remaining < 0
        ? "Prazo vencido"
        : remaining <= 3600000
          ? "Vence em breve"
          : "No prazo",
    detail: next.name + ": " + formatTicketDate(next.value),
    dueAt: next.value,
    tone: remaining < 0 ? "rose" : remaining <= 3600000 ? "amber" : "blue",
  };
}
export function ticketEventMessage(message: string) {
  const labels: Record<string, string> = {
    ...TICKET_STATUS_LABELS,
    ...TICKET_PRIORITY_LABELS,
    ...TICKET_ORIGIN_LABELS,
  };
  return message.replace(
    /\b[A-Z]+(?:_[A-Z]+)*\b/g,
    (value) => labels[value] || value,
  );
}
export function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[\s]*[=+@-]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}
