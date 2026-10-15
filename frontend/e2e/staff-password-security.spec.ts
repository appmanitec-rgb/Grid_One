import { expect, test } from "@playwright/test";
import { apiLogin, apiRequest, apiRequestRaw } from "./helpers/auth";
import { accounts } from "./helpers/test-data";

type Session = { access_token: string; refresh_token: string; user: unknown };
test("senha interna exige permissao, invalida acessos anteriores e permite troca no perfil", async ({ page }) => {
  const admin = await apiLogin(accounts.admin);
  const stamp = Date.now();
  const initial = "InicialE2E!2026-A";
  const reset = "RedefinidaE2E!2026-B";
  const finalPassword = "PerfilE2E!2026-C";
  const staff = await apiRequest<{ id: string; email: string }>(admin.access_token, "/users", { method: "POST", body: { name: "Seguranca de senha E2E", email: "staff-security-" + stamp + "@manitec.test", role: "SALES", password: initial } });
  const delegated = await apiRequest<{ id: string; email: string }>(admin.access_token, "/users", { method: "POST", body: { name: "Gestao sem seguranca E2E", email: "delegated-security-" + stamp + "@manitec.test", role: "NORMAL", password: initial, accessPolicy: { users: { manage: true, manageSecurity: false } } } });
  const login = (email: string, password: string, deviceId: string) => apiRequest<Session>(undefined, "/auth/login", { method: "POST", body: { email, password, deviceId } });
  try {
    const first = await login(staff.email, initial, "staff-a-" + stamp);
    const second = await login(staff.email, initial, "staff-b-" + stamp);
    const restricted = await login(delegated.email, initial, "delegated-" + stamp);
    expect((await apiRequestRaw(restricted.access_token, "/users/" + staff.id, { method: "PATCH", body: { password: reset } })).status).toBe(403);
    expect((await apiRequestRaw(first.access_token, "/users/me")).status).toBe(200);
    for (const body of [
      { password: reset },
      { password: reset, currentPassword: "incorreta", confirmPassword: reset },
      { password: reset, currentPassword: initial, confirmPassword: "diferente" },
      { password: "curta", currentPassword: initial, confirmPassword: "curta" },
      { password: "á".repeat(37), currentPassword: initial, confirmPassword: "á".repeat(37) },
    ]) expect((await apiRequestRaw(first.access_token, "/users/me", { method: "PATCH", body })).status).toBe(400);
    await apiRequest(first.access_token, "/users/me", { method: "PATCH", body: { department: "Comercial E2E" } });
    await apiRequest(admin.access_token, "/users/" + staff.id, { method: "PATCH", body: { password: reset } });
    for (const session of [first, second]) {
      expect((await apiRequestRaw(session.access_token, "/users/me")).status).toBe(401);
      expect((await apiRequestRaw(undefined, "/auth/refresh", { method: "POST", body: { refreshToken: session.refresh_token, deviceId: session === first ? "staff-a-" + stamp : "staff-b-" + stamp } })).status).toBe(401);
    }
    expect((await apiRequestRaw(undefined, "/auth/login", { method: "POST", body: { email: staff.email, password: initial } })).status).toBe(401);
    const renewed = await login(staff.email, reset, "staff-profile-" + stamp);
    await page.goto("/");
    await page.evaluate(({ session, deviceId }) => {
      localStorage.setItem("manitec_token", session.access_token);
      localStorage.setItem("manitec_refresh_token", session.refresh_token);
      localStorage.setItem("manitec_user", JSON.stringify(session.user));
      localStorage.setItem("manitec_device_id", deviceId);
    }, { session: renewed, deviceId: "staff-profile-" + stamp });
    await page.goto("/dashboard/profile");
    await page.getByLabel("Senha atual", { exact: true }).fill(reset);
    await page.getByLabel("Nova senha", { exact: true }).fill(finalPassword);
    await page.getByLabel("Confirmar nova senha", { exact: true }).fill(finalPassword);
    await page.getByRole("button", { name: "Salvar perfil", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Senha alterada com sucesso");
    expect((await apiRequestRaw(renewed.access_token, "/users/me")).status).toBe(401);
    expect((await apiRequestRaw(undefined, "/auth/refresh", { method: "POST", body: { refreshToken: renewed.refresh_token, deviceId: "staff-profile-" + stamp } })).status).toBe(401);
    const final = await login(staff.email, finalPassword, "staff-final-" + stamp);
    expect((await apiRequestRaw(final.access_token, "/users/me")).status).toBe(200);
  } finally {
    for (const user of [staff, delegated]) await apiRequest(admin.access_token, "/users/" + user.id, { method: "PATCH", body: { isActive: false } });
  }
});
