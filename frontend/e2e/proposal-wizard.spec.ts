import { expect, test, type Page } from "@playwright/test";

const client = { id: "wizard-client", companyName: "Cartórios Mesquita", cnpj: "39315244000107", paymentTermDefault: "A_VISTA" };
const seller = { id: "wizard-seller", name: "Michele Comercial" };
const part = { id: "wizard-part", code: "P001", name: "Filtro de óleo", type: "PART", basePrice: 100 };
const service = { id: "wizard-service", code: "S001", name: "Manutenção preventiva", type: "SERVICE", basePrice: 200 };
const profiles = ["PARTS", "SERVICES"].map((purpose) => ({
  id: "profile-" + purpose, name: purpose === "PARTS" ? "Peças" : "Serviços", purpose,
  method: "PIX", beneficiary: "Manitec", beneficiaryDocument: "39315244000107", pixKey: "39315244000107",
  issuerCompany: { id: "issuer", companyName: "Manitec Energia Equipamentos" },
}));

async function mockWizard(page: Page) {
  const opportunity = {
    id: "wizard-opportunity", title: "Manutenção do gerador principal", client, assignedSeller: seller,
    stage: "PROPOSAL_SENT", pipeline: "COMMERCIAL_03_PARTS_SERVICES", opportunityType: "FIELD_SERVICE", proposals: [],
  };
  const draft = {
    id: "wizard-draft", code: "90002/01", status: "DRAFT", type: "PARTS_AND_SERVICES", origin: "MANITEC",
    clientId: client.id, client, userId: seller.id, user: seller, salesOpportunityId: opportunity.id,
    scope: "Manutenção preventiva com teste funcional.", freight: "FOB", paymentTerm: "A_VISTA",
    discount: 20, installmentCount: 1, installmentIntervalDays: 30, totalValue: 290,
    paymentSelections: profiles,
    operationalExpenses: [{ expenseType: "DISPLACEMENT", label: "Deslocamento", unitLabel: "km", unitPrice: 10, quantity: 1 }],
    items: [
      { id: "part-row", kind: "PART_MATERIAL", catalogItemId: part.id, catalogItem: part, quantity: 1, unitPrice: 100 },
      { id: "service-row", kind: "CATALOG_SERVICE", catalogItemId: service.id, catalogItem: service, quantity: 1, unitPrice: 200 },
    ],
    movements: [], revisions: [],
  };
  await page.route("http://127.0.0.1:3100/**", async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = [];
    if (url.pathname === "/proposals/wizard-draft") data = draft;
    else if (url.pathname.startsWith("/crm/opportunities/")) data = opportunity;
    else if (url.pathname === "/clients/" + client.id) data = client;
    else if (url.pathname === "/clients/lookup") data = [client];
    else if (url.pathname === "/crm/sellers") data = [seller];
    else if (url.pathname === "/catalogs/lookup") data = url.searchParams.get("type") === "PART" ? [part] : [service];
    else if (url.pathname === "/proposals/payment-profiles") data = profiles;
    else if (url.pathname === "/studio/control-options/PAYMENT_TERM") data = [{ id: "cash", name: "A_VISTA", code: "A_VISTA" }];
    else if (url.pathname === "/proposals/pricing-options") data = { hourTypes: [], technicianTypes: [], rates: [] };
    else if (url.pathname === "/proposals/operational-expense-rates") data = [{ id: "travel", expenseType: "DISPLACEMENT", label: "Deslocamento", unitLabel: "km", unitPrice: 10, sortOrder: 1 }];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.addInitScript(() => {
    const payload = btoa(JSON.stringify({ role: "ADMIN", exp: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem("manitec_token", "header." + payload + ".signature");
    localStorage.setItem("manitec_refresh_token", "test-refresh");
  });
}

async function expectDockFits(page: Page) {
  const dock = page.getByRole("region", { name: "Resumo financeiro da proposta", exact: true });
  await expect(dock).toBeVisible();
  const layout = await page.evaluate(() => {
    const main = document.querySelector(".dashboard-main")!;
    const dock = document.querySelector(".proposal-finance-dock")!;
    const rect = dock.getBoundingClientRect();
    const button = dock.querySelector(".proposal-flow-primary")!.getBoundingClientRect();
    return { overflow: main.scrollWidth - main.clientWidth, left: rect.left, right: rect.right, bottom: rect.bottom, height: window.innerHeight, width: window.innerWidth, buttonBottom: button.bottom, mainLeft: main.getBoundingClientRect().left };
  });
  expect(layout.overflow).toBeLessThanOrEqual(1);
  expect(layout.left).toBeGreaterThanOrEqual(layout.mainLeft - 1);
  expect(layout.right).toBeLessThanOrEqual(layout.width);
  expect(layout.buttonBottom).toBeLessThanOrEqual(layout.bottom);
  expect(layout.bottom).toBeLessThanOrEqual(layout.height);
  expect(layout.height - layout.bottom).toBeLessThanOrEqual(77);
}

for (const viewport of [{ width: 1366, height: 768 }, { width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 683, height: 384 }]) {
  test(`proposta por etapas preserva dados, calcula valores e cabe em ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await mockWizard(page);
    await page.goto("/dashboard/proposals/new?editId=wizard-draft");
    await expect(page.getByRole("heading", { name: "Editar rascunho 90002/01" })).toBeVisible({ timeout: 45_000 });
    const dock = page.getByRole("region", { name: "Resumo financeiro da proposta", exact: true });
    await expect(page.getByLabel("Condição de pagamento", { exact: true })).toHaveValue("CASH");
    await expect(page.getByLabel("Condição de pagamento", { exact: true }).locator('option:checked')).toHaveText("À vista");
    await expect(dock.getByLabel("Total da proposta", { exact: true })).toHaveText("R$ 290,00");
    await page.getByText("Mais informações", { exact: true }).click();
    await expect(page.getByText("Serviço avulso", { exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("FIELD_SERVICE");
    await expect(page.locator("body")).not.toContainText("COMMERCIAL_03_PARTS_SERVICES");
    await page.getByText("Mais informações", { exact: true }).click();
    await expectDockFits(page);
    await page.screenshot({ path: testInfo.outputPath("01-dados.png"), fullPage: true });

    await dock.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByRole("heading", { name: "Peças e materiais", exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Nome ou codigo")).toHaveValue(/Filtro de óleo/);
    await expectDockFits(page);
    await page.screenshot({ path: testInfo.outputPath("02-pecas.png"), fullPage: true });
    await dock.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByRole("heading", { name: "Serviços do catálogo", exact: true })).toBeVisible();
    await page.getByText("Qtd", { exact: true }).locator("..").getByRole("spinbutton").fill("2");
    await expect(dock.getByLabel("Total da proposta", { exact: true })).toHaveText("R$ 490,00");
    await expectDockFits(page);
    await page.screenshot({ path: testInfo.outputPath("03-servicos.png"), fullPage: true });
    await dock.getByRole("button", { name: "Continuar" }).click();
    await expect(page).toHaveURL(/\/proposals\/new\?editId=wizard-draft/);
    await expect(page.getByLabel("Escopo da proposta")).toHaveValue("Manutenção preventiva com teste funcional.");
    await page.getByLabel("Aplicar desconto", { exact: true }).fill("30");
    await expect(dock.getByLabel("Total da proposta", { exact: true })).toHaveText("R$ 480,00");
    await expectDockFits(page);
    await page.screenshot({ path: testInfo.outputPath("04-revisao.png"), fullPage: true });

    await page.getByRole("button", { name: /01 Dados comerciais/ }).click();
    await expect(page.getByLabel("Pagamento de peças", { exact: true })).toHaveValue("profile-PARTS");
    await expect(page.getByLabel("Pagamento de serviços", { exact: true })).toHaveValue("profile-SERVICES");
    await page.getByRole("button", { name: /04 Revisão/ }).click();
    const request = page.waitForRequest((request) => request.method() === "PATCH" && request.url().endsWith("/proposals/wizard-draft"));
    await dock.getByRole("button", { name: "Salvar alterações" }).click();
    const saved = (await request).postDataJSON();
    expect(saved).toMatchObject({ clientId: client.id, userId: seller.id, paymentTerm: "A_VISTA", discount: 30, partsPaymentProfileId: "profile-PARTS", servicesPaymentProfileId: "profile-SERVICES" });
    expect(saved.items).toEqual(expect.arrayContaining([expect.objectContaining({ catalogItemId: service.id, quantity: 2 }), expect.objectContaining({ catalogItemId: part.id, quantity: 1 })]));
    expect(saved.operationalExpenses).toEqual([{ expenseType: "DISPLACEMENT", quantity: 1 }]);
  });
}

test("a revisão aponta a etapa com dados obrigatórios ausentes", async ({ page }) => {
  await mockWizard(page);
  await page.goto("/dashboard/proposals/new");
  await page.getByRole("button", { name: /04 Revisão/ }).click();
  await page.getByRole("button", { name: "Salvar proposta", exact: true }).click();
  await expect(page.locator("#proposal-form").getByRole("alert")).toHaveText("Selecione um cliente na lista de resultados.");
  await expect(page.getByRole("button", { name: /01 Dados comerciais/ })).toHaveAttribute("aria-current", "step");
  await expect(page.locator("#proposal-step-heading")).toBeFocused();
});

test("condições padrão calculam a entrada e a condição especial permite percentual ou valor", async ({page})=>{
  await mockWizard(page);
  await page.goto('/dashboard/proposals/new?editId=wizard-draft');
  await expect(page.getByLabel('Condição de pagamento',{exact:true})).toHaveValue('CASH');
  await page.getByLabel('Condição de pagamento',{exact:true}).selectOption('50_50');
  await expect(page.getByLabel('Entrada calculada',{exact:true})).toHaveText('R$ 145,00');
  await page.getByLabel('Condição de pagamento',{exact:true}).selectOption('30_70');
  await expect(page.getByLabel('Entrada calculada',{exact:true})).toHaveText('R$ 87,00');
  await expect(page.getByLabel('Saldo calculado',{exact:true})).toHaveText('R$ 203,00');
  await page.getByRole('button',{name:/03 Serviços/}).click();
  await page.getByText('Qtd',{exact:true}).locator('..').getByRole('spinbutton').fill('2');
  await page.getByRole('button',{name:/01 Dados comerciais/}).click();
  await expect(page.getByLabel('Entrada calculada',{exact:true})).toHaveText('R$ 147,00');
  await page.getByLabel('Condição de pagamento',{exact:true}).selectOption('CUSTOM');
  await expect(page.getByLabel('Percentual da entrada',{exact:true})).toHaveValue('30');
  await page.getByLabel('Percentual da entrada',{exact:true}).fill('40');
  await expect(page.getByLabel('Entrada calculada',{exact:true})).toHaveText('R$ 196,00');
  await page.getByLabel('Entrada em',{exact:true}).selectOption('VALUE');
  await expect(page.getByLabel('Valor da entrada',{exact:true})).toHaveValue('196');
  await page.getByLabel('Valor da entrada',{exact:true}).fill('100');
  await page.getByLabel('Entrada em',{exact:true}).selectOption('PERCENTAGE');
  await expect(page.getByLabel('Percentual da entrada',{exact:true})).toHaveValue('20.4082');
  expect(await page.getByLabel('Percentual da entrada',{exact:true}).evaluate((input: HTMLInputElement)=>input.checkValidity())).toBe(true);
  await expect(page.getByLabel('Entrada calculada',{exact:true})).toHaveText('R$ 100,00');
  await page.getByLabel('Entrada em',{exact:true}).selectOption('VALUE');
  await expect(page.getByLabel('Valor da entrada',{exact:true})).toHaveValue('100');
  await page.getByLabel('Parcelas do saldo',{exact:true}).fill('3');
  await page.getByText('Ver composição das parcelas',{exact:true}).click();
  await expect(page.getByText('Parcela 3 de 3',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Saldo calculado',{exact:true})).toHaveText('R$ 390,00');
  await expect(page.getByLabel('Intervalo (dias)',{exact:true})).toHaveCount(0);
  await expect(page.getByLabel('Primeiro vencimento',{exact:true})).toHaveCount(0);
});

test("gerador e proposta externa compartilham navegação e resumo", async ({ page }) => {
  await mockWizard(page);
  for (const route of ["generator", "external"]) {
    await page.goto("/dashboard/proposals/new/" + route);
    await expect(page.getByRole("navigation", { name: "Etapas da proposta" })).toBeVisible();
    await expectDockFits(page);
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(page.getByText(route === "generator" ? "Selecione o cliente e o vendedor." : "Selecione o cliente, o vendedor e informe a referência externa.", { exact: true })).toBeVisible();
  }
});
