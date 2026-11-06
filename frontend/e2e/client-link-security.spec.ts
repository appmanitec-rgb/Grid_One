import { expect, test } from "@playwright/test";
import { apiLogin, apiRequest, apiRequestRaw } from "./helpers/auth";
import { accounts } from "./helpers/test-data";

test("transferir login entre clientes exige permissao de seguranca", async () => {
  const admin = await apiLogin(accounts.admin);
  const clients = await apiRequest<Array<{ id: string; cnpj: string }>>(admin.access_token, "/clients");
  const first = clients.find(c => c.cnpj.replace(/\D/g, "") === "12345678000190");
  const second = clients.find(c => c.cnpj.replace(/\D/g, "") === "22222222000122");
  if (!first || !second) throw new Error("Clientes da fixture E2E nao encontrados.");
  const stamp = Date.now();
  const password = "DelegadoE2E!2026-A";
  const delegate = await apiRequest<{ id: string; email: string }>(admin.access_token, "/users", { method: "POST", body: { name: "Gestao de cadastro sem seguranca", email: "client-link-delegate-" + stamp + "@manitec.test", password, role: "NORMAL", accessPolicy: { users: { manage: true, manageSecurity: false } } } });
  const portal = await apiRequest<{ user: { id: string } }>(admin.access_token, "/clients/" + first.id + "/portal/users", { method: "POST", body: { name: "Limite de transferencia E2E", email: "client-link-target-" + stamp + "@manitec.test", permissions: ["PROPOSALS"] } });
  try {
    const session = await apiRequest<{ access_token: string }>(undefined, "/auth/login", { method: "POST", body: { email: delegate.email, password } });
    const denied = await apiRequestRaw(session.access_token, "/users/" + portal.user.id, { method: "PATCH", body: { linkedClientId: second.id } });
    expect(denied.status).toBe(403);
    const unchanged = await apiRequest<{ linkedClientId: string }>(admin.access_token, "/users/" + portal.user.id);
    expect(unchanged.linkedClientId).toBe(first.id);
    await apiRequest(admin.access_token, "/users/" + portal.user.id, { method: "PATCH", body: { linkedClientId: second.id } });
    const moved = await apiRequest<{ linkedClientId: string }>(admin.access_token, "/users/" + portal.user.id);
    expect(moved.linkedClientId).toBe(second.id);
  } finally {
    await apiRequest(admin.access_token, "/users/" + portal.user.id, { method: "PATCH", body: { linkedClientId: first.id, isActive: false } });
    await apiRequest(admin.access_token, "/users/" + delegate.id, { method: "PATCH", body: { isActive: false } });
  }
});
