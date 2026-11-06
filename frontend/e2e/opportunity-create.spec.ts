import { expect, test } from "@playwright/test";
import { apiLogin, apiRequest, loginByApi } from "./helpers/auth";
import { accounts } from "./helpers/test-data";

type Opportunity = { id: string; title: string; client: { companyName: string } };

test("comercial cadastra oportunidade para cliente existente", async ({ page }) => {
  const session = await apiLogin(accounts.sales);
  await loginByApi(page, accounts.sales);
  await page.goto("/dashboard/opportunities");
  await expect(page.getByRole("heading", { name: "Nova Oportunidade" })).toBeVisible();

  const title = `E2E Oportunidade ${Date.now()}`;
  await page.getByPlaceholder(/t.tulo da oportunidade/i).fill(title);
  await page.getByRole("textbox", { name: "Buscar cliente da oportunidade" }).fill("Cliente Demo Energia");
  await page.getByRole("button", { name: /Cliente Demo Energia S\.A\./i }).click();
  await page.getByPlaceholder("Valor estimado").fill("12500");
  await page.getByRole("button", { name: "Criar oportunidade" }).click();

  await expect(page.getByText("Oportunidade criada com sucesso.")).toBeVisible();
  await expect(page.getByText(title)).toBeVisible();
  const opportunities = await apiRequest<Opportunity[]>(session.access_token, "/crm/opportunities");
  expect(opportunities.find((item) => item.title === title)).toMatchObject({
    client: { companyName: "Cliente Demo Energia S.A." },
  });
});
