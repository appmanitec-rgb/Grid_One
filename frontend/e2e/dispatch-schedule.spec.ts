import { expect, test } from "@playwright/test";

test("programação prioriza a fila e filtra hoje, atrasadas e sem agenda", async ({ page }) => {
  test.setTimeout(180_000);
  const today = new Date();
  const atDay = (offset: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    date.setHours(23, 59, 0, 0);
    return date.toISOString();
  };
  const orders = Array.from({ length: 23 }, (_, index) => {
    const number = index + 1;
    return {
      id: "order-schedule-" + number,
      auvoId: "AUVO-" + number,
      title: "Ordem " + number,
      status: "OPEN",
      type: "CORRECTIVE",
      priority: "NORMAL",
      scheduledTo: number === 3 ? null : atDay(number === 2 ? -1 : number === 1 ? 0 : number),
      technicianId: null,
      openedAt: atDay(-2),
      generator: { id: "generator-1", name: "Gerador de teste", client: { id: "client-1", companyName: "Cliente de teste" } },
    };
  });

  await page.route("http://127.0.0.1:3100/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("http://127.0.0.1:3100/maintenance-orders", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(orders) }),
  );
  await page.addInitScript(() => {
    const payload = btoa(JSON.stringify({ role: "ADMIN", exp: Math.floor(Date.now() / 1000) + 3600 }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    localStorage.setItem("manitec_token", "header." + payload + ".signature");
    localStorage.setItem("manitec_refresh_token", "test-refresh");
  });

  await page.goto("/dashboard/dispatch");
  await expect(page.getByRole("heading", { name: "Programação e despacho", exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("#fila-programacao")).toBeVisible();
  await expect(page.getByText("Página 1 de 2")).toBeVisible();
  await expect(page.locator("#fila-programacao").getByTitle("Abrir ordem de serviço").first()).toHaveText("Ordem 2");

  await page.getByRole("button", { name: "Atrasadas", exact: true }).click();
  await expect(page.locator("#fila-programacao").getByTitle("Abrir ordem de serviço")).toHaveCount(1);
  await expect(page.locator("#fila-programacao")).toContainText("Ordem 2");

  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(page.locator("#fila-programacao").getByTitle("Abrir ordem de serviço")).toHaveCount(1);
  await expect(page.locator("#fila-programacao")).toContainText("Ordem 1");

  await page.getByRole("button", { name: "Sem agenda", exact: true }).click();
  await expect(page.locator("#fila-programacao").getByTitle("Abrir ordem de serviço")).toHaveCount(1);
  await expect(page.locator("#fila-programacao")).toContainText("Ordem 3");

  await page.getByRole("button", { name: "Toda a fila", exact: true }).click();
  await page.getByLabel("Pesquisar ordem de serviço").fill("AUVO-17");
  await expect(page.locator("#fila-programacao").getByTitle("Abrir ordem de serviço")).toHaveCount(1);
  await expect(page.locator("#fila-programacao")).toContainText("Ordem 17");

  await page.getByLabel("Pesquisar ordem de serviço").fill("");
  await page.getByRole("button", { name: "Próxima" }).click();
  await expect(page.getByText("Página 2 de 2")).toBeVisible();
  await expect(page.locator("#nova-os")).toBeVisible();
});