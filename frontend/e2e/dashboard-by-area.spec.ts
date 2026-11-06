import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { apiLogin, apiRequest, apiRequestRaw } from "./helpers/auth";
import { accounts, API_BASE_URL } from "./helpers/test-data";
import type { UserAccessProfile } from "../lib/access-profiles";
import type { DashboardOverview } from "../lib/dashboard-overview";
let admin: string, supplies: string, finance: string, assistant: string;
const users: string[] = [];
const tokens: Record<string, string> = {};
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
  for (const id of [
    "SUPPLIES",
    "FINANCE",
    "ADMIN_ASSISTANT",
    "HR",
    "PURCHASING",
    "PLANNING",
    "TECHNICIAN",
  ]) {
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
        ...(id === "TECHNICIAN"
          ? {
              technicianProfile: {
                cpf: String(parseInt(fixture.suffix, 16)).padStart(11, "0"),
                phone: "11999990000",
                skills: [],
              },
            }
          : {}),
        department: p.department,
        accessPolicy: p.accessPolicy,
        accessRules: p.accessRules,
      },
    });
    users.push(user.id);
    if (id === "HR")
      await apiRequest(admin, "/users/" + user.id + "/certifications", {
        method: "POST",
        body: {
          code: "DASH-EXPIRED-" + fixture.suffix,
          validUntil: "2020-01-01T00:00:00.000Z",
        },
      });
    const token = (await apiLogin(account)).access_token;
    tokens[id] = token;
    if (id === "SUPPLIES") supplies = token;
    else if (id === "FINANCE") finance = token;
    else if (id === "ADMIN_ASSISTANT") assistant = token;
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

test("RH e assistente acompanham documentos sem expor salarios ou anexos privados", async () => {
  for (const id of ["HR", "ADMIN_ASSISTANT"]) {
    const data = await apiRequest<DashboardOverview>(
      tokens[id],
      "/dashboard/overview",
    );
    expect(
      data.metrics.find((m) => m.id === "documents-expired")?.value,
    ).toBeGreaterThan(0);
    expect(
      data.sections
        .find((s) => s.id === "documents")
        ?.items.some((i) => i.status === "EXPIRED"),
    ).toBe(true);
    expect(JSON.stringify(data)).not.toMatch(
      /hourCost|salary|signedTermUrl|metadata|documentId|passwordHash/,
    );
  }
  const hr = await apiRequest<DashboardOverview>(
    tokens.HR,
    "/dashboard/overview",
  );
  expect(hr.metrics.map((m) => m.id)).toEqual(
    expect.arrayContaining([
      "documents-expired",
      "documents-expiring",
      "time-review",
      "fleet-unavailable",
      "commissions-pending",
    ]),
  );
  expect(hr.sections.some((s) => s.id === "payables")).toBe(false);
});

test("Compras recebe negociacoes e Planejamento recebe programacao", async () => {
  const purchasing = await apiRequest<DashboardOverview>(
    tokens.PURCHASING,
    "/dashboard/overview",
  );
  expect(purchasing.metrics.map((m) => m.id)).toEqual(
    expect.arrayContaining(["quotes", "quotes-approval", "purchase-drafts"]),
  );
  expect(
    purchasing.sections.some(
      (s) => s.id === "payables" || s.id === "documents",
    ),
  ).toBe(false);
  const planning = await apiRequest<DashboardOverview>(
    tokens.PLANNING,
    "/dashboard/overview",
  );
  expect(planning.metrics.map((m) => m.id)).toEqual(
    expect.arrayContaining([
      "orders-unassigned",
      "orders-unscheduled",
      "orders-today",
      "tickets-overdue",
      "reports-pending",
    ]),
  );
  expect(
    planning.sections.some((s) => s.id === "payables" || s.id === "documents"),
  ).toBe(false);
});

test("Tecnico sem atribuicoes nao recebe trabalho de outros nem acesso a RH ou financeiro", async () => {
  const data = await apiRequest<DashboardOverview>(
    tokens.TECHNICIAN,
    "/dashboard/overview",
  );
  for (const id of [
    "orders",
    "orders-today",
    "orders-overdue",
    "tickets-active",
    "tickets-overdue",
    "reports-pending",
  ])
    expect(data.metrics.find((m) => m.id === id)?.value).toBe(0);
  expect(
    data.metrics.some((m) =>
      [
        "payables",
        "receivables",
        "documents-expired",
        "orders-unassigned",
      ].includes(m.id),
    ),
  ).toBe(false);
  expect(data.sections.find((s) => s.id === "tickets")?.href).toBe(
    "/dashboard/tecnico",
  );
});
