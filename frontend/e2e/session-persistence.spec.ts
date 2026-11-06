import { expect, test } from "@playwright/test";
import { randomUUID } from "crypto";
import { apiRequest, generateTotp } from "./helpers/auth";
import { accounts } from "./helpers/test-data";

async function openPersistentClientSession(page: import("@playwright/test").Page) {
  const deviceId = randomUUID();
  const session = await apiRequest<{
    access_token: string;
    refresh_token: string;
    refresh_token_expires_at: string;
    user: unknown;
  }>(undefined, "/auth/client-login", {
    method: "POST",
    body: { email: accounts.clientA.email, password: accounts.clientA.password, deviceId },
  });
  expect(session.refresh_token).toBeTruthy();
  await page.goto("/cliente/entrar");
  await expect(page.getByRole("button", { name: "Entrar no portal" })).toBeVisible();
  await page.evaluate(({ deviceId, session }) => {
    localStorage.setItem("manitec_device_id", deviceId);
    localStorage.setItem("manitec_token", session.access_token);
    localStorage.setItem("manitec_refresh_token", session.refresh_token);
    localStorage.setItem("manitec_refresh_token_expires_at", session.refresh_token_expires_at);
    localStorage.setItem("manitec_user", JSON.stringify(session.user));
  }, { deviceId, session });
  await page.goto("/portal/dashboard");
  await expect(page.getByRole("link", { name: "Resumo" })).toBeVisible();
}

async function expireAccessToken(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const token = localStorage.getItem("manitec_token");
    if (!token) throw new Error("Token de acesso ausente");
    const parts = token.split(".");
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    payload.exp = Math.floor(Date.now() / 1000) - 1;
    parts[1] = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    localStorage.setItem("manitec_token", parts.join("."));
  });
}

test("duas abas renovam a sessão sem voltar ao login", async ({ page }) => {
  await page.context().addInitScript(() => {
    Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
  });
  await openPersistentClientSession(page);
  const second = await page.context().newPage();
  await second.goto("/portal/dashboard");
  const previousRefresh = await page.evaluate(() => localStorage.getItem("manitec_refresh_token"));
  expect(previousRefresh).toBeTruthy();

  await expireAccessToken(page);
  await Promise.all([page.reload(), second.reload()]);
  await expect(page).toHaveURL(/\/portal/);
  await expect(second).toHaveURL(/\/portal/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("manitec_refresh_token"))).not.toBe(previousRefresh);
  await expect.poll(() => second.evaluate(() => localStorage.getItem("manitec_token"))).toBeTruthy();
});

test("falha temporária ao renovar mantém o usuário na página", async ({ page }) => {
  await openPersistentClientSession(page);
  const previousRefresh = await page.evaluate(() => localStorage.getItem("manitec_refresh_token"));
  expect(previousRefresh).toBeTruthy();

  await page.route("**/auth/refresh", (route) => route.fulfill({ status: 503, body: "Indisponível" }));
  await expireAccessToken(page);
  await page.reload();
  await expect(page).toHaveURL(/\/portal/);
  expect(await page.evaluate(() => localStorage.getItem("manitec_refresh_token"))).toBe(previousRefresh);

  await page.unroute("**/auth/refresh");
  await page.reload();
  await expect(page).toHaveURL(/\/portal/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("manitec_refresh_token"))).not.toBe(previousRefresh);
});

test("foco no painel não renova token válido e renova o expirado", async ({ page }) => {
  const deviceId = randomUUID();
  const session = await apiRequest<{
    access_token: string;
    refresh_token: string;
    refresh_token_expires_at: string;
    user: unknown;
  }>(undefined, "/auth/login", {
    method: "POST",
    body: { email: accounts.admin.email, password: accounts.admin.password, mfaCode: generateTotp(), deviceId },
  });
  expect(session.refresh_token).toBeTruthy();
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Acessar o GridOne/i })).toBeVisible();
  await page.evaluate(({ deviceId, session }) => {
    localStorage.setItem("manitec_device_id", deviceId);
    localStorage.setItem("manitec_token", session.access_token);
    localStorage.setItem("manitec_refresh_token", session.refresh_token);
    localStorage.setItem("manitec_refresh_token_expires_at", session.refresh_token_expires_at);
    localStorage.setItem("manitec_user", JSON.stringify(session.user));
  }, { deviceId, session });
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();

  let refreshCalls = 0;
  await page.route("**/auth/refresh", async (route) => {
    refreshCalls += 1;
    await route.fulfill({ status: 401, body: "Token inválido" });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(1_000);
  expect(refreshCalls).toBe(0);
  await expect(page).toHaveURL(/\/dashboard/);

  await page.unroute("**/auth/refresh");
  await expireAccessToken(page);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => page.evaluate(() => localStorage.getItem("manitec_refresh_token"))).not.toBe(session.refresh_token);
  await expect(page).toHaveURL(/\/dashboard/);
});
