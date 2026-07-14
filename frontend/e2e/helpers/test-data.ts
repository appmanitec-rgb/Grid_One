export const APP_BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:3001";
export const API_BASE_URL = process.env.E2E_API_URL || "http://127.0.0.1:3000";
export const E2E_PASSWORD =
  process.env.E2E_DEMO_PASSWORD ||
  process.env.SEED_DEMO_PASSWORD ||
  "Demo@123456";
export const E2E_TOTP_SECRET =
  process.env.E2E_TOTP_SECRET || "JBSWY3DPEHPK3PXP";

export const PUBLIC_TOKENS = {
  shareValid: "e2e-service-report-share-valid",
  shareExpired: "e2e-service-report-share-expired",
  shareRevoked: "e2e-service-report-share-revoked",
  validation: "e2e-service-report-validation",
  invalid: "e2e-invalid-token",
};

export type E2eAccountKey =
  | "admin"
  | "manager"
  | "sales"
  | "operation"
  | "technician"
  | "finance"
  | "supplies"
  | "hr"
  | "auditor"
  | "clientA"
  | "clientB";

export type E2eAccount = {
  key: E2eAccountKey;
  email: string;
  password: string;
  internal: boolean;
  expectedStartPath: string;
};

export const accounts: Record<E2eAccountKey, E2eAccount> = {
  admin: {
    key: "admin",
    email: "admin.demo@manitec.local",
    password: E2E_PASSWORD,
    internal: true,
    expectedStartPath: "/dashboard",
  },
  manager: {
    key: "manager",
    email: "gestor.demo@manitec.local",
    password: E2E_PASSWORD,
    internal: true,
    expectedStartPath: "/dashboard",
  },
  sales: {
    key: "sales",
    email: "vendas.demo@manitec.local",
    password: E2E_PASSWORD,
    internal: true,
    expectedStartPath: "/dashboard",
  },
  operation: {
    key: "operation",
    email: "operacao.demo@manitec.local",
    password: E2E_PASSWORD,
    internal: true,
    expectedStartPath: "/dashboard",
  },
  technician: {
    key: "technician",
    email: "tecnico.demo@manitec.local",
    password: E2E_PASSWORD,
    internal: true,
    expectedStartPath: "/dashboard",
  },
  finance: {
    key: "finance",
    email: "financeiro.demo@manitec.local",
    password: E2E_PASSWORD,
    internal: true,
    expectedStartPath: "/dashboard",
  },
  supplies: {
    key: "supplies",
    email: "suprimentos.demo@manitec.local",
    password: E2E_PASSWORD,
    internal: true,
    expectedStartPath: "/dashboard",
  },
  hr: {
    key: "hr",
    email: "pessoas.demo@manitec.local",
    password: E2E_PASSWORD,
    internal: true,
    expectedStartPath: "/dashboard",
  },
  auditor: {
    key: "auditor",
    email: "auditor.demo@manitec.local",
    password: E2E_PASSWORD,
    internal: true,
    expectedStartPath: "/dashboard",
  },
  clientA: {
    key: "clientA",
    email: "cliente.a.demo@manitec.local",
    password: E2E_PASSWORD,
    internal: false,
    expectedStartPath: "/portal",
  },
  clientB: {
    key: "clientB",
    email: "cliente.b.demo@manitec.local",
    password: E2E_PASSWORD,
    internal: false,
    expectedStartPath: "/portal",
  },
};

export type E2eEntityData = {
  clientAEquipmentId: string;
  clientBEquipmentId: string;
  clientATicketId: string;
  clientBTicketId: string;
  technicianOrderId: string;
  otherTechnicianOrderId: string;
  serviceReportAId: string;
  serviceReportBId: string;
};

type EntityRow = Record<string, unknown>;

export function findEntityId(
  rows: EntityRow[],
  predicate: (row: EntityRow) => boolean,
  label: string,
) {
  const row = rows.find(predicate);
  const id = typeof row?.id === "string" ? row.id : "";
  if (!id) {
    throw new Error(`Dado E2E nao encontrado: ${label}`);
  }
  return id;
}
