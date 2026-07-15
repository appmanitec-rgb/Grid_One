import { expect, test } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  apiRequestRaw,
  loginByApi,
} from "./helpers/auth";
import { expectLoaded } from "./helpers/selectors";
import { accounts } from "./helpers/test-data";

type User = {
  id: string;
  email: string;
};

type Contract = {
  id: string;
  code: string;
  clientId?: string | null;
  costCenterId?: string | null;
  client?: { id: string; companyName?: string | null } | null;
};

type BankAccount = {
  id: string;
  name: string;
  currentBalance: number;
  isActive?: boolean | null;
};

type Receivable = {
  id: string;
  description: string;
  clientId: string;
  contractId?: string | null;
  costCenterId?: string | null;
  grossAmount: number;
  netAmount: number;
  paidAmount: number;
  status: string;
  payments?: Array<{
    id: string;
    amount: number;
    bankAccountId?: string | null;
    notes?: string | null;
  }>;
};

type Commission = {
  id: string;
  receivableId?: string | null;
  contractId?: string | null;
  status: string;
  notes?: string | null;
};

type CashFlowProjection = {
  projections?: Array<{
    horizonDays: number;
    realizedIn?: number;
    expectedIn?: number;
  }>;
};

type DrePayload = {
  totals?: {
    realizedRevenue?: number;
    realizedOperationalResult?: number;
  };
};

