import { expect, test } from "@playwright/test";
import { apiLogin, apiRequest, loginByApi } from "./helpers/auth";
import { accounts } from "./helpers/test-data";

function validCnpj() {
  const base = `72${Date.now().toString().slice(-10)}`;
  const digit = (value: string, factors: number[]) => {
    const remainder = value.split("").reduce((sum, char, index) => sum + Number(char) * factors[index], 0) % 11;
    return String(remainder < 2 ? 0 : 11 - remainder);
  };
  const first = digit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base}${first}${digit(base + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])}`;
}

test.describe("propostas operacionais", () => {
  test("cria proposta com cliente rapido, maquina rapida, servico e conta PIX", async ({
    page,
  }) => {
    const admin = await apiLogin(accounts.admin);
    const companies = await apiRequest<Array<{ id: string; cnpj: string | null }>>(admin.access_token, "/company-settings/companies");
    let company = companies.find((item) => item.cnpj === "39315244000107");
    if (!company) {
      company = await apiRequest<{ id: string; cnpj: string }>(admin.access_token, "/company-settings/companies", {
        method: "POST",
        body: { companyName: "MANITEC ENERGIA EQUIPAMENTOS LTDA", cnpj: "39315244000107" },
      });
    }
    const profile = await apiRequest<{ id: string }>(admin.access_token, "/studio/data/proposalPaymentProfiles", {
      method: "POST",
      body: {
        issuerCompanyId: company.id,
        name: `E2E PIX Proposta ${Date.now()}`,
        purpose: "SERVICES",
        method: "PIX",
        isActive: true,
      },
    });
    const sales = await loginByApi(page, accounts.sales);
    await page.goto("/dashboard/proposals/new");

    const suffix = `${Date.now()}`.slice(-8);

    await page.getByRole("button", { name: /cliente rapido/i }).click();
    await page.getByPlaceholder("Razao social/nome").fill(`Cliente 20GB ${suffix}`);
    await page.getByPlaceholder("Nome fantasia").fill(`20GB ${suffix}`);
    await page.getByPlaceholder("CPF/CNPJ").fill(validCnpj());
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

    await page.getByRole("button", { name: /\+ adicionar servico/i }).click();
    await page.getByPlaceholder("Nome ou codigo").fill("Servico Preventivo Mensal Demo");
    await page.locator("li", { hasText: "Servico Preventivo Mensal Demo" }).click();
    await page.getByText(/Pagamento de servi.os/i).first().locator("..").locator("select").selectOption(profile.id);

    await page.getByRole("button", { name: /salvar proposta/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/proposals\/[a-f0-9-]+/, {
      timeout: 30_000,
    });
    const proposalId = page.url().split("/").pop()!;
    const saved = await apiRequest<{
      client: { companyName: string; cnpj: string };
      generator: { serialNumber: string };
      paymentSelections: Array<{ id: string; pixKey: string }>;
      items: Array<{ catalogItemId: string }>;
    }>(sales.access_token, `/proposals/${proposalId}`);
    expect(saved.client.companyName).toBe(`Cliente 20GB ${suffix}`);
    expect(saved.client.cnpj.replace(/\D/g, "")).toHaveLength(14);
    expect(saved.generator.serialNumber).toBe(`SN-20GB-${suffix}`);
    expect(saved.items.length).toBeGreaterThan(0);
    expect(saved.paymentSelections).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: profile.id, pixKey: "39315244000107" }),
    ]));

    const beforeEdit = await apiRequest<{ totalValue: number; items: Array<{ quantity: number }> }>(sales.access_token, `/proposals/${proposalId}`);
    await page.getByRole("link", { name: "Editar rascunho" }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/proposals/new\\?editId=${proposalId}`));
    await expect(page.getByRole("heading", { name: /Editar rascunho/ })).toBeVisible();
    await expect(page.getByPlaceholder("Nome ou codigo")).toHaveValue(/Servico Preventivo Mensal Demo/);
    await page.getByText("Qtd", { exact: true }).first().locator("..").getByRole("spinbutton").fill("2");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/proposals/${proposalId}$`), { timeout: 30_000 });
    const afterEdit = await apiRequest<{ totalValue: number; items: Array<{ quantity: number }> }>(sales.access_token, `/proposals/${proposalId}`);
    expect(afterEdit.items).toHaveLength(1);
    expect(afterEdit.items[0].quantity).toBe(2);
    expect(afterEdit.totalValue).toBeCloseTo(beforeEdit.totalValue * 2, 2);
    await expect(page.getByRole("link", { name: "Arquivos e envio" })).toHaveCount(0);
    await apiRequest(sales.access_token, "/proposals/" + proposalId + "/submit-board", { method: "POST" });
    await apiRequest(admin.access_token, "/proposals/" + proposalId + "/board-approve", { method: "POST" });
    await page.reload();
    await expect(page.getByRole("link", { name: "Arquivos e envio" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Abrir PDF da proposta" })).toHaveCount(0);
    await page.getByRole("link", { name: "Arquivos e envio" }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/documents/proposals/${proposalId}$`), { timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Visualizar PDF" })).toBeVisible();
    await page.getByRole("button", { name: "Visualizar PDF" }).click();
    const preview = page.getByRole("dialog", { name: /PDF da proposta/ });
    await expect(preview).toBeVisible({ timeout: 60_000 });
    await expect(preview.locator("iframe")).toHaveAttribute("src", /^blob:/);
    const downloadPromise = page.waitForEvent("download");
    await preview.getByRole("button", { name: "Baixar PDF" }).click();
    const download = await downloadPromise;
    const finalProposal = await apiRequest<{ code: string }>(sales.access_token, "/proposals/" + proposalId);
    expect(download.suggestedFilename()).toBe("proposta-" + finalProposal.code.replace("/", "-") + ".pdf");
    await preview.getByRole("button", { name: "Fechar" }).click();
    await expect(preview).not.toBeVisible();
  });
});
