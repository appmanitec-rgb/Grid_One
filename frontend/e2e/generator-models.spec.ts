import { expect, test } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  apiRequestRaw,
  loginByApi,
} from "./helpers/auth";
import { expectLoaded } from "./helpers/selectors";
import { accounts } from "./helpers/test-data";

type GeneratorModel = {
  id: string;
  name: string;
  maintenanceTemplates?: Array<{ id: string; name: string; active: boolean }>;
};

test.describe("modelos de geradores", () => {
  test("admin cria, edita e configura plano de manutencao do modelo", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const unique = Date.now();
    const modelName = `Modelo E2E ${unique}`;
    const updatedName = `${modelName} Revisado`;
    const adminSession = await apiLogin(accounts.admin);

    await loginByApi(page, accounts.admin);
    await page.goto("/dashboard/equipments/models", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Modelos de Geradores/i);

    await page.getByLabel(/Fabricante/i).fill("STEMAC");
    await page.getByLabel(/^Modelo$/i).fill(modelName);
    await page.getByLabel(/Potencia kVA/i).fill("180");
    await page.getByLabel(/Tensao/i).fill("380/220 V");
    await page.getByLabel(/Frequencia/i).fill("60");
    await page.getByRole("button", { name: /^Adicionar item$/i }).click();
    await page.getByLabel("Nome do item de manutencao 1").fill("Troca de oleo");
    await page.getByLabel("Intervalo por tempo 1").fill("6");
    await page.getByLabel("Intervalo por horimetro 1").fill("250");
    await page.getByRole("button", { name: /^Salvar modelo$/i }).click();
    await expect(page.locator("body")).toContainText(
      /Modelo cadastrado com plano de manutencao/i,
    );
    await expect(page.locator("body")).toContainText(modelName);

    const created = (
      await apiRequest<GeneratorModel[]>(adminSession.access_token, "/generators/models")
    ).find((item) => item.name === modelName);
    expect(created?.id).toBeTruthy();

    await page
      .locator("tr", { hasText: modelName })
      .getByRole("button", { name: /Editar/i })
      .click();
    await expect(page.getByRole("button", { name: /Salvar alteracoes/i })).toBeVisible();
    await expect(page.getByLabel(/^Modelo$/i)).toHaveValue(modelName);
    await page.getByLabel(/^Modelo$/i).fill(updatedName);
    await page.getByLabel(/Potencia kVA/i).fill("200");
    await page.getByRole("button", { name: /^Adicionar item$/i }).click();
    await page.getByLabel("Nome do item de manutencao 2").fill("Filtro de oleo");
    await page.getByRole("button", { name: /Salvar alteracoes/i }).click();
    await expect(page.locator("body")).toContainText(
      /Modelo atualizado com plano de manutencao/i,
    );
    await expect(page.locator("body")).toContainText(updatedName);
    await expect(page.locator("tr", { hasText: updatedName })).toContainText(
      /2 recomendacoes/i,
    );

    const [auditorSession, clientSession] = await Promise.all([
      apiLogin(accounts.auditor),
      apiLogin(accounts.clientA),
    ]);
    const auditorPatch = await apiRequestRaw(
      auditorSession.access_token,
      `/generators/models/${created!.id}`,
      {
        method: "PATCH",
        body: { name: `${updatedName} Auditor` },
      },
    );
    expect(auditorPatch.status).toBe(403);

    const clientPatch = await apiRequestRaw(
      clientSession.access_token,
      `/generators/models/${created!.id}`,
      {
        method: "PATCH",
        body: { name: `${updatedName} Cliente` },
      },
    );
    expect(clientPatch.status).toBe(403);
  });
});
