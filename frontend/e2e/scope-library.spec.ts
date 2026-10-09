import { expect, test } from "@playwright/test";
import { apiRequest, loginByApi } from "./helpers/auth";
import { accounts } from "./helpers/test-data";

test("importa TXT, pesquisa e adiciona escopo à proposta", async ({ page }) => {
  const session = await loginByApi(page, accounts.sales);
  await page.goto("/dashboard/proposals/new");

  const fileName = "QA-escopo-" + Date.now() + ".txt";
  const title = fileName.slice(0, -4);
  const scopeText = "Manutenção preventiva de grupo gerador com inspeção e teste funcional.";
  const search = page.getByPlaceholder("Pesquisar escopos por nome, arquivo ou categoria");
  await expect(search).toBeVisible();
  await search.fill("arquivo que ainda nao existe");
  await page.locator('input[type="file"][accept*=".txt"]').setInputFiles({
    name: fileName,
    mimeType: "text/plain",
    buffer: Buffer.from(scopeText, "utf8"),
  });

  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(search).toHaveValue("");
  await page.getByRole("button", { name: "Adicionar ao escopo" }).click();
  await expect(page.locator("textarea").first()).toHaveValue(scopeText);

  await page.reload();
  await search.fill(title);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  const saved = await apiRequest<Array<{ name: string; scopeText: string }>>(
    session.access_token,
    "/proposals/scope-templates",
  );
  expect(saved).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: title, scopeText }),
  ]));
});
