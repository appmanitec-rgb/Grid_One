import { expect, test } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  apiRequestRaw,
  loginByApi,
} from "./helpers/auth";
import { accounts, API_BASE_URL } from "./helpers/test-data";
import {
  accessProfileChanges,
  type UserAccessProfile,
} from "../lib/access-profiles";

let admin: string;
let profiles: UserAccessProfile[];
let employeeId = "";
const account = {
  ...accounts.hr,
  email: "profiles-" + Date.now() + "@manitec.test",
  password: "ProfileTest@2026",
};
test.beforeAll(async () => {
  if (new URL(API_BASE_URL).port !== "3100")
    throw new Error("Exige a base isolada E2E.");
  admin = (await apiLogin(accounts.admin)).access_token;
  profiles = await apiRequest<UserAccessProfile[]>(
    admin,
    "/users/access-profiles",
  );
  const preset = profiles.find((p) => p.id === "ADMIN_ASSISTANT")!;
  const created = await apiRequest<{ id: string }>(admin, "/users", {
    method: "POST",
    body: {
      name: "E2E Perfis por Area",
      email: account.email,
      password: account.password,
      role: preset.role,
      department: preset.department,
      accessPolicy: preset.accessPolicy,
      accessRules: preset.accessRules,
    },
  });
  employeeId = created.id;
});
test.afterAll(async () => {
  if (employeeId) {
    const result = await apiRequestRaw(admin, "/users/" + employeeId, {
      method: "DELETE",
    });
    expect(result.ok).toBe(true);
  }
});

test("sete perfis protegidos e apoio administrativo sem pagamento nem acesso bancario", async () => {
  expect(profiles.map((p) => p.id)).toEqual([
    "SUPPLIES",
    "PURCHASING",
    "HR",
    "FINANCE",
    "TECHNICIAN",
    "PLANNING",
    "ADMIN_ASSISTANT",
  ]);
  expect(
    (await apiRequestRaw(undefined, "/users/access-profiles")).status,
  ).toBe(401);

  const tech = profiles.find((p) => p.id === "TECHNICIAN")!;
  const shifts = [
    { startsAt: "2026-10-23T21:00:00Z", endsAt: "2026-10-26T11:00:00Z" },
  ];
  const current = {
    role: "TECHNICIAN",
    accessRules: { ...tech.accessRules, onCallShifts: shifts },
  };
  const changes = accessProfileChanges(tech, current);
  expect(changes.accessRules?.onCallShifts).toEqual(shifts);
  expect(changes.accessRules?.onCallShifts).not.toBe(shifts);
  expect(tech.accessRules.onCallShifts).toEqual([]);
  const custom = accessProfileChanges(null, current);
  expect(custom.accessRules?.profileId).toBeUndefined();
  expect(custom.accessRules?.screens).toEqual(tech.accessRules.screens);
  expect(current.accessRules.profileId).toBe("TECHNICIAN");
  const token = (await apiLogin(account)).access_token;
  for (const endpoint of [
    "/finance/payables",
    "/finance/receivables",
    "/finance/bank-account-options",
    "/hr-admin/agents",
  ])
    expect((await apiRequestRaw(token, endpoint)).status, endpoint).toBe(200);
  for (const endpoint of [
    "/users/access-profiles",
    "/finance/bank-accounts",
    "/finance/cash-flow/projection",
    "/purchase-orders",
    "/contracts",
  ])
    expect((await apiRequestRaw(token, endpoint)).status, endpoint).toBe(403);
  expect(
    (
      await apiRequestRaw(token, "/finance/payables/" + employeeId + "/pay", {
        method: "PATCH",
        body: {},
      })
    ).status,
  ).toBe(403);
  const saved = await apiRequest<{ accessRules: { profileId: string } }>(
    admin,
    "/users/" + employeeId,
  );
  expect(saved.accessRules.profileId).toBe("ADMIN_ASSISTANT");
});

test("cadastro oferece os sete perfis e preenche cargo e departamento sem criar conta", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/management/users/new");
  const selector = page.getByLabel("Perfil por área", { exact: true });
  await expect(selector).toBeEnabled({ timeout: 90_000 });
  await expect(selector.locator("option")).toHaveCount(8);
  for (const preset of profiles) {
    await selector.selectOption(preset.id);
    await expect(
      page
        .locator("select")
        .filter({ has: page.locator('option[value="' + preset.role + '"]') })
        .last(),
    ).toHaveValue(preset.role);
    const department = page
      .getByText("Departamento", { exact: true })
      .locator("xpath=../..")
      .locator("input");
    await expect(department).toHaveValue(preset.department);
  }
  await selector.selectOption("TECHNICIAN");
  await expect(page.getByText("CPF *", { exact: true })).toBeVisible();
  await expect(page.getByText(/Só abre O.S. emergencial/)).toBeVisible();
});

test("permissoes aplica planejamento, salva e preserva perfil apos recarregar", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/management/users/permissions");
  await page
    .getByRole("button", { name: new RegExp("E2E Perfis por Area") })
    .click({ timeout: 90_000 });
  const selector = page.getByLabel("Perfil por área", { exact: true });
  await expect(selector).toHaveValue("ADMIN_ASSISTANT");
  await selector.selectOption("PLANNING");
  const save = page.getByRole("button", {
    name: "Salvar permissões",
    exact: true,
  });
  await expect(save).toBeEnabled();
  const savedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/users/" + employeeId) &&
      response.request().method() === "PATCH",
  );
  await save.click();
  expect((await savedResponse).ok()).toBe(true);
  const saved = await apiRequest<{
    role: string;
    department: string;
    accessRules: { profileId: string };
  }>(admin, "/users/" + employeeId);
  expect(saved.role).toBe("LOGISTICS");
  expect(saved.department).toBe("Planejamento");
  expect(saved.accessRules.profileId).toBe("PLANNING");
  await page.reload();
  await page
    .getByRole("button", { name: new RegExp("E2E Perfis por Area") })
    .click({ timeout: 90_000 });
  await expect(page.getByLabel("Perfil por área", { exact: true })).toHaveValue(
    "PLANNING",
  );
  await expect(
    page.getByRole("button", { name: "Salvar permissões", exact: true }),
  ).toBeDisabled();
});
