import { apiFetch, readApiErrorMessage } from "./api";

export type ScopeActivityDefinition = {
  id: string;
  text: string;
  auxiliary?: boolean;
  section?: { id: string; title: string; order?: number };
};
export type ScopeCompatibility = Record<string, string[]>;
export type ScopeFamilyDefinition = {
  kind?: "MATERIAL" | "SERVICE";
  description?: string;
  procedureCodes?: string[];
};
export type ScopeProcedureDefinition = {
  description?: string;
  category?: string;
  trigger?: "MATERIAL" | "SERVICE";
  section: { id: string; title: string; order?: number };
  activities: ScopeActivityDefinition[];
  dependsOnCodes?: string[];
  requiredServiceFamilyCodes?: string[];
  requiredMaterialFamilyCodes?: string[];
  compatibleEquipment?: ScopeCompatibility;
  requirements?: Array<{
    code: string;
    message: string;
    severity?: "warning" | "error" | "info";
    condition?:
      | "CLIENT_PENDING"
      | "COMMERCIAL_DEPENDENCY"
      | "SAFETY"
      | "EQUIPMENT";
  }>;
  operationalConditions?: Array<{
    code: string;
    text: string;
    status?: "PENDING" | "INCLUDED" | "EXCLUDED";
  }>;
  requiresOperationalAuthorization?: boolean;
  loadMode?: "INSTALLATION" | "LOAD_BANK";
};
export type ScopeFamily = {
  code: string;
  name: string;
  kind: "MATERIAL" | "SERVICE";
  isActive?: boolean;
  version?: number;
  definitionJson: ScopeFamilyDefinition;
};
export type ScopeProcedure = {
  code: string;
  name: string;
  category?: string;
  version?: number;
  isActive?: boolean;
  definitionJson: ScopeProcedureDefinition;
};
export type ScopeCatalogProfile = {
  catalogItemId: string;
  familyCodes: string[];
  procedureCodes?: string[];
  includedProcedureCodes?: string[];
  compatibility?: ScopeCompatibility;
  isActive?: boolean;
  version?: number;
  catalogItem?: {
    id: string;
    name: string;
    type?: string;
    sku?: string | null;
  };
};
export type TechnicalScopeLibrary = {
  families: ScopeFamily[];
  procedures: ScopeProcedure[];
  profiles: ScopeCatalogProfile[];
};
export type TechnicalScopeSourceItem = {
  key: string;
  kind: string;
  catalogItemId?: string | null;
  description?: string;
  quantity: number;
  hours?: number;
};
export type TechnicalServiceClassification = {
  sourceFacts?: string;
  sourceKey: string;
  procedureCodes?: string[];
  manualDescription?: string;
};
export type TechnicalScopeRequest = {
  technicalScopeClassifications?: TechnicalServiceClassification[];
  proposalId?: string;
  clientId?: string;
  generatorId?: string;
  type: string;
  items: TechnicalScopeSourceItem[];
};
export type TechnicalScopeReview = {
  sourceHash: string;
  libraryHash: string;
  reviewed: true;
};
export type TechnicalScopePreview = {
  engineVersion: string;
  sourceHash: string;
  libraryHash: string;
  generatedText: string;
  sections: Array<{
    id: string;
    title: string;
    activities: Array<{
      id: string;
      text: string;
      procedureCodes: string[];
      sourceKeys: string[];
      auxiliary?: boolean;
    }>;
  }>;
  alerts: Array<{
    code: string;
    severity: "warning" | "error" | "info";
    message: string;
    sourceKeys?: string[];
  }>;
  procedureOptions?: Array<{ code: string; name: string }>;
  canClassify?: boolean;
  sources: Array<
    TechnicalScopeSourceItem & {
      technical?: Omit<TechnicalServiceClassification, "sourceKey"> & {
        stale?: boolean;
      };
      classificationFacts?: string;
      familyCodes: string[];
      procedureCodes: string[];
    }
  >;
  procedures: Array<{
    code: string;
    name: string;
    version: number;
    sourceKeys: string[];
  }>;
  operationalConditions: Array<{
    code: string;
    text: string;
    status: "PENDING" | "INCLUDED" | "EXCLUDED";
    procedureCodes: string[];
    sourceKeys: string[];
  }>;
};

