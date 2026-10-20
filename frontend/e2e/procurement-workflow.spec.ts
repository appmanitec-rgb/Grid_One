import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  apiLogin,
  apiRequest,
  apiRequestRaw,
  loginByApi,
} from "./helpers/auth";
import { accounts, API_BASE_URL } from "./helpers/test-data";
import type {
  Order,
  PurchaseRequest,
  Quote,
} from "../app/dashboard/purchase-orders/_components/types";
import type { UserAccessProfile } from "../lib/access-profiles";
type Fixture = {
  suffix: string;
  supplierA: { id: string; companyName: string };
  supplierB: { id: string; companyName: string };
  warehouse: { id: string; name: string };
  warehouse2: { id: string; name: string };
  items: Array<{ id: string; name: string }>;
  service: { id: string; name: string };
  order: { id: string; generatorId: string; generator: { clientId: string } };
  warranty?: { id: string; clientId: string; generatorId: string };
};
let admin: string,
  fixture: Fixture,
  profiles: UserAccessProfile[],
  buyer: string,
  supply: string,
  assistant: string;
const users: string[] = [];
const stamp = Date.now();
test.beforeAll(async () => {
  if (new URL(API_BASE_URL).port !== "3100")
    throw new Error("Exige a base isolada gridone_e2e.");
  fixture = JSON.parse(
    readFileSync(
      path.resolve(process.cwd(), "../runtime-logs/procurement-fixtures.json"),
      "utf8",
    ),
  );
  admin = (await apiLogin(accounts.admin)).access_token;
  await apiRequest(admin, "/purchasing/settings", {
    method: "PATCH",
    body: { enabled: true },
  });
  profiles = await apiRequest<UserAccessProfile[]>(
    admin,
    "/users/access-profiles",
  );
  for (const [id, label] of [
    ["PURCHASING", "buyer"],
    ["SUPPLIES", "supply"],
    ["ADMIN_ASSISTANT", "assistant"],
  ]) {
    const preset = profiles.find((p) => p.id === id)!;
    const account = {
      ...accounts.hr,
      email: label + "-" + stamp + "@prp.manitec.test",
      password: "PrpWorkflow@2026",
    };
    const user = await apiRequest<{ id: string }>(admin, "/users", {
      method: "POST",
      body: {
        name: "PRP " + label,
        role: preset.role,
        department: preset.department,
        email: account.email,
        password: account.password,
        accessPolicy: preset.accessPolicy,
        accessRules: preset.accessRules,
      },
    });
    users.push(user.id);
    const token = (await apiLogin(account)).access_token;
    if (label === "buyer") buyer = token;
    else if (label === "supply") supply = token;
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
async function bodyRequest(
  catalogs = fixture.items.slice(0, 1),
  quantity = 10,
  origin = "STOCK",
  allocation: Record<string, unknown> = {},
) {
  return {
    requestKey: randomUUID(),
    department: "Suprimentos",
    origin,
    priority: "NORMAL",
    justification: "PRP " + stamp + " " + randomUUID(),
    items: catalogs.map((item) => ({
      catalogItemId: item.id,
      description: item.name,
      quantity,
      unit: item.id === fixture.service.id ? "SV" : "UN",
      allocations: [
        {
          origin,
          quantity,
          ...(origin === "STOCK" ? { warehouseId: fixture.warehouse.id } : {}),
          ...allocation,
        },
      ],
    })),
  };
}
async function need(
  catalogs = fixture.items.slice(0, 1),
  quantity = 10,
  origin = "STOCK",
  allocation: Record<string, unknown> = {},
) {
  const req = await apiRequest<PurchaseRequest>(admin, "/purchasing/requests", {
    method: "POST",
    body: await bodyRequest(catalogs, quantity, origin, allocation),
  });
  await apiRequest(admin, "/purchasing/requests/" + req.id + "/actions", {
    method: "POST",
    body: { action: "SUBMIT" },
  });
  await apiRequest(supply, "/purchasing/requests/" + req.id + "/actions", {
    method: "POST",
    body: { action: "ANALYZE" },
  });
  return apiRequest<PurchaseRequest>(admin, "/purchasing/requests/" + req.id);
}
async function rfq(
  req: PurchaseRequest,
  supplierIds = [fixture.supplierA.id, fixture.supplierB.id],
) {
  return apiRequest<Quote>(buyer, "/purchasing/quotes", {
    method: "POST",
    body: {
      requestKey: randomUUID(),
      title: "PRP " + req.code,
      groups: req.items.map((item) => ({
        sources: [{ requestItemId: item.id, quantity: Number(item.quantity) }],
      })),
      supplierIds,
    },
  });
}
async function offer(
  quote: Quote,
  supplierId: string,
  prices: number[],
  freightAmount = 0,
  compatibility = "APPROVED",
) {
  return apiRequest<{
    id: string;
    items: Array<{ id: string; quoteItemId: string }>;
  }>(buyer, "/purchasing/quotes/" + quote.id + "/offers", {
    method: "POST",
    body: {
      supplierId,
      validUntil: "2030-12-31T23:59:59Z",
      paymentTerm: "30 dias",
      deliveryDays: 5,
      freightAmount,
      freightAllocation: "VALUE",
      items: quote.items.map((item, index) => ({
        quoteItemId: item.id,
        description: item.description,
        quantity: Number(item.quantity),
        unit: item.unit,
        unitPrice: prices[index] ?? prices[0],
        discountPercent: 0,
        taxAmount: 0,
        otherExpenses: 0,
        compatibility,
        technicalReason: "Conferido com a especificação solicitada",
        available: true,
      })),
    },
  });
}
async function choose(
  quote: Quote,
  offerData: { items: Array<{ id: string; quoteItemId: string }> },
  indices: number[],
  mode = "WAREHOUSE",
  token = buyer,
  exceptionReason?: string,
) {
  for (const index of indices) {
    const item = quote.items[index];
    const line = offerData.items.find((i) => i.quoteItemId === item.id)!;
    await apiRequest(token, "/purchasing/quotes/" + quote.id + "/selections", {
      method: "POST",
      body: {
        quoteItemId: item.id,
        offerItemId: line.id,
        justification: "Prazo, preço e compatibilidade conferidos",
        fulfillmentMode: mode,
        exceptionReason,
      },
    });
  }
}
async function approve(quote: Quote) {
  await apiRequest(admin, "/purchasing/quotes/" + quote.id + "/actions", {
    method: "POST",
    body: {
      action: "SUBMIT",
      reason:
        "Fornecedores consultados; escolha e eventuais exclusividades justificadas.",
    },
  });
  const detail = await apiRequest<Quote>(
    admin,
    "/purchasing/quotes/" + quote.id,
  );
  for (const approval of detail.approvals!.filter(
    (a) => a.status === "PENDING",
  ))
    await apiRequest(admin, "/approvals/" + approval.id + "/approve", {
      method: "POST",
      body: { decisionNote: "Condições aprovadas para o cenário PRP." },
    });
}
async function generated(quote: Quote) {
  const ids = await apiRequest<Array<{ id: string }>>(
    buyer,
    "/purchasing/quotes/" + quote.id + "/actions",
    { method: "POST", body: { action: "GENERATE" } },
  );
  return Promise.all(
    ids.map((i) => apiRequest<Order>(admin, "/purchasing/orders/" + i.id)),
  );
}
async function oneOrder(
  item = fixture.items[1],
  quantity = 10,
  mode = "WAREHOUSE",
  origin = "STOCK",
  allocation: Record<string, unknown> = {},
) {
  const req = await need([item], quantity, origin, allocation),
    quote = await rfq(req),
    proposal = await offer(quote, fixture.supplierA.id, [200]);
  await offer(quote, fixture.supplierB.id, [220]);
  await choose(quote, proposal, [0], mode);
  await approve(quote);
  return { req, quote, order: (await generated(quote))[0] };
}
async function receipt(
  order: Order,
  quantity: number,
  requestKey = randomUUID(),
  rejected = 0,
) {
  return apiRequest<{ id: string }>(
    supply,
    "/purchasing/orders/" + order.id + "/receive",
    {
      method: "POST",
      body: {
        requestKey,
        warehouseId:
          order.items[0].fulfillmentMode === "WAREHOUSE"
            ? fixture.warehouse.id
            : undefined,
        items: [
          {
            orderItemId: order.items[0].id,
            acceptedQty: quantity,
            rejectedQty: rejected,
            serialNumbers: [],
            divergence: rejected ? "Avaria conferida" : undefined,
          },
        ],
      },
    },
  );
}
async function invoice(
  order: Order,
  quantity: number,
  amount: number,
  number: string,
  schedule: Array<{ amount: number; dueDate: string }>,
  kind = "STANDARD",
) {
  return apiRequest<{ id: string }>(
    admin,
    "/purchasing/orders/" + order.id + "/invoices",
    {
      method: "POST",
      body: {
        number,
        series: "PRP-" + fixture.suffix,
        kind,
        issueDate: "2026-10-20",
        amount,
        evidence: "Documento fiscal conferido no cenário E2E",
        justification:
          kind === "ADVANCE"
            ? "Adiantamento previsto no contrato de fornecimento"
            : undefined,
        lines:
          kind === "STANDARD"
            ? [{ orderItemId: order.items[0].id, quantity, amount }]
            : [],
        schedule,
      },
    },
  );
}

test("A e D — reposição, entregas parciais e reenvios não duplicam estoque e custos", async () => {
  const flow = await oneOrder(fixture.items[0], 10);
  expect(flow.order.workflowVersion).toBe(2);
  expect(flow.order.commitment?.amount).toBe("2000");
  expect(flow.order.payableEntries).toHaveLength(0);
  const key = randomUUID();
  const first = await Promise.all([
    receipt(flow.order, 4, key),
    receipt(flow.order, 4, key),
  ]);
  expect(first[0].id).toBe(first[1].id);
  let current = await apiRequest<Order>(
    admin,
    "/purchasing/orders/" + flow.order.id,
  );
  expect(current.items[0].receivedQty).toBe(4);
  expect(current.status).toBe("PARTIALLY_RECEIVED");
  const responses = await Promise.all(
    [1, 2].map(() =>
      apiRequestRaw(
        supply,
        "/purchasing/orders/" + flow.order.id + "/receive",
        {
          method: "POST",
          body: {
            requestKey: randomUUID(),
            warehouseId: fixture.warehouse.id,
            items: [
              {
                orderItemId: flow.order.items[0].id,
                acceptedQty: 6,
                rejectedQty: 0,
                serialNumbers: [],
              },
            ],
          },
        },
      ),
    ),
  );
  expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
  current = await apiRequest<Order>(
    admin,
    "/purchasing/orders/" + flow.order.id,
  );
  expect(current.items[0].receivedQty).toBe(10);
  expect(current.procurementReceipts).toHaveLength(2);
  expect(current.status).toBe("RECEIVED");
  expect(current.payableEntries).toHaveLength(0);
  const catalog = await apiRequest<{
    stockCurrent: number;
    averageCost: number;
  }>(admin, "/catalogs/" + fixture.items[0].id);
  expect(catalog.stockCurrent).toBe(20);
  expect(catalog.averageCost).toBeCloseTo(150, 5);
  const request = await apiRequest<PurchaseRequest>(
    admin,
    "/purchasing/requests/" + flow.req.id,
  );
  expect(request.status).toBe("FULFILLED");
  expect(Number(request.items[0].fulfilledQty)).toBe(10);
});
test("C — comparação por item gera dois pedidos sem duplicação concorrente", async () => {
  const req = await need(fixture.items.slice(1, 4), 3),
    quote = await rfq(req);
  const a = await offer(quote, fixture.supplierA.id, [100, 90, 110], 10),
    b = await offer(quote, fixture.supplierB.id, [120, 80, 130], 20);
  await choose(quote, a, [0, 2]);
  await choose(quote, b, [1]);
  await approve(quote);
  const results = await Promise.all(
    [1, 2, 3].map(() =>
      apiRequest<Array<{ id: string }>>(
        buyer,
        "/purchasing/quotes/" + quote.id + "/actions",
        { method: "POST", body: { action: "GENERATE" } },
      ),
    ),
  );
  expect(new Set(results.flat().map((o) => o.id)).size).toBe(2);
  const orders = await Promise.all(
    results[0].map((row) =>
      apiRequest<Order>(admin, "/purchasing/orders/" + row.id),
    ),
  );
  expect(orders.reduce((sum, o) => sum + o.items.length, 0)).toBe(3);
  expect(orders.reduce((sum, o) => sum + o.freightAmount, 0)).toBe(30);
  for (const order of orders) {
    expect(order.payableEntries).toHaveLength(0);
    for (const item of order.items)
      expect(
        item.procurementSelection?.quoteItem.sources[0].requestItem.request.id,
      ).toBe(req.id);
  }
});
test("B — compra preserva O.S., cliente e máquina até a reserva existente", async () => {
  const orderContext = fixture.order,
    flow = await oneOrder(fixture.items[1], 2, "WAREHOUSE", "ORDER", {
      orderId: orderContext.id,
      clientId: orderContext.generator.clientId,
      generatorId: orderContext.generatorId,
    });
  await receipt(flow.order, 2);
  const detail = await apiRequest<Order>(
    admin,
    "/purchasing/orders/" + flow.order.id,
  );
  const allocation =
    detail.items[0].procurementSelection!.quoteItem.sources[0].requestItem
      .allocations[0];
  expect(allocation.orderId).toBe(orderContext.id);
  expect(allocation.generatorId).toBe(orderContext.generatorId);
  const reserved = await apiRequestRaw(supply, "/inventory/reserve", {
    method: "POST",
    body: {
      catalogItemId: fixture.items[1].id,
      quantity: 2,
      referenceType: "MAINTENANCE_ORDER",
      referenceId: orderContext.id,
    },
  });
  expect(reserved.ok, await reserved.text()).toBe(true);
});
test("E — documento, parcelas e pagamento parcial permanecem independentes do recebimento", async () => {
  const { order } = await oneOrder(fixture.items[2], 10);
  await receipt(order, 4);
  const registered = await invoice(order, 4, 800, "PRP-PARTIAL-" + stamp, [
    { amount: 300, dueDate: "2026-11-20" },
    { amount: 500, dueDate: "2026-12-20" },
  ]);
  await Promise.all(
    [1, 2].map(() =>
      apiRequest(
        admin,
        "/purchasing/orders/" +
          order.id +
          "/invoices/" +
          registered.id +
          "/validate",
        { method: "POST", body: {} },
      ),
    ),
  );
  let current = await apiRequest<Order>(
    admin,
    "/purchasing/orders/" + order.id,
  );
  expect(current.payableEntries).toHaveLength(2);
  expect(current.payableEntries.reduce((s, p) => s + p.amount, 0)).toBe(800);
  expect(current.items[0].receivedQty).toBe(4);
  expect(current.status).toBe("PARTIALLY_RECEIVED");
  const banks = await apiRequest<Array<{ id: string }>>(
    admin,
    "/finance/bank-accounts",
  );
  expect(banks.length).toBeGreaterThan(0);
  await apiRequest(
    admin,
    "/finance/payables/" + current.payableEntries[0].id + "/pay",
    { method: "PATCH", body: { bankAccountId: banks[0].id, amount: 100 } },
  );
  current = await apiRequest<Order>(admin, "/purchasing/orders/" + order.id);
  expect(current.payableEntries.find((p) => p.paidAmount > 0)?.paidAmount).toBe(
    100,
  );
  expect(current.items[0].receivedQty).toBe(4);
  const excess = await invoice(order, 7, 1400, "PRP-EXCESS-" + stamp, [
    { amount: 1400, dueDate: "2026-12-20" },
  ]);
  expect(
    (
      await apiRequestRaw(
        admin,
        "/purchasing/orders/" +
          order.id +
          "/invoices/" +
          excess.id +
          "/validate",
        { method: "POST", body: {} },
      )
    ).status,
  ).toBe(400);
});
test("E — adiantamento é separado e compensado na obrigação definitiva", async () => {
  const { order } = await oneOrder(fixture.items[3], 1);
  const advance = await invoice(
    order,
    0,
    50,
    "PRP-ADV-" + stamp,
    [{ amount: 50, dueDate: "2026-11-20" }],
    "ADVANCE",
  );
  await apiRequest(
    admin,
    "/purchasing/orders/" + order.id + "/invoices/" + advance.id + "/validate",
    { method: "POST", body: {} },
  );
  await receipt(order, 1);
  const final = await invoice(order, 1, 200, "PRP-FINAL-" + stamp, [
    { amount: 150, dueDate: "2026-12-20" },
  ]);
  await apiRequest(
    admin,
    "/purchasing/orders/" + order.id + "/invoices/" + final.id + "/validate",
    { method: "POST", body: {} },
  );
  const current = await apiRequest<Order>(
    admin,
    "/purchasing/orders/" + order.id,
  );
  expect(current.payableEntries.reduce((sum, p) => sum + p.amount, 0)).toBe(
    200,
  );
  expect(
    Number(
      current.procurementInvoices.find((i) => i.id === final.id)
        ?.advanceApplied,
    ),
  ).toBe(50);
});
test("F — pedido manual legado continua aprovando, recebendo e mantendo um único título", async () => {
  const legacy = await apiRequest<{
    id: string;
    workflowVersion: number;
    items: Array<{ id: string }>;
  }>(admin, "/purchase-orders", {
    method: "POST",
    body: {
      supplierId: fixture.supplierA.id,
      paymentTerm: "30",
      items: [
        { catalogItemId: fixture.items[3].id, quantity: 1, unitPrice: 40 },
      ],
    },
  });
  expect(legacy.workflowVersion).toBe(1);
  await apiRequest(admin, "/purchase-orders/" + legacy.id + "/status", {
    method: "PATCH",
    body: { status: "APPROVED" },
  });
  const approved = await apiRequest<Order>(
    admin,
    "/purchasing/orders/" + legacy.id,
  );
  expect(approved.payableEntries).toHaveLength(1);
  await apiRequest(admin, "/purchase-orders/" + legacy.id + "/receive", {
    method: "POST",
    body: {
      warehouseId: fixture.warehouse.id,
      items: [{ purchaseOrderItemId: legacy.items[0].id, quantity: 1 }],
    },
  });
  const received = await apiRequest<Order>(
    admin,
    "/purchasing/orders/" + legacy.id,
  );
  expect(received.payableEntries).toHaveLength(1);
  expect(received.payableEntries[0].id).toBe(approved.payableEntries[0].id);
});
test("G — permissões, valores aprovados, excesso e cancelamento não são contornados", async () => {
  const { order, quote } = await oneOrder(fixture.items[1], 1);
  const detail = await apiRequest<Quote>(
    admin,
    "/purchasing/quotes/" + quote.id,
  );
  const approval = detail.approvals![0];
  expect(
    (
      await apiRequestRaw(buyer, "/approvals/" + approval.id + "/approve", {
        method: "POST",
        body: {},
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await apiRequestRaw(buyer, "/purchasing/settings", {
        method: "PATCH",
        body: { enabled: false },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await apiRequestRaw(buyer, "/purchasing/quotes/" + quote.id + "/offers", {
        method: "POST",
        body: {
          supplierId: fixture.supplierA.id,
          validUntil: "2030-12-31T00:00:00Z",
          paymentTerm: "30",
          deliveryDays: 1,
          freightAmount: 0,
          freightAllocation: "VALUE",
          items: [],
        },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await apiRequestRaw(admin, "/purchase-orders/" + order.id + "/status", {
        method: "PATCH",
        body: { status: "RECEIVED" },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await apiRequestRaw(
        supply,
        "/purchasing/orders/" + order.id + "/receive",
        {
          method: "POST",
          body: {
            requestKey: randomUUID(),
            warehouseId: fixture.warehouse.id,
            items: [
              {
                orderItemId: order.items[0].id,
                acceptedQty: 2,
                rejectedQty: 0,
                serialNumbers: [],
              },
            ],
          },
        },
      )
    ).status,
  ).toBe(400);
  await receipt(order, 1);
  expect(
    (
      await apiRequestRaw(
        admin,
        "/purchasing/orders/" + order.id + "/actions",
        {
          method: "POST",
          body: { action: "CANCEL", reason: "Tentativa após movimentação" },
        },
      )
    ).status,
  ).toBe(400);
  const body = await bodyRequest([fixture.items[2]], 1, "INTERNAL");
  body.department = "Financeiro";
  expect(
    (
      await apiRequestRaw(assistant, "/purchasing/requests", {
        method: "POST",
        body,
      })
    ).status,
  ).toBe(403);
  expect(
    (await apiRequestRaw(assistant, "/purchasing/quotes/" + quote.id)).status,
  ).toBe(403);
});
test("H — serviço e entrega direta não simulam estoque físico", async () => {
  for (const [item, mode] of [
    [fixture.service, "SERVICE"],
    [fixture.items[2], "DIRECT"],
  ] as const) {
    const before = await apiRequest<{ stockCurrent: number }>(
      admin,
      "/catalogs/" + item.id,
    );
    const { order } = await oneOrder(item, 1, mode, "ORDER", {
      orderId: fixture.order.id,
      clientId: fixture.order.generator.clientId,
      generatorId: fixture.order.generatorId,
    });
    await receipt(order, 1);
    const after = await apiRequest<{ stockCurrent: number }>(
      admin,
      "/catalogs/" + item.id,
    );
    expect(after.stockCurrent).toBe(before.stockCurrent);
    expect(
      (await apiRequest<Order>(admin, "/purchasing/orders/" + order.id)).status,
    ).toBe("RECEIVED");
  }
});
test("H — várias solicitações são consolidadas mantendo atendimento individual", async () => {
  const a = await need([fixture.items[3]], 2, "INTERNAL"),
    b = await need([fixture.items[3]], 3, "INTERNAL");
  const quote = await apiRequest<Quote>(buyer, "/purchasing/quotes", {
    method: "POST",
    body: {
      requestKey: randomUUID(),
      title: "PRP Consolidada",
      groups: [
        {
          sources: [
            { requestItemId: a.items[0].id, quantity: 2 },
            { requestItemId: b.items[0].id, quantity: 3 },
          ],
        },
      ],
      supplierIds: [fixture.supplierA.id, fixture.supplierB.id],
    },
  });
  const supplier = await offer(quote, fixture.supplierA.id, [20]);
  await offer(quote, fixture.supplierB.id, [22]);
  await choose(quote, supplier, [0]);
  await approve(quote);
  const order = (await generated(quote))[0];
  expect(order.items[0].procurementSelection!.quoteItem.sources).toHaveLength(
    2,
  );
  await receipt(order, 2);
  expect(
    Number(
      (await apiRequest<PurchaseRequest>(admin, "/purchasing/requests/" + a.id))
        .items[0].fulfilledQty,
    ),
  ).toBe(2);
  expect(
    Number(
      (await apiRequest<PurchaseRequest>(admin, "/purchasing/requests/" + b.id))
        .items[0].fulfilledQty,
    ),
  ).toBe(0);
  await receipt(order, 1);
  expect(
    Number(
      (await apiRequest<PurchaseRequest>(admin, "/purchasing/requests/" + b.id))
        .items[0].fulfilledQty,
    ),
  ).toBe(1);
  await receipt(order, 2);
  for (const req of [a, b]) {
    const saved = await apiRequest<PurchaseRequest>(
      admin,
      "/purchasing/requests/" + req.id,
    );
    expect(saved.status).toBe("FULFILLED");
  }
});
test("G e H — nova proposta exige versão atual e rejeição técnica exige exceção", async () => {
  const req = await need([fixture.items[1]], 1),
    quote = await rfq(req);
  const old = await offer(quote, fixture.supplierA.id, [50]),
    latest = await offer(quote, fixture.supplierA.id, [45]);
  expect(
    (
      await apiRequestRaw(
        buyer,
        "/purchasing/quotes/" + quote.id + "/selections",
        {
          method: "POST",
          body: {
            quoteItemId: quote.items[0].id,
            offerItemId: old.items[0].id,
            justification: "Versão antiga",
            fulfillmentMode: "WAREHOUSE",
          },
        },
      )
    ).status,
  ).toBe(400);
  const incompatible = await offer(
    quote,
    fixture.supplierB.id,
    [40],
    0,
    "REJECTED",
  );
  expect(
    (
      await apiRequestRaw(
        buyer,
        "/purchasing/quotes/" + quote.id + "/selections",
        {
          method: "POST",
          body: {
            quoteItemId: quote.items[0].id,
            offerItemId: incompatible.items[0].id,
            justification: "Preço menor",
            fulfillmentMode: "WAREHOUSE",
          },
        },
      )
    ).status,
  ).toBe(403);
  await choose(quote, latest, [0]);
  const detail = await apiRequest<Quote>(
    admin,
    "/purchasing/quotes/" + quote.id,
  );
  expect(detail.offers).toHaveLength(3);
  expect(detail.items[0].selection?.offerItemId).toBe(latest.items[0].id);
});
test("UI — solicitação sem fornecedor, análise e navegação conectada", async ({
  page,
}) => {
  test.setTimeout(180000);
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/purchase-orders/requests/new");
  await expect(
    page.getByRole("heading", { name: "Nova solicitação", exact: true }),
  ).toBeVisible({ timeout: 90000 });
  await expect(page.getByLabel("Fornecedor", { exact: true })).toHaveCount(0);
  await page
    .getByLabel("Departamento solicitante", { exact: true })
    .fill("Suprimentos");
  await page
    .getByLabel("Origem da necessidade", { exact: true })
    .selectOption("INTERNAL");
  await page
    .getByLabel("Justificativa da necessidade", { exact: true })
    .fill("PRP interface " + stamp);
  await page
    .getByLabel("Descrição do item 1", { exact: true })
    .fill("Necessidade descritiva PRP");
  await page
    .getByRole("button", { name: "Salvar solicitação", exact: true })
    .click();
  await expect(page).toHaveURL(/requests\/[a-f0-9-]+$/, { timeout: 30000 });
  await page
    .getByRole("button", { name: "Enviar para análise", exact: true })
    .click();
  await expect(
    page.getByText("Aguardando análise", { exact: true }).last(),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Concluir análise de Suprimentos",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Iniciar cotação", exact: true }),
  ).toBeVisible();
});

test("H — alçada configurável, propostas insuficientes e compra emergencial", async () => {
  const me = await apiRequest<{ id: string }>(admin, "/users/me");
  const scope = "PRP-SCOPE-" + stamp;
  await apiRequest(admin, "/purchasing/rules", {
    method: "POST",
    body: {
      name: scope,
      active: true,
      minAmount: 0,
      maxAmount: 1000000,
      department: scope,
      minimumOffers: 2,
      approverUserId: me.id,
    },
  });
  const body = await bodyRequest([fixture.items[1]], 1);
  body.department = scope;
  const req = await apiRequest<PurchaseRequest>(admin, "/purchasing/requests", {
    method: "POST",
    body,
  });
  for (const action of ["SUBMIT", "ANALYZE"])
    await apiRequest(admin, "/purchasing/requests/" + req.id + "/actions", {
      method: "POST",
      body: { action },
    });
  const quote = await rfq(req),
    proposal = await offer(quote, fixture.supplierA.id, [30]);
  await choose(quote, proposal, [0]);
  await apiRequest(buyer, "/purchasing/quotes/" + quote.id + "/invitations", {
    method: "POST",
    body: {
      supplierId: fixture.supplierB.id,
      status: "NO_RESPONSE",
      notes: "Fornecedor sem resposta no prazo.",
    },
  });
  expect(
    (
      await apiRequestRaw(
        buyer,
        "/purchasing/quotes/" + quote.id + "/actions",
        { method: "POST", body: { action: "SUBMIT" } },
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await apiRequestRaw(
        admin,
        "/purchasing/quotes/" + quote.id + "/actions",
        { method: "POST", body: { action: "SUBMIT" } },
      )
    ).status,
  ).toBe(400);
  await apiRequest(admin, "/purchasing/quotes/" + quote.id + "/actions", {
    method: "POST",
    body: {
      action: "SUBMIT",
      reason: "Fornecedor exclusivo disponível para cumprir a emergência.",
    },
  });
  const queued = await apiRequest<Quote>(
    admin,
    "/purchasing/quotes/" + quote.id,
  );
  expect(queued.status).toBe("AWAITING_APPROVAL");
  expect(queued.approvals?.filter((a) => a.status === "PENDING")).toHaveLength(
    1,
  );
  const emergency = {
    ...(await bodyRequest([fixture.items[1]], 1)),
    department: "Compras",
    priority: "EMERGENCY",
  };
  expect(
    (
      await apiRequestRaw(buyer, "/purchasing/requests", {
        method: "POST",
        body: emergency,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await apiRequestRaw(admin, "/purchasing/requests", {
        method: "POST",
        body: { ...emergency, requestKey: randomUUID() },
      })
    ).status,
  ).toBe(201);
});
test("G — retirada do fornecedor invalida a seleção e cancelamento libera nova cotação", async () => {
  const req = await need([fixture.items[1]], 1),
    quote = await rfq(req),
    a = await offer(quote, fixture.supplierA.id, [30]);
  await offer(quote, fixture.supplierB.id, [32]);
  await choose(quote, a, [0]);
  await apiRequest(buyer, "/purchasing/quotes/" + quote.id + "/invitations", {
    method: "POST",
    body: {
      supplierId: fixture.supplierA.id,
      status: "DECLINED",
      notes: "Fornecedor retirou a proposta.",
    },
  });
  const updated = await apiRequest<Quote>(
    admin,
    "/purchasing/quotes/" + quote.id,
  );
  expect(updated.items[0].selection).toBeNull();
  expect(
    (
      await apiRequestRaw(
        buyer,
        "/purchasing/quotes/" + quote.id + "/selections",
        {
          method: "POST",
          body: {
            quoteItemId: quote.items[0].id,
            offerItemId: a.items[0].id,
            justification: "Tentativa de fornecedor retirado",
            fulfillmentMode: "WAREHOUSE",
          },
        },
      )
    ).status,
  ).toBe(400);
  const flow = await oneOrder(fixture.items[3], 1);
  await apiRequest(buyer, "/purchasing/orders/" + flow.order.id + "/actions", {
    method: "POST",
    body: { action: "CANCEL", reason: "Necessidade de negociar novamente." },
  });
  const retry = await rfq(flow.req);
  expect(retry.id).not.toBe(flow.quote.id);
  const fresh = await need([fixture.items[3]], 1),
    payload = {
      title: "Concorrência de cotação",
      groups: [
        { sources: [{ requestItemId: fresh.items[0].id, quantity: 1 }] },
      ],
      supplierIds: [fixture.supplierA.id],
    };
  const parallel = await Promise.all(
    [1, 2].map(() =>
      apiRequestRaw(buyer, "/purchasing/quotes", {
        method: "POST",
        body: { ...payload, requestKey: randomUUID() },
      }),
    ),
  );
  expect(parallel.map((r) => r.status).sort()).toEqual([201, 400]);
});
test("H — garantia e substituto aprovado mantêm origem e produto realmente comprado", async () => {
  expect(fixture.warranty).toBeTruthy();
  const warranty = fixture.warranty!;
  const req = await need([fixture.items[1]], 1, "WARRANTY", {
    warrantyId: warranty.id,
    clientId: warranty.clientId,
    generatorId: warranty.generatorId,
  });
  const quote = await rfq(req);
  const proposal = await apiRequest<{
    items: Array<{ id: string; quoteItemId: string }>;
  }>(buyer, "/purchasing/quotes/" + quote.id + "/offers", {
    method: "POST",
    body: {
      supplierId: fixture.supplierA.id,
      validUntil: "2030-12-31T23:59:59Z",
      paymentTerm: "30 dias",
      deliveryDays: 2,
      freightAmount: 0,
      freightAllocation: "VALUE",
      negotiatedContract: "Tabela negociada de fornecimento PRP",
      items: [
        {
          quoteItemId: quote.items[0].id,
          catalogItemId: fixture.items[2].id,
          description: "Substituto técnico aprovado",
          reference: "REF-PRP",
          manufacturer: "Fabricante PRP",
          quantity: 1,
          unit: "UN",
          unitPrice: 40,
          discountPercent: 0,
          taxAmount: 0,
          otherExpenses: 0,
          compatibility: "APPROVED",
          technicalReason:
            "Equivalência técnica conferida para este equipamento.",
          available: true,
        },
      ],
    },
  });
  await choose(quote, proposal, [0]);
  await approve(quote);
  const order = (await generated(quote))[0];
  expect(order.items[0].catalogItemId).toBe(fixture.items[2].id);
  expect(
    order.items[0].procurementSelection?.quoteItem.sources[0].requestItem
      .allocations[0].warrantyId,
  ).toBe(warranty.id);
});
test("H — propostas vencidas e versões arquivadas não podem ser selecionadas", async () => {
  const req = await need([fixture.items[3]], 1),
    quote = await rfq(req);
  const proposal = await apiRequest<{
    items: Array<{ id: string; quoteItemId: string }>;
  }>(buyer, "/purchasing/quotes/" + quote.id + "/offers", {
    method: "POST",
    body: {
      supplierId: fixture.supplierA.id,
      validUntil: new Date(Date.now() + 8000).toISOString(),
      paymentTerm: "30 dias",
      deliveryDays: 2,
      freightAmount: 0,
      freightAllocation: "VALUE",
      items: [
        {
          quoteItemId: quote.items[0].id,
          description: quote.items[0].description,
          quantity: 1,
          unit: "UN",
          unitPrice: 40,
          discountPercent: 0,
          taxAmount: 0,
          otherExpenses: 0,
          compatibility: "APPROVED",
          technicalReason: "Compatível",
          available: true,
        },
      ],
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 8500));
  expect(
    (
      await apiRequestRaw(
        buyer,
        "/purchasing/quotes/" + quote.id + "/selections",
        {
          method: "POST",
          body: {
            quoteItemId: quote.items[0].id,
            offerItemId: proposal.items[0].id,
            justification: "Tentativa vencida",
            fulfillmentMode: "WAREHOUSE",
          },
        },
      )
    ).status,
  ).toBe(400);
});
test("G — anexos comerciais pertencem à versão e exigem autorização", async () => {
  const req = await need([fixture.items[2]], 1),
    quote = await rfq(req),
    proposal = await offer(quote, fixture.supplierA.id, [20]);
  const form = new FormData();
  form.append(
    "file",
    new Blob(["%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF"], {
      type: "application/pdf",
    }),
    "proposta-prp.pdf",
  );
  const uploaded = await fetch(
    API_BASE_URL + "/purchasing/attachments/OFFER/" + proposal.id,
    {
      method: "POST",
      headers: { Authorization: "Bearer " + buyer },
      body: form,
    },
  );
  expect(uploaded.status, await uploaded.clone().text()).toBe(201);
  const file = (await uploaded.json()) as { id: string };
  const detail = await apiRequest<Quote>(
    admin,
    "/purchasing/quotes/" + quote.id,
  );
  expect(
    detail.offers
      .find((o) => o.id === proposal.id)
      ?.attachments?.some((a) => a.id === file.id),
  ).toBe(true);
  expect(
    (
      await apiRequestRaw(
        assistant,
        "/purchasing/attachments/" + file.id + "/download",
      )
    ).status,
  ).toBe(403);
  const downloaded = await apiRequestRaw(
    buyer,
    "/purchasing/attachments/" + file.id + "/download",
  );
  expect(downloaded.status).toBe(200);
  expect(downloaded.headers.get("content-type")).toContain("application/pdf");
});
test("E — correção de rascunho é possível e documento validado é imutável", async () => {
  const { order } = await oneOrder(fixture.items[1], 1);
  await receipt(order, 1);
  const number = "PRP-CORR-" + stamp;
  const document = await invoice(order, 1, 200, number, [
    { amount: 190, dueDate: "2026-11-20" },
  ]);
  expect(
    (
      await apiRequestRaw(
        admin,
        "/purchasing/orders/" +
          order.id +
          "/invoices/" +
          document.id +
          "/validate",
        { method: "POST", body: {} },
      )
    ).status,
  ).toBe(400);
  const corrected = {
    number,
    series: "PRP-" + fixture.suffix,
    kind: "STANDARD",
    issueDate: "2026-10-20",
    amount: 200,
    evidence: "Conferência documental corrigida",
    lines: [{ orderItemId: order.items[0].id, quantity: 1, amount: 200 }],
    schedule: [{ amount: 200, dueDate: "2026-11-20" }],
  };
  await apiRequest(
    admin,
    "/purchasing/orders/" + order.id + "/invoices/" + document.id,
    { method: "PATCH", body: corrected },
  );
  await apiRequest(
    admin,
    "/purchasing/orders/" + order.id + "/invoices/" + document.id + "/validate",
    { method: "POST", body: {} },
  );
  expect(
    (
      await apiRequestRaw(
        admin,
        "/purchasing/orders/" + order.id + "/invoices/" + document.id,
        { method: "PATCH", body: corrected },
      )
    ).status,
  ).toBe(400);
  const saved = await apiRequest<Order>(
    admin,
    "/purchasing/orders/" + order.id,
  );
  expect(saved.payableEntries).toHaveLength(1);
});
test("Ativação — desligar preserva operações existentes e impede novas solicitações", async () => {
  const { order } = await oneOrder(fixture.items[1], 1);
  await apiRequest(admin, "/purchasing/settings", {
    method: "PATCH",
    body: { enabled: false },
  });
  try {
    expect(
      (
        await apiRequestRaw(admin, "/purchasing/requests", {
          method: "POST",
          body: await bodyRequest([fixture.items[1]], 1),
        })
      ).status,
    ).toBe(400);
    expect(
      (await apiRequest<Order>(admin, "/purchasing/orders/" + order.id)).id,
    ).toBe(order.id);
    await receipt(order, 1);
  } finally {
    await apiRequest(admin, "/purchasing/settings", {
      method: "PATCH",
      body: { enabled: true },
    });
  }
});

test("D — frações em duas cotações atendem a mesma necessidade sem sobra", async () => {
  const req = await need([fixture.items[2]], 0.3);
  for (const quantity of [0.1, 0.2]) {
    const quote = await apiRequest<Quote>(buyer, "/purchasing/quotes", {
      method: "POST",
      body: {
        requestKey: randomUUID(),
        title: "PRP Fracionada",
        groups: [{ sources: [{ requestItemId: req.items[0].id, quantity }] }],
        supplierIds: [fixture.supplierA.id, fixture.supplierB.id],
      },
    });
    const proposal = await offer(quote, fixture.supplierA.id, [10]);
    await offer(quote, fixture.supplierB.id, [11]);
    await choose(quote, proposal, [0]);
    await approve(quote);
    const order = (await generated(quote))[0];
    await receipt(order, quantity);
    const saved = await apiRequest<Order>(
      admin,
      "/purchasing/orders/" + order.id,
    );
    expect(saved.status).toBe("RECEIVED");
    expect(saved.items[0].receivedQty).toBe(quantity);
  }
  const result = await apiRequest<PurchaseRequest>(
    admin,
    "/purchasing/requests/" + req.id,
  );
  expect(result.status).toBe("FULFILLED");
  expect(Number(result.items[0].fulfilledQty)).toBe(0.3);
  expect(Number(result.items[0].allocations[0].fulfilledQty)).toBe(0.3);
});

test("D — recebimento respeita almoxarifado e registra a alocação exata", async () => {
  const body = await bodyRequest([fixture.items[3]], 5);
  body.items[0].allocations = [
    { origin: "STOCK", quantity: 2, warehouseId: fixture.warehouse.id },
    { origin: "STOCK", quantity: 3, warehouseId: fixture.warehouse2.id },
  ];
  const req = await apiRequest<PurchaseRequest>(admin, "/purchasing/requests", {
    method: "POST",
    body,
  });
  for (const action of ["SUBMIT", "ANALYZE"])
    await apiRequest(admin, "/purchasing/requests/" + req.id + "/actions", {
      method: "POST",
      body: { action },
    });
  const quote = await rfq(req),
    proposal = await offer(quote, fixture.supplierA.id, [20]);
  await offer(quote, fixture.supplierB.id, [22]);
  await choose(quote, proposal, [0]);
  await approve(quote);
  const order = (await generated(quote))[0];
  const payload = (quantity: number, warehouseId: string) => ({
    requestKey: randomUUID(),
    warehouseId,
    items: [
      {
        orderItemId: order.items[0].id,
        acceptedQty: quantity,
        rejectedQty: 0,
        serialNumbers: [],
      },
    ],
  });
  expect(
    (
      await apiRequestRaw(
        supply,
        "/purchasing/orders/" + order.id + "/receive",
        { method: "POST", body: payload(3, fixture.warehouse.id) },
      )
    ).status,
  ).toBe(400);
  expect(
    (await apiRequest<Order>(admin, "/purchasing/orders/" + order.id)).items[0]
      .receivedQty,
  ).toBe(0);
  await apiRequest(supply, "/purchasing/orders/" + order.id + "/receive", {
    method: "POST",
    body: payload(3, fixture.warehouse2.id),
  });
  let saved = await apiRequest<PurchaseRequest>(
    admin,
    "/purchasing/requests/" + req.id,
  );
  expect(
    Number(
      saved.items[0].allocations.find(
        (a) => a.warehouseId === fixture.warehouse2.id,
      )?.fulfilledQty,
    ),
  ).toBe(3);
  expect(
    Number(
      saved.items[0].allocations.find(
        (a) => a.warehouseId === fixture.warehouse.id,
      )?.fulfilledQty,
    ),
  ).toBe(0);
  await receipt(order, 2);
  saved = await apiRequest<PurchaseRequest>(
    admin,
    "/purchasing/requests/" + req.id,
  );
  expect(saved.status).toBe("FULFILLED");
  const audit = await apiRequest<Order>(
    admin,
    "/purchasing/orders/" + order.id,
  );
  expect(
    audit.procurementReceipts
      .flatMap((r) => r.items)
      .every((i) => i.allocations?.length === 1),
  ).toBe(true);
});

test("G — permissão legada isolada não abre solicitações de outros departamentos", async () => {
  const preset = profiles.find((p) => p.id === "ADMIN_ASSISTANT")!,
    policy = structuredClone(preset.accessPolicy);
  policy.purchaseOrders.approve = true;
  const account = {
    ...accounts.hr,
    email: "scoped-" + stamp + "@prp.manitec.test",
    password: "PrpWorkflow@2026",
  };
  const user = await apiRequest<{ id: string }>(admin, "/users", {
    method: "POST",
    body: {
      name: "PRP escopo legado",
      role: preset.role,
      department: preset.department,
      email: account.email,
      password: account.password,
      accessPolicy: policy,
      accessRules: preset.accessRules,
    },
  });
  users.push(user.id);
  const token = (await apiLogin(account)).access_token;
  const other = await need([fixture.items[2]], 1);
  expect(
    (await apiRequestRaw(token, "/purchasing/requests/" + other.id)).status,
  ).toBe(403);
  const payload = await bodyRequest([fixture.items[2]], 1, "INTERNAL");
  payload.department = preset.department;
  const own = await apiRequest<PurchaseRequest>(token, "/purchasing/requests", {
    method: "POST",
    body: payload,
  });
  await apiRequest(token, "/purchasing/requests/" + own.id + "/actions", {
    method: "POST",
    body: { action: "SUBMIT" },
  });
  const detail = await apiRequest<PurchaseRequest>(
    token,
    "/purchasing/requests/" + own.id,
  );
  expect(detail.analysis?.flatMap((a) => a.duplicates)).toHaveLength(0);
  expect(
    (
      await apiRequest<{ items: PurchaseRequest[] }>(
        token,
        "/purchasing/requests",
      )
    ).items.every((r) => r.id === own.id),
  ).toBe(true);
});

test("UI — mapa comparativo escuro, pedido no celular e parcela financeira conectada", async ({
  page,
}, info) => {
  const { quote, order } = await oneOrder(fixture.items[3], 1);
  await receipt(order, 1);
  const doc = await invoice(order, 1, 200, "PRP-UI-" + stamp, [
    { amount: 200, dueDate: "2026-11-20" },
  ]);
  await apiRequest(
    admin,
    "/purchasing/orders/" + order.id + "/invoices/" + doc.id + "/validate",
    { method: "POST", body: {} },
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/purchase-orders/quotations/" + quote.id);
  await expect(
    page.getByRole("heading", { name: "Mapa comparativo", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tema", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Aparência" });
  await dialog.getByRole("button", { name: "Escuro", exact: true }).click();
  await dialog.getByRole("button", { name: /Grafite/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveAttribute(
    "data-manitec-mode",
    "dark",
  );
  const surface = await page
    .getByRole("heading", { name: "Mapa comparativo", exact: true })
    .evaluate((el) => getComputedStyle(el.closest("section")!).backgroundColor);
  expect(surface).not.toBe("rgb(255, 255, 255)");
  await page.screenshot({
    path: info.outputPath("compras-comparativo-escuro.png"),
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/purchase-orders/" + order.id);
  await expect(
    page.getByRole("heading", { name: new RegExp("^" + order.code) }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("compras-pedido-celular.png"),
    fullPage: false,
  });
  await page.locator('a[href*="payableId="]').first().click();
  await expect(page).toHaveURL(/payableId=/);
  await expect(
    page.getByText("Títulos vinculados à compra selecionada.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("1 titulo(s) na visao atual", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("G — compra consolidada exige todas as alçadas e cobre o departamento sem regra", async () => {
  const preset = profiles.find((p) => p.id === "SUPPLIES")!,
    policy = structuredClone(preset.accessPolicy),
    rules = structuredClone(preset.accessRules);
  policy.purchaseOrders.approve = true;
  rules.screens.purchasingApprovals = {
    view: true,
    actions: { approve: true },
  };
  const account = {
    ...accounts.hr,
    email: "approver-" + stamp + "@prp.manitec.test",
    password: "PrpWorkflow@2026",
  };
  const manager = await apiRequest<{ id: string }>(admin, "/users", {
    method: "POST",
    body: {
      name: "PRP Gestor de alçada",
      email: account.email,
      password: account.password,
      role: preset.role,
      department: "Gestão de compras",
      accessPolicy: policy,
      accessRules: rules,
    },
  });
  users.push(manager.id);
  const token = (await apiLogin(account)).access_token;
  const department = "PRP-MIX-" + stamp;
  await apiRequest(admin, "/purchasing/rules", {
    method: "POST",
    body: {
      name: department,
      active: true,
      minAmount: 0,
      maxAmount: 100000,
      department,
      minimumOffers: 1,
      approverUserId: manager.id,
    },
  });
  const body = await bodyRequest([fixture.items[1]], 1);
  body.department = department;
  const first = await apiRequest<PurchaseRequest>(
    admin,
    "/purchasing/requests",
    { method: "POST", body },
  );
  for (const action of ["SUBMIT", "ANALYZE"])
    await apiRequest(admin, "/purchasing/requests/" + first.id + "/actions", {
      method: "POST",
      body: { action },
    });
  const second = await need([fixture.items[1]], 1);
  const quote = await apiRequest<Quote>(buyer, "/purchasing/quotes", {
    method: "POST",
    body: {
      requestKey: randomUUID(),
      title: "PRP Alçadas combinadas",
      groups: [
        {
          sources: [
            { requestItemId: first.items[0].id, quantity: 1 },
            { requestItemId: second.items[0].id, quantity: 1 },
          ],
        },
      ],
      supplierIds: [fixture.supplierA.id, fixture.supplierB.id],
    },
  });
  const proposal = await offer(quote, fixture.supplierA.id, [50]);
  await offer(quote, fixture.supplierB.id, [55]);
  await choose(quote, proposal, [0]);
  await apiRequest(buyer, "/purchasing/quotes/" + quote.id + "/actions", {
    method: "POST",
    body: { action: "SUBMIT" },
  });
  let detail = await apiRequest<Quote>(admin, "/purchasing/quotes/" + quote.id);
  expect(detail.approvals?.filter((a) => a.status === "PENDING")).toHaveLength(
    2,
  );
  const queue = await apiRequest<Array<{ id: string; entityId: string }>>(
    token,
    "/purchasing/approvals",
  );
  const assigned = queue.find((a) => a.entityId === quote.id)!;
  expect(assigned).toBeTruthy();
  await apiRequest(token, "/approvals/" + assigned.id + "/approve", {
    method: "POST",
    body: { decisionNote: "Alçada do departamento aprovada." },
  });
  detail = await apiRequest<Quote>(admin, "/purchasing/quotes/" + quote.id);
  expect(detail.status).toBe("AWAITING_APPROVAL");
  expect(
    (
      await apiRequestRaw(
        buyer,
        "/purchasing/quotes/" + quote.id + "/actions",
        { method: "POST", body: { action: "GENERATE" } },
      )
    ).status,
  ).toBe(400);
  for (const a of detail.approvals!.filter((a) => a.status === "PENDING"))
    await apiRequest(admin, "/approvals/" + a.id + "/approve", {
      method: "POST",
      body: { decisionNote: "Necessidade sem alçada específica conferida." },
    });
  expect(
    (await apiRequest<Quote>(admin, "/purchasing/quotes/" + quote.id)).status,
  ).toBe("APPROVED");
});
