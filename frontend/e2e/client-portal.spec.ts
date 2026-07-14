import { expect, test } from "@playwright/test";
import {
  apiLogin,
  apiRequestRaw,
  getE2eEntityData,
  loginByApi,
} from "./helpers/auth";
import { expectLoaded } from "./helpers/selectors";
import { accounts } from "./helpers/test-data";

test.describe("portal do cliente e isolamento Cliente A/B", () => {
  test("Cliente A ve apenas seus equipamentos, chamados e laudos", async ({
    page,
  }) => {
    const data = await getE2eEntityData();
    const sessionA = await loginByApi(page, accounts.clientA);

    await page.goto("/portal/equipamentos");
    await expectLoaded(page, /Equipamentos/i);
    await expect(page.locator("body")).toContainText(/Gerador Hospital Principal/i);
    await expect(page.locator("body")).not.toContainText(/Gerador Industrial Backup/i);

    await page.goto("/portal/chamados");
    await expectLoaded(page, /Chamados/i);
    await expect(page.locator("body")).toContainText(/TCK-E2E-A/i);
    await expect(page.locator("body")).not.toContainText(/TCK-E2E-B/i);

    await page.goto("/portal/laudos");
    await expectLoaded(page, /Laudos/i);
    await expect(page.locator("body")).toContainText(/LR-E2E-90001/i);
    await expect(page.locator("body")).not.toContainText(/LR-E2E-90002/i);

    const tokenA = sessionA.access_token;
    await expect(
      apiRequestRaw(tokenA, `/customer-portal/equipment/${data.clientBEquipmentId}`),
    ).resolves.toHaveProperty("status", 404);
    await expect(
      apiRequestRaw(tokenA, `/customer-portal/tickets/${data.clientBTicketId}`),
    ).resolves.toHaveProperty("status", 404);
    await expect(
      apiRequestRaw(tokenA, `/customer-portal/service-reports/${data.serviceReportBId}`),
    ).resolves.toHaveProperty("status", 404);
  });

  test("Cliente B nao ve dados do Cliente A", async ({ page }) => {
    const data = await getE2eEntityData();
    const sessionB = await loginByApi(page, accounts.clientB);

    await page.goto("/portal/equipamentos");
    await expectLoaded(page, /Equipamentos/i);
    await expect(page.locator("body")).toContainText(/Gerador Industrial Backup/i);
    await expect(page.locator("body")).not.toContainText(/Gerador Hospital Principal/i);

    const tokenB = sessionB.access_token;
    await expect(
      apiRequestRaw(tokenB, `/customer-portal/equipment/${data.clientAEquipmentId}`),
    ).resolves.toHaveProperty("status", 404);
    await expect(
      apiRequestRaw(tokenB, `/customer-portal/tickets/${data.clientATicketId}`),
    ).resolves.toHaveProperty("status", 404);
    await expect(
      apiRequestRaw(tokenB, `/customer-portal/service-reports/${data.serviceReportAId}`),
    ).resolves.toHaveProperty("status", 404);
  });

  test("laudo liberado no portal nao expoe campos internos e permite downloads autorizados", async ({
    page,
  }) => {
    const data = await getE2eEntityData();
    const session = await loginByApi(page, accounts.clientA);
    const detailResponse = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(
            `/customer-portal/service-reports/${data.serviceReportAId}`,
          ) &&
        response.request().method() === "GET" &&
        !response.url().includes("/download") &&
        !response.url().includes("/evidence/"),
      { timeout: 45_000 },
    );
    await page.goto(`/portal/laudos/${data.serviceReportAId}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    await expect((await detailResponse).status()).toBe(200);
    await expectLoaded(page, /Laudo E2E liberado ao Cliente A/i);
    await expect(page.locator("body")).not.toContainText(
      /OBSERVACAO_INTERNA_E2E_NAO_DEVE_APARECER_NO_PORTAL/i,
    );
    await expect(page.locator("body")).not.toContainText(
      /NOTA_INTERNA_SEGURANCA_E2E_NAO_PUBLICA/i,
    );
    await expect(page.locator("body")).not.toContainText(/storageKey/i);

    const pdfResponse = await apiRequestRaw(
      session.access_token,
      `/customer-portal/service-reports/${data.serviceReportAId}/download-pdf`,
    );
    expect(pdfResponse.status).toBe(200);
    expect(pdfResponse.headers.get("content-type")).toContain("application/pdf");
    expect((await pdfResponse.arrayBuffer()).byteLength).toBeGreaterThan(100);

    const reportResponse = await apiRequestRaw(
      session.access_token,
      `/customer-portal/service-reports/${data.serviceReportAId}`,
    );
    expect(reportResponse.status).toBe(200);
    const report = (await reportResponse.json()) as {
      evidences?: Array<{ id: string; hasStoredFile?: boolean }>;
    };
    const storedEvidence = report.evidences?.find(
      (evidence) => evidence.hasStoredFile,
    );
    expect(storedEvidence?.id).toBeTruthy();

    const evidenceResponse = await apiRequestRaw(
      session.access_token,
      `/customer-portal/service-reports/${data.serviceReportAId}/evidence/${storedEvidence?.id}/download`,
    );
    expect(evidenceResponse.status).toBe(200);
    expect((await evidenceResponse.arrayBuffer()).byteLength).toBeGreaterThan(10);
  });
});

test.describe("API de portal rejeita token de cliente errado", () => {
  test("Cliente A nao baixa PDF de laudo de Cliente B", async () => {
    const data = await getE2eEntityData();
    const sessionA = await apiLogin(accounts.clientA);
    const response = await apiRequestRaw(
      sessionA.access_token,
      `/customer-portal/service-reports/${data.serviceReportBId}/download-pdf`,
      { timeoutMs: 60_000 },
    );
    expect([403, 404]).toContain(response.status);
  });
});
