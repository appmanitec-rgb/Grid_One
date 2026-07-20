import { expect, test } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  apiRequestRaw,
  getE2eEntityData,
  loginByApi,
} from "./helpers/auth";
import { expectLoaded } from "./helpers/selectors";
import { accounts } from "./helpers/test-data";

type Proposal = {
  id: string;
  code: string;
};

test.describe("ciclo 19 ux operacional", () => {
  test("perfil, agentes, ficha de equipamento, estoque e PDF de proposta ficam navegaveis", async ({
    page,
  }) => {
    const [data, adminSession] = await Promise.all([
      getE2eEntityData(),
      apiLogin(accounts.admin),
    ]);
    const adminToken = adminSession.access_token;

    await loginByApi(page, accounts.admin);

    await page.goto("/dashboard/profile", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Meu Perfil/i);
    await expect(page.locator("form")).not.toContainText(
      /custo HH|alçada de desconto|permissões|hourCost|approvalDiscountLimit/i,
    );
    await expect(page.locator("form")).toContainText(/Dados permitidos/i);

    await page.goto("/dashboard/hr/collaborators", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Agentes/i);
    await expect(page.getByRole("button", { name: /Colaboradores/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Clientes/i })).toBeVisible();

    await page.goto(`/dashboard/equipments/${data.clientAEquipmentId}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Prontuario tecnico|Prontuário técnico/i);
    await expect(
      page.getByRole("link", { name: "Cliente", exact: true }),
    ).toBeVisible();
    await expect(page.locator("body")).toContainText(/Ordens de servico|Ordens de serviço/i);
    await expect(page.locator("body")).toContainText(/Laudos tecnicos|Laudos técnicos/i);

    await page.goto("/dashboard/inventory", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Fisico x Reservado x Disponivel|Físico x Reservado x Disponível/i);
    await expect(page.getByRole("link", { name: /Abrir ficha/i }).first()).toBeVisible();

    const proposals = await apiRequest<Proposal[]>(adminToken, "/proposals");
    const proposal = proposals.find((item) => item.id);
    expect(proposal?.id).toBeTruthy();

    const pdfResponse = await apiRequestRaw(
      adminToken,
      `/documents/proposals/${proposal!.id}/download-pdf`,
    );
    expect(pdfResponse.ok).toBeTruthy();
    expect(pdfResponse.headers.get("content-type") || "").toContain(
      "application/pdf",
    );
    const pdfContent = Buffer.from(await pdfResponse.arrayBuffer()).toString(
      "latin1",
    );
    expect(pdfContent.startsWith("%PDF-1.4")).toBe(true);
    expect(pdfContent).toContain(`Proposta Comercial ${proposal!.code}`);

    await page.goto(`/dashboard/documents/proposals/${proposal!.id}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, new RegExp(`Proposta ${proposal!.code}`));
    await expect(
      page.getByRole("button", { name: /Baixar PDF profissional/i }),
    ).toBeVisible();
  });
});
