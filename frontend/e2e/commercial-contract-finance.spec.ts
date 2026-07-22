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

type ApiUser = {
  id: string;
};

type GeneratorDetail = {
  id: string;
  clientId?: string;
  currentSite?: { id: string } | null;
  client?: { id: string; companyName: string } | null;
};

type CatalogItem = {
  id: string;
  name?: string;
};

type Opportunity = {
  id: string;
  title: string;
  stage: string;
};

type Proposal = {
  id: string;
  code: string;
  status: string;
  salesOpportunity?: { id: string; stage: string } | null;
  generatedContract?: { id: string; code: string } | null;
};

type Contract = {
  id: string;
  code: string;
  clientId?: string;
  invoices?: Array<{ id: string; competenceDate: string }>;
  schedules?: Array<{ id: string; generatedOrderId?: string | null }>;
};

type Receivable = {
  id: string;
  description: string;
  clientId: string;
  contractId?: string | null;
  netAmount: number;
  contract?: { id: string; code?: string | null } | null;
};

type MaintenanceOrder = {
  id: string;
  title: string;
  contract?: { id: string; code?: string } | null;
};

test.describe.serial("fluxo comercial -> contrato -> financeiro -> preventiva", () => {
  test("cliente aprova proposta no portal e contrato gera AR/preventiva/OS sem duplicidade", async ({
    page,
  }) => {
    const [data, adminSession, clientASession, clientBSession] = await Promise.all([
      getE2eEntityData(),
      apiLogin(accounts.admin),
      apiLogin(accounts.clientA),
      apiLogin(accounts.clientB),
    ]);
    const adminToken = adminSession.access_token;
    const adminUserId = requireUserId(adminSession.user);
    const generator = await apiRequest<GeneratorDetail>(
      adminToken,
      `/generators/${data.clientAEquipmentId}`,
    );
    const clientId = generator.client?.id ?? generator.clientId;
    expect(clientId).toBeTruthy();
    const catalogItem = await firstCatalogItem(adminToken);

    const proposal = await createProposalReadyForCustomerReview({
      token: adminToken,
      userId: adminUserId,
      clientId: clientId!,
      generatorId: generator.id,
      siteId: generator.currentSite?.id,
      catalogItemId: catalogItem.id,
      label: "aprovar",
      amount: 1777,
    });

    const forbiddenProposal = await apiRequestRaw(
      clientBSession.access_token,
      `/customer-portal/proposals/${proposal.id}`,
    );
    expect(forbiddenProposal.status).toBe(404);
    const forbiddenProposalPdf = await apiRequestRaw(
      clientBSession.access_token,
      `/customer-portal/proposals/${proposal.id}/download-pdf`,
    );
    expect([403, 404]).toContain(forbiddenProposalPdf.status);
    const forbiddenProposalDocument = await apiRequestRaw(
      clientBSession.access_token,
      `/customer-portal/proposals/${proposal.id}/download-docx`,
    );
    expect([403, 404]).toContain(forbiddenProposalDocument.status);

    const customerPdf = await apiRequestRaw(
      clientASession.access_token,
      `/customer-portal/proposals/${proposal.id}/download-pdf`,
    );
    if (!customerPdf.ok) {
      throw new Error(
        `Download PDF do cliente falhou: ${customerPdf.status} ${await customerPdf.text()}`,
      );
    }
    expect(customerPdf.headers.get("content-type") || "").toContain(
      "application/pdf",
    );
    const customerPdfContent = Buffer.from(
      await customerPdf.arrayBuffer(),
    ).toString("latin1");
    expect(customerPdfContent.startsWith("%PDF-1.4")).toBe(true);
    expect(customerPdfContent).toContain(`Proposta Comercial ${proposal.code}`);
    expect(customerPdfContent).not.toContain("sidebar");
    expect(customerPdfContent).not.toContain("button");

    const customerDocument = await apiRequestRaw(
      clientASession.access_token,
      `/customer-portal/proposals/${proposal.id}/download-docx`,
    );
    expect(customerDocument.ok).toBeTruthy();
    expect(customerDocument.headers.get("content-type") || "").toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    const customerDocumentContent = Buffer.from(
      await customerDocument.arrayBuffer(),
    ).toString("utf8");
    expect(customerDocumentContent.startsWith("PK\u0003\u0004")).toBe(true);
    expect(customerDocumentContent).toContain(`Proposta Comercial ${proposal.code}`);
    expect(customerDocumentContent).toContain("proposal/manitec-default-v1");
    expect(customerDocumentContent).not.toContain("sidebar");
    expect(customerDocumentContent).not.toContain("button");

    await loginByApi(page, accounts.clientA);
    await page.goto(`/portal/propostas/${proposal.id}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, new RegExp(`Proposta ${proposal.code}`));
    await page.getByRole("button", { name: /Aprovar proposta/i }).click();
    await page
      .locator("textarea")
      .fill("Aprovado pelo E2E do Ciclo 11.");
    const approveResponsePromise = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/customer-portal/proposals/${proposal.id}/approve`) &&
        response.request().method() === "POST",
      { timeout: 45_000 },
    );
    await page.getByRole("button", { name: /^Confirmar$/i }).click();
    const approveResponse = await approveResponsePromise;
    expect(approveResponse.ok()).toBeTruthy();
    await expect(page.locator("body")).toContainText(/Proposta aprovada/i);

    const approved = await apiRequest<Proposal>(
      adminToken,
      `/proposals/${proposal.id}`,
    );
    expect(approved.status).toBe("WON");

    const contractResult = await apiRequest<{
      contract: { id: string; code: string };
    }>(adminToken, `/proposals/${proposal.id}/convert-contract`, {
      method: "POST",
      body: {},
    });
    expect(contractResult.contract.id).toBeTruthy();

    const receivablesAfterFirstConvert = await contractReceivables(
      adminToken,
      contractResult.contract.id,
    );
    expect(receivablesAfterFirstConvert.length).toBeGreaterThan(0);
    expect(receivablesAfterFirstConvert[0]).toEqual(
      expect.objectContaining({
        clientId,
        contractId: contractResult.contract.id,
      }),
    );
    expect(
      receivablesAfterFirstConvert.some((item) =>
        item.description.includes(contractResult.contract.code),
      ),
    ).toBeTruthy();

    const duplicateContractResult = await apiRequest<{
      contract: { id: string; code: string };
    }>(adminToken, `/proposals/${proposal.id}/convert-contract`, {
      method: "POST",
      body: {},
    });
    expect(duplicateContractResult.contract.id).toBe(contractResult.contract.id);
    const receivablesAfterDuplicateConvert = await contractReceivables(
      adminToken,
      contractResult.contract.id,
    );
    expect(receivablesAfterDuplicateConvert).toHaveLength(
      receivablesAfterFirstConvert.length,
    );

    const contract = await apiRequest<Contract>(
      adminToken,
      `/contracts/${contractResult.contract.id}`,
    );
    expect(contract.invoices?.length ?? 0).toBeGreaterThan(0);
    expect(contract.schedules?.length ?? 0).toBeGreaterThan(0);

    const generated = await apiRequest<{ createdCount: number }>(
      adminToken,
      `/contracts/${contract.id}/generate-orders?daysAhead=400`,
      { method: "POST", body: {} },
    );
    expect(generated.createdCount).toBeGreaterThan(0);

    const duplicatedOrders = await apiRequest<{ createdCount: number }>(
      adminToken,
      `/contracts/${contract.id}/generate-orders?daysAhead=400`,
      { method: "POST", body: {} },
    );
    expect(duplicatedOrders.createdCount).toBe(0);

    const orders = await apiRequest<MaintenanceOrder[]>(
      adminToken,
      "/maintenance-orders",
    );
    expect(
      orders.some((order) => order.contract?.id === contract.id),
    ).toBeTruthy();
  });

  test("cliente rejeita proposta propria e proposta nao aprovada nao converte", async () => {
    const [data, adminSession, clientSession] = await Promise.all([
      getE2eEntityData(),
      apiLogin(accounts.admin),
      apiLogin(accounts.clientA),
    ]);
    const adminToken = adminSession.access_token;
    const adminUserId = requireUserId(adminSession.user);
    const generator = await apiRequest<GeneratorDetail>(
      adminToken,
      `/generators/${data.clientAEquipmentId}`,
    );
    const clientId = generator.client?.id ?? generator.clientId;
    expect(clientId).toBeTruthy();
    const catalogItem = await firstCatalogItem(adminToken);

    const rejectedProposal = await createProposalReadyForCustomerReview({
      token: adminToken,
      userId: adminUserId,
      clientId: clientId!,
      generatorId: generator.id,
      siteId: generator.currentSite?.id,
      catalogItemId: catalogItem.id,
      label: "reprovar",
      amount: 1888,
    });

    const rejectResponse = await apiRequestRaw(
      clientSession.access_token,
      `/customer-portal/proposals/${rejectedProposal.id}/reject`,
      {
        method: "POST",
        body: { note: "Reprovado pelo E2E do Ciclo 11." },
      },
    );
    expect(rejectResponse.ok).toBeTruthy();
    const rejected = await apiRequest<Proposal>(
      adminToken,
      `/proposals/${rejectedProposal.id}`,
    );
    expect(rejected.status).toBe("LOST");

    const draftProposal = await createDraftProposal({
      token: adminToken,
      userId: adminUserId,
      clientId: clientId!,
      generatorId: generator.id,
      siteId: generator.currentSite?.id,
      catalogItemId: catalogItem.id,
      label: "nao-converter",
      amount: 1999,
    });
    const invalidConvert = await apiRequestRaw(
      adminToken,
      `/proposals/${draftProposal.id}/convert-contract`,
      { method: "POST", body: {} },
    );
    expect(invalidConvert.status).toBe(400);
  });
});

