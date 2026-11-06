import { expect, test } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  getE2eEntityData,
  loginByApi,
} from "./helpers/auth";
import { accounts } from "./helpers/test-data";
let token: string;
let equipment: {
  id: string;
  name: string;
  clientId: string;
  photoUrl?: string | null;
};
test.beforeAll(async () => {
  const [login, data] = await Promise.all([
    apiLogin(accounts.admin),
    getE2eEntityData(),
  ]);
  token = login.access_token;
  equipment = await apiRequest(token, "/generators/" + data.clientAEquipmentId);
  const summary = await apiRequest<{
    pending: { total: number; items: unknown[] };
    completed: { total: number; items: unknown[] };
  }>(token, "/generators/" + equipment.id + "/order-summary");
  expect(summary.pending.total).toBeGreaterThanOrEqual(
    summary.pending.items.length,
  );
  expect(summary.completed.total).toBeGreaterThanOrEqual(
    summary.completed.items.length,
  );
  expect(summary.pending.items.length).toBeLessThanOrEqual(5);
});
async function open(page: import("@playwright/test").Page) {
  await page.goto("/dashboard/equipments");
  await page.getByPlaceholder(/Nome, tag/).fill(equipment.name);
  await expect(
    page.getByTitle("Abrir resumo do equipamento", { exact: true }),
  ).toHaveCount(1);
  await page.getByTitle("Abrir resumo do equipamento", { exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Resumo do equipamento/ });
  await expect(dialog).toBeVisible();
  return dialog;
}
for (const width of [1366, 390]) {
  test(
    "resumo do equipamento exibe O.S., salva foto e abre atalhos vinculados em " +
      width +
      "px",
    async ({ page }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await loginByApi(page, accounts.admin);
      await page.route(
        "**/generators/" + equipment.id + "/order-summary",
        (route) =>
          route.fulfill({
            json: {
              pending: {
                total: 14,
                items: [
                  {
                    id: "pending-order",
                    title: "Revisão pendente",
                    status: "OPEN",
                  },
                ],
              },
              completed: {
                total: 8,
                items: [
                  {
                    id: "completed-order",
                    title: "Preventiva realizada",
                    status: "COMPLETED",
                    finishedAt: "2026-10-15T12:00:00Z",
                  },
                ],
              },
            },
          }),
      );
      let dialog = await open(page);
      await expect(
        dialog.getByRole("region", { name: "O.S. a fazer" }),
      ).toContainText("14");
      await expect(
        dialog.getByRole("region", { name: "O.S. realizadas" }),
      ).toContainText("8");
      await expect(
        dialog.getByRole("link", { name: /Revisão pendente/ }),
      ).toHaveAttribute("href", "/dashboard/orders/pending-order");
      const proposal = dialog.getByRole("link", {
        name: "Abrir proposta",
        exact: true,
      });
      const ticket = dialog.getByRole("link", {
        name: "Abrir chamado / solicitação",
        exact: true,
      });
      await expect(proposal).toHaveAttribute(
        "href",
        "/dashboard/proposals/new?clientId=" +
          equipment.clientId +
          "&generatorId=" +
          equipment.id,
      );
      await expect(ticket).toHaveAttribute(
        "href",
        "/dashboard/atendimento?clientId=" +
          equipment.clientId +
          "&generatorId=" +
          equipment.id +
          "#novo-chamado",
      );
      try {
        await dialog
          .getByLabel("Anexar foto do equipamento", { exact: true })
          .setInputFiles({
            name: "maquina.png",
            mimeType: "image/png",
            buffer: Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
              "base64",
            ),
          });
        const image = dialog.getByRole("img", {
          name: "Foto do equipamento do cliente",
        });
        await expect(image).toBeVisible();
        await expect(image).toHaveJSProperty("naturalWidth", 1);
        const saved = page.waitForResponse(
          (response) =>
            response.url().endsWith("/generators/" + equipment.id) &&
            response.request().method() === "PATCH",
        );
        await dialog
          .getByRole("button", { name: "Salvar alterações", exact: true })
          .click();
        expect((await saved).ok()).toBeTruthy();
        const persisted = await apiRequest<{ photoUrl: string }>(
          token,
          "/generators/" + equipment.id,
        );
        expect(persisted.photoUrl).toMatch(/^data:image\/webp;base64,/);
        dialog = await open(page);
        await expect(
          dialog.getByRole("img", { name: "Foto do equipamento do cliente" }),
        ).toHaveJSProperty("naturalWidth", 1);
        await page.screenshot({
          path: info.outputPath("equipment-summary.png"),
        });
        expect(
          await dialog.evaluate(
            (element) => element.scrollWidth - element.clientWidth,
          ),
        ).toBeLessThanOrEqual(1);
        if (width === 1366) {
          await dialog
            .getByRole("link", { name: "Abrir proposta", exact: true })
            .click();
          await expect
            .poll(() =>
              page
                .getByRole("textbox", { name: "Equipamento", exact: true })
                .inputValue(),
            )
            .toContain(equipment.name);
          dialog = await open(page);
        }
        await dialog
          .getByRole("link", {
            name: "Abrir chamado / solicitação",
            exact: true,
          })
          .click();
        const field = page
          .getByRole("form", { name: "Novo chamado" })
          .getByRole("combobox", { name: "Equipamento", exact: true });
        await expect(field).toBeEnabled();
        await expect(
          field.locator("xpath=following-sibling::select"),
        ).toHaveValue(equipment.id);
      } finally {
        await apiRequest(token, "/generators/" + equipment.id, {
          method: "PATCH",
          body: { photoUrl: equipment.photoUrl || null },
        });
      }
    },
  );
}
