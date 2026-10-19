import { expect, test } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  apiRequestRaw,
  loginByApi,
} from "./helpers/auth";
import { accounts, API_BASE_URL } from "./helpers/test-data";
test.use({ actionTimeout: 20000 });
const password = "AccessRulesE2E!2026";
let admin: string,
  parts: any,
  generators: any,
  manager: any,
  clientId: string,
  equipmentId: string,
  servicesPaymentProfileId: string;
const created: any[] = [];
const empty = {
  version: 1,
  screens: {},
  commercial: { generators: false, partsServices: false, contracts: false },
  orderTypes: {},
  onCallShifts: [],
};
const account = (user: any) => ({
  ...accounts.sales,
  email: user.email,
  password,
});
test.beforeAll(async () => {
  if (new URL(API_BASE_URL).port !== "3100")
    throw new Error("Este teste exige o ambiente isolado na porta 3100.");
  admin = (await apiLogin(accounts.admin)).access_token;
  const clients = await apiRequest<any[]>(admin, "/clients/lookup?take=1");
  clientId = clients[0].id;
  const equipment = await apiRequest<any[]>(admin, "/generators");
  equipmentId = equipment[0].id;
  const profiles = await apiRequest<any[]>(
    admin,
    "/proposals/payment-profiles",
  );
  servicesPaymentProfileId = profiles.find((p) => p.purpose === "SERVICES")?.id;
  expect(servicesPaymentProfileId).toBeTruthy();
  const stamp = Date.now();
  async function create(label: string, commercial: any, role = "SALES") {
    const user = await apiRequest<any>(admin, "/users", {
      method: "POST",
      body: {
        name: label + " " + stamp,
        email: label + stamp + "@manitec.test",
        password,
        role,
        approvalDiscountLimit: 5,
        accessRules: { ...empty, commercial },
        accessPolicy: {
          pages: { proposals: true, contracts: true, orders: true },
          orders: { view: true, create: true },
        },
      },
    });
    created.push(user);
    return user;
  }
  parts = await create("parts", { ...empty.commercial, partsServices: true });
  generators = await create("generators", {
    ...empty.commercial,
    generators: true,
  });
  manager = await create(
    "manager",
    { generators: true, partsServices: true, contracts: true },
    "MANAGER",
  );
});
test.afterAll(async () => {
  for (const u of created)
    await apiRequest(admin, "/users/" + u.id, {
      method: "PATCH",
      body: { isActive: false },
    });
});
test("separa carteiras na lista, acesso direto, indicadores e documentos", async () => {
  const ids: any[] = [];
  for (const [pipeline, type] of [
    ["COMMERCIAL_03_PARTS_SERVICES", "FIELD_SERVICE"],
    ["COMMERCIAL_01_GENERATORS", "GENERATOR_SALE"],
    ["COMMERCIAL_02_CONTRACTS", "MAINTENANCE_CONTRACT"],
  ]) {
    ids.push(
      await apiRequest<any>(admin, "/crm/opportunities", {
        method: "POST",
        body: {
          title: "Carteira E2E " + pipeline,
          clientId,
          pipeline,
          opportunityType: type,
          estimatedValue: 1000,
        },
      }),
    );
  }
  const token = (await apiLogin(account(parts))).access_token;
  const rows = await apiRequest<any[]>(token, "/crm/opportunities");
  expect(rows.every((r) => r.pipeline === "COMMERCIAL_03_PARTS_SERVICES")).toBe(
    true,
  );
  expect(
    (await apiRequestRaw(token, "/crm/opportunities/" + ids[1].id)).status,
  ).toBe(403);
  expect((await apiRequestRaw(token, "/contracts")).status).toBe(403);
  expect(
    (
      await apiRequestRaw(
        token,
        "/crm/opportunities?pipeline=COMMERCIAL_02_CONTRACTS",
      )
    ).status,
  ).toBe(403);
  const all = await apiRequest<any[]>(
    (await apiLogin(account(manager))).access_token,
    "/crm/opportunities",
  );
  for (const item of ids) expect(all.some((r) => r.id === item.id)).toBe(true);
  const proposal = await apiRequest<any>(admin, "/proposals", {
    method: "POST",
    body: {
      type: "CONTRACT",
      clientId,
      userId: manager.id,
      servicesPaymentProfileId,
      items: [
        {
          kind: "OTHER",
          description: "Cobertura E2E",
          quantity: 1,
          unitPrice: 100,
        },
      ],
    },
  });
  expect((await apiRequestRaw(token, "/proposals/" + proposal.id)).status).toBe(
    403,
  );
  expect(
    (await apiRequestRaw(token, "/documents/proposals/" + proposal.id)).status,
  ).toBe(403);
  const customer = await apiRequest<any>(token, "/clients/" + clientId);
  expect(
    customer.proposals.every(
      (p: any) => p.type !== "CONTRACT" && p.type !== "GENERATOR_SALE",
    ),
  ).toBe(true);
});
test("aplica desconto individual em oportunidades e propostas, somando descontos", async () => {
  const token = (await apiLogin(account(parts))).access_token;
  const payload = {
    title: "Alçada E2E",
    clientId,
    pipeline: "COMMERCIAL_03_PARTS_SERVICES",
    opportunityType: "FIELD_SERVICE",
    estimatedValue: 100,
    discountPercent: 5,
  };
  const opportunity = await apiRequest<any>(token, "/crm/opportunities", {
    method: "POST",
    body: payload,
  });
  expect(opportunity.discountPercent).toBe(5);
  expect(
    (
      await apiRequestRaw(token, "/crm/opportunities/" + opportunity.id, {
        method: "PATCH",
        body: { discountPercent: 5.01 },
      })
    ).status,
  ).toBe(403);
  const proposal = {
    type: "PARTS_AND_SERVICES",
    clientId,
    userId: parts.id,
    servicesPaymentProfileId,
    discount: 1,
    items: [
      {
        kind: "OTHER",
        description: "Serviço E2E",
        quantity: 1,
        unitPrice: 100,
        discountPercent: 5,
      },
    ],
  };
  const blocked = await apiRequestRaw(token, "/proposals", {
    method: "POST",
    body: proposal,
  });
  expect(blocked.status).toBe(403);
  await apiRequest(admin, "/users/" + parts.id, {
    method: "PATCH",
    body: { approvalDiscountLimit: 10 },
  });
  const allowed = await apiRequestRaw(token, "/proposals", {
    method: "POST",
    body: proposal,
  });
  expect(allowed.status).toBe(201); // Old token must immediately use the new ceiling from the database.
});
test("tipos de tarefa são restritos e técnicos dependem de um plantão válido", async () => {
  const stamp = Date.now();
  const tech = await apiRequest<any>(admin, "/users", {
    method: "POST",
    body: {
      name: "Plantão E2E " + stamp,
      email: "plantao" + stamp + "@manitec.test",
      password,
      role: "TECHNICIAN",
      technicianProfile: {
        cpf: String(stamp).slice(-11),
        phone: "11999999999",
        skills: [],
      },
      accessPolicy: { orders: { create: true, view: true, finish: false } },
      accessRules: {
        ...empty,
        orderTypes: { EMERGENCY: true },
        onCallShifts: [],
      },
    },
  });
  created.push(tech);
  const token = (await apiLogin(account(tech))).access_token;
  const payload = {
    title: "Emergência em plantão",
    generatorId: equipmentId,
    type: "EMERGENCY",
  };
  expect(
    (
      await apiRequestRaw(token, "/maintenance-orders", {
        method: "POST",
        body: payload,
      })
    ).status,
  ).toBe(403);
  await apiRequest(admin, "/users/" + tech.id, {
    method: "PATCH",
    body: {
      accessRules: {
        ...empty,
        orderTypes: { EMERGENCY: true, PREVENTIVE: true },
        onCallShifts: [
          {
            startsAt: new Date(Date.now() - 3600000).toISOString(),
            endsAt: new Date(Date.now() + 3600000).toISOString(),
          },
        ],
      },
    },
  });
  expect(
    (
      await apiRequestRaw(token, "/maintenance-orders", {
        method: "POST",
        body: { ...payload, type: "PREVENTIVE" },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await apiRequestRaw(token, "/maintenance-orders", {
        method: "POST",
        body: { ...payload, status: "COMPLETED" },
      })
    ).status,
  ).toBe(403);
  const allowed = await apiRequestRaw(token, "/maintenance-orders", {
    method: "POST",
    body: payload,
  });
  expect(allowed.status).toBe(201);
});
test("permissões por tela bloqueiam API e não permitem autoelevação", async () => {
  const token = (await apiLogin(account(manager))).access_token;
  await apiRequest(admin, "/users/" + manager.id, {
    method: "PATCH",
    body: {
      accessRules: {
        ...empty,
        commercial: { generators: true, partsServices: true, contracts: true },
        screens: {
          payables: { view: false, actions: {} },
          contracts: { view: true, actions: { create: false } },
          renewals: { view: false, actions: {} },
        },
      },
    },
  });
  expect((await apiRequestRaw(token, "/finance/payables")).status).toBe(403);
  expect(
    (await apiRequestRaw(token, "/contracts", { method: "POST", body: {} }))
      .status,
  ).toBe(403);
  // A delegated account can edit records but cannot provision a privileged login.
  await apiRequest(admin, "/users/" + generators.id, {
    method: "PATCH",
    body: {
      accessPolicy: {
        pages: { usersControl: true },
        users: { manage: true, manageSecurity: false },
      },
    },
  });
  const delegated = (await apiLogin(account(generators))).access_token;
  expect(
    (
      await apiRequestRaw(delegated, "/users", {
        method: "POST",
        body: {
          name: "Blocked finance account",
          email: "blocked-finance-" + Date.now() + "@manitec.test",
          password,
          role: "FINANCE",
        },
      })
    ).status,
  ).toBe(403);
  const administrator = await apiRequest<any>(admin, "/users/me");
  expect(
    (
      await apiRequestRaw(delegated, "/users/" + administrator.id, {
        method: "DELETE",
      })
    ).status,
  ).toBe(403);
  const employee = (await apiLogin(account(parts))).access_token;
  expect(
    (
      await apiRequestRaw(employee, "/users/" + parts.id, {
        method: "PATCH",
        body: { approvalDiscountLimit: 100 },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await apiRequestRaw(employee, "/users/" + parts.id, {
        method: "PATCH",
        body: {
          accessRules: {
            ...empty,
            commercial: {
              generators: true,
              partsServices: true,
              contracts: true,
            },
          },
        },
      })
    ).status,
  ).toBe(403);
});
test("editor oferece cada tela, carteiras, alçada e períodos de plantão", async ({
  page,
}, info) => {
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/management/users/permissions?user=" + parts.id);
  await expect(
    page.getByRole("heading", {
      name: "Carteiras comerciais e alçada",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Contratos", exact: true }).check();
  await expect(
    page.getByRole("checkbox", { name: "Contratos", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("spinbutton", { name: "Limite individual de desconto (%)" })
    .fill("10");
  await expect(
    page.getByRole("checkbox", { name: "Contratos", exact: true }),
    "carteira após alçada",
  ).toBeChecked();
  await page.getByRole("tab", { name: "Renovações", exact: true }).click();
  await page
    .getByRole("tabpanel", { name: "Renovações", exact: true })
    .getByLabel("Pode visualizar esta tela")
    .uncheck();
  await page
    .getByRole("tabpanel", { name: "Renovações", exact: true })
    .getByLabel("Pode visualizar esta tela")
    .check();
  await expect(
    page.getByRole("checkbox", { name: "Contratos", exact: true }),
    "carteira após tela",
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Adicionar plantão", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Contratos", exact: true }),
    "carteira após adicionar plantão",
  ).toBeChecked();
  await page.getByLabel("Início do plantão 1").fill("2026-10-16T18:00");
  await expect(
    page.getByRole("checkbox", { name: "Contratos", exact: true }),
    "carteira após início",
  ).toBeChecked();
  await page.getByLabel("Fim do plantão 1").fill("2026-10-19T08:00");
  await expect(
    page.getByRole("checkbox", { name: "Contratos", exact: true }),
  ).toBeChecked();
  const savedResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/users/" + parts.id) &&
      r.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Salvar permissões", exact: true })
    .click();
  expect((await savedResponse).ok()).toBe(true);
  await expect
    .poll(
      async () =>
        (await apiRequest<any>(admin, "/users/" + parts.id)).accessRules
          ?.onCallShifts?.length,
    )
    .toBe(1);
  const saved = await apiRequest<any>(admin, "/users/" + parts.id);
  expect(saved.accessRules.commercial.contracts).toBe(true);
  expect(saved.accessRules.screens.renewals.view).toBe(true);
  expect(saved.approvalDiscountLimit).toBe(10);
  await page
    .getByRole("tab", { name: "Contas a receber", exact: true })
    .click();
  await page
    .getByRole("tabpanel", { name: "Contas a receber", exact: true })
    .getByLabel("Pode visualizar esta tela")
    .check();
  const crossSaved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/users/" + parts.id) &&
      r.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Salvar permissões", exact: true })
    .click();
  expect((await crossSaved).ok()).toBe(true);
  const crossToken = (await apiLogin(account(parts))).access_token;
  expect((await apiRequestRaw(crossToken, "/finance/receivables")).status).toBe(
    200,
  );
  expect((await apiRequestRaw(crossToken, "/finance/payables")).status).toBe(
    403,
  );
  const options = await apiRequest<any[]>(
    crossToken,
    "/finance/bank-account-options",
  );
  expect(
    options.every(
      (o) => o.currentBalance === undefined && o.pixKey === undefined,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("permissoes-detalhadas.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Carteiras comerciais e alçada",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
});

test("central do cliente mantém suas propostas e bloqueia o CRM interno", async () => {
  const token = (await apiLogin(accounts.clientA)).access_token;
  expect((await apiRequestRaw(token, "/crm/opportunities")).status).toBe(403);
  const rows = await apiRequest<any[]>(token, "/proposals");
  const claim = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString(),
  );
  expect(rows.every((p) => p.clientId === claim.linkedClientId)).toBe(true);
});