test.describe.serial("financeiro operacional, caixa, DRE e comissao", () => {
  test("financeiro baixa recebivel contratual, movimenta caixa, realiza DRE, libera comissao e permite estorno", async ({
    page,
  }) => {
    const [adminSession, financeSession] = await Promise.all([
      apiLogin(accounts.admin),
      apiLogin(accounts.finance),
    ]);
    const adminToken = adminSession.access_token;
    const financeToken = financeSession.access_token;

    const contract = await firstContract(adminToken);
    const clientId = contract.clientId ?? contract.client?.id;
    expect(clientId).toBeTruthy();

    const bankBefore = await firstActiveBankAccount(financeToken);
    const salesUser = await salesDemoUser(adminToken);
    const suffix = Date.now();
    const amount = 1234.56;
    const description = `Ciclo 12 E2E recebivel ${suffix}`;
    const competenceDate = new Date(Date.now() + 90_000).toISOString();
    const dueDate = new Date(
      Date.now() + 5 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const receivable = await apiRequest<Receivable>(
      financeToken,
      "/finance/receivables",
      {
        method: "POST",
        body: {
          clientId,
          contractId: contract.id,
          costCenterId: contract.costCenterId,
          description,
          competenceDate,
          dueDate,
          grossAmount: amount,
          discountAmount: 0,
        },
      },
    );

    await apiRequest<Commission>(adminToken, "/hr-admin/commissions", {
      method: "POST",
      body: {
        userId: salesUser.id,
        receivableId: receivable.id,
        contractId: contract.id,
        baseAmount: amount,
        percent: 2,
        notes: `Ciclo 12 E2E ${suffix}`,
      },
    });

    await loginByApi(page, accounts.finance);
    await page.goto("/dashboard/finance/accounts-receivable", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Contas a receber|Financeiro/i);
    await page.locator("input").first().fill(description);
    const receivableCard = page
      .locator("article")
      .filter({ hasText: description });
    await expect(receivableCard).toBeVisible();
    await receivableCard
      .getByRole("button", { name: /Registrar recebimento/i })
      .click();
    await receivableCard.locator("select").nth(1).selectOption(bankBefore.id);
    await receivableCard
      .getByRole("button", { name: /Confirmar baixa/i })
      .click();
    await expect(page.getByText(/titulo quitado/i)).toBeVisible({
      timeout: 45_000,
    });

    const paidReceivable = await reloadReceivable(financeToken, receivable.id);
    expect(paidReceivable.status).toBe("PAID");
    expect(Math.round(Number(paidReceivable.paidAmount) * 100)).toBe(
      Math.round(amount * 100),
    );

    const bankAfterPayment = await findBankAccount(financeToken, bankBefore.id);
    expect(
      Math.round(
        (bankAfterPayment.currentBalance - bankBefore.currentBalance) * 100,
      ),
    ).toBe(Math.round(amount * 100));

    const cashFlow = await apiRequest<CashFlowProjection>(
      financeToken,
      "/finance/cash-flow/projection?days=30",
    );
    expect(
      (cashFlow.projections || []).some(
        (item) => Number(item.realizedIn || 0) >= amount,
      ),
    ).toBeTruthy();

    if (contract.costCenterId) {
      const dre = await apiRequest<DrePayload>(
        financeToken,
        `/finance/cost-centers/${contract.costCenterId}/dre`,
      );
      expect(Number(dre.totals?.realizedRevenue || 0)).toBeGreaterThanOrEqual(
        amount,
      );
      expect(
        Number(dre.totals?.realizedOperationalResult || 0),
      ).toBeGreaterThanOrEqual(amount);
    }

    const releasedCommissions = await apiRequest<Commission[]>(
      adminToken,
      "/hr-admin/commissions?status=RELEASED",
    );
    expect(
      releasedCommissions.some(
        (item) =>
          item.receivableId === receivable.id &&
          item.contractId === contract.id &&
          item.notes?.includes(`Ciclo 12 E2E ${suffix}`),
      ),
    ).toBeTruthy();

    const positivePayment = paidReceivable.payments?.find(
      (payment) =>
        payment.amount > 0 && payment.bankAccountId === bankBefore.id,
    );
    expect(positivePayment?.id).toBeTruthy();

    await apiRequest(
      financeToken,
      `/finance/receivables/${receivable.id}/payments/${positivePayment!.id}/reverse`,
      {
        method: "PATCH",
        body: { reason: "Estorno validado pelo E2E do Ciclo 12" },
      },
    );

    const reversedReceivable = await reloadReceivable(
      financeToken,
      receivable.id,
    );
    expect(reversedReceivable.status).toBe("OPEN");
    expect(Number(reversedReceivable.paidAmount)).toBe(0);

    const bankAfterReversal = await findBankAccount(
      financeToken,
      bankBefore.id,
    );
    expect(Math.round(bankAfterReversal.currentBalance * 100)).toBe(
      Math.round(bankBefore.currentBalance * 100),
    );

    const pendingCommissions = await apiRequest<Commission[]>(
      adminToken,
      "/hr-admin/commissions?status=PENDING",
    );
    expect(
      pendingCommissions.some(
        (item) =>
          item.receivableId === receivable.id &&
          item.notes?.includes(`Ciclo 12 E2E ${suffix}`),
      ),
    ).toBeTruthy();
  });

  test("perfis tecnico e cliente nao acessam financeiro interno", async ({
    page,
  }) => {
    const [technicianSession, clientSession] = await Promise.all([
      apiLogin(accounts.technician),
      apiLogin(accounts.clientA),
    ]);

    const technicianReceivables = await apiRequestRaw(
      technicianSession.access_token,
      "/finance/receivables",
    );
    expect(technicianReceivables.status).toBe(403);

    const clientReceivables = await apiRequestRaw(
      clientSession.access_token,
      "/finance/receivables",
    );
    expect(clientReceivables.status).toBe(403);

    await loginByApi(page, accounts.clientA);
    await page.goto("/dashboard/finance/accounts-receivable", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expect(page).toHaveURL(/\/portal/);
  });
});

async function firstContract(token: string) {
  const contracts = await apiRequest<Contract[]>(token, "/contracts");
  const contract = contracts.find(
    (item) => (item.clientId || item.client?.id) && item.id,
  );
  if (!contract) throw new Error("Nenhum contrato E2E disponivel.");
  return contract;
}

async function firstActiveBankAccount(token: string) {
  const accountsList = await apiRequest<BankAccount[]>(
    token,
    "/finance/bank-accounts",
  );
  const account = accountsList.find((item) => item.isActive !== false);
  if (!account) throw new Error("Nenhuma conta bancaria ativa disponivel.");
  return account;
}

async function findBankAccount(token: string, id: string) {
  const accountsList = await apiRequest<BankAccount[]>(
    token,
    "/finance/bank-accounts",
  );
  const account = accountsList.find((item) => item.id === id);
  if (!account) throw new Error(`Conta bancaria nao encontrada: ${id}`);
  return account;
}

async function salesDemoUser(token: string) {
  const users = await apiRequest<User[]>(token, "/users");
  const user = users.find((item) => item.email === accounts.sales.email);
  if (!user) throw new Error("Usuario comercial demo nao encontrado.");
  return user;
}

async function reloadReceivable(token: string, id: string) {
  const receivables = await apiRequest<Receivable[]>(
    token,
    "/finance/receivables",
  );
  const receivable = receivables.find((item) => item.id === id);
  if (!receivable) throw new Error(`Recebivel nao encontrado: ${id}`);
  return receivable;
}
