import { expect, test } from "@playwright/test";
import {
  apiLogin,
  apiRequestRaw,
  getE2eEntityData,
  loginByApi,
} from "./helpers/auth";
import { expectLoaded } from "./helpers/selectors";
import { accounts } from "./helpers/test-data";

test.describe("fluxo Cliente -> Chamado -> OS", () => {
  test("cliente abre chamado e operacao converte sem duplicar OS", async ({
    browser,
    page,
  }) => {
    const [data, operationSession] = await Promise.all([
      getE2eEntityData(),
      apiLogin(accounts.operation),
    ]);
    const title = `Chamado E2E conversao ${Date.now()}`;
    const clientSession = await loginByApi(page, accounts.clientA);

    const equipmentResponse = await apiRequestRaw(
      clientSession.access_token,
      `/customer-portal/equipment/${data.clientAEquipmentId}`,
      { timeoutMs: 45_000 },
    );
    expect(equipmentResponse.status).toBe(200);

    const createResponse = await apiRequestRaw(
      clientSession.access_token,
      "/customer-portal/tickets",
      {
        method: "POST",
        body: {
          generatorId: data.clientAEquipmentId,
          title,
          description:
            "Chamado criado pelo Playwright para validar conversao em OS.",
          category: "CORRECTIVE_MAINTENANCE",
          priority: "MEDIUM",
        },
        timeoutMs: 45_000,
      },
    );
    expect(createResponse.ok).toBeTruthy();
    const created = (await createResponse.json()) as { id: string };
    await page.goto(`/portal/chamados/${created.id}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, new RegExp(title));

    const ticketId = created.id;
    expect(ticketId).toBeTruthy();

    const operationContext = await browser.newContext();
    const operationPage = await operationContext.newPage();
    await loginByApi(operationPage, accounts.operation);
    try {
      await operationPage.goto(`/dashboard/atendimento/${ticketId}`);
      await expectLoaded(operationPage, new RegExp(title));
      await expect(
        operationPage.getByRole("button", { name: /Converter para OS/i }),
      ).toBeEnabled();
      const convertResponsePromise = operationPage.waitForResponse(
        (response) =>
          response.url().includes(`/tickets/${ticketId}/convert-to-order`) &&
          response.request().method() === "POST",
        { timeout: 45_000 },
      );
      await operationPage.getByRole("button", { name: /Converter para OS/i }).click();
      const convertResponse = await convertResponsePromise;
      expect(convertResponse.ok()).toBeTruthy();
      await expect(operationPage.locator("body")).toContainText(
        /Chamado convertido em OS/i,
      );
      await expect(operationPage.locator("body")).toContainText(
        /Chamado ja convertido|Chamado já convertido/i,
      );
      await expect(
        operationPage.getByRole("button", { name: /Converter para OS/i }),
      ).toBeDisabled();
    } finally {
      await operationContext.close();
    }

    const duplicate = await apiRequestRaw(
      operationSession.access_token,
      `/tickets/${ticketId}/convert-to-order`,
      { method: "POST", body: {} },
    );
    expect(duplicate.status).toBe(400);
  });
});
