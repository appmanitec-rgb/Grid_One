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

test.describe("ciclo 20c ux operacional", () => {
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
    await expect(page.locator("body")).toContainText(/Custo HH/i);

    await page.goto("/dashboard/equipments", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Equipamentos/i);
    await expect(page.locator("body")).toContainText(/Cadastro mestre tecnico/i);
    await expect(page.getByRole("link", { name: /Abrir ficha/i }).first()).toBeVisible();

    await page.goto(`/dashboard/equipments/${data.clientAEquipmentId}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Prontuario tecnico|Prontuário técnico/i);
    await expect(page.locator("body")).toContainText(/Dados do gerador/i);
    await expect(page.locator("body")).toContainText(/Motor/i);
    await expect(page.locator("body")).toContainText(/Alternador/i);
    await expect(page.locator("body")).toContainText(/QTA/i);
    await expect(
      page.getByRole("link", { name: "Cliente", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Historico e links|Histórico e links/i }).click();
    await expect(page.locator("body")).toContainText(/Ordens de servico recentes|Ordens de serviço recentes/i);
    await expect(page.locator("body")).toContainText(/Laudos tecnicos|Laudos técnicos/i);
    await page.getByRole("button", { name: /Editar ficha/i }).click();
    await page.getByTestId("equipment-field-voltage").fill("380/220 V");
    await page.getByTestId("equipment-field-engineModelName").fill("QSB6.7 E2E");
    await page.getByTestId("equipment-field-hasTransferSwitch").selectOption("true");
    await page.getByTestId("equipment-field-batteryQuantity").fill("2");
    await page.getByRole("button", { name: /Salvar ficha tecnica/i }).click();
    await expect(page.locator("body")).toContainText(/Ficha tecnica atualizada/i);
    await expect(page.locator("body")).toContainText(/380\/220 V/i);
    await expect(page.locator("body")).toContainText(/QSB6.7 E2E/i);

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

  test("dados sensiveis de agentes respeitam permissao granular", async ({
    page,
  }) => {
    const [data, auditorSession, clientSession] = await Promise.all([
      getE2eEntityData(),
      apiLogin(accounts.auditor),
      apiLogin(accounts.clientA),
    ]);

    const auditorAgents = await apiRequest<{
      internalUsers: Array<Record<string, unknown>>;
      access?: { canViewSensitivePeople?: boolean };
    }>(auditorSession.access_token, "/hr-admin/agents");
    expect(auditorAgents.access?.canViewSensitivePeople).toBe(false);
    expect(
      auditorAgents.internalUsers.some((row) =>
        Object.prototype.hasOwnProperty.call(row, "hourCost"),
      ),
    ).toBe(false);

    const [auditorOrders, auditorTechnicians] = await Promise.all([
      apiRequest<Array<{ technician?: { user?: Record<string, unknown> } | null }>>(
        auditorSession.access_token,
        "/maintenance-orders",
      ),
      apiRequest<Array<{ user?: Record<string, unknown> }>>(
        auditorSession.access_token,
        "/technicians",
      ),
    ]);
    expect(
      auditorOrders.some((row) =>
        Object.prototype.hasOwnProperty.call(row.technician?.user || {}, "hourCost"),
      ),
    ).toBe(false);
    expect(
      auditorTechnicians.some((row) =>
        Object.prototype.hasOwnProperty.call(row.user || {}, "hourCost"),
      ),
    ).toBe(false);

    const clientAgentsResponse = await apiRequestRaw(
      clientSession.access_token,
      "/hr-admin/agents",
    );
    expect(clientAgentsResponse.status).toBe(403);

    const clientInternalEquipment = await apiRequestRaw(
      clientSession.access_token,
      `/generators/${data.clientAEquipmentId}`,
    );
    expect(clientInternalEquipment.status).toBe(403);

    const auditorEquipmentPatch = await apiRequestRaw(
      auditorSession.access_token,
      `/generators/${data.clientAEquipmentId}`,
      {
        method: "PATCH",
        body: { voltage: "999 V" },
      },
    );
    expect(auditorEquipmentPatch.status).toBe(403);

    await loginByApi(page, accounts.auditor);
    await page.goto("/dashboard/hr/collaborators", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Agentes/i);
    await expect(page.locator("body")).not.toContainText(/Custo HH|hourCost/i);
    await expect(page.locator("body")).toContainText(/dados administrativos sens/i);

    await page.goto(`/dashboard/equipments/${data.clientAEquipmentId}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Prontuario tecnico|Prontuário técnico/i);
    await expect(page.getByRole("button", { name: /Editar ficha/i })).toHaveCount(0);
  });
});
