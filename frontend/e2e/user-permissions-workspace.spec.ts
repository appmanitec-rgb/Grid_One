import { expect, test } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  apiRequestRaw,
  loginByApi,
} from "./helpers/auth";
import { accounts } from "./helpers/test-data";
import { selectFieldOption } from "./helpers/select-field";

test.use({ actionTimeout: 20000 });
let token: string;
let target: { id: string; name: string; email: string };
let delegated: { id: string; email: string };
const password = "PermissoesE2E!2026";
test.beforeAll(async () => {
  token = (await apiLogin(accounts.admin)).access_token;
  const stamp = Date.now();
  target = await apiRequest(token, "/users", {
    method: "POST",
    body: {
      name: "Colaborador Permissões " + stamp,
      email: "permissoes-alvo-" + stamp + "@manitec.test",
      role: "SALES",
      department: "Comercial de teste",
      password,
    },
  });
  delegated = await apiRequest(token, "/users", {
    method: "POST",
    body: {
      name: "Consulta de acessos " + stamp,
      email: "permissoes-consulta-" + stamp + "@manitec.test",
      role: "NORMAL",
      password,
      accessPolicy: {
        pages: { usersControl: true },
        users: { manage: true, manageSecurity: false },
      },
    },
  });
});
test.afterAll(async () => {
  for (const user of [target, delegated].filter(Boolean)) {
    await apiRequest(token, "/users/" + user.id, {
      method: "PATCH",
      body: { isActive: false },
    });
  }
});

test("RH abre o colaborador correto e permissões por área salvam sem liberar outros departamentos", async ({
  page,
}, info) => {
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/hr/collaborators");
  await expect(
    page.getByRole("heading", {
      name: "Colaboradores e acessos",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Recursos Humanos", exact: true }),
  ).toBeVisible();
  await page
    .getByPlaceholder("Buscar colaborador, departamento, cliente ou e-mail")
    .fill(target.name);
  await expect(
    page.getByRole("row").filter({ hasText: target.email }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await selectFieldOption(
    page.getByRole("combobox", { name: "Departamento", exact: true }),
    "Comercial de teste",
  );

  const row = page.getByRole("row").filter({ hasText: target.email });
  await expect(row).toHaveCount(1);
  await row.getByRole("link", { name: "Ver cadastro", exact: true }).click();
  await expect(page.locator('input[type="email"]')).toHaveValue(target.email);
  await page.goto("/dashboard/management/users/permissions?user=" + target.id);
  const panel = page.getByRole("tabpanel");
  await expect(page.getByRole("tab", { name: /^Propostas$/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    panel.getByLabel("Pode visualizar esta tela", { exact: true }),
  ).toBeChecked();
  await expect(panel.getByLabel("Criar", { exact: true })).toBeChecked();
  await panel.getByLabel("Criar", { exact: true }).uncheck();
  await expect(panel.getByLabel("Criar", { exact: true })).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Salvar permissões", exact: true }),
  ).toBeEnabled();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/users/" + target.id) &&
      response.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Salvar permissões", exact: true })
    .click();
  expect((await saved).ok()).toBeTruthy();
  const current = await apiRequest<{
    accessRules: { screens: { proposals: { actions: { create: boolean } } } };
    accessPolicy: {
      proposals: { create: boolean };
      finance: { pay: boolean };
      pages: { finance: boolean };
    };
  }>(token, "/users/" + target.id);
  expect(current.accessRules.screens.proposals.actions.create).toBe(false);
  expect(current.accessPolicy.finance.pay).toBe(false);
  expect(current.accessPolicy.pages.finance).toBe(false);
  await page.reload();
  await expect(
    page.getByRole("tabpanel").getByLabel("Criar", { exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("group", { name: "Departamentos das telas" })
    .getByRole("button", { name: "RH", exact: true })
    .click();
  await page.getByRole("tab", { name: "Documentação", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Documentação");
  await expect(
    page
      .getByRole("tabpanel")
      .getByLabel("Pode visualizar esta tela", { exact: true }),
  ).not.toBeChecked();
  await page.screenshot({
    path: info.outputPath("permissoes-departamento.png"),
    fullPage: true,
  });
});

test("consulta de permissões não permite editar e o RH não recebe administração de segurança", async ({
  page,
}, info) => {
  await loginByApi(page, {
    ...accounts.sales,
    email: delegated.email,
    password,
  });
  await page.goto("/dashboard/management/users/permissions?user=" + target.id);
  await expect(page.getByRole("tabpanel")).toBeVisible();
  await expect(
    page
      .getByRole("tabpanel")
      .getByLabel("Pode visualizar esta tela", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Salvar permissões", exact: true }),
  ).toBeDisabled();
  const session = await apiLogin({
    ...accounts.sales,
    email: delegated.email,
    password,
  });
  expect(
    (
      await apiRequestRaw(session.access_token, "/users/" + target.id, {
        method: "PATCH",
        body: { accessPolicy: { finance: { pay: true } } },
      })
    ).status,
  ).toBe(403);
  await loginByApi(page, accounts.hr);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/hr/collaborators");
  await expect(
    page.getByRole("heading", {
      name: "Colaboradores e acessos",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Gerenciar permissões", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: "Documentação", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("rh-celular.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
});