function requireUserId(user: unknown) {
  const id = (user as ApiUser | undefined)?.id;
  if (!id) throw new Error("Usuario autenticado sem id no payload E2E.");
  return id;
}

async function firstCatalogItem(token: string) {
  const catalog = await apiRequest<CatalogItem[]>(token, "/catalogs");
  const item = catalog.find((entry) => entry.id);
  if (!item) throw new Error("Catalogo E2E sem item disponivel.");
  return item;
}

async function createProposalReadyForCustomerReview(input: {
  token: string;
  userId: string;
  clientId: string;
  generatorId: string;
  siteId?: string;
  catalogItemId: string;
  label: string;
  amount: number;
}) {
  const proposal = await createDraftProposal(input);
  await apiRequest<Proposal>(input.token, `/proposals/${proposal.id}/submit-board`, {
    method: "POST",
    body: {},
  });
  const clientReview = await apiRequest<Proposal>(
    input.token,
    `/proposals/${proposal.id}/board-approve`,
    {
      method: "POST",
      body: {},
    },
  );
  expect(clientReview.status).toBe("CLIENT_REVIEW");
  return clientReview;
}

async function createDraftProposal(input: {
  token: string;
  userId: string;
  clientId: string;
  generatorId: string;
  siteId?: string;
  catalogItemId: string;
  label: string;
  amount: number;
}) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const firstDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const opportunity = await apiRequest<Opportunity>(input.token, "/crm/opportunities", {
    method: "POST",
    body: {
      title: `Ciclo 11 ${input.label} ${suffix}`,
      clientId: input.clientId,
      siteId: input.siteId,
      assignedSellerId: input.userId,
      estimatedValue: input.amount,
      expectedCloseDate: validUntil.toISOString(),
      source: "E2E_CICLO_11",
      notes: "Oportunidade criada pelo E2E do Ciclo 11.",
    },
  });
  expect(opportunity.id).toBeTruthy();

  const proposal = await apiRequest<Proposal>(input.token, "/proposals", {
    method: "POST",
    body: {
      clientId: input.clientId,
      salesOpportunityId: opportunity.id,
      generatorId: input.generatorId,
      userId: input.userId,
      type: "CONTRACT",
      scope: "Contrato preventivo criado pelo E2E do Ciclo 11.",
      freight: "Incluso",
      validUntil: validUntil.toISOString(),
      paymentTerm: "Mensal",
      paymentDetails: "Primeiro vencimento definido pelo E2E.",
      installmentCount: 12,
      installmentIntervalDays: 30,
      firstDueDate: firstDueDate.toISOString(),
      externalNotes: "Proposta visivel no portal do cliente.",
      items: [
        {
          catalogItemId: input.catalogItemId,
          quantity: 1,
          unitPrice: input.amount,
        },
      ],
    },
  });
  expect(proposal.status).toBe("DRAFT");
  expect(proposal.salesOpportunity?.id).toBe(opportunity.id);
  return proposal;
}

async function contractReceivables(token: string, contractId: string) {
  const receivables = await apiRequest<Receivable[]>(
    token,
    "/finance/receivables",
  );
  return receivables.filter(
    (item) => item.contractId === contractId || item.contract?.id === contractId,
  );
}
