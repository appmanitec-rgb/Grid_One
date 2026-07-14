import { expect, test } from "@playwright/test";
import { API_BASE_URL, PUBLIC_TOKENS, accounts } from "./helpers/test-data";
import { getE2eEntityData, loginByApi } from "./helpers/auth";
import { expectLoaded } from "./helpers/selectors";

test.describe("laudos, PDF e portal", () => {
  test("laudo interno possui PDF armazenado e download autorizado", async ({
    page,
  }) => {
    const data = await getE2eEntityData();
    const session = await loginByApi(page, accounts.admin);
    await page.goto(`/dashboard/relatorios-tecnicos/${data.serviceReportAId}`);

    await expectLoaded(page, /Laudo E2E liberado ao Cliente A/i);
    await expect(page.locator("body")).toContainText(/PDF/i);
    await expect(page.locator("body")).toContainText(/Hash/i);
    await expect(
      page.getByRole("button", { name: /Baixar PDF/i }),
    ).toBeVisible();

    const response = await page.request.get(
      `${API_BASE_URL}/service-reports/${data.serviceReportAId}/download-pdf`,
      {
        headers: { Authorization: `Bearer ${session.access_token}` },
      },
    );
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("application/pdf");
    expect((await response.body()).subarray(0, 4).toString("ascii")).toBe(
      "%PDF",
    );
  });

  test("portal exibe laudo liberado sem observacoes internas", async ({
    page,
  }) => {
    const data = await getE2eEntityData();
    await loginByApi(page, accounts.clientA);
    await page.goto(`/portal/laudos/${data.serviceReportAId}`);

    await expectLoaded(page, /Laudo E2E liberado ao Cliente A/i);
    await expect(page.locator("body")).not.toContainText(
      /OBSERVACAO_INTERNA_E2E_NAO_DEVE_APARECER_NO_PORTAL/i,
    );
    await expect(page.locator("body")).not.toContainText(/storageKey/i);
  });

  test("portal registra aceite formal do laudo", async ({ page }) => {
    const data = await getE2eEntityData();
    await loginByApi(page, accounts.clientA);
    await page.goto(`/portal/laudos/${data.serviceReportAId}`);

    await expectLoaded(page, /Laudo E2E liberado ao Cliente A/i);
    const acceptButton = page.getByRole("button", {
      name: /Registrar aceite/i,
    });
    if (await acceptButton.isVisible()) {
      await acceptButton.click();
      await expect(page.locator("body")).toContainText(
        /Aceite formal registrado/i,
      );
    } else {
      await expect(page.locator("body")).toContainText(/Aceito em/i);
    }
  });

  test("download HTTP do PDF do portal retorna binario PDF", async ({
    page,
  }) => {
    const data = await getE2eEntityData();
    const session = await loginByApi(page, accounts.clientA);
    const response = await page.request.get(
      `${API_BASE_URL}/customer-portal/service-reports/${data.serviceReportAId}/download-pdf`,
      {
        headers: { Authorization: `Bearer ${session.access_token}` },
      },
    );

    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("application/pdf");
    const body = await response.body();
    expect(body.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  test("validacao publica reconhece token valido", async ({ page }) => {
    await page.goto(
      `/public/service-reports/verify/${PUBLIC_TOKENS.validation}`,
    );
    await expectLoaded(page, /Documento v.lido|Documento válido/i);
    await expect(page.locator("body")).toContainText(/LR-E2E-90001/i);
  });
});
