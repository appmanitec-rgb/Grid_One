export type InsertionRow = {
  catalogItemId: string;
  quantity: string;
  unitPrice: string;
  origin?: "GENERAL" | "MACHINE";
};
export type InsertionItem = {
  catalogItemId: string;
  quantity: number;
  catalogItem?: {
    id: string;
    name: string;
    type?: string | null;
    basePrice?: number | null;
  } | null;
};
export function insertEquipmentItems(
  parts: InsertionRow[],
  services: InsertionRow[],
  items: InsertionItem[],
  mode: "add" | "sum" | "separate",
) {
  const nextParts = parts.map((row) => ({ ...row })),
    nextServices = services.map((row) => ({ ...row }));
  for (const item of items) {
    if (!item.catalogItem || !item.catalogItemId)
      throw new Error("Há um item sem identificação no catálogo.");
    if (!Number.isInteger(item.quantity) || item.quantity < 1)
      throw new Error(
        "Confira a quantidade cadastrada de " +
          item.catalogItem.name +
          ". A proposta exige quantidade inteira positiva.",
      );
    const target =
      item.catalogItem.type === "SERVICE" ? nextServices : nextParts;
    const matches = target.filter(
      (row) => row.catalogItemId === item.catalogItemId,
    );
    const price = Number(item.catalogItem.basePrice || 0);
    if (matches.length && mode === "add")
      throw new Error(
        "Há um item repetido. Confira se deseja somar ou manter linhas separadas.",
      );
    if (matches.length && mode === "sum") {
      if (matches.length !== 1 || Number(matches[0].unitPrice) !== price)
        throw new Error(
          "Não é possível somar automaticamente " +
            item.catalogItem.name +
            ": há preços ou linhas comerciais distintos. Confira as linhas ou mantenha separadas com justificativa.",
        );
      matches[0].quantity = String(Number(matches[0].quantity) + item.quantity);
    } else
      target.push({
        catalogItemId: item.catalogItemId,
        quantity: String(item.quantity),
        unitPrice: String(price),
        origin: "MACHINE",
      });
  }
  return { parts: nextParts, services: nextServices };
}
