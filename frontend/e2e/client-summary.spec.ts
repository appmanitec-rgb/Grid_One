import { expect, test, type Page } from "@playwright/test";
import { apiLogin, apiRequest, getE2eEntityData, loginByApi } from "./helpers/auth";
import { accounts } from "./helpers/test-data";

type Client = {
  id: string; companyName: string; preferences?: string | null;
  generators: Array<{ id: string; orders?: Array<{ id: string }> }>;
  proposals: Array<{ id: string }>;
  contracts: Array<{ id: string }>;
  serviceTickets: Array<{ id: string }>;
  serviceReports: Array<{ id: string }>;
};
let client: Client;
let token: string;

test.beforeAll(async () => {
  const session = await apiLogin(accounts.admin);
  token = session.access_token;
  const data = await getE2eEntityData();
  const generator = await apiRequest<{clientId?: string; client?: {id:string}}>(token, "/generators/" + data.clientAEquipmentId);
  client = await apiRequest<Client>(token, "/clients/" + (generator.clientId || generator.client?.id));
});

async function openSummary(page: Page) {
  await page.goto("/dashboard/clients");
  await page.getByRole("button", { name: client.companyName, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Resumo do cliente/ });
  await expect(dialog.getByRole("heading", { name: "Mapa de relacionamentos" })).toBeVisible();
  await expect(dialog.getByLabel("Empresa / nome", { exact: false })).not.toHaveValue("");
  return dialog;
}

