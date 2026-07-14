import { apiFetch, apiUrl, readApiErrorMessage } from "./api";
import { customerPortalGet } from "./customer-portal";

export type ReportStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED"
  | "RELEASED_TO_CUSTOMER"
  | "CANCELED";

export type ChecklistResult = "OK" | "NOT_OK" | "NOT_APPLICABLE" | "PENDING";

export type EvidenceType =
  | "PHOTO"
  | "VIDEO"
  | "DOCUMENT"
  | "MEASUREMENT"
  | "SIGNATURE"
  | "OTHER";

export type ServiceReportChecklistItem = {
  id?: string;
  label: string;
  result: ChecklistResult;
  required: boolean;
  notes?: string | null;
  sortOrder: number;
};

export type ServiceReportEvidence = {
  id: string;
  type: EvidenceType;
  title: string;
  description?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  checksumSha256?: string | null;
  storedAt?: string | null;
  storageKey?: string | null;
  hasStoredFile?: boolean;
  customerVisible: boolean;
  createdAt: string;
  uploadedByUser?: { id: string; name: string; email?: string | null } | null;
};

export type ServiceReportShareLink = {
  id: string;
  reportId: string;
  expiresAt: string;
  revokedAt?: string | null;
  allowPdfDownload: boolean;
  allowEvidenceDownload: boolean;
  accessCount: number;
  lastAccessedAt?: string | null;
  createdAt: string;
  shareUrl?: string;
  createdByUser?: { id: string; name: string; email?: string | null } | null;
};

export type ServiceReportAccessLog = {
  id: string;
  documentType: string;
  documentId?: string | null;
  documentDeliveryId?: string | null;
  serviceReportId?: string | null;
  evidenceId?: string | null;
  userId?: string | null;
  clientId?: string | null;
  shareLinkId?: string | null;
  accessType: "PDF_DOWNLOAD" | "EVIDENCE_DOWNLOAD" | "SHARE_OPEN" | "VERIFY";
  channel: "INTERNAL" | "CUSTOMER_PORTAL" | "PUBLIC_LINK" | "VERIFY";
  result: "SUCCESS" | "DENIED" | "EXPIRED" | "REVOKED" | "NOT_FOUND";
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email?: string | null;
    role?: string | null;
  } | null;
  client?: {
    id: string;
    companyName: string;
    tradeName?: string | null;
  } | null;
};

export type ServiceReport = {
  id: string;
  code: string;
  maintenanceOrderId: string;
  clientId: string;
  generatorId: string;
  siteId?: string | null;
  contractId?: string | null;
  technicianId?: string | null;
  status: ReportStatus;
  title: string;
  diagnosis: string;
  performedServices: string;
  recommendations?: string | null;
  observations?: string | null;
  safetyNotes?: string | null;
  customerNotes?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  signedAt?: string | null;
  signedByName?: string | null;
  signedByDocument?: string | null;
  signatureData?: string | null;
  signerRole?: string | null;
  signerEmail?: string | null;
  acceptanceText?: string | null;
  evidenceHash?: string | null;
  signatureHash?: string | null;
  signatureVersion?: number;
  customerVisible: boolean;
  releasedToCustomerAt?: string | null;
  retentionUntil?: string | null;
  legalHold?: boolean;
  revokedAt?: string | null;
  archivedAt?: string | null;
  customerAcceptedAt?: string | null;
  customerAcceptedByUserId?: string | null;
  customerAcceptanceText?: string | null;
  customerAcceptanceHash?: string | null;
  customerAcceptanceDocumentHash?: string | null;
  generatedDocumentId?: string | null;
  versionNumber?: number;
  documentHash?: string | null;
  validationUrl?: string | null;
  validationExpiresAt?: string | null;
  storageDriver?: string;
  maintenanceOrder?: {
    id: string;
    title: string;
    status: string;
    type?: string | null;
    priority?: string | null;
    openedAt?: string | null;
    finishedAt?: string | null;
  } | null;
  client?: {
    id: string;
    companyName: string;
    tradeName?: string | null;
  } | null;
  generator?: {
    id: string;
    name: string;
    serialNumber?: string | null;
    brand?: string | null;
    power?: number | null;
  } | null;
  site?: { id: string; name: string; code?: string | null } | null;
  contract?: {
    id: string;
    code: string;
    title?: string | null;
    status: string;
  } | null;
  technician?: {
    id: string;
    user?: { id: string; name: string; email?: string | null } | null;
  } | null;
  generatedDocument?: {
    id: string;
    documentType: string;
    documentCode?: string | null;
    documentTitle?: string | null;
    fileStorageKey?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    checksumSha256?: string | null;
    storedAt?: string | null;
    hasStoredFile?: boolean;
    createdAt?: string | null;
  } | null;
  checklistItems: ServiceReportChecklistItem[];
  evidences: ServiceReportEvidence[];
  createdAt: string;
  updatedAt: string;
};

