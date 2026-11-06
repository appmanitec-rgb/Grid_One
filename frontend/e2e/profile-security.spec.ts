import { expect, test } from "@playwright/test";
import { apiLogin, apiRequest, apiRequestRaw } from "./helpers/auth";
import { accounts } from "./helpers/test-data";

test("perfil pessoal rejeita permissões administrativas e mantém o acesso original", async () => {
  const session = await apiLogin(accounts.sales);
  const token = session.access_token;
  const before = await apiRequest<{ name: string; role: string; email: string }>(token, "/users/me");
  for (const body of [
    { name: before.name, portalPermissions: ["all"] },
    { name: before.name, role: "ADMIN", accessPolicy: { users: { manageSecurity: true } } },
    { linkedClientId: "00000000-0000-0000-0000-000000000000" },
    { name: null },
  ]) {
    const response = await apiRequestRaw(token, "/users/me", { method: "PATCH", body });
    expect(response.status).toBe(400);
  }
  const after = await apiRequest<{ name: string; role: string; email: string }>(token, "/users/me");
  expect(after.role).toBe(before.role);
  expect(after.name).toBe(before.name);
  expect(after.email).toBe(before.email);
  const denied = await apiRequestRaw(token, "/users");
  expect(denied.status).toBe(403);
});
