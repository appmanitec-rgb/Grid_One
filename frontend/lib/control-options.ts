import { apiFetch } from "@/lib/api";

export type ControlOption = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  sortOrder?: number | null;
  isActive?: boolean | null;
  isBlockedForNewClients?: boolean | null;
};

export type ControlOptionType =
  | "CATALOG_UNIT"
  | "CATALOG_BRAND"
  | "CATALOG_DOCUMENT_CATEGORY"
  | "STORAGE_LOCATION"
  | "SERVICE_TYPE"
  | "MAINTENANCE_TYPE"
  | "MAINTENANCE_TEMPLATE_CATEGORY"
  | "TICKET_CATEGORY"
  | "EQUIPMENT_APPLICATION"
  | "EQUIPMENT_OPERATION_MODE"
  | "HR_ASSET_CATEGORY"
  | "PAYMENT_TERM"
  | "BRAZIL_STATE";

export async function loadControlOptions(
  types: ControlOptionType[],
): Promise<Record<ControlOptionType, ControlOption[]>> {
  const entries = await Promise.all(
    types.map(async (type) => {
      const response = await apiFetch(`/studio/control-options/${type}`, {
        cache: "no-store",
      });
      if (!response.ok) return [type, []] as const;
      const payload = await response.json();
      return [
        type,
        Array.isArray(payload)
          ? payload.filter((option) => option?.isActive !== false)
          : [],
      ] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<
    ControlOptionType,
    ControlOption[]
  >;
}

export function optionLabel(option: ControlOption) {
  return option.code ? `${option.code} - ${option.name}` : option.name;
}