test("resumo mostra v\u00ednculos, protege edi\u00e7\u00f5es e abre proposta com o cliente", async ({page}) => {
  await loginByApi(page, accounts.admin);
  let dialog = await openSummary(page);
  const map = dialog.locator('section[aria-labelledby="summary-relationships-title"]');
  const relationPaths = [
    ["equipments", client.generators[0]?.id],
    ["proposals", client.proposals[0]?.id],
    ["contracts", client.contracts[0]?.id],
    ["atendimento", client.serviceTickets[0]?.id],
    ["relatorios-tecnicos", client.serviceReports[0]?.id],
  ];
  expect(relationPaths.filter(([,id]) => id).length).toBeGreaterThanOrEqual(3);
  for (const [kind,id] of relationPaths) {
    if (id) await expect(map.locator('a[href="/dashboard/' + kind + '/' + id + '"]')).toBeVisible();
  }
  await expect(dialog.getByRole("link", {name: "Abrir proposta", exact: true})).toHaveAttribute("href", "/dashboard/proposals/new?clientId=" + client.id);
  await expect(dialog.getByRole("link", {name: "Abrir chamado / solicita\u00e7\u00e3o"})).toHaveAttribute("href", "/dashboard/atendimento?clientId=" + client.id + "#novo-chamado");

  await expect(map).not.toContainText("Converted to order");
  await expect(map).not.toContainText("Released to customer");
  const preferences = dialog.getByLabel("Prefer\u00eancias de atendimento");
  const original = await preferences.inputValue();
  const changed = "Resumo do cliente E2E " + Date.now();
  await preferences.fill(changed);
  page.once("dialog", confirmation => confirmation.dismiss());
  await dialog.getByRole("link", { name: "Abrir proposta", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(preferences).toHaveValue(changed);
  page.once("dialog", confirmation => confirmation.dismiss());
  await map.getByRole("link").first().click();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/clients$/);
  try {
    const saved = page.waitForResponse(response => response.url().endsWith("/clients/" + client.id) && response.request().method() === "PATCH");
    await dialog.getByRole("button", { name: "Salvar altera\u00e7\u00f5es" }).click();
    expect((await saved).ok()).toBeTruthy();
    await expect(dialog).toHaveCount(0);
    expect((await apiRequest<Client>(token, "/clients/" + client.id)).preferences).toBe(changed);
    dialog = await openSummary(page);
    await dialog.getByRole("link", {name: "Abrir proposta", exact: true}).click();
    await expect(page).toHaveURL(new RegExp("/dashboard/proposals/new\\?clientId=" + client.id));
    await expect(page.getByRole("textbox", {name: "Cliente", exact: true})).toHaveValue(client.companyName);
  } finally {
    await apiRequest(token, "/clients/" + client.id, {method: "PATCH", body: {preferences: original}});
  }
});

test("atalho seleciona o cliente e cria chamado vinculado a ele", async ({page}) => {
  await loginByApi(page, accounts.admin);
  const dialog = await openSummary(page);
  await dialog.getByRole("link", {name: "Abrir chamado / solicita\u00e7\u00e3o"}).click();
  const select = page.locator("#ticket-client");
  await expect(select).not.toHaveValue("");
  await expect(select.locator("xpath=following-sibling::select")).toHaveValue(client.id);
  await expect(select).toBeFocused();
  const form = page.locator("#novo-chamado form");
  const title = "Chamado pelo resumo E2E " + Date.now();
  await form.getByLabel("T\u00edtulo", {exact: true}).fill(title);
  await form.getByLabel("Descri\u00e7\u00e3o", {exact: true}).fill("Verificar o atendimento aberto a partir do resumo do cliente.");
  const createdResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/tickets" && response.request().method() === "POST");
  await form.getByRole("button", {name: "Criar chamado", exact: true}).click();
  const response = await createdResponse;
  expect(response.ok()).toBeTruthy();
  const created = await response.json();
  const ticket = await apiRequest<{clientId:string; title:string}>(token, "/tickets/" + created.id);
  expect(ticket.clientId).toBe(client.id);
  expect(ticket.title).toBe(title);
});

test("auditor pode consultar v\u00ednculos sem criar ou editar pelo resumo", async ({page}) => {
  await loginByApi(page, accounts.auditor);
  const dialog = await openSummary(page);
  await expect(dialog.getByRole("link", {name: "Abrir proposta", exact: true})).toHaveCount(0);
  await expect(dialog.getByRole("link", {name: "Abrir chamado / solicita\u00e7\u00e3o"})).toHaveCount(0);
  await expect(dialog.getByLabel("Empresa / nome", {exact:false})).toBeDisabled();
  await expect(dialog.getByRole("button", {name: "Salvar altera\u00e7\u00f5es"})).toHaveCount(0);
  await expect(dialog.getByRole("link", {name: "Ver ficha completa"})).toBeVisible();
  await expect(dialog.locator('section[aria-labelledby="summary-relationships-title"] a').first()).toBeVisible();
});

for (const viewport of [{width:1366,height:768}, {width:390,height:844}, {width:683,height:384}]) {
  test("resumo mant\u00e9m a\u00e7\u00f5es e rolagem acess\u00edveis em " + viewport.width + "px", async ({page},testInfo) => {
    await page.setViewportSize(viewport);
    await loginByApi(page, accounts.admin);
    const longName = "1 TABELIAO DE NOTAS E PROTESTO DE LETRAS E TITULOS DE INDAIATUBA";
    await page.route("**/clients/" + client.id, async route => {
      if (route.request().method() !== "GET") return route.continue();
      await route.fulfill({json:{...client, companyName:longName}});
    });
    const dialog = await openSummary(page);
    await expect(dialog.getByRole("heading", {name:longName})).toBeVisible();
    await expect(dialog.getByRole("link", {name:"Abrir proposta",exact:true})).toBeInViewport();
    await expect(dialog.getByRole("link", {name:"Abrir chamado / solicita\u00e7\u00e3o"})).toBeInViewport();
    await expect(dialog.getByRole("button", {name:"Fechar resumo do cliente"})).toBeInViewport();
    await expect(dialog.getByRole("link", {name:"Ver ficha completa"})).toBeInViewport();
    const layout = await dialog.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return {left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom, overflow:element.scrollWidth-element.clientWidth};
    });
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(viewport.width);
    expect(layout.top).toBeGreaterThanOrEqual(0);
    expect(layout.bottom).toBeLessThanOrEqual(viewport.height);
    expect(layout.overflow).toBeLessThanOrEqual(1);
    await page.screenshot({path:testInfo.outputPath("client-summary.png")});
    const preferences = dialog.getByLabel("Prefer\u00eancias de atendimento");
    await preferences.scrollIntoViewIfNeeded();
    await expect(preferences).toBeInViewport();
    await expect(dialog.getByRole("link", {name:"Abrir proposta",exact:true})).toBeInViewport();
    await dialog.getByRole("button", {name:"Fechar resumo do cliente"}).click();
    await expect(dialog).toHaveCount(0);
  });
}
