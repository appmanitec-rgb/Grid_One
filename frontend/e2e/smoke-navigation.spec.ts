import { expect, test } from "@playwright/test";
import { loginByApi } from "./helpers/auth";
import { expectLoaded, expectNoAppCrash } from "./helpers/selectors";
import { PUBLIC_TOKENS, accounts } from "./helpers/test-data";

const internalRoutes = [
  "/dashboard",
  "/dashboard/opportunities",
  "/dashboard/proposals",
  "/dashboard/orders",
  "/dashboard/atendimento",
  "/dashboard/relatorios-tecnicos",
  "/dashboard/finance/cash-flow",
  "/dashboard/control",
];

const portalRoutes = [
  "/portal/dashboard",
  "/portal/equipamentos",
  "/portal/propostas",
  "/portal/chamados",
  "/portal/laudos",
  "/portal/documentos",
  "/portal/financeiro",
];

test.describe("smoke navigation", () => {
  test("rotas internas principais carregam sem 404/500", async ({ page }) => {
    await loginByApi(page, accounts.admin);

    for (const route of internalRoutes) {
      await page.goto(route);
      await expectNoAppCrash(page);
      await expect(page.locator("body")).not.toContainText(/nao encontrado|não encontrado/i);
    }
  });

  test("area tecnica carrega com perfil tecnico", async ({ page }) => {
    await loginByApi(page, accounts.technician);
    await page.goto("/dashboard/tecnico");
    await expectLoaded(page, /Minha rota/i);
  });

  test("rotas do portal carregam com cliente", async ({ page }) => {
    await loginByApi(page, accounts.clientA);

    for (const route of portalRoutes) {
      await page.goto(route);
      await expectNoAppCrash(page);
      await expect(page.locator("body")).not.toContainText(/Application error/i);
    }
  });

  test("rotas publicas de laudo carregam", async ({ page }) => {
    await page.goto(`/public/service-reports/share/${PUBLIC_TOKENS.shareValid}`);
    await expectLoaded(page, /Link seguro/i);

    await page.goto(`/public/service-reports/verify/${PUBLIC_TOKENS.validation}`);
    await expectLoaded(page, /Documento v.lido|Documento válido/i);
  });
});
