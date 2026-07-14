import { expect, test } from "@playwright/test";
import { API_BASE_URL, PUBLIC_TOKENS } from "./helpers/test-data";
import { expectLoaded } from "./helpers/selectors";

test.describe("links publicos de laudo", () => {
  test("share publico valido carrega laudo sem dados internos", async ({
    page,
  }) => {
    await page.goto(
      `/public/service-reports/share/${PUBLIC_TOKENS.shareValid}`,
    );
    await expectLoaded(page, /Laudo E2E liberado ao Cliente A/i);
    await expect(page.locator("body")).toContainText(/Link seguro/i);
    await expect(page.getByRole("link", { name: /Baixar PDF/i })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/OBSERVACAO_INTERNA/i);
    await expect(page.locator("body")).not.toContainText(/storageKey/i);
  });

  test("share publico permite download quando liberado", async ({ page }) => {
    const response = await page.request.get(
      `${API_BASE_URL}/public/service-reports/share/${PUBLIC_TOKENS.shareValid}/download-pdf`,
    );
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("application/pdf");
    expect((await response.body()).subarray(0, 4).toString("ascii")).toBe(
      "%PDF",
    );
  });

  test("token invalido, expirado e revogado exibem bloqueio claro", async ({
    page,
  }) => {
    for (const token of [
      PUBLIC_TOKENS.invalid,
      PUBLIC_TOKENS.shareExpired,
      PUBLIC_TOKENS.shareRevoked,
    ]) {
      await page.goto(`/public/service-reports/share/${token}`);
      await expect(page.locator("body")).toContainText(
        /Link publico nao encontrado|Link publico invalido|Link publico revogado|Link publico expirado|Link indisponivel|Link público/i,
      );
    }
  });

  test("verify com token invalido mostra erro legivel", async ({ page }) => {
    await page.goto(`/public/service-reports/verify/${PUBLIC_TOKENS.invalid}`);
    await expect(page.locator("body")).toContainText(
      /Link publico invalido|Validacao indisponivel|Valida/i,
    );
  });

  test("verify com documento revogado mostra status revogado", async ({
    page,
  }) => {
    await page.goto(
      `/public/service-reports/verify/${PUBLIC_TOKENS.validationRevoked}`,
    );
    await expect(page.locator("body")).toContainText(/Documento revogado/i);
    await expect(page.locator("body")).toContainText(/LR-E2E-90002/i);
  });
});
