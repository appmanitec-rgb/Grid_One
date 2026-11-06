import { expect, test } from "@playwright/test";
import {
  buildEquipmentItemSets,
  uniqueEquipmentItems,
  toggleEquipmentItemSetSelection,
  type EquipmentBaseItem,
} from "../app/dashboard/proposals/new/equipment-item-sets";

function part(
  id: string,
  name: string,
  changes: Partial<EquipmentBaseItem> = {},
): EquipmentBaseItem {
  return {
    id,
    catalogItemId: "catalog-" + id,
    serviceGroup: "OUTROS",
    quantity: 1,
    catalogItem: { id: "catalog-" + id, name, type: "PART", basePrice: 50 },
    ...changes,
  };
}

function members(items: EquipmentBaseItem[], group: string) {
  return buildEquipmentItemSets(items).find((set) => set.id === group)?.itemIds;
}

test("oferece TOF, TM e TB para itens cadastrados como OUTROS sem mudar o cadastro", () => {
  const equipment = [
    part("filter-oil", "FILTRO DE ÓLEO", { quantity: 2 }),
    part("filter-fuel", "Filtro de combustível"),
    part("filter-air", "Elemento filtrante de ar"),
    part("oil", "ÓLEO LUBRIFICANTE SAE 15W40", { quantity: 18 }),
    part("hose", "Mangueira do radiador"),
    part("clamp", "ABRAÇADEIRA 40-60", { quantity: 4 }),
    part("coolant", "Aditivo concentrado", { quantity: 6 }),
    part("battery", "Bateria 12V 150Ah"),
    part("belt", "Correia do alternador"),
  ];
  const original = JSON.stringify(equipment);
  const sets = buildEquipmentItemSets(equipment);
  expect(sets.map((set) => set.id)).toEqual(["TOF", "TM", "TB"]);
  expect(members(equipment, "TOF")).toEqual([
    "filter-oil",
    "filter-fuel",
    "filter-air",
    "oil",
  ]);
  expect(members(equipment, "TM")).toEqual(["hose", "clamp", "coolant"]);
  expect(members(equipment, "TB")).toEqual(["battery"]);
  expect(JSON.stringify(equipment)).toBe(original);
  expect(sets.flatMap((set) => set.itemIds)).not.toContain("belt");
  expect(sets.every((set) => set.label && set.description)).toBe(true);
});

test("reconhece nomes sem acentos, plural e elemento filtrante", () => {
  const equipment = [
    part("filters", "Filtros do motor"),
    part("elements", "ELEMENTOS FILTRANTES"),
    part("oil", "oleo 15W40"),
    part("clamps", "abracadeiras inox"),
    part("coolants", "ADITIVOS"),
    part("batteries", "BATERIAS 150AH"),
  ];
  expect(members(equipment, "TOF")).toEqual(["filters", "elements", "oil"]);
  expect(members(equipment, "TM")).toEqual(["clamps", "coolants"]);
  expect(members(equipment, "TB")).toEqual(["batteries"]);
});

test("mangueira de óleo pertence ao TM; sensor e bomba de óleo não entram no TOF", () => {
  const equipment = [
    part("hose", "Mangueira de óleo"),
    part("sensor", "Sensor de pressão de óleo"),
    part("pump", "Bomba de óleo"),
    part("additive", "Aditivo de óleo"),
    part("oil", "Óleo lubrificante"),
  ];
  expect(members(equipment, "TOF")).toEqual(["oil"]);
  expect(members(equipment, "TM")).toEqual(["hose", "additive"]);
});

test("TB inclui bateria e exclui carregadores, suportes, cabos e terminais", () => {
  const equipment = [
    part("battery", "Bateria estacionária 12V"),
    part("charger", "Carregador de bateria"),
    part("support", "Suporte da bateria"),
    part("cable", "Cabo de bateria positivo"),
    part("terminal", "Terminal de bateria"),
  ];
  expect(members(equipment, "TB")).toEqual(["battery"]);
});

test("respeita grupos explícitos e unifica TROCA_MANGUEIRAS com TM", () => {
  const equipment = [
    part("explicit-oil", "Insumo cadastrado", { serviceGroup: "TOF" }),
    part("explicit-hose", "Componente cadastrado", {
      serviceGroup: "TROCA_MANGUEIRAS",
    }),
    part("explicit-clamp", "Componente cadastrado", { serviceGroup: "TM" }),
    part("explicit-battery", "Componente cadastrado", { serviceGroup: "TB" }),
  ];
  expect(members(equipment, "TOF")).toEqual(["explicit-oil"]);
  expect(members(equipment, "TM")).toEqual(["explicit-hose", "explicit-clamp"]);
  expect(members(equipment, "TB")).toEqual(["explicit-battery"]);
  expect(buildEquipmentItemSets(equipment).map((set) => set.id)).not.toContain(
    "TROCA_MANGUEIRAS",
  );
  expect(equipment[1].serviceGroup).toBe("TROCA_MANGUEIRAS");
});

test("mantém TBC, ARREFECIMENTO e TMA com os rótulos do cadastro", () => {
  const equipment = [
    part("charger", "Carregador de bateria", { serviceGroup: "TBC" }),
    part("radiator", "Radiador", { serviceGroup: "ARREFECIMENTO" }),
    part("custom", "Revisão adicional", { serviceGroup: "TMA" }),
    part("unmatched", "Parafuso sextavado"),
  ];
  expect(buildEquipmentItemSets(equipment)).toEqual([
    expect.objectContaining({
      id: "TBC",
      label: "TBC - bateria e carregador",
      itemIds: ["charger"],
    }),
    expect.objectContaining({
      id: "ARREFECIMENTO",
      label: "Sistema de arrefecimento",
      itemIds: ["radiator"],
    }),
    expect.objectContaining({ id: "TMA", label: "TMA", itemIds: ["custom"] }),
  ]);
});

