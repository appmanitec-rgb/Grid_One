import { expect, test } from "@playwright/test";
import { financialComposition, reviewProposal } from "../lib/proposal-review";
import {
  insertEquipmentItems,
  type InsertionItem,
} from "../app/dashboard/proposals/new/equipment-item-insertion";

// Pure contracts, no browser fixture. The frontend imports the actual API domain.
test("frontend totals and protection of expense discount use the shared API domain", () => {
  const items = [
    { kind: "PART_MATERIAL", quantity: 1, unitPrice: 69.3 },
    { kind: "CATALOG_SERVICE", quantity: 1, unitPrice: 440 },
  ];
  const expenses = [{ expenseType: "MEAL", quantity: 1, unitPrice: 13440 }];
  expect(financialComposition(items, expenses, 697.47, true).total).toBe(
    13251.83,
  );
  expect(
    financialComposition(items, expenses, 25, false).breakdown[0].discount,
  ).toBe(0);
});
test("empty form may remain a draft without bypassing approval", () => {
  expect(reviewProposal({ items: [] }).blocks("draft")).toEqual([]);
  expect(reviewProposal({ items: [] }).blocks("approve")).toHaveLength(3);
});
test("all 12 selected items are inserted without relying on the search page", () => {
  const selected: InsertionItem[] = Array.from({ length: 12 }, (_, index) => ({
    catalogItemId: "part-" + index,
    quantity: index + 1,
    catalogItem: {
      id: "part-" + index,
      name: "Material " + index,
      type: "PART",
      basePrice: 10,
    },
  }));
  const result = insertEquipmentItems([], [], selected, "add");
  expect(result.parts).toHaveLength(12);
  expect(result.parts.reduce((sum, row) => sum + Number(row.quantity), 0)).toBe(
    78,
  );
  expect(result.services).toEqual([]);
});
test("duplicate insertion requires an explicit choice and sum preserves original input for undo", () => {
  const parts = [{ catalogItemId: "part", quantity: "2", unitPrice: "10" }];
  const item = {
    catalogItemId: "part",
    quantity: 3,
    catalogItem: { id: "part", name: "Filtro", type: "PART", basePrice: 10 },
  };
  expect(() => insertEquipmentItems(parts, [], [item], "add")).toThrow(
    "repetido",
  );
  expect(insertEquipmentItems(parts, [], [item], "sum").parts[0].quantity).toBe(
    "5",
  );
  expect(parts[0].quantity).toBe("2");
  expect(
    insertEquipmentItems(parts, [], [item], "separate").parts,
  ).toHaveLength(2);
});
test("distinct prices and multiple commercial contexts cannot be merged silently", () => {
  const item = {
    catalogItemId: "part",
    quantity: 1,
    catalogItem: { id: "part", name: "Filtro", basePrice: 10 },
  };
  expect(() =>
    insertEquipmentItems(
      [{ catalogItemId: "part", quantity: "1", unitPrice: "9" }],
      [],
      [item],
      "sum",
    ),
  ).toThrow("preços");
  expect(() =>
    insertEquipmentItems(
      [
        { catalogItemId: "part", quantity: "1", unitPrice: "10" },
        { catalogItemId: "part", quantity: "1", unitPrice: "10" },
      ],
      [],
      [item],
      "sum",
    ),
  ).toThrow("linhas comerciais");
});
test("invalid catalog and fractional quantity cannot create phantom charges", () => {
  expect(() =>
    insertEquipmentItems([], [], [{ catalogItemId: "", quantity: 1 }], "add"),
  ).toThrow("identificação");
  expect(() =>
    insertEquipmentItems(
      [],
      [],
      [
        {
          catalogItemId: "part",
          quantity: 1.5,
          catalogItem: { id: "part", name: "Filtro" },
        },
      ],
      "add",
    ),
  ).toThrow("inteira positiva");
  expect(insertEquipmentItems([], [], [], "add")).toEqual({
    parts: [],
    services: [],
  });
});
