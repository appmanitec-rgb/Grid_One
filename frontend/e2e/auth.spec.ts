import { expect, test } from "@playwright/test";
import { accounts } from "./helpers/test-data";
import { loginByUi } from "./helpers/auth";
import { expectLoaded } from "./helpers/selectors";

test.describe("login e RBAC por perfil", () => {
  for (const account of [
    accounts.admin,
    accounts.manager,
    accounts.sales,
    accounts.operation,
    accounts.technician,
    accounts.finance,
    accounts.clientA,
    accounts.clientB,
  ]) {
    test(`${account.key} autentica no navegador`, async ({ page }) => {
      await loginByUi(page, account);
      await expect(page).toHaveURL(new RegExp(account.expectedStartPath));
    });
  }

  test("admin ve modulos internos sensiveis", async ({ page }) => {
    await loginByUi(page, accounts.admin);
    await expectLoaded(page, /Dashboard|Cockpit|Painel/i);
    await expect(page.getByRole("button", { name: /Financeiro/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Fluxo de Caixa/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Gestao|Gestão/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Laudos/i })).toBeVisible();
  });

  test("tecnico nao ve financeiro, RH ou gestao e nao acessa URL direta", async ({
    page,
  }) => {
    await loginByUi(page, accounts.technician);
    await page.goto("/dashboard/tecnico");
    await expectLoaded(page, /Minha rota/i);
    await expect(page.getByRole("link", { name: /Financeiro/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^RH$/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Gestao|Gestão/i })).toHaveCount(0);

    await page.goto("/dashboard/finance/cash-flow");
    await expect(page).not.toHaveURL(/\/dashboard\/finance\/cash-flow/);
  });

  test("financeiro acessa financeiro e nao executa area tecnica", async ({ page }) => {
    await loginByUi(page, accounts.finance);
    await page.goto("/dashboard/finance/cash-flow");
    await expectLoaded(page, /Fluxo de caixa|Financeiro/i);

    await page.goto("/dashboard/tecnico");
    await expect(page).not.toHaveURL(/\/dashboard\/tecnico$/);
  });

  test("cliente fica restrito ao portal mesmo por URL direta", async ({ page }) => {
    await loginByUi(page, accounts.clientA);
    await expectLoaded(page, /Portal|Resumo/i);

    await page.goto("/dashboard/finance/cash-flow");
    await expect(page).toHaveURL(/\/portal/);

    await page.goto("/dashboard/tecnico");
    await expect(page).toHaveURL(/\/portal/);
  });
});
