import { expect, test } from "@playwright/test";

test("carteira exibe todos os status e permite buscar, ordenar e paginar", async ({ page }) => {
  test.setTimeout(180_000);
  const proposals = Array.from({ length: 23 }, (_, index) => {
    const number = index + 1;
    return {
      id: "proposal-list-" + number,
      code: "P-" + String(number).padStart(3, "0"),
      type: "PARTS_AND_SERVICES",
      origin: number === 3 ? "EXTERNAL" : "MANITEC",
      externalCurrency: number === 3 ? "USD" : "BRL",
      status: number === 2 ? "DISCOUNT_REVIEW" : number === 3 ? "SENT" : number === 4 ? "APPROVED" : "DRAFT",
      totalValue: number * 100,
      createdAt: new Date(Date.UTC(2026, 9, number)).toISOString(),
      externalReference: number === 3 ? "EX-UNICA-2026" : null,
      client: { companyName: "Cliente " + number },
      commercialGenerator: number === 4 ? { manufacturer: "Cummins", model: "C50" } : null,
    };
  });

  await page.route("http://127.0.0.1:3100/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("http://127.0.0.1:3100/proposals", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(proposals) }),
  );
  await page.addInitScript(() => {
    const payload = btoa(JSON.stringify({ role: "ADMIN", exp: Math.floor(Date.now() / 1000) + 3600 }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    localStorage.setItem("manitec_token", "header." + payload + ".signature");
    localStorage.setItem("manitec_refresh_token", "test-refresh");
  });

  await page.goto("/dashboard/proposals");
  await expect(page.getByRole("heading", { name: "Central de propostas", exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Página 1 de 2")).toBeVisible();

  await page.getByLabel("Pesquisar propostas").fill("EX-UNICA-2026");
  await expect(page.locator('a[title="Abrir proposta"]')).toHaveCount(1);
  await expect(page.locator('a[title="Abrir proposta"]')).toContainText("P-003");
  await expect(page.locator("body")).toContainText("US$ 300,00");

  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.getByLabel("Filtrar por etapa").selectOption("BOARD_REVIEW");
  await expect(page.locator('a[title="Abrir proposta"]')).toHaveCount(1);
  await expect(page.locator('a[title="Abrir proposta"]')).toContainText("P-002");

  await page.getByLabel("Filtrar por etapa").selectOption("ALL");
  await page.getByLabel("Pesquisar propostas").fill("Cummins C50");
  await expect(page.locator('a[title="Abrir proposta"]')).toContainText("P-004");
  await page.getByLabel("Pesquisar propostas").fill("");
  await page.getByRole("button", { name: "Kanban", exact: true }).click();
  const board = page.locator('[aria-label="Kanban comercial de propostas"]');
  await expect(board).toContainText("P-002");
  await expect(board).toContainText("P-003");
  await expect(board).toContainText("P-004");
  await expect(board).toContainText("Outros status");

  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await page.getByLabel("Ordenar propostas").selectOption("VALUE_DESC");
  await expect(page.locator('a[title="Abrir proposta"]').first()).toHaveText("P-023");
  await page.getByRole("button", { name: "Próxima" }).click();
  await expect(page.getByText("Página 2 de 2")).toBeVisible();
  await expect(page.locator('a[title="Abrir proposta"]').first()).toHaveText("P-003");
});