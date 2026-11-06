export type EquipmentBaseItem = {
  id: string;
  catalogItemId: string;
  serviceGroup: string;
  quantity: number;
  catalogItem?: {
    id: string;
    name: string;
    sku?: string | null;
    code?: string | null;
    type?: string | null;
    basePrice?: number | null;
  } | null;
};

export type EquipmentItemSet = {
  id: string;
  label: string;
  description: string;
  itemIds: string[];
};

const SET_DEFINITIONS: Record<
  string,
  Pick<EquipmentItemSet, "label" | "description">
> = {
  TOF: {
    label: "TOF - Filtros e óleo",
    description: "Filtros e óleo lubrificante cadastrados no equipamento.",
  },
  TM: {
    label: "TM - Mangueiras, abraçadeiras e aditivo",
    description:
      "Mangueiras, abraçadeiras e aditivo cadastrados no equipamento.",
  },
  TB: {
    label: "TB - Bateria",
    description:
      "Bateria cadastrada no equipamento, sem carregadores ou acessórios.",
  },
  TBC: {
    label: "TBC - bateria e carregador",
    description: "Itens vinculados ao grupo de bateria e carregador.",
  },
  ARREFECIMENTO: {
    label: "Sistema de arrefecimento",
    description: "Itens vinculados ao grupo de arrefecimento.",
  },
  TMA: {
    label: "TMA",
    description: "Itens vinculados ao grupo TMA.",
  },
};

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function explicitGroup(value: string) {
  const key = fold(value)
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
  if (key === "TROCA_MANGUEIRAS") return "TM";
  return key === "OUTROS" ? "" : key;
}

function inferredGroups(item: EquipmentBaseItem) {
  if (!item.catalogItem || fold(item.catalogItem.type || "") === "service")
    return [];

  const name = fold(item.catalogItem.name);
  if (!name) return [];
  const groups: string[] = [];
  const isFilter = /\b(?:filtros?|elementos?\s+filtrantes?)\b/.test(name);
  const isOil =
    /\boleos?\b/.test(name) &&
    !/\b(?:mangueiras?|mangotes?|sensor(?:es)?|bombas?|aditivos?|tubos?|tubulacoes|tubulacao|conexoes|conexao|conector(?:es)?|medidor(?:es)?|pressostatos?|interruptor(?:es)?|retentor(?:es)?|tampas?|suportes?|juntas?|reservatorios?|radiador(?:es)?|trocador(?:es)?|varetas?|carter|cabos?|aneis|anel)\b/.test(
      name,
    );
  if (isFilter || isOil) groups.push("TOF");
  if (
    /\b(?:mangueiras?|mangotes?|abracadeiras?|aditivos?)\b/.test(name) ||
    /\bfluido\s+(?:de\s+)?arrefecimento\b/.test(name)
  )
    groups.push("TM");
  if (
    /\bbaterias?\b/.test(name) &&
    !/\b(?:carregador(?:es)?|suportes?|cabos?|terminais|terminal|conector(?:es)?|chicotes?|fixador(?:es)?|bercos?|caixas?|tampas?|sensor(?:es)?|chaves?|bornes?|adaptador(?:es)?|isolador(?:es)?|parafusos?|bandejas?)\b/.test(
      name,
    )
  )
    groups.push("TB");
  return groups;
}

/** Groups existing equipment rows for selection; it never changes their saved group. */
export function buildEquipmentItemSets(
  items: readonly EquipmentBaseItem[],
): EquipmentItemSet[] {
  const groups = new Map<string, Set<string>>();
  const customLabels = new Map<string, string>();
  for (const item of items) {
    const explicit = explicitGroup(item.serviceGroup);
    const memberships = new Set(inferredGroups(item));
    if (explicit) {
      memberships.add(explicit);
      if (!SET_DEFINITIONS[explicit])
        customLabels.set(explicit, item.serviceGroup.trim());
    }
    for (const group of memberships) {
      const ids = groups.get(group) || new Set<string>();
      ids.add(item.id);
      groups.set(group, ids);
    }
  }
  const order = ["TOF", "TM", "TB", "TBC", "ARREFECIMENTO", "TMA"];
  const keys = [
    ...order.filter((key) => groups.has(key)),
    ...[...groups.keys()]
      .filter((key) => !order.includes(key))
      .sort((left, right) => left.localeCompare(right, "pt-BR")),
  ];
  return keys.map((id) => ({
    id,
    ...(SET_DEFINITIONS[id] || {
      label: customLabels.get(id) || id,
      description: "Itens vinculados a este grupo no cadastro do equipamento.",
    }),
    itemIds: [...groups.get(id)!],
  }));
}

/** Keeps the first row for each catalog item, preserving its original quantity. */
export function uniqueEquipmentItems<T extends EquipmentBaseItem>(
  selectedItems: readonly T[],
  existingCatalogIds: Iterable<string>,
): { items: T[]; duplicates: T[] } {
  const seen = new Set(existingCatalogIds);
  const items: T[] = [];
  const duplicates: T[] = [];
  for (const item of selectedItems) {
    if (seen.has(item.catalogItemId)) {
      duplicates.push(item);
      continue;
    }
    seen.add(item.catalogItemId);
    items.push(item);
  }
  return { items, duplicates };
}

/** Toggles only the requested set, keeping individually selected rows outside it. */
export function toggleEquipmentItemSetSelection(
  currentIds: readonly string[],
  groupIds: readonly string[],
): string[] {
  if (groupIds.length === 0) return [...currentIds];
  const selected = new Set(currentIds);
  const group = new Set(groupIds);
  if ([...group].every((id) => selected.has(id)))
    return currentIds.filter((id) => !group.has(id));
  return [...new Set([...currentIds, ...group])];
}
