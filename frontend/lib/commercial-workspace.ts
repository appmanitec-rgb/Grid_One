import { apiFetch, readApiErrorMessage } from "./api";
export const PORTFOLIO_LABELS = {
  generators: "Geradores",
  partsServices: "Peças e serviços",
  contracts: "Contratos",
};
export type Portfolio = keyof typeof PORTFOLIO_LABELS;
export type ManagementRights = Record<
  "team" | "costs" | "margins" | "templates" | "publishTemplates",
  boolean
>;
export type CommercialCapabilities = {
  portfolios: Portfolio[];
  management: Partial<Record<Portfolio, ManagementRights>>;
  variables: string[];
};
export type EstimateInput = {
  portfolio: Portfolio;
  items: Array<{
    key: string;
    catalogItemId?: string;
    description?: string;
    quantity: number;
    revenue: number;
    unitCost?: number;
  }>;
  revenue: number;
  version?: number;
  sourceHash?: string;
  laborCost?: number;
  travelCost?: number;
  freightCost?: number;
  otherCost?: number;
};
export type CostEstimate = {
  version?: number;
  updatedAt?: string;
  stale?: boolean;
  complete: boolean;
  missing?: string[];
  estimatedCost?: number;
  contribution?: number | null;
  marginPercent?: number | null;
  note?: string;
  items?: Array<{
    key: string;
    description?: string;
    quantity: number;
    unitCost: number | null;
    source: string;
  }>;
  costs?: Record<string, number | null>;
};
export type Availability = {
  key: string;
  name: string;
  available: number | null;
  physical: number | null;
  reserved: number | null;
  requested: number;
  status:
    | "PLANNING_REQUIRED"
    | "UNCONFIRMED"
    | "AVAILABLE"
    | "PURCHASE_REQUIRED";
  note: string;
};
export type Template = {
  id: string;
  key: string;
  version: number;
  portfolio: Portfolio;
  category: string;
  name: string;
  subject: string | null;
  body: string;
  publishedAt: string | null;
};
export const TEMPLATE_LABELS: Record<string, string> = {
  EMAIL: "E-mail",
  NOTICE: "Aviso",
  REMINDER: "Lembrete",
  SERVICE_SCOPE: "Escopo de serviços",
  PARTS_SCOPE: "Escopo de peças",
  AUTOMATION: "Texto de automação",
};
export const COMMERCIAL_VARIABLES = [
  "cliente.nome",
  "vendedor.nome",
  "proposta.codigo",
  "proposta.total",
  "proposta.validade",
  "proposta.itens",
  "proposta.escopo",
  "equipamento.nome",
] as const;
export type CommercialValues = Partial<
  Record<(typeof COMMERCIAL_VARIABLES)[number], string>
>;
export function renderCommercialText(body: string, values: CommercialValues) {
  const tokens = [...body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((match) =>
    match[1].trim(),
  );
  if (
    tokens.some(
      (token) => !(COMMERCIAL_VARIABLES as readonly string[]).includes(token),
    ) ||
    /[{}]/.test(body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, ""))
  )
    throw new Error(
      "O modelo contém uma variável inválida. Solicite a revisão ao responsável.",
    );
  return body.replace(
    /\{\{\s*([^{}]+?)\s*\}\}/g,
    (_, key: string) =>
      values[key.trim() as keyof CommercialValues] || "Não informado",
  );
}
export async function commercialFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await apiFetch("/commercial" + path, {
    cache: "no-store",
    ...options,
  });
  if (!response.ok)
    throw new Error(
      await readApiErrorMessage(
        response,
        "Não foi possível carregar os dados comerciais.",
      ),
    );
  return response.json() as Promise<T>;
}
export function commercialPost<T>(path: string, body: unknown): Promise<T> {
  return commercialFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
