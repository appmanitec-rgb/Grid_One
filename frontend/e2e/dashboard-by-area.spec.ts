import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { apiLogin, apiRequest, apiRequestRaw } from "./helpers/auth";
import { accounts, API_BASE_URL } from "./helpers/test-data";
import type { UserAccessProfile } from "../lib/access-profiles";
import type { DashboardOverview } from "../lib/dashboard-overview";
let admin: string, supplies: string, finance: string, assistant: string;
const users: string[] = [];
let fixture: {
  suffix: string;
  product: { id: string };
  warehouse: { id: string };
  reservedMaterialId: string;
  unreservedMaterialId: string;
  serviceMaterialId: string;
};
test.beforeAll(async () => {
  if (new URL(API_BASE_URL).port !== "3100")
    throw Error("Exige ambiente isolado 3100/gridone_e2e");
  fixture = JSON.parse(
    readFileSync(
      path.resolve(
        process.cwd(),
        "../runtime-logs/dashboard-area-fixtures.json",
      ),
      "utf8",
    ),
  );
  admin = (await apiLogin(accounts.admin)).access_token;
  const profiles = await apiRequest<UserAccessProfile[]>(
    admin,
    "/users/access-profiles",
  );
  for (const id of ["SUPPLIES", "FINANCE", "ADMIN_ASSISTANT"]) {
    const p = profiles.find((p) => p.id === id)!,
      account = {
        ...accounts.hr,
        email:
          id.toLowerCase() + "-" + fixture.suffix + "@dashboard.manitec.test",
        password: "DashboardArea@2026",
      };
    const user = await apiRequest<{ id: string }>(admin, "/users", {
      method: "POST",
      body: {
        name: "Dashboard " + id,
        email: account.email,
        password: account.password,
        role: p.role,
        department: p.department,
        accessPolicy: p.accessPolicy,
        accessRules: p.accessRules,
      },
    });
    users.push(user.id);
    const token = (await apiLogin(account)).access_token;
    if (id === "SUPPLIES") supplies = token;
    else if (id === "FINANCE") finance = token;
    else assistant = token;
  }
});
test.afterAll(async () => {
  for (const id of users)
    await apiRequest(admin, "/users/" + id, {
      method: "PATCH",
      body: { isActive: false },
    });
});
test("Suprimentos recebe os indicadores da area e nao recebe carteira comercial ou dados financeiros", async () => {
  const data = await apiRequest<DashboardOverview>(
    supplies,
    "/dashboard/overview?role=ADMIN&department=Diretoria",
  );
  expect(data.audience).toBe("SUPPLIES");
  expect(data.metrics.map((m) => m.id)).toEqual(
    expect.arrayContaining([
      "purchases",
      "separation",
      "low-stock",
      "products-expiry",
      "epis",
      "requests",
    ]),
  );
  expect(data.metrics.map((m) => m.id)).not.toEqual(
    expect.arrayContaining(["payables"]),
  );
  expect(data.canViewCommercial).toBe(false);
  expect(JSON.stringify(data)).not.toMatch(
    /signedTermUrl|passwordHash|paidAmount|unitCost|totalAmount/,
  );
  expect(data.sections.find((s) => s.id === "epis")?.total).toBeGreaterThan(0);
});
test("administrador conserva a visao gerencial de todos os departamentos", async () => {
  const data = await apiRequest<DashboardOverview>(
    admin,
    "/dashboard/overview",
  );
  expect(data.audience).toBe("EXECUTIVE");
  expect(data.canViewCommercial).toBe(true);
  expect(data.metrics.map((m) => m.id)).toEqual(
    expect.arrayContaining([
      "purchases",
      "separation",
      "payables",
      "receivables",
    ]),
  );
});
test("Financeiro nao carrega estoque e assistente so recebe as proprias solicitacoes", async () => {
  const f = await apiRequest<DashboardOverview>(finance, "/dashboard/overview");
  expect(f.audience).toBe("DEPARTMENT");
  expect(f.metrics.some((m) => m.id === "payables")).toBe(true);
  expect(
    f.sections.some((s) => s.id === "separation" || s.id === "stock"),
  ).toBe(false);
  const a = await apiRequest<DashboardOverview>(
      assistant,
      "/dashboard/overview",
    ),
    own = await apiRequest<{ total: number }>(
      assistant,
      "/purchasing/requests",
    );
  expect(a.metrics.find((m) => m.id === "requests")?.value).toBe(own.total);
  expect(a.canSeparate).toBe(false);
});
test("separacao exige reserva, resiste a repeticao e nao movimenta estoque", async () => {
  const get = () =>
    apiRequest<
      Array<{ catalogItemId: string; physicalQty: number; reservedQty: number }>
    >(supplies, "/inventory/summary?warehouseId=" + fixture.warehouse.id);
  const before = (await get()).find(
    (b) => b.catalogItemId === fixture.product.id,
  )!;
  expect(
    (
      await apiRequestRaw(
        supplies,
        "/dashboard/materials/" + fixture.unreservedMaterialId + "/separate",
        { method: "PATCH", body: {} },
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await apiRequestRaw(
        assistant,
        "/dashboard/materials/" + fixture.reservedMaterialId + "/separate",
        { method: "PATCH", body: {} },
      )
    ).status,
  ).toBe(403);
  const first = await apiRequest<{ separatedAt: string }>(
      supplies,
      "/dashboard/materials/" + fixture.reservedMaterialId + "/separate",
      { method: "PATCH", body: {} },
    ),
    repeat = await apiRequest<{ separatedAt: string }>(
      supplies,
      "/dashboard/materials/" + fixture.reservedMaterialId + "/separate",
      { method: "PATCH", body: {} },
    );
  expect(first.separatedAt).toBe(repeat.separatedAt);
  const after = (await get()).find(
    (b) => b.catalogItemId === fixture.product.id,
  )!;
  expect(after.physicalQty).toBe(before.physicalQty);
  expect(after.reservedQty).toBe(before.reservedQty);
  expect(
    (
      await apiRequestRaw(
        supplies,
        "/dashboard/materials/" + fixture.serviceMaterialId + "/separate",
        { method: "PATCH", body: {} },
      )
    ).status,
  ).toBe(400);
});
test("validade do produto e identificada por lote, auditada, sem duplicacao e pode ser encerrada", async () => {
  const body = {
    catalogItemId: fixture.product.id,
    lotCode: "LOTE-" + fixture.suffix,
    expiresAt: "2020-12-31",
  };
  expect(
    (
      await apiRequestRaw(assistant, "/dashboard/product-validities", {
        method: "POST",
        body,
      })
    ).status,
  ).toBe(403);
  const created = await Promise.all(
    [1, 2].map(() =>
      apiRequest<{ id: string }>(supplies, "/dashboard/product-validities", {
        method: "POST",
        body,
      }),
    ),
  );
  expect(created[0].id).toBe(created[1].id);
  const records = await apiRequest<Array<{ id: string; source: string }>>(
    supplies,
    "/catalogs/" + fixture.product.id + "/identifiers",
  );
  expect(records.filter((r) => r.source === "PRODUCT_EXPIRY")).toHaveLength(1);
  const before = await apiRequest<DashboardOverview>(
    supplies,
    "/dashboard/overview",
  );
  await apiRequest(
    supplies,
    "/dashboard/product-validities/" + created[0].id + "/close",
    { method: "PATCH", body: {} },
  );
  const after = await apiRequest<DashboardOverview>(
    supplies,
    "/dashboard/overview",
  );
  expect(after.metrics.find((m) => m.id === "products-expiry")!.value).toBe(
    before.metrics.find((m) => m.id === "products-expiry")!.value - 1,
  );
});

test("busca de produtos e pesquisavel, limitada a dez e nao inclui servicos ou custos", async () => {
  const options = await apiRequest<Array<{ id: string; type: string }>>(
    supplies,
    "/dashboard/product-options?q=Dashboard",
  );
  expect(options.length).toBeLessThanOrEqual(10);
  expect(options.every((item) => item.type !== "SERVICE")).toBe(true);
  expect(JSON.stringify(options)).not.toMatch(
    /costPrice|basePrice|averageCost/,
  );
  expect(
    (await apiRequestRaw(assistant, "/dashboard/product-options")).status,
  ).toBe(403);
});