test("não infere kits para cadastro sem catálogo ou apenas com códigos sugestivos", () => {
  const equipment = [
    part("missing", "Filtro", { catalogItem: null }),
    part("undefined", "Óleo", { catalogItem: undefined }),
    part("sku", "Parafuso sextavado", {
      catalogItem: {
        id: "catalog-sku",
        name: "Parafuso sextavado",
        sku: "TOF-TM-TB",
      },
    }),
  ];
  expect(buildEquipmentItemSets(equipment)).toEqual([]);
  expect(
    buildEquipmentItemSets([
      part("missing-explicit", "", { catalogItem: null, serviceGroup: "TMA" }),
    ]),
  ).toEqual([
    expect.objectContaining({ id: "TMA", itemIds: ["missing-explicit"] }),
  ]);
});

test("serviços entram somente no grupo explícito, sem inferência pelo nome", () => {
  const equipment = [
    part("service-outros", "Troca de óleo e filtros", {
      catalogItem: {
        id: "service-outros",
        name: "Troca de óleo e filtros",
        type: "SERVICE",
      },
    }),
    part("service-tof", "Troca de óleo e filtros", {
      serviceGroup: "TOF",
      catalogItem: {
        id: "service-tof",
        name: "Troca de óleo e filtros",
        type: "SERVICE",
      },
    }),
    part("service-tm", "Troca de bateria e mangueiras", {
      serviceGroup: "TROCA_MANGUEIRAS",
      catalogItem: {
        id: "service-tm",
        name: "Troca de bateria e mangueiras",
        type: "SERVICE",
      },
    }),
  ];
  expect(members(equipment, "TOF")).toEqual(["service-tof"]);
  expect(members(equipment, "TM")).toEqual(["service-tm"]);
  expect(members(equipment, "TB")).toBeUndefined();
});

test("deduplica por catálogo em dois grupos e contra itens já existentes sem somar quantidades", () => {
  const first = part("filter-tof", "Filtro", {
    catalogItemId: "same-filter",
    serviceGroup: "TOF",
    quantity: 2,
  });
  const otherGroup = part("filter-tma", "Filtro", {
    catalogItemId: "same-filter",
    serviceGroup: "TMA",
    quantity: 8,
  });
  const alreadyAdded = part("existing-oil", "Óleo", {
    catalogItemId: "existing-oil",
    quantity: 18,
  });
  const hose = part("hose", "Mangueira", { quantity: 1.5 });
  const selected = [first, otherGroup, alreadyAdded, hose, first];
  const original = JSON.stringify(selected);
  const result = uniqueEquipmentItems(selected, new Set(["existing-oil"]));
  expect(result.items).toEqual([first, hose]);
  expect(result.items[0]).toBe(first);
  expect(result.items[1]).toBe(hose);
  expect(result.items.map((item) => item.quantity)).toEqual([2, 1.5]);
  expect(result.duplicates).toEqual([otherGroup, alreadyAdded, first]);
  expect(JSON.stringify(selected)).toBe(original);
});

test("não cria conjuntos vazios nem itens quando não há cadastro selecionado", () => {
  expect(buildEquipmentItemSets([])).toEqual([]);
  expect(uniqueEquipmentItems([], [])).toEqual({ items: [], duplicates: [] });
});

test("seleciona e desmarca o TOF em cliques consecutivos sem perder seleção individual", () => {
  const equipment = [
    part("filter", "Filtro de óleo"),
    part("oil", "Óleo lubrificante"),
    part("battery", "Bateria 150Ah"),
  ];
  const group = members(equipment, "TOF")!;
  const individual = Object.freeze(["battery"]);
  const selected = toggleEquipmentItemSetSelection(individual, group);
  expect(selected).toEqual(["battery", "filter", "oil"]);
  expect(toggleEquipmentItemSetSelection(selected, group)).toEqual(["battery"]);
  expect(individual).toEqual(["battery"]);
  expect(group).toEqual(["filter", "oil"]);
});

test("seleção parcial completa o conjunto antes de permitir desmarcar", () => {
  const current = Object.freeze(["filter", "battery"]);
  const group = Object.freeze(["filter", "oil", "oil"]);
  const completed = toggleEquipmentItemSetSelection(current, group);
  expect(completed).toEqual(["filter", "battery", "oil"]);
  expect(toggleEquipmentItemSetSelection(completed, group)).toEqual([
    "battery",
  ]);
  expect(current).toEqual(["filter", "battery"]);
  expect(group).toEqual(["filter", "oil", "oil"]);
});

test("conjuntos compartilhados preservam os itens que estão fora do conjunto desmarcado", () => {
  const first = ["shared", "oil"];
  const second = ["shared", "hose"];
  const both = toggleEquipmentItemSetSelection(
    toggleEquipmentItemSetSelection(["battery"], first),
    second,
  );
  expect(both).toEqual(["battery", "shared", "oil", "hose"]);
  const remaining = toggleEquipmentItemSetSelection(both, first);
  expect(remaining).toEqual(["battery", "hose"]);
  expect(toggleEquipmentItemSetSelection(remaining, second)).toEqual([
    "battery",
    "hose",
    "shared",
  ]);
});

test("conjunto vazio preserva integralmente a seleção atual", () => {
  const current = Object.freeze(["battery", "filter"]);
  expect(toggleEquipmentItemSetSelection(current, [])).toEqual(current);
  expect(toggleEquipmentItemSetSelection([], [])).toEqual([]);
});
