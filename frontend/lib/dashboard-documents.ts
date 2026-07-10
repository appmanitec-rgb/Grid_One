import { apiFetch, apiUrl, readApiErrorMessage } from "./api";

export type DashboardDocumentState = "ready" | "attention" | "pending";
export type DashboardDocumentKind = "proposal" | "contract" | "order";
export type DashboardDocumentAudience = "shared" | "client" | "internal";

export type DashboardDocumentCompany = {
  companyName: string;
  tradeName: string;
  cnpj?: string | null;
  phone?: string | null;
  email?: string | null;
  billingEmail?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  logoUrl?: string | null;
  website?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
};

export type DashboardDocumentHubItem = {
  id: string;
  code: string;
  kind: DashboardDocumentKind;
  title: string;
  counterpart: string;
  status: string;
  statusLabel: string;
  documentState: DashboardDocumentState;
  updatedAt: string;
  href: string;
  sourceHref: string;
  audience: DashboardDocumentAudience;
  issues: string[];
};

export type DashboardDocumentsHub = {
  company: DashboardDocumentCompany;
  summary: {
    total: number;
    ready: number;
    attention: number;
    pending: number;
    shared: number;
    byKind: Record<DashboardDocumentKind, number>;
  };
  sections: {
    proposals: DashboardDocumentHubItem[];
    contracts: DashboardDocumentHubItem[];
    orders: DashboardDocumentHubItem[];
  };
};

export type ProposalDocumentPayload = {
  kind: "proposal";
  company: DashboardDocumentCompany;
  viewerRole: string;
  sourceHref: string;
  document: {
    id: string;
    code: string;
    status: string;
    statusLabel: string;
    type: string;
    totalValue: number;
    validUntil?: string | null;
    revision: number;
    issuedAt: string;
    scope?: string | null;
    freight?: string | null;
    paymentTerm?: string | null;
    deliveryLeadTimeDays?: number | null;
    paymentDetails?: string | null;
    hasDownPayment?: boolean | null;
    downPaymentAmount?: number | null;
    installmentCount?: number | null;
    installmentIntervalDays?: number | null;
    firstDueDate?: string | null;
    externalNotes?: string | null;
    generatedContract?: { id: string; code: string; status: string } | null;
  };
  client: {
    id: string;
    companyName: string;
    tradeName?: string | null;
    cnpj: string;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city: string;
    state: string;
  };
  generator?: {
    id: string;
    name: string;
    brand: string;
    serialNumber?: string | null;
    power: number;
    currentSite?: { id: string; name: string; code?: string | null } | null;
  } | null;
  seller?: { id: string; name: string; email: string } | null;
  salesOpportunity?: { id: string; title: string; stage: string } | null;
  related: {
    parentProposal?: { id: string; code: string } | null;
    revisions: Array<{
      id: string;
      code: string;
      status: string;
      createdAt: string;
      statusLabel: string;
    }>;
  };
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    catalogItem?: {
      id: string;
      name: string;
      sku?: string | null;
      unit?: string | null;
    } | null;
  }>;
};

export type ContractDocumentPayload = {
  kind: "contract";
  company: DashboardDocumentCompany;
  viewerRole: string;
  sourceHref: string;
  document: {
    id: string;
    code: string;
    title?: string | null;
    status: string;
    statusLabel: string;
    issuedAt: string;
    startDate: string;
    endDate: string;
    alertDays: number;
    preventiveRecurrence: string;
    responseTimeHours?: number | null;
    correctiveVisitAllowance?: number | null;
    partsCoverage: string;
    recurringAmount: number;
    dueDay: number;
    adjustmentIndex: string;
    adjustmentBaseMonth?: number | null;
    includesFuelManagement?: boolean | null;
    notes?: string | null;
  };
  client: {
    id: string;
    companyName: string;
    tradeName?: string | null;
    cnpj: string;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city: string;
    state: string;
    isDelinquent?: boolean | null;
  };
  sourceProposal?: { id: string; code: string; status: string } | null;
  createdByUser?: { id: string; name: string; email: string } | null;
  summary: {
    equipments: number;
    overdueInvoices: number;
    pendingInvoices: number;
  };
  equipments: Array<{
    id: string;
    coverageAmount?: number | null;
    generator: {
      id: string;
      name: string;
      serialNumber?: string | null;
      currentSite?: { id: string; name: string; code?: string | null } | null;
    };
  }>;
  invoices: Array<{
    id: string;
    dueDate: string;
    competenceDate: string;
    amount: number;
    status: string;
    statusLabel: string;
    paidAt?: string | null;
  }>;
};

