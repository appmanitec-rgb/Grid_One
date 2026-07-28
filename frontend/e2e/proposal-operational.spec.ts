import { expect, test } from "@playwright/test";
import { loginByApi } from "./helpers/auth";
import { accounts } from "./helpers/test-data";

test.describe("propostas operacionais", () => {
  test("cria proposta com cliente rapido, maquina rapida, hora e escopo pronto", async ({
    page,
  }) => {
    await loginByApi(page, accounts.sales);
    await page.goto("/dashboard/proposals/new");

    const suffix = `${Date.now()}`.slice(-8);

    await page.getByRole("button", { name: /cliente rapido/i }).click();
    await page.getByPlaceholder("Razao social/nome").fill(`Cliente 20GB ${suffix}`);
    await page.getByPlaceholder("Nome fantasia").fill(`20GB ${suffix}`);
    await page.getByPlaceholder("CPF/CNPJ").fill(`55.555.${suffix.slice(0, 3)}/0001-55`);
    await page.getByPlaceholder("Telefone").fill("(11) 4002-2000");
    await page.getByPlaceholder("E-mail").fill(`cliente20gb-${suffix}@example.test`);
    await page.getByPlaceholder("Contato").fill("Contato Comercial");
    await page.getByPlaceholder("Endereco").fill("Rua Teste, 100");
    await page.getByPlaceholder("Cidade").fill("Sao Paulo");
    await page.getByPlaceholder("UF").fill("SP");
    await page.getByRole("button", { name: /salvar cliente/i }).click();
    await expect(page.getByText(/cliente cadastrado e selecionado/i)).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: /maquina rapida/i }).click();
    await page.getByPlaceholder("Nome/apelido").fill(`GMG 20GB ${suffix}`);
    await page.getByPlaceholder("Tag patrimonial").fill(`TAG-${suffix}`);
    await page.getByPlaceholder("Fabricante").fill("Stemac");
    await page.getByPlaceholder("Modelo").fill("G100");
    await page.getByPlaceholder("Numero de serie").fill(`SN-20GB-${suffix}`);
    await page.getByPlaceholder("Potencia kVA").fill("100");
    await page.getByPlaceholder("Tensao").fill("220/380V");
    await page.getByPlaceholder("Local/site").fill("Sala tecnica");
    await page.getByPlaceholder("Observacao").fill("Criado pelo E2E 20G-B.");
    await page.getByRole("button", { name: /salvar maquina/i }).click();
    await expect(page.getByText(/maquina cadastrada e selecionada/i)).toBeVisible({
      timeout: 20_000,
    });

    await page.getByPlaceholder("Pesquisar vendedor comercial").fill("Comercial");
    await page.getByRole("button", { name: /Comercial Demo/i }).first().click();

    await page.getByRole("button", { name: /\+ adicionar hora/i }).click();
    await page.getByPlaceholder("Descricao").fill("Atendimento tecnico por hora");
    await page.getByPlaceholder("Horas").fill("4");
    await page.getByPlaceholder("Valor hora").fill("250");

    await page.getByLabel(/Troca de bateria/i).check();
    await page.getByLabel(/TOF/i).check();
    await page.getByRole("button", { name: /adicionar ao escopo/i }).click();
    await expect
      .poll(async () => page.locator("textarea").first().inputValue())
      .toContain("Substituicao da bateria");
    await expect(page.getByText(/custo interno nao e exibido/i)).toBeVisible();

    await page.getByRole("button", { name: /salvar proposta/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/proposals\/[a-f0-9-]+/, {
      timeout: 30_000,
    });
  });
});