export type MaintenanceOrderOption = {
  id: string;
  title: string;
  status: string;
  type?: string | null;
  generator?: {
    id: string;
    name: string;
    client?: {
      id: string;
      companyName: string;
      tradeName?: string | null;
    } | null;
  } | null;
  technician?: {
    id: string;
    user?: { id: string; name: string } | null;
  } | null;
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  DRAFT: "Rascunho",
  IN_REVIEW: "Em revisao",
  APPROVED: "Aprovado",
  RELEASED_TO_CUSTOMER: "Liberado ao cliente",
  CANCELED: "Cancelado",
};

export const CHECKLIST_RESULT_LABELS: Record<ChecklistResult, string> = {
  OK: "OK",
  NOT_OK: "Nao conforme",
  NOT_APPLICABLE: "Nao aplicavel",
  PENDING: "Pendente",
};

export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  PHOTO: "Foto",
  VIDEO: "Video",
  DOCUMENT: "Documento",
  MEASUREMENT: "Medicao",
  SIGNATURE: "Assinatura",
  OTHER: "Outro",
};

export async function serviceReportsGet<T>(path = "") {
  const response = await apiFetch(`/service-reports${path}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, "Falha ao carregar laudos."),
    );
  }
  return (await response.json()) as T;
}

export async function serviceReportsPost<T>(path: string, body: unknown = {}) {
  const response = await apiFetch(`/service-reports${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, "Falha ao salvar laudo."),
    );
  }
  return (await response.json()) as T;
}

export async function serviceReportsPostForm<T>(path: string, body: FormData) {
  const response = await apiFetch(`/service-reports${path}`, {
    method: "POST",
    body,
  });
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, "Falha ao enviar arquivo."),
    );
  }
  return (await response.json()) as T;
}

export async function serviceReportsGetText(path: string) {
  const response = await apiFetch(`/service-reports${path}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, "Falha ao abrir laudo."),
    );
  }
  return response.text();
}

export async function serviceReportsGetBlob(path: string) {
  const response = await apiFetch(`/service-reports${path}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, "Falha ao baixar arquivo."),
    );
  }
  return response.blob();
}

export async function serviceReportsPatch<T>(path: string, body: unknown) {
  const response = await apiFetch(`/service-reports${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, "Falha ao atualizar laudo."),
    );
  }
  return (await response.json()) as T;
}

export async function portalServiceReportsGet<T>(path = "") {
  return customerPortalGet<T>(`/service-reports${path}`);
}

export async function portalServiceReportsPost<T>(
  path: string,
  body: unknown = {},
) {
  const response = await apiFetch(`/customer-portal/service-reports${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, "Falha ao salvar aceite."),
    );
  }
  return (await response.json()) as T;
}

export async function portalServiceReportsGetText(path: string) {
  const response = await apiFetch(`/customer-portal/service-reports${path}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, "Falha ao abrir laudo."),
    );
  }
  return response.text();
}

export async function portalServiceReportsGetBlob(path: string) {
  const response = await apiFetch(`/customer-portal/service-reports${path}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, "Falha ao baixar arquivo."),
    );
  }
  return response.blob();
}

export async function publicServiceReportGet<T>(path: string) {
  const response = await fetch(apiUrl(`/public/service-reports${path}`), {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, "Link publico invalido."),
    );
  }
  return (await response.json()) as T;
}

export function openHtmlInNewWindow(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function formatServiceReportDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function reportStatusTone(status?: ReportStatus | null) {
  if (status === "RELEASED_TO_CUSTOMER") return "emerald";
  if (status === "APPROVED") return "blue";
  if (status === "CANCELED") return "rose";
  if (status === "IN_REVIEW") return "amber";
  return "slate";
}
