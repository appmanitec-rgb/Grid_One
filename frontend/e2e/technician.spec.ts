import { expect, test } from "@playwright/test";
import {
  apiRequestRaw,
  getE2eEntityData,
  loginByApi,
} from "./helpers/auth";
import { expectLoaded } from "./helpers/selectors";
import { accounts } from "./helpers/test-data";

test.describe.serial("area tecnica", () => {
  test("tecnico ve apenas OS propria e realiza check-in/check-out", async ({
    page,
  }) => {
    const data = await getE2eEntityData();
    const session = await loginByApi(page, accounts.technician);

    await page.goto("/dashboard/tecnico");
    await expectLoaded(page, /Minha rota/i);
    await expect(page.locator("body")).toContainText(/Preventiva contratual mensal/i);
    await expect(page.locator("body")).not.toContainText(/Cliente B tecnico secundario/i);

    await page.goto(`/dashboard/tecnico/ordens/${data.technicianOrderId}`);
    await expectLoaded(page, /OS DEMO - Preventiva contratual mensal/i);
    await page.getByRole("button", { name: /^Check-in$/i }).click();
    await expect(page.locator("body")).toContainText(/Check-in registrado/i);

    const duplicate = await apiRequestRaw(
      session.access_token,
      `/technician/orders/${data.technicianOrderId}/check-in`,
      { method: "POST", body: { note: "duplicado e2e" } },
    );
    expect(duplicate.status).toBe(400);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /^Check-out$/i }).click();
    await expect(page.locator("body")).toContainText(/Check-out registrado/i);
    await expect(page.locator("body")).toContainText(/Banco de horas gerado/i);
  });

  test("tecnico nao acessa OS de outro tecnico por URL direta", async ({ page }) => {
    const data = await getE2eEntityData();
    await loginByApi(page, accounts.technician);

    await page.goto(`/dashboard/tecnico/ordens/${data.otherTechnicianOrderId}`);
    await expect(page.locator("body")).toContainText(/OS nao encontrada|OS não encontrada/i);
    await expect(page.locator("body")).not.toContainText(/Cliente B tecnico secundario/i);
  });

  test("detalhe tecnico permanece operavel no viewport mobile", async ({ page }) => {
    const data = await getE2eEntityData();
    await page.setViewportSize({ width: 375, height: 812 });
    await loginByApi(page, accounts.technician);

    await page.goto(`/dashboard/tecnico/ordens/${data.technicianOrderId}`);
    await expectLoaded(page, /Apontamento/i);
    await expect(page.getByRole("button", { name: /^Check-in$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Check-out$/i })).toBeVisible();
  });
});
