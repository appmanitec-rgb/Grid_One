import { expect, test } from "@playwright/test";
import { apiLogin, apiRequest, getE2eEntityData, loginByApi } from "./helpers/auth";
import { accounts } from "./helpers/test-data";

test("atalhos do cliente preservam a pesquisa nas carteiras", async ({ page }) => {
  const session = await apiLogin(accounts.admin);
  const entities = await getE2eEntityData();
  const generator = await apiRequest<{ client: { id: string; companyName: string } }>(session.access_token, `/generators/${entities.clientAEquipmentId}`);
  await loginByApi(page, accounts.admin);
  for (const [label, route] of [["Ver chamados", "atendimento"], ["Ver O.S.", "orders"], ["Ver contratos", "contracts"]]) {
    await page.goto(`/dashboard/clients/${generator.client.id}`);
    const action = page.getByRole("link", { name: label, exact: true });
    await expect(action).toHaveAttribute("href", `/dashboard/${route}?q=${encodeURIComponent(generator.client.companyName)}`);
    await action.click();
    await expect(page).toHaveURL(new RegExp("/dashboard/" + route + "\\?q="));
    await expect(page.getByRole("textbox").first()).toHaveValue(generator.client.companyName);
  }
});

test("cliente envia feedback e encontra a mensagem no historico", async ({ page }) => {
  await loginByApi(page, accounts.clientA);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/portal/feedback");
  await expect(page.getByRole("heading", { name: "Observações e feedback", exact: true })).toBeVisible();
  const message = `Revisão visual: retorno do cliente ${Date.now()}`;
  await page.getByLabel("Tipo", { exact: true }).selectOption("FEEDBACK");
  await page.getByLabel("Mensagem", { exact: true }).fill(message);
  await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Mensagem enviada" })).toBeVisible();
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await expect(page.getByLabel("Mensagem", { exact: true })).toHaveValue("");
  await expect(page.getByRole("navigation", { name: "Central do cliente" }).getByRole("link", { name: "Observações e feedback" })).toHaveAttribute("aria-current", "page");
});

test("perfil continua acessivel pela barra superior", async ({ page }) => {
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Abrir meu perfil" }).click();
  await expect(page).toHaveURL(/\/dashboard\/profile$/);
  await expect(page.locator(".dashboard-page-header h1")).toBeVisible();
});


test("menu do celular abre todas as areas e fecha ao navegar", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  const trigger = page.getByRole("button", { name: "Abrir todos os menus", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Todos os menus" });
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(dialog.locator('a[href="/dashboard/finance/reconciliation"]')).toHaveCount(1);
  await expect(dialog.locator('a[href="/dashboard/hr/fleet"]')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("mobile-menu.png"), fullPage: false });
  await dialog.getByLabel("Pesquisar menus").fill("programacao");
  await dialog.locator('a[href="/dashboard/dispatch"]').click();
  await expect(page).toHaveURL(/\/dashboard\/dispatch$/);
  await expect(dialog).toBeHidden();
  await trigger.click();
  await dialog.getByLabel("Pesquisar menus").fill("conciliacao");
  await expect(dialog.locator('a[href="/dashboard/finance/reconciliation"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("menu do celular respeita os acessos do tecnico", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginByApi(page, accounts.technician);
  await page.goto("/dashboard/tecnico", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Abrir todos os menus", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Todos os menus" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('a[href="/dashboard/tecnico"]')).toBeVisible();
  await expect(dialog.locator('a[href="/dashboard/finance/reconciliation"]')).toHaveCount(0);
  await expect(dialog.locator('a[href="/dashboard/management/users"]')).toHaveCount(0);
});
