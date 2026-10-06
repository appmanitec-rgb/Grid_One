export type ProposalAccessoryRule = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  sortOrder: number;
};

export type ProposalAssistanceItem = {
  name: string;
  quantity: number;
};

export type ProposalAccessoryWarning = {
  rule: ProposalAccessoryRule;
  triggerQuantity: number;
  accessoryQuantity: number;
  missingQuantity: number;
  signature: string;
};

export function normalizeProposalItemName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function matchingItems(items: ProposalAssistanceItem[], term: string) {
  const needle = normalizeProposalItemName(term);
  if (!needle) return [];
  return items.filter((item) => normalizeProposalItemName(item.name).includes(needle));
}

function totalQuantity(items: ProposalAssistanceItem[]) {
  return items.reduce((total, item) => total + Math.max(0, Number(item.quantity) || 0), 0);
}

function itemSignature(items: ProposalAssistanceItem[]) {
  return items
    .map((item) => `${normalizeProposalItemName(item.name)}:${item.quantity}`)
    .sort()
    .join("|");
}

export function buildProposalAccessoryWarnings(
  rules: ProposalAccessoryRule[],
  triggerItems: ProposalAssistanceItem[],
  accessoryItems: ProposalAssistanceItem[],
): ProposalAccessoryWarning[] {
  return rules.flatMap((rule) => {
    const triggers = matchingItems(triggerItems, rule.code);
    const triggerQuantity = totalQuantity(triggers);
    if (triggerQuantity <= 0) return [];

    const accessories = matchingItems(accessoryItems, rule.name);
    const accessoryQuantity = totalQuantity(accessories);
    const requiredQuantity = Math.ceil(triggerQuantity * Math.max(1, rule.sortOrder));
    const missingQuantity = Math.max(0, requiredQuantity - accessoryQuantity);
    if (missingQuantity <= 0) return [];

    return [{
      rule,
      triggerQuantity,
      accessoryQuantity,
      missingQuantity,
      signature: `${rule.id}:${rule.code}:${rule.name}:${rule.description}:${itemSignature(triggers)}:${itemSignature(accessories)}:${requiredQuantity}`,
    }];
  });
}