async function readScopeApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await apiFetch(path, { cache: "no-store", ...init });
  if (!response.ok)
    throw new Error(
      await readApiErrorMessage(
        response,
        "Não foi possível concluir a operação da biblioteca técnica.",
      ),
    );
  return response.json() as Promise<T>;
}
export async function fetchTechnicalScopeLibrary(
  signal?: AbortSignal,
): Promise<TechnicalScopeLibrary> {
  const raw = await readScopeApi<TechnicalScopeLibrary>(
    "/catalogs/technical-scope/library",
    { signal },
  );
  return {
    ...raw,
    families: raw.families.map((family) => ({
      ...family,
      kind: family.kind || family.definitionJson?.kind || "MATERIAL",
    })),
  };
}
export function previewTechnicalScope(
  request: TechnicalScopeRequest,
  signal?: AbortSignal,
) {
  return readScopeApi<TechnicalScopePreview>(
    "/proposals/technical-scope/preview",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    },
  );
}
function writeScopeApi(path: string, body: unknown) {
  return readScopeApi<unknown>("/catalogs/technical-scope" + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
export function saveScopeFamily(
  code: string,
  body: {
    name: string;
    kind: "MATERIAL" | "SERVICE";
    isActive: boolean;
    definitionJson: ScopeFamilyDefinition;
  },
) {
  return writeScopeApi("/families/" + encodeURIComponent(code), body);
}
export function saveScopeProcedure(
  code: string,
  body: {
    name: string;
    category?: string;
    isActive: boolean;
    definitionJson: ScopeProcedureDefinition;
  },
) {
  return writeScopeApi("/procedures/" + encodeURIComponent(code), body);
}
export function saveScopeCatalogProfile(
  catalogItemId: string,
  body: Omit<ScopeCatalogProfile, "catalogItemId" | "catalogItem" | "version">,
) {
  return writeScopeApi("/profiles/" + encodeURIComponent(catalogItemId), body);
}
export function installTechnicalScopeLibrary() {
  return readScopeApi<unknown>("/catalogs/technical-scope/seed", {
    method: "POST",
  });
}
export function technicalScopeRequestFingerprint(
  request: TechnicalScopeRequest,
) {
  return JSON.stringify({
    proposalId: request.proposalId || null,
    clientId: request.clientId || null,
    generatorId: request.generatorId || null,
    type: request.type,
    classifications: request.technicalScopeClassifications || [],
    items: request.items.map((item) => ({
      key: item.key,
      kind: item.kind,
      catalogItemId: item.catalogItemId || null,
      description: item.description || "",
      quantity: item.quantity,
      hours: item.hours ?? null,
    })),
  });
}
export function technicalScopeSnapshotMatchesRequest(
  snapshot: unknown,
  request: TechnicalScopeRequest,
): boolean {
  if (!snapshot || typeof snapshot !== "object") return true;
  const saved = (
    snapshot as {
      inputSnapshot?: {
        proposalType?: string;
        equipment?: { clientId?: string; generatorId?: string };
        items?: TechnicalScopeSourceItem[];
      };
    }
  ).inputSnapshot;
  if (!saved?.items) return true;
  const itemKey = (item: TechnicalScopeSourceItem) =>
    JSON.stringify([
      item.catalogItemId || null,
      item.catalogItemId
        ? "CATALOG"
        : item.kind === "HOURLY_SERVICE" || item.kind === "HOURLY"
          ? "HOURLY"
          : item.kind,
      item.catalogItemId ||
      item.kind === "HOURLY_SERVICE" ||
      item.kind === "HOURLY"
        ? ""
        : item.description?.trim() || "Item avulso",
      item.kind === "HOURLY_SERVICE" || item.kind === "HOURLY"
        ? item.hours
        : Math.max(1, Math.trunc(item.quantity)),
    ]);
  return (
    saved.proposalType === request.type &&
    (saved.equipment?.clientId || "") === (request.clientId || "") &&
    (saved.equipment?.generatorId || "") === (request.generatorId || "") &&
    JSON.stringify(saved.items.map(itemKey).sort()) ===
      JSON.stringify(request.items.map(itemKey).sort()) &&
    JSON.stringify(
      normalizedClassifications(storedTechnicalClassifications(snapshot)),
    ) ===
      JSON.stringify(
        normalizedClassifications(
          (request.technicalScopeClassifications || []).filter((row) =>
            saved.items?.some((item) => item.key === row.sourceKey),
          ),
        ),
      )
  );
}

function normalizedClassifications(rows: TechnicalServiceClassification[]) {
  return rows
    .map((row) => ({
      sourceKey: row.sourceKey,
      sourceFacts: row.sourceFacts || "",
      procedureCodes: [...(row.procedureCodes || [])].sort(),
      manualDescription: row.manualDescription?.trim() || "",
    }))
    .sort((a, b) => a.sourceKey.localeCompare(b.sourceKey));
}
export function storedTechnicalClassifications(
  snapshot: unknown,
): TechnicalServiceClassification[] {
  const items =
    (
      snapshot as {
        inputSnapshot?: {
          items?: Array<{
            key: string;
            technical?: Omit<TechnicalServiceClassification, "sourceKey">;
          }>;
        };
      } | null
    )?.inputSnapshot?.items || [];
  return items
    .filter((item) => item.technical)
    .map((item) => ({
      sourceKey: item.key,
      procedureCodes: item.technical?.procedureCodes || [],
      manualDescription: item.technical?.manualDescription || "",
      ...(item.technical?.sourceFacts
        ? { sourceFacts: item.technical.sourceFacts }
        : {}),
    }));
}

export function parseTechnicalObject(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value.trim() || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Informe um objeto JSON válido.");
  return parsed as Record<string, unknown>;
}
export function parseScopeCompatibility(value: string): ScopeCompatibility {
  const parsed = parseTechnicalObject(value);
  for (const entry of Object.values(parsed))
    if (
      !Array.isArray(entry) ||
      !entry.every((part: unknown) => typeof part === "string")
    )
      throw new Error(
        "Cada característica deve conter uma lista de valores em texto.",
      );
  return parsed as ScopeCompatibility;
}
