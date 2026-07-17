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

type Contract = {
  id: string;
  code: string;
  clientId?: string | null;
  costCenterId?: string | null;
  client?: { id: string } | null;
};

type BankAccount = {
  id: string;
  isActive?: boolean | null;
};

type Receivable = {
  id: string;
  status: string;
};

test.describe.serial("piloto operacional hardening", () => {
  test("smoke ponta a ponta valida health, papeis, financeiro e bloqueios criticos", async ({
    browser,
  }) => {
    const [
      data,
      financeSession,
      salesSession,
      technicianSession,
      clientSession,
      auditorSession,
    ] = await Promise.all([
      getE2eEntityData(),
      apiLogin(accounts.finance),
      apiLogin(accounts.sales),
      apiLogin(accounts.technician),
      apiLogin(accounts.clientA),
      apiLogin(accounts.auditor),
    ]);

    const [health, dbHealth, storageHealth] = await Promise.all([
      apiRequest<{ status: string }>(undefined, "/health"),
      apiRequest<{ status: string }>(undefined, "/health/db"),
      apiRequest<{ status: string; driver: string }>(
        undefined,
        "/health/storage",
      ),
    ]);
    expect(health.status).toBe("ok");
    expect(dbHealth.status).toBe("ok");
    expect(storageHealth.status).toBe("ok");
    expect(storageHealth.driver).toBeTruthy();

    const contracts = await apiRequest<Contract[]>(
      salesSession.access_token,
      "/contracts",
    );
    const contract = contracts.find(
      (item) => item.id && (item.clientId || item.client?.id),
    );
    expect(contract?.id).toBeTruthy();

    const proposals = await apiRequest<unknown[]>(
      salesSession.access_token,
      "/proposals",
    );
    expect(proposals.length).toBeGreaterThan(0);

    const bankAccounts = await apiRequest<BankAccount[]>(
      financeSession.access_token,
      "/finance/bank-accounts",
    );
    const bankAccount = bankAccounts.find((item) => item.isActive !== false);
    expect(bankAccount?.id).toBeTruthy();

    const now = new Date();
    const receivable = await apiRequest<Receivable>(
      financeSession.access_token,
      "/finance/receivables",
      {
        method: "POST",
        body: {
          clientId: contract!.clientId ?? contract!.client?.id,
          contractId: contract!.id,
          costCenterId: contract!.costCenterId,
          description: `Piloto operacional smoke ${Date.now()}`,
          competenceDate: now.toISOString(),
          dueDate: now.toISOString(),
          grossAmount: 91.17,
          discountAmount: 0,
        },
      },
    );
    await apiRequest(financeSession.access_token, `/finance/receivables/${receivable.id}/pay`, {
      method: "PATCH",
      body: {
        amount: 91.17,
        method: "TRANSFER",
        bankAccountId: bankAccount!.id,
        paidAt: now.toISOString(),
      },
    });

    const reconciliationReport = await apiRequest<{
      totals: { movements: number };
    }>(
      financeSession.access_token,
      `/finance/reconciliation/report?bankAccountId=${bankAccount!.id}&from=${now.toISOString().slice(0, 10)}T00:00:00.000Z&to=${now.toISOString().slice(0, 10)}T23:59:59.999Z`,
    );
    expect(reconciliationReport.totals.movements).toBeGreaterThan(0);

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginByApi(adminPage, accounts.admin);
    await adminPage.goto("/dashboard", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(adminPage, /Dashboard|Painel/i);
    await adminContext.close();

    const clientContext = await browser.newContext();
    const clientPage = await clientContext.newPage();
    await loginByApi(clientPage, accounts.clientA);
    await clientPage.goto(`/portal/laudos/${data.serviceReportAId}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(clientPage, /Laudo|Relat.rio|Técnico/i);
    await clientPage.goto("/dashboard", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expect(clientPage).toHaveURL(/\/portal/);
    await clientContext.close();

    const technicianContext = await browser.newContext();
    const technicianPage = await technicianContext.newPage();
    await loginByApi(technicianPage, accounts.technician);
    await technicianPage.goto(`/dashboard/tecnico/ordens/${data.technicianOrderId}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(technicianPage, /OS|Ordem|Check/i);
    await technicianContext.close();

    const [clientFinance, technicianFinance, salesReconciliation, auditorImport] =
      await Promise.all([
        apiRequestRaw(
          clientSession.access_token,
          `/finance/reconciliation/report?bankAccountId=${bankAccount!.id}`,
        ),
        apiRequestRaw(
          technicianSession.access_token,
          `/finance/reconciliation/report?bankAccountId=${bankAccount!.id}`,
        ),
        apiRequestRaw(
          salesSession.access_token,
          `/finance/reconciliation/report?bankAccountId=${bankAccount!.id}`,
        ),
        apiRequestRaw(
          auditorSession.access_token,
          `/finance/bank-accounts/${bankAccount!.id}/statements/import`,
          {
            method: "POST",
            body: {
              fileName: "auditor-smoke.csv",
              fileType: "CSV",
              content: "data;descricao;valor\n10/07/2026;Teste;10,00",
            },
          },
        ),
      ]);

    expect(clientFinance.status).toBe(403);
    expect(technicianFinance.status).toBe(403);
    expect(salesReconciliation.status).toBe(403);
    expect(auditorImport.status).toBe(403);
  });
});
