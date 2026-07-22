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

type CatalogItem = {
  id: string;
  name: string;
  type: "PART" | "SERVICE";
};

type CatalogDetail = CatalogItem & {
  maintenanceOrderMaterials?: Array<{
    order: { id: string; title: string };
  }>;
  supplierItems?: Array<{
    supplier: { id: string; companyName: string };
  }>;
};

test.describe("ciclo 20d ux operacional", () => {
  test("perfil, agentes, equipamento, estoque operacional e PDF de proposta ficam navegaveis", async ({
    page,
  }) => {
    test.setTimeout(180_000);

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
    await expect(page.getByRole("link", { name: /^Abrir$/i }).first()).toBeVisible();

    const catalogItems = await apiRequest<CatalogItem[]>(adminToken, "/catalogs");
    let stockItem: CatalogItem | undefined;
    let stockDetail: CatalogDetail | undefined;
    for (const candidate of catalogItems.filter((entry) => entry.type === "PART")) {
      const detail = await apiRequest<CatalogDetail>(
        adminToken,
        `/catalogs/${candidate.id}`,
      );
      if (
        detail.supplierItems?.length &&
        detail.maintenanceOrderMaterials?.length
      ) {
        stockItem = candidate;
        stockDetail = detail;
        break;
      }
    }
    expect(stockItem?.id).toBeTruthy();
    expect(stockDetail?.id).toBeTruthy();
    await page.goto(`/dashboard/catalog/${stockItem!.id}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Ficha operacional do item/i);
    await expect(page.locator("body")).toContainText(/Saldo por almoxarifado/i);
    await expect(page.locator("body")).toContainText(/Fornecedor principal/i);
    await page.getByRole("button", { name: /Rastreabilidade/i }).click();
    await expect(page.locator("body")).toContainText(/Movimentos recentes/i);
    await expect(page.locator("body")).toContainText(/Compras relacionadas/i);
    await expect(page.locator("body")).toContainText(/OS relacionadas/i);

    await page.getByRole("link", { name: /Editar cadastro/i }).click();
    await expectLoaded(page, /Editar Item de Catalogo/i);
    await page.getByRole("button", { name: /^Estoque$/i }).click();
    await expect(page.locator("body")).toContainText(/Alterado apenas por movimento/i);
    await expect(page.getByLabel(/Estoque atual/i)).toHaveCount(0);
    await page.locator('input[name="storageLocation"]').fill("A1-E2E");
    await page.locator('input[name="reorderPoint"]').fill("7");
    await page.getByRole("button", { name: /Salvar alteracoes/i }).click();
    await page.goto(`/dashboard/catalog/${stockItem!.id}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Ficha operacional do item/i);
    await expect(page.locator("body")).toContainText(/A1-E2E/i);

    const supplierId = stockDetail!.supplierItems?.[0]?.supplier.id;
    expect(supplierId).toBeTruthy();
    await page.goto(`/dashboard/suppliers/${supplierId}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Perfil do Fornecedor/i);
    await expect(
      page.locator(`a[href="/dashboard/catalog/${stockItem!.id}"]`).first(),
    ).toBeVisible();

    const relatedOrderId = stockDetail!.maintenanceOrderMaterials?.[0]?.order.id;
    expect(relatedOrderId).toBeTruthy();
    await page.goto(`/dashboard/orders/${relatedOrderId}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Ordem de Servico|Ordem de ServiÃ§o/i);
    await expect(
      page.locator(`a[href="/dashboard/catalog/${stockItem!.id}"]`).first(),
    ).toBeVisible();

    const proposals = await apiRequest<Proposal[]>(adminToken, "/proposals");
    const proposal = proposals.find((item) => item.id);
    expect(proposal?.id).toBeTruthy();

    const documentResponse = await apiRequestRaw(
      adminToken,
      `/documents/proposals/${proposal!.id}/download-docx`,
    );
    expect(documentResponse.ok).toBeTruthy();
    expect(documentResponse.headers.get("content-type") || "").toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    const documentContent = Buffer.from(
      await documentResponse.arrayBuffer(),
    ).toString("utf8");
    expect(documentContent.startsWith("PK\u0003\u0004")).toBe(true);
    expect(documentContent).toContain(`Proposta Comercial ${proposal!.code}`);
    expect(documentContent).toContain("proposal/manitec-default-v1");
    expect(documentContent).not.toContain("sidebar");
    expect(documentContent).not.toContain("button");

    await page.goto(`/dashboard/documents/proposals/${proposal!.id}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, new RegExp(`Proposta ${proposal!.code}`));
    await expect(
      page.getByRole("button", { name: /Baixar documento|Gerar documento/i }),
    ).toBeVisible();
  });

  test("dados sensiveis de agentes respeitam permissao granular", async ({
    page,
  }) => {
    const [data, adminSession, auditorSession, clientSession] = await Promise.all([
      getE2eEntityData(),
      apiLogin(accounts.admin),
      apiLogin(accounts.auditor),
      apiLogin(accounts.clientA),
    ]);
    const catalogItems = await apiRequest<CatalogItem[]>(
      adminSession.access_token,
      "/catalogs",
    );
    const stockItem = catalogItems.find((entry) => entry.type === "PART" && entry.id);
    expect(stockItem?.id).toBeTruthy();

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

    const clientInternalStock = await apiRequestRaw(
      clientSession.access_token,
      `/catalogs/${stockItem!.id}`,
    );
    expect(clientInternalStock.status).toBe(403);

    const auditorCatalogPatch = await apiRequestRaw(
      auditorSession.access_token,
      `/catalogs/${stockItem!.id}`,
      {
        method: "PATCH",
        body: { storageLocation: "AUDITOR-BLOCKED" },
      },
    );
    expect(auditorCatalogPatch.status).toBe(403);

    const directStockMutation = await apiRequestRaw(
      adminSession.access_token,
      `/catalogs/${stockItem!.id}`,
      {
        method: "PATCH",
        body: { stockCurrent: 999 },
      },
    );
    expect(directStockMutation.status).toBe(400);

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

    await page.goto(`/dashboard/catalog/${stockItem!.id}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Ficha operacional do item/i);
    await expect(page.getByRole("link", { name: /Editar cadastro/i })).toHaveCount(0);
  });
});
