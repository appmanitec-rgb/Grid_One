import { expect, Page, test } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  getE2eEntityData,
  loginByApi,
} from "./helpers/auth";
import { expectLoaded, saveQaScreenshot } from "./helpers/selectors";
import { PUBLIC_TOKENS, accounts } from "./helpers/test-data";

async function capture(
  page: Page,
  route: string,
  name: string,
  readyText: RegExp,
  mobile = false,
  waitForNoTransientText = false,
) {
  await page.setViewportSize(
    mobile ? { width: 375, height: 812 } : { width: 1366, height: 768 },
  );
  await page.goto(route);
  await expectLoaded(page, readyText);
  if (waitForNoTransientText) {
    await expect(page.locator("body")).not.toContainText(
      /Carregando laudo|Abrindo laudo|Validando documento/i,
      { timeout: 20_000 },
    );
  }
  await saveQaScreenshot(page, `${mobile ? "mobile" : "desktop"}-${name}`);
}

test.describe("screenshots de regressao visual", () => {
  test("gera baseline interno desktop e mobile", async ({ page }) => {
    test.setTimeout(180_000);
    const data = await getE2eEntityData();
    const admin = await apiLogin(accounts.admin);
    const proposals = await apiRequest<Record<string, unknown>[]>(
      admin.access_token,
      "/proposals",
    );
    const proposalId =
      proposals.find((proposal) => typeof proposal.id === "string")?.id || "";
    expect(proposalId).toBeTruthy();

    await loginByApi(page, accounts.admin);
    await capture(page, "/dashboard", "dashboard", /Gestao|Gestão|Painel/i);
    await capture(page, "/dashboard", "dashboard", /Gestao|Gestão|Painel/i, true);
    await capture(page, "/dashboard/opportunities", "oportunidades", /Oportunidades/i);
    await capture(
      page,
      "/dashboard/opportunities",
      "oportunidades",
      /Oportunidades/i,
      true,
    );
    await capture(
      page,
      `/dashboard/proposals/${proposalId}`,
      "proposta-detalhe",
      /Proposta|Cliente/i,
    );
    await capture(
      page,
      `/dashboard/proposals/${proposalId}`,
      "proposta-detalhe",
      /Proposta|Cliente/i,
      true,
    );
    await capture(page, "/dashboard/atendimento", "atendimento", /Atendimento/i);
    await capture(page, "/dashboard/relatorios-tecnicos", "laudos", /Laudos/i);
    await capture(
      page,
      `/dashboard/relatorios-tecnicos/${data.serviceReportAId}`,
      "laudo-detalhe",
      /Laudo E2E liberado ao Cliente A|PDF|Hash/i,
      false,
      true,
    );
  });

  test("gera baseline da lista da area tecnica", async ({ page }) => {
    test.setTimeout(120_000);
    await loginByApi(page, accounts.technician);
    await capture(page, "/dashboard/tecnico", "area-tecnica", /Minha rota/i);
    await capture(page, "/dashboard/tecnico", "area-tecnica", /Minha rota/i, true);
  });

  test("gera baseline do detalhe da OS tecnica", async ({ page }) => {
    test.setTimeout(120_000);
    const data = await getE2eEntityData();
    await loginByApi(page, accounts.technician);
    await capture(
      page,
      `/dashboard/tecnico/ordens/${data.technicianOrderId}`,
      "os-tecnico-detalhe",
      /Apontamento|OS DEMO/i,
    );
    await capture(
      page,
      `/dashboard/tecnico/ordens/${data.technicianOrderId}`,
      "os-tecnico-detalhe",
      /Apontamento|OS DEMO/i,
      true,
    );
  });

  test("gera baseline do portal e paginas publicas", async ({ page }) => {
    test.setTimeout(120_000);
    await loginByApi(page, accounts.clientA);
    await capture(page, "/portal/dashboard", "portal-dashboard", /Portal|Resumo/i);
    await capture(page, "/portal/chamados", "portal-chamados", /Chamados/i);
    await capture(page, "/portal/laudos", "portal-laudos", /Laudos/i);

    await capture(
      page,
      `/public/service-reports/share/${PUBLIC_TOKENS.shareValid}`,
      "public-share",
      /Link seguro|Laudo E2E/i,
      false,
      true,
    );
    await capture(
      page,
      `/public/service-reports/verify/${PUBLIC_TOKENS.validation}`,
      "public-verify",
      /Documento v.lido|Documento válido/i,
      false,
      true,
    );
  });
});
