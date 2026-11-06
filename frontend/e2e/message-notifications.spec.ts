import { expect, test } from "@playwright/test";
import { apiLogin, apiRequest, loginByApi } from "./helpers/auth";
import { accounts } from "./helpers/test-data";

type Channel = { id: string; name: string; unreadCount: number };

async function setupChannel() {
  const [sender, recipient] = await Promise.all([apiLogin(accounts.admin), apiLogin(accounts.sales)]);
  const me = await apiRequest<{ id: string }>(recipient.access_token, "/users/me");
  const channel = await apiRequest<Channel>(sender.access_token, "/team/channels", {
    method: "POST", body: { name: "Avisos E2E " + Date.now(), memberIds: [me.id] },
  });
  return { sender, recipient, channel };
}

test("nova mensagem avisa sem tirar foco, abre a conversa e atualiza a leitura", async ({ page }) => {
  const { sender, recipient, channel } = await setupChannel();
  const other = await apiLogin(accounts.auditor);
  expect((await apiRequest<Channel[]>(other.access_token, "/team/channels")).some(item => item.id === channel.id)).toBe(false);
  await loginByApi(page, accounts.sales);
  const initialChannels = page.waitForResponse(response => response.url().includes("/team/channels") && response.request().method() === "GET");
  await page.goto("/dashboard/clients");
  await initialChannels;
  const search = page.getByPlaceholder(/CNPJ, nome, raz/);
  await search.fill("Teste de foco");
  await search.focus();
  const body = "Nova mensagem sem interromper " + Date.now();
  await apiRequest(sender.access_token, "/team/channels/" + channel.id + "/messages", { method: "POST", body: { body } });
  const notice = page.getByRole("status", { name: "Nova mensagem da equipe" });
  await expect(notice).toContainText(body, { timeout: 25_000 });
  await expect(search).toBeFocused();
  await page.screenshot({ path: "../runtime-logs/message-notice-desktop.png" });
  await notice.getByRole("button", { name: "Dispensar aviso de mensagem" }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(notice).toHaveCount(0);
  const bell = page.getByRole("button", { name: /^Notifica/ });
  await bell.click();
  const panel = page.getByRole("dialog", { name: "Notificações", exact: true });
  await expect(panel.getByRole("link", { name: new RegExp(channel.name) })).toBeVisible();
  await page.screenshot({ path: "../runtime-logs/notification-panel-desktop.png" });
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(bell).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await bell.click();
  await expect(panel).toBeVisible();
  const bounds = await panel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "../runtime-logs/notification-panel-mobile.png" });
  await panel.getByRole("link", { name: new RegExp(channel.name) }).click();
  await expect(page).toHaveURL(new RegExp("channel=" + channel.id));
  await expect(page.getByRole("log", { name: "Mensagens do canal" })).toContainText(body);
  await expect.poll(async () => (await apiRequest<Channel[]>(recipient.access_token, "/team/channels")).find(item => item.id === channel.id)?.unreadCount).toBe(0);
  const activeMessage = "Mensagem na conversa aberta " + Date.now();
  await apiRequest(sender.access_token, "/team/channels/" + channel.id + "/messages", { method: "POST", body: { body: activeMessage } });
  await expect(page.getByRole("log", { name: "Mensagens do canal" })).toContainText(activeMessage);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(notice).toHaveCount(0);
});

test("mensagens antigas ficam no sino sem popup e outra conversa abre na mesma tela", async ({ page }) => {
  const { sender, channel } = await setupChannel();
  const body = "Mensagem anterior ao acesso " + Date.now();
  await apiRequest(sender.access_token, "/team/channels/" + channel.id + "/messages", { method: "POST", body: { body } });
  await loginByApi(page, accounts.sales);
  const initial = page.waitForResponse(response => response.url().includes("/team/channels") && response.request().method() === "GET");
  await page.goto("/dashboard/team");
  await initial;
  await expect(page.getByRole("status", { name: "Nova mensagem da equipe" })).toHaveCount(0);
  await page.getByRole("button", { name: /^Notifica/ }).click();
  await page.getByRole("dialog", { name: "Notificações", exact: true }).getByRole("link", { name: new RegExp(channel.name) }).click();
  await expect(page.getByRole("log", { name: "Mensagens do canal" })).toContainText(body);
  const second = await setupChannel();
  const message = "Segunda conversa " + Date.now();
  await apiRequest(sender.access_token, "/team/channels/" + second.channel.id + "/messages", { method: "POST", body: { body: message } });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("button", { name: /^Notifica/ }).click();
  await page.getByRole("dialog", { name: "Notificações", exact: true }).getByRole("link", { name: new RegExp(second.channel.name) }).click();
  await expect(page).toHaveURL(new RegExp("channel=" + second.channel.id));
  await expect(page.getByRole("log", { name: "Mensagens do canal" })).toContainText(message);
});

test("falha temporaria das mensagens oferece nova tentativa sem encerrar a sessao", async ({ page }) => {
  await loginByApi(page, accounts.sales);
  await page.route("**/team/channels", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Indisponivel" }) }));
  await page.goto("/dashboard/clients");
  await page.getByRole("button", { name: /^Notifica/ }).click();
  const panel = page.getByRole("dialog", { name: "Notificações", exact: true });
  await expect(panel.getByText(/atualizar as mensagens/)).toBeVisible();
  await page.unroute("**/team/channels");
  await panel.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(panel.getByText(/atualizar as mensagens/)).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp("dashboard/clients"));
});

for (const width of [1366, 390]) {
  test("aviso preserva o resumo financeiro e as acoes da proposta em " + width + "px", async ({ page }) => {
    const { sender, channel } = await setupChannel();
    await page.setViewportSize({ width, height: 844 });
    await loginByApi(page, accounts.sales);
    const initial = page.waitForResponse(response => response.url().includes("/team/channels") && response.request().method() === "GET");
    await page.goto("/dashboard/proposals/new");
    await initial;
    const dock = page.locator(".proposal-finance-dock");
    await expect(dock).toBeVisible();
    const body = "Aviso durante proposta " + Date.now();
    await apiRequest(sender.access_token, "/team/channels/" + channel.id + "/messages", { method: "POST", body: { body } });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const notice = page.getByRole("status", { name: "Nova mensagem da equipe" });
    await expect(notice).toContainText(body);
    const noticeBounds = await notice.boundingBox();
    const dockBounds = await dock.boundingBox();
    expect(noticeBounds!.y + noticeBounds!.height).toBeLessThanOrEqual(dockBounds!.y - 10);
    await expect(dock.getByRole("button", { name: /Continuar/ })).toBeVisible();
    await page.screenshot({ path: "../runtime-logs/message-notice-proposal-" + width + ".png" });
  });
}