export type OrderDocumentPayload = {
  kind: "order";
  company: DashboardDocumentCompany;
  viewerRole: string;
  sourceHref: string;
  document: {
    id: string;
    title: string;
    status: string;
    statusLabel: string;
    type: string;
    priority?: string | null;
    openedAt: string;
    scheduledTo?: string | null;
    startedAt?: string | null;
    pausedAt?: string | null;
    finishedAt?: string | null;
    laborHours?: number | null;
    hourMeterAfter?: number | null;
    description?: string | null;
    customerReport?: string | null;
    customerSignatureUrl?: string | null;
    auvoId?: string | null;
    auvoLink?: string | null;
  };
  client: {
    id: string;
    companyName: string;
    tradeName?: string | null;
    cnpj: string;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city: string;
    state: string;
  };
  generator: {
    id: string;
    name: string;
    brand: string;
    serialNumber?: string | null;
    currentSite?: { id: string; name: string; code?: string | null } | null;
  };
  site?: { id: string; name: string; code?: string | null } | null;
  contract?: { id: string; code: string; status: string } | null;
  technician?: {
    id: string;
    user?: {
      id: string;
      name: string;
      email: string;
      skillLevel?: string | null;
      department?: string | null;
      digitalSignatureUrl?: string | null;
    } | null;
  } | null;
  summary: {
    hasReport: boolean;
    hasSignature: boolean;
    materials: number;
    materialCost: number;
  };
  checklist: Array<{ label: string; value: string }>;
  materials: Array<{
    id: string;
    quantity: number;
    unitCost?: number | null;
    reservedAt?: string | null;
    warehouse?: { id: string; code?: string | null; name?: string | null } | null;
    catalogItem?: {
      id: string;
      name?: string | null;
      sku?: string | null;
      unit?: string | null;
    } | null;
  }>;
};

export type DashboardDocumentsApiError = Error & {
  status?: number;
};

async function readJsonOrThrow<T>(path: string) {
  const response = await apiFetch(apiUrl(path), {
    cache: "no-store",
  });

  if (!response.ok) {
    const error = new Error(
      await readApiErrorMessage(
        response,
        "Nao foi possivel carregar o documento.",
      ),
    ) as DashboardDocumentsApiError;
    error.status = response.status;
    throw error;
  }

  return (await response.json()) as T;
}

export function fetchDocumentsHub() {
  return readJsonOrThrow<DashboardDocumentsHub>("/documents/hub");
}

export function fetchProposalDocument(id: string) {
  return readJsonOrThrow<ProposalDocumentPayload>(`/documents/proposals/${id}`);
}

export function fetchContractDocument(id: string) {
  return readJsonOrThrow<ContractDocumentPayload>(`/documents/contracts/${id}`);
}

export function fetchOrderDocument(id: string) {
  return readJsonOrThrow<OrderDocumentPayload>(`/documents/orders/${id}`);
}

export function labelDocumentKind(kind: DashboardDocumentKind) {
  const labels: Record<DashboardDocumentKind, string> = {
    proposal: "Proposta",
    contract: "Contrato",
    order: "O.S.",
  };

  return labels[kind];
}

export function labelDocumentState(state: DashboardDocumentState) {
  const labels: Record<DashboardDocumentState, string> = {
    ready: "Pronto",
    attention: "Atencao",
    pending: "Pendente",
  };

  return labels[state];
}
