import { expect, test } from "@playwright/test";
import { apiLogin, apiRequest, loginByApi } from "./helpers/auth";
import { accounts } from "./helpers/test-data";

type Company = { id: string; cnpj: string | null };
type PaymentProfile = {
  id: string;
  name: string;
  issuerCompanyId: string | null;
  beneficiaryDocument: string | null;
  pixKey: string | null;
  pixCopyPaste: string | null;
  isActive: boolean;
};

test("empresa com CNPJ permite cadastrar PIX ativo sem codigo de QR", async ({ page }) => {
  const admin = await apiLogin(accounts.admin);
  const cnpj = "39315244000107";
  const companyName = "MANITEC ENERGIA EQUIPAMENTOS LTDA";
  const companies = await apiRequest<Company[]>(admin.access_token, "/company-settings/companies");
  let company = companies.find((item) => item.cnpj === cnpj);
  if (!company) {
    company = await apiRequest<Company>(admin.access_token, "/company-settings/companies", {
      method: "POST",
      body: { companyName, tradeName: "MANITEC GRUPOS GERADORES", cnpj },
    });
  }

  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/developer/data/proposalPaymentProfiles");
  await expect(page.getByRole("heading", { name: "Contas para Propostas" })).toBeVisible();
  await page.getByRole("button", { name: "Novo registro" }).click();
  const drawer = page.locator("aside.fixed");
  await expect(drawer).toBeVisible();
  await drawer.getByLabel("Empresa emitente (CNPJ)").selectOption(company.id);
  const name = `E2E PIX Servicos ${Date.now()}`;
  await drawer.getByLabel("Nome do perfil").fill(name);
  await drawer.getByLabel("Destino").selectOption("SERVICES");
  await drawer.getByLabel("Meio").selectOption("PIX");
  await drawer.getByLabel("Ativo").selectOption("true");
  await expect(drawer.getByText(/chave PIX/i)).toBeVisible();
  await drawer.getByRole("button", { name: "Criar registro" }).click();
  await expect(page.getByText("Registro criado com sucesso.")).toBeVisible();

  const profiles = await apiRequest<PaymentProfile[]>(
    admin.access_token,
    "/studio/data/proposalPaymentProfiles",
  );
  const created = profiles.find((item) => item.name === name);
  expect(created).toMatchObject({
    issuerCompanyId: company.id,
    beneficiaryDocument: cnpj,
    pixKey: cnpj,
    pixCopyPaste: null,
    isActive: true,
  });
});
