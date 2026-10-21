import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  MAIN_SECTIONS,
  navigationContext,
  isNavigationItemActive,
  searchNavigation,
} from "../lib/dashboard-navigation";
import { ACCESS_SCREENS } from "../lib/access-screens";
const items = MAIN_SECTIONS.flatMap((s) => s.items);
test("todas as rotinas apontam para paginas reais e possuem chaves e destinos unicos", () => {
  expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
  expect(new Set(items.map((i) => i.href)).size).toBe(items.length);
  for (const item of items) {
    expect(item.enabled).toBe(true);
    expect(item.soon).not.toBe(true);
    expect(item.href).toBeTruthy();
    expect(
      existsSync(
        path.resolve(process.cwd(), "app", item.href!.slice(1), "page.tsx"),
      ),
      item.href,
    ).toBe(true);
  }
});
test("processo comercial, compras e almoxarifado pertencem a areas distintas", () => {
  for (const [route, area] of [
    ["/dashboard/sales-orders", "crm"],
    ["/dashboard/contracts", "contracts"],
    ["/dashboard/contracts/renewals", "contracts"],
    ["/dashboard/purchase-orders/requests", "supplies"],
    ["/dashboard/purchase-orders/quotations", "supplies"],
    ["/dashboard/suppliers", "supplies"],
    ["/dashboard/inventory", "warehouse"],
    ["/dashboard/inventory/operations", "warehouse"],
    ["/dashboard/catalog", "warehouse"],
    ["/dashboard/dispatch", "planning"],
    ["/dashboard/hr/fleet", "planning"],
    ["/dashboard/management/users", "hr"],
    ["/dashboard/company-settings", "admin"],
    ["/dashboard/billing", "finance"],
    ["/dashboard/costs", "finance"],
  ])
    expect(navigationContext(route)?.section.id, route).toBe(area);
});
test("a tela mais especifica fica ativa sem marcar seus pais ao mesmo tempo", () => {
  for (const route of [
    "/dashboard/contracts/renewals",
    "/dashboard/equipments/models",
    "/dashboard/purchase-orders/requests/123",
    "/dashboard/inventory/operations",
  ])
    expect(
      items.filter((item) => isNavigationItemActive(route, item.href)),
    ).toHaveLength(1);
  expect(
    navigationContext("/dashboard/purchase-orders/quotations/123")?.item.key,
  ).toBe("purchaseQuotations");
  expect(
    isNavigationItemActive(
      "/dashboard/contracts/renewals",
      "/dashboard/contracts",
    ),
  ).toBe(false);
  expect(
    navigationContext("/dashboard/inventory/operations?foo=1#section")?.item
      .key,
  ).toBe("warehouse_operations");
});
test("busca ignora acentos, combina palavras e retorna no maximo dez rotinas", () => {
  expect(searchNavigation(MAIN_SECTIONS, "cotacoes").items[0].item.key).toBe(
    "purchaseQuotations",
  );
  expect(
    searchNavigation(MAIN_SECTIONS, "financeiro pagar").items.map(
      (r) => r.item.key,
    ),
  ).toEqual(["finance_payable"]);
  expect(
    searchNavigation(MAIN_SECTIONS, "RH documentos").items.map(
      (r) => r.item.key,
    ),
  ).toEqual(["hr_documentation"]);
  expect(searchNavigation(MAIN_SECTIONS, "chamados").items[0].item.key).toBe(
    "ops_tickets",
  );
  expect(searchNavigation(MAIN_SECTIONS, "", 100).items).toHaveLength(10);
  expect(searchNavigation(MAIN_SECTIONS, "nada-inexistente").total).toBe(0);
});
test("busca e contexto nao recuperam menus removidos pelas permissoes", () => {
  const allowed = new Set([
    "/dashboard",
    "/dashboard/inventory",
    "/dashboard/inventory/operations",
  ]);
  const restricted = MAIN_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => allowed.has(i.href!)),
  })).filter((s) => s.items.length);
  expect(searchNavigation(restricted, "financeiro").total).toBe(0);
  expect(
    navigationContext("/dashboard/purchase-orders", restricted),
  ).toBeUndefined();
  expect(restricted.map((s) => s.id)).toEqual(["overview", "warehouse"]);
});
test("nenhuma tela principal autorizavel fica esquecida no menu", () => {
  for (const screen of ACCESS_SCREENS) {
    if (["people", "usersControl"].includes(screen.key)) continue;
    expect(
      items.some((i) => i.href === screen.path),
      screen.path,
    ).toBe(true);
  }
});
