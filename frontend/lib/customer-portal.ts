import { apiFetch, readApiErrorMessage } from "./api";

export type PortalClient = {
  id: string;
  companyName: string;
  tradeName?: string | null;
  email?: string | null;
  phone?: string | null;
  contactName?: string | null;
  city?: string | null;
  state?: string | null;
  isDelinquent?: boolean;
};

export type PortalDashboard = {
  client: PortalClient;
  stats: {
    equipmentCount: number;
    awaitingProposals: number;
    openOrders: number;
    openQuoteRequests: number;
    activeContracts: number;
    openTickets?: number;
    waitingCustomerTickets?: number;
    convertedTickets?: number;
    recentDocuments: number;
  };
  recentOrders: PortalOrder[];
  recentProposals: PortalProposal[];
  recentDocuments: PortalDocument[];
  upcomingPreventives: Array<{
    id: string;
    scheduledDate: string;
    status: string;
    generator: { id: string; name: string; serialNumber?: string | null };
    contract?: { id: string; code: string; title?: string | null } | null;
  }>;
};

export type PortalEquipment = {
  id: string;
  name: string;
  brand: string;
  serialNumber?: string | null;
  power: number;
  hourMeter?: number | null;
  condition?: string | null;
  application?: string | null;
  voltage?: string | null;
  operationalStatus: string;
  lifecycleStatus: string;
  criticality: string;
  model?: { id: string; name: string; brand?: string | null } | null;
  currentSite?: { id: string; name: string; code?: string | null } | null;
  lastOrder?: PortalOrder | null;
  nextPreventive?: { id: string; scheduledDate: string; status: string } | null;
  orders?: PortalOrder[];
  contractSchedules?: Array<{
    id: string;
    scheduledDate: string;
    status: string;
    contract?: { id: string; code: string; title?: string | null } | null;
  }>;
};

export type PortalProposal = {
  id: string;
  code: string;
  status: string;
  type: string;
  totalValue: number;
  validUntil?: string | null;
  scope?: string | null;
  freight?: string | null;
  paymentTerm?: string | null;
  paymentDetails?: string | null;
  deliveryLeadTimeDays?: number | null;
  externalNotes?: string | null;
  customerDecisionAt?: string | null;
  customerDecisionSource?: string | null;
  customerDecisionNote?: string | null;
  generator?: {
    id: string;
    name: string;
    serialNumber?: string | null;
    brand?: string | null;
    power?: number | null;
  } | null;
  generatedContract?: {
    id: string;
    code: string;
    title?: string | null;
    status: string;
  } | null;
  items?: Array<{
    id: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    catalogItem: {
      id: string;
      sku?: string | null;
      name: string;
      commercialDescription?: string | null;
      unit?: string | null;
      type: string;
    };
  }>;
  movements?: Array<{
    id: string;
    action: string;
    note?: string | null;
    fromStatus?: string | null;
    toStatus: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type PortalOrder = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  type: string;
  priority: string;
  customerReport?: string | null;
  customerSignatureUrl?: string | null;
  scheduledTo?: string | null;
  openedAt: string;
  closedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  generator?: {
    id: string;
    name: string;
    serialNumber?: string | null;
    brand?: string | null;
    power?: number | null;
  };
  site?: { id: string; name: string; code?: string | null } | null;
  technician?: { user?: { id: string; name: string } | null } | null;
  contract?: {
    id: string;
    code: string;
    title?: string | null;
    status: string;
  } | null;
  updatedAt: string;
};

export type PortalDocument = {
  id: string;
  documentType: string;
  documentId: string;
  documentCode?: string | null;
  documentTitle?: string | null;
  channel: string;
  status: string;
  recipientName?: string | null;
  subject?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
};

export type PortalFinancialEntry = {
  id: string;
  description: string;
  dueDate: string;
  grossAmount: number;
  netAmount: number;
  paidAmount: number;
  status: string;
  contract?: { id: string; code: string; title?: string | null } | null;
  maintenanceOrder?: { id: string; title: string; status: string } | null;
};

export type PortalQuoteRequest = {
  id: string;
  title: string;
  stage: string;
  temperature: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  site?: { id: string; name: string } | null;
};

export async function customerPortalGet<T>(path: string) {
  const response = await apiFetch(`/customer-portal${path}`);
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, "Falha ao carregar o portal."),
    );
  }
  return (await response.json()) as T;
}

export async function customerPortalPost<T>(path: string, body: unknown) {
  const response = await apiFetch(`/customer-portal${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, "Falha ao enviar dados."),
    );
  }
  return (await response.json()) as T;
}

export async function customerPortalGetBlob(path: string) {
  const response = await apiFetch(`/customer-portal${path}`);
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, "Falha ao baixar arquivo."),
    );
  }
  return response.blob();
}

export function downloadPortalBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function formatPortalCurrency(value?: number | null) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

export function formatPortalDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(new Date(value));
}

export function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    CLIENT_REVIEW: "Aguardando decisao",
    WON: "Aprovada",
    LOST: "Recusada",
    DRAFT: "Rascunho",
    BOARD_REVIEW: "Em analise",
    OPEN: "Aberta",
    IN_PROGRESS: "Em andamento",
    COMPLETED: "Concluida",
    CANCELED: "Cancelada",
    ACTIVE: "Ativo",
    PENDING: "Pendente",
    OVERDUE: "Vencido",
    PAID: "Pago",
    PROSPECTION: "Nova",
    SITE_SURVEY_SCHEDULED: "Vistoria",
    PROPOSAL_SENT: "Proposta",
    NEGOTIATION: "Negociacao",
  };
  return status ? labels[status] || status : "-";
}
