import { expect, test } from "@playwright/test";
import { apiLogin, apiRequest, getE2eEntityData, loginByApi } from "./helpers/auth";
import { expectLoaded } from "./helpers/selectors";
import { accounts } from "./helpers/test-data";

type GeneratorDetail = {
  id: string;
  clientId?: string | null;
  client?: { id: string; companyName?: string | null } | null;
};

type Contract = {
  id: string;
  code?: string | null;
  clientId?: string | null;
  client?: { id: string } | null;
};

type Proposal = {
  id: string;
  code?: string | null;
  clientId?: string | null;
  client?: { id: string } | null;
  generatedContract?: { id: string } | null;
};

type Ticket = {
  id: string;
  maintenanceOrder?: { id: string } | null;
};

test.describe("ciclo 20e links inteligentes", () => {
  test("admin encontra links cruzados entre entidades operacionais", async ({
    page,
  }) => {
    const [data, adminSession, clientSession] = await Promise.all([
      getE2eEntityData(),
      apiLogin(accounts.admin),
      apiLogin(accounts.clientA),
    ]);
    const token = adminSession.access_token;
    const generator = await apiRequest<GeneratorDetail>(
      token,
      `/generators/${data.clientAEquipmentId}`,
    );
    const clientId = generator.client?.id ?? generator.clientId;
    expect(clientId).toBeTruthy();

    const [contracts, proposals] = await Promise.all([
      apiRequest<Contract[]>(token, "/contracts"),
      apiRequest<Proposal[]>(token, "/proposals"),
    ]);
    const contract = contracts.find(
      (item) => item.id && (item.clientId || item.client?.id) === clientId,
    );
    const proposal =
      proposals.find((item) => item.generatedContract?.id) ||
      proposals.find((item) => item.id && (item.clientId || item.client?.id));
    const proposalClientId = proposal?.clientId ?? proposal?.client?.id;
    const ticket = await createConvertedTicket({
      customerToken: clientSession.access_token,
      internalToken: token,
      generatorId: data.clientAEquipmentId,
    });
    expect(ticket.maintenanceOrder?.id).toBeTruthy();
    const convertedOrderId = ticket.maintenanceOrder!.id;

    await loginByApi(page, accounts.admin);

    await page.goto(`/dashboard/clients/${clientId}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Mapa de relacionamentos/i);
    await expect(
      page.locator(`a[href="/dashboard/equipments/${data.clientAEquipmentId}"]`).first(),
    ).toBeVisible();
    await expect(
      page.locator(`a[href="/dashboard/orders/${convertedOrderId}"]`).first(),
    ).toBeVisible();
    await expect(
      page.locator(`a[href="/dashboard/atendimento/${ticket.id}"]`).first(),
    ).toBeVisible();
    await expect(
      page
        .locator(`a[href="/dashboard/relatorios-tecnicos/${data.serviceReportAId}"]`)
        .first(),
    ).toBeVisible();

    await page.goto(`/dashboard/equipments/${data.clientAEquipmentId}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Prontuario tecnico|Prontuário técnico/i);
    await expect(page.locator('nav[aria-label="Caminho operacional"]')).toBeVisible();
    await expect(page.locator(`a[href="/dashboard/clients/${clientId}"]`).first()).toBeVisible();
    await expect(
      page.locator(`a[href="/dashboard/orders/${convertedOrderId}"]`).first(),
    ).toBeVisible();

    await page.goto(`/dashboard/orders/${convertedOrderId}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Ordem de servico/i);
    await expect(page.locator(`a[href="/dashboard/clients/${clientId}"]`).first()).toBeVisible();
    await expect(
      page.locator(`a[href="/dashboard/equipments/${data.clientAEquipmentId}"]`).first(),
    ).toBeVisible();
    await expect(
      page.locator(`a[href="/dashboard/atendimento/${ticket.id}"]`).first(),
    ).toBeVisible();

    await page.goto(`/dashboard/atendimento/${ticket.id}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Chamado|Atendimento/i);
    await expect(page.locator('nav[aria-label="Caminho operacional"]')).toBeVisible();
    await expect(page.locator(`a[href="/dashboard/clients/${clientId}"]`).first()).toBeVisible();
    await expect(
      page.locator(`a[href="/dashboard/equipments/${data.clientAEquipmentId}"]`).first(),
    ).toBeVisible();

    if (proposal?.id && proposalClientId) {
      await page.goto(`/dashboard/proposals/${proposal.id}`, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      await expectLoaded(page, /Relacionamentos da proposta/i);
      await expect(
        page.locator(`a[href="/dashboard/clients/${proposalClientId}"]`).first(),
      ).toBeVisible();
      if (proposal.generatedContract?.id) {
        await expect(
          page.locator(`a[href="/dashboard/contracts/${proposal.generatedContract.id}"]`).first(),
        ).toBeVisible();
      }
    }

    if (contract?.id) {
      await page.goto(`/dashboard/contracts/${contract.id}`, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      await expectLoaded(page, /Relacionamentos do contrato/i);
      await expect(page.locator(`a[href="/dashboard/clients/${clientId}"]`).first()).toBeVisible();
      await expect(
        page.locator(`a[href="/dashboard/equipments/${data.clientAEquipmentId}"]`).first(),
      ).toBeVisible();
    }

    await page.goto(`/dashboard/relatorios-tecnicos/${data.serviceReportAId}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Relacionamentos do laudo/i);
    await expect(
      page.locator(`a[href="/dashboard/orders/${data.technicianOrderId}"]`).first(),
    ).toBeVisible();
    await expect(
      page.locator(`a[href="/dashboard/equipments/${data.clientAEquipmentId}"]`).first(),
    ).toBeVisible();
  });

  test("tecnico mantem navegacao de campo sem links financeiros internos", async ({
    page,
  }) => {
    const data = await getE2eEntityData();

    await loginByApi(page, accounts.technician);
    await page.goto(`/dashboard/tecnico/ordens/${data.technicianOrderId}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    await expectLoaded(page, /Area tecnica|Área técnica|Voltar para campo/i);
    await expect(page.locator('nav[aria-label="Caminho operacional"]')).toBeVisible();
    await expect(page.locator('a[href^="/dashboard/finance"]')).toHaveCount(0);
    await expect(page.locator('a[href^="/dashboard/contracts"]')).toHaveCount(0);
  });

  test("cliente do portal nao permanece em rota interna por URL direta", async ({
    page,
  }) => {
    const [data, adminSession] = await Promise.all([
      getE2eEntityData(),
      apiLogin(accounts.admin),
    ]);
    const generator = await apiRequest<GeneratorDetail>(
      adminSession.access_token,
      `/generators/${data.clientAEquipmentId}`,
    );
    const clientId = generator.client?.id ?? generator.clientId;
    expect(clientId).toBeTruthy();

    await loginByApi(page, accounts.clientA);
    await page.goto(`/dashboard/clients/${clientId}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    await expect(page).toHaveURL(/\/portal/, { timeout: 45_000 });
  });
});

async function createConvertedTicket(input: {
  customerToken: string;
  internalToken: string;
  generatorId: string;
}) {
  const title = `Chamado 20E navegacao ${Date.now()}`;
  const created = await apiRequest<Ticket>(
    input.customerToken,
    "/customer-portal/tickets",
    {
      method: "POST",
      body: {
        generatorId: input.generatorId,
        title,
        description:
          "Chamado criado pelo E2E do Ciclo 20E para validar navegacao cruzada.",
        category: "CORRECTIVE_MAINTENANCE",
        priority: "MEDIUM",
      },
      timeoutMs: 45_000,
    },
  );

  return apiRequest<Ticket>(
    input.internalToken,
    `/tickets/${created.id}/convert-to-order`,
    {
      method: "POST",
      body: {},
      timeoutMs: 45_000,
    },
  );
}
