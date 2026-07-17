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

type BankMovement = {
  id: string;
  type: "CREDIT" | "DEBIT";
  amount: number;
  movementDate?: string;
  description?: string;
  originType: string;
  receivableId?: string | null;
  payableId?: string | null;
  reconciledAt?: string | null;
  status?: string | null;
  runningBalance?: number;
};

type BankMovementPayload = {
  openingBalance: number;
  finalBalance: number;
  totals: { credits: number; debits: number };
  entries: BankMovement[];
};

type BankStatementImport = {
  id: string;
  status: string;
  profileId?: string | null;
  profile?: { id: string; name: string } | null;
  entries?: BankStatementEntry[];
};

type BankStatementEntry = {
  id: string;
  amount: number;
  type: "CREDIT" | "DEBIT";
  description: string;
  matchStatus: string;
  suggestedMovementId?: string | null;
  suggestionScore?: number | null;
  suggestionReason?: string | null;
  matchedMovementId?: string | null;
};

type ReconciliationReport = {
  totals: {
    reconciledMovements: number;
    unmatchedStatementEntries: number;
    openIssues: number;
  };
  balanceAudit?: BalanceAudit;
};

type BalanceAudit = {
  currentBalance: number;
  ledgerCalculatedBalance: number;
  difference: number;
  status: "OK" | "DIVERGENT";
};

type MatchSuggestions = {
  candidates: Array<{
    movement: BankMovement;
    score: number;
    reason: string;
    canAutoMatch: boolean;
  }>;
};

type BankImportProfile = {
  id: string;
  name: string;
  fileType: string;
  active: boolean;
};

type BankReconciliationClosing = {
  id: string;
  status: string;
  difference: number;
};

type FinancialPeriodClosing = {
  id: string;
  year: number;
  month: number;
  status: string;
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

    const statementBeforePayment = await apiRequest<BankMovementPayload>(
      financeToken,
      `/finance/bank-movements?bankAccountId=${bankBefore.id}`,
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

    const statementAfterPayment = await apiRequest<BankMovementPayload>(
      financeToken,
      `/finance/bank-movements?bankAccountId=${bankBefore.id}`,
    );
    const creditMovement = statementAfterPayment.entries.find(
      (movement) =>
        movement.receivableId === receivable.id &&
        movement.type === "CREDIT" &&
        Math.round(Number(movement.amount) * 100) === Math.round(amount * 100),
    );
    expect(creditMovement?.id).toBeTruthy();
    expect(Number(statementAfterPayment.finalBalance.toFixed(2))).toBeCloseTo(
      Number((statementBeforePayment.finalBalance + amount).toFixed(2)),
      2,
    );

    await apiRequest(
      financeToken,
      `/finance/bank-movements/${creditMovement!.id}/reconcile`,
      {
        method: "PATCH",
        body: { reconciliationReference: `E2E-${suffix}` },
      },
    );

    const positivePayment = paidReceivable.payments?.find(
      (payment) =>
        payment.amount > 0 && payment.bankAccountId === bankBefore.id,
    );
    expect(positivePayment?.id).toBeTruthy();

    const blockedReverse = await apiRequestRaw(
      financeToken,
      `/finance/receivables/${receivable.id}/payments/${positivePayment!.id}/reverse`,
      {
        method: "PATCH",
        body: { reason: "Tentativa com movimento conciliado" },
      },
    );
    expect(blockedReverse.status).toBeGreaterThanOrEqual(400);

    await apiRequest(
      financeToken,
      `/finance/bank-movements/${creditMovement!.id}/unreconcile`,
      {
        method: "PATCH",
        body: { reason: "Liberar estorno validado no E2E" },
      },
    );

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

    const statementAfterReversal = await apiRequest<BankMovementPayload>(
      financeToken,
      `/finance/bank-movements?bankAccountId=${bankBefore.id}`,
    );
    expect(
      statementAfterReversal.entries.some(
        (movement) =>
          movement.receivableId === receivable.id &&
          movement.type === "DEBIT" &&
          movement.originType === "REVERSAL",
      ),
    ).toBeTruthy();

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

  test("conciliacao bancaria importa CSV, faz matching, registra ajuste e bloqueia perfis externos", async ({
    page,
  }) => {
    const [
      adminSession,
      financeSession,
      technicianSession,
      clientSession,
      auditorSession,
      salesSession,
    ] = await Promise.all([
      apiLogin(accounts.admin),
      apiLogin(accounts.finance),
      apiLogin(accounts.technician),
      apiLogin(accounts.clientA),
      apiLogin(accounts.auditor),
      apiLogin(accounts.sales),
    ]);
    const adminToken = adminSession.access_token;
    const financeToken = financeSession.access_token;

    const contract = await firstContract(adminToken);
    const clientId = contract.clientId ?? contract.client?.id;
    expect(clientId).toBeTruthy();

    const bankAccount = await firstActiveBankAccount(financeToken);
    const suffix = Date.now();
    const amount = 2789 + (suffix % 97) + 0.37;
    const feeAmount = 17.89;
    const paidAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    const description = `Ciclo 14 conciliacao ${suffix}`;

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
          competenceDate: paidAt,
          dueDate: paidAt,
          grossAmount: amount,
          discountAmount: 0,
        },
      },
    );

    await apiRequest(
      financeToken,
      `/finance/receivables/${receivable.id}/pay`,
      {
        method: "PATCH",
        body: {
          amount,
          method: "TRANSFER",
          bankAccountId: bankAccount.id,
          paidAt,
        },
      },
    );

    const statementBefore = await apiRequest<BankMovementPayload>(
      financeToken,
      `/finance/bank-movements?bankAccountId=${bankAccount.id}`,
    );
    const creditMovement = statementBefore.entries.find(
      (movement) =>
        movement.receivableId === receivable.id &&
        movement.type === "CREDIT" &&
        Math.round(movement.amount * 100) === Math.round(amount * 100),
    );
    expect(creditMovement?.id).toBeTruthy();

    const bankDate = formatBrDate(paidAt);
    const csv = [
      "data;descricao;valor;referencia",
      `${bankDate};Recebimento ${suffix};${formatBrMoney(amount)};E2E-C14-${suffix}`,
      `${bankDate};Tarifa bancaria ${suffix};-${formatBrMoney(feeAmount)};E2E-C14-TAR-${suffix}`,
    ].join("\n");

    const imported = await apiRequest<BankStatementImport>(
      financeToken,
      `/finance/bank-accounts/${bankAccount.id}/statements/import`,
      {
        method: "POST",
        body: {
          fileName: `ciclo-14-${suffix}.csv`,
          fileType: "CSV",
          content: csv,
        },
      },
    );
    expect(imported.id).toBeTruthy();
    expect(imported.entries?.length).toBe(2);

    const duplicateImport = await apiRequestRaw(
      financeToken,
      `/finance/bank-accounts/${bankAccount.id}/statements/import`,
      {
        method: "POST",
        body: {
          fileName: `ciclo-14-${suffix}.csv`,
          fileType: "CSV",
          content: csv,
        },
      },
    );
    expect(duplicateImport.status).toBeGreaterThanOrEqual(400);

    const importProfile = await apiRequest<BankImportProfile>(
      financeToken,
      "/finance/bank-import-profiles",
      {
        method: "POST",
        body: {
          name: `Perfil CSV banco E2E ${suffix}`,
          bankCode: "E2E",
          fileType: "CSV",
          dateFormat: "YYYY-MM-DD",
          decimalSeparator: ".",
          amountMode: "SIGNED",
          columnMapping: {
            date: "posted_on",
            description: "history",
            amount: "transaction_value",
            type: "nature",
            documentNumber: "doc_id",
            reference: "bank_id",
          },
          matchingConfig: {
            dateWindowDays: 3,
            minAutoMatchScore: 0.82,
          },
        },
      },
    );
    expect(importProfile.id).toBeTruthy();

    const profileCsv = [
      "posted_on,history,transaction_value,nature,doc_id,bank_id",
      `${paidAt.slice(0, 10)},Tarifa pequena perfil ${suffix},-12.34,DEBIT,TAR-PERFIL-${suffix},E2E-PERFIL-${suffix}`,
    ].join("\n");
    const profileImport = await apiRequest<BankStatementImport>(
      financeToken,
      `/finance/bank-accounts/${bankAccount.id}/statements/import`,
      {
        method: "POST",
        body: {
          fileName: `perfil-ciclo-16-${suffix}.csv`,
          fileType: "CSV",
          profileId: importProfile.id,
          content: profileCsv,
        },
      },
    );
    expect(profileImport.profileId).toBe(importProfile.id);
    expect(profileImport.entries?.[0]?.matchStatus).toBe("UNMATCHED");

    const autoMatch = await apiRequest<{
      autoMatched: number;
      unmatched: number;
    }>(financeToken, `/finance/bank-statements/${imported.id}/auto-match`, {
      method: "POST",
      body: { dateWindowDays: 2 },
    });
    expect(autoMatch.autoMatched).toBeGreaterThanOrEqual(1);
    expect(autoMatch.unmatched).toBeGreaterThanOrEqual(1);

    const entriesAfterMatch = await apiRequest<BankStatementEntry[]>(
      financeToken,
      `/finance/bank-statements/${imported.id}/entries`,
    );
    const matchedCredit = entriesAfterMatch.find(
      (entry) =>
        entry.type === "CREDIT" &&
        Math.round(entry.amount * 100) === Math.round(amount * 100),
    );
    expect(matchedCredit?.matchStatus).toBe("AUTO_MATCHED");
    expect(matchedCredit?.matchedMovementId).toBe(creditMovement!.id);

    const feeEntry = entriesAfterMatch.find(
      (entry) =>
        entry.type === "DEBIT" &&
        Math.round(entry.amount * 100) === Math.round(feeAmount * 100),
    );
    expect(feeEntry?.id).toBeTruthy();
    expect(feeEntry?.matchStatus).toBe("UNMATCHED");

    await apiRequest(
      financeToken,
      `/finance/bank-statement-entries/${feeEntry!.id}/adjustment`,
      {
        method: "POST",
        body: {
          amount: feeAmount,
          type: "DEBIT",
          description: `Ajuste tarifa bancaria ${suffix}`,
          postedDate: paidAt,
          reason: "Tarifa bancaria importada sem titulo interno",
        },
      },
    );

    const entriesAfterAdjustment = await apiRequest<BankStatementEntry[]>(
      financeToken,
      `/finance/bank-statements/${imported.id}/entries`,
    );
    const adjustedFee = entriesAfterAdjustment.find(
      (entry) => entry.id === feeEntry!.id,
    );
    expect(adjustedFee?.matchStatus).toBe("MANUAL_MATCHED");
    expect(adjustedFee?.matchedMovementId).toBeTruthy();

    const report = await apiRequest<ReconciliationReport>(
      financeToken,
      `/finance/reconciliation/report?bankAccountId=${bankAccount.id}&from=${paidAt.slice(0, 10)}T00:00:00.000Z&to=${paidAt.slice(0, 10)}T23:59:59.999Z`,
    );
    expect(report.totals.reconciledMovements).toBeGreaterThanOrEqual(2);
    expect(report.totals.unmatchedStatementEntries).toBeGreaterThanOrEqual(0);
    expect(report.balanceAudit?.status).toMatch(/OK|DIVERGENT/);

    const balanceAudit = await apiRequest<BalanceAudit>(
      financeToken,
      `/finance/bank-accounts/${bankAccount.id}/balance-audit`,
    );
    expect(balanceAudit.status).toMatch(/OK|DIVERGENT/);
    expect(Number.isFinite(balanceAudit.ledgerCalculatedBalance)).toBeTruthy();

    const ambiguousAmount = 1800 + (suffix % 83) + 0.73;
    const ambiguousDescription = `Ciclo 15 ambiguidade ${suffix}`;
    const ambiguousReceivables = await Promise.all(
      [1, 2].map((index) =>
        apiRequest<Receivable>(financeToken, "/finance/receivables", {
          method: "POST",
          body: {
            clientId,
            costCenterId: contract.costCenterId,
            description: ambiguousDescription,
            competenceDate: new Date(
              new Date(paidAt).getTime() + index * 1000,
            ).toISOString(),
            dueDate: paidAt,
            grossAmount: ambiguousAmount,
            discountAmount: 0,
          },
        }).then(async (item) => {
          await apiRequest(
            financeToken,
            `/finance/receivables/${item.id}/pay`,
            {
              method: "PATCH",
              body: {
                amount: ambiguousAmount,
                method: "TRANSFER",
                bankAccountId: bankAccount.id,
                paidAt,
                notes: `Ambiguidade Ciclo 15 ${index}`,
              },
            },
          );
          return item;
        }),
      ),
    );

    const movementsAfterAmbiguity = await apiRequest<BankMovementPayload>(
      financeToken,
      `/finance/bank-movements?bankAccountId=${bankAccount.id}`,
    );
    const ambiguousMovements = movementsAfterAmbiguity.entries.filter(
      (movement) =>
        ambiguousReceivables.some(
          (item) => item.id === movement.receivableId,
        ) &&
        movement.type === "CREDIT" &&
        Math.round(movement.amount * 100) === Math.round(ambiguousAmount * 100),
    );
    expect(ambiguousMovements.length).toBe(2);

    const ignoreAmount = 9.87;
    const ambiguousCsv = [
      "data;descricao;valor",
      `${bankDate};${ambiguousDescription};${formatBrMoney(ambiguousAmount)}`,
      `${bankDate};Tarifa menor ${suffix};-${formatBrMoney(ignoreAmount)}`,
    ].join("\n");
    const ambiguousImport = await apiRequest<BankStatementImport>(
      financeToken,
      `/finance/bank-accounts/${bankAccount.id}/statements/import`,
      {
        method: "POST",
        body: {
          fileName: `ciclo-15-ambiguidade-${suffix}.csv`,
          fileType: "CSV",
          content: ambiguousCsv,
        },
      },
    );
    const ambiguousAutoMatch = await apiRequest<{
      autoMatched: number;
      ambiguous: number;
      unmatched: number;
    }>(
      financeToken,
      `/finance/bank-statements/${ambiguousImport.id}/auto-match`,
      {
        method: "POST",
        body: { dateWindowDays: 2 },
      },
    );
    expect(ambiguousAutoMatch.ambiguous).toBeGreaterThanOrEqual(1);

    const ambiguousEntries = await apiRequest<BankStatementEntry[]>(
      financeToken,
      `/finance/bank-statements/${ambiguousImport.id}/entries`,
    );
    const ambiguousEntry = ambiguousEntries.find(
      (entry) =>
        entry.type === "CREDIT" &&
        Math.round(entry.amount * 100) === Math.round(ambiguousAmount * 100),
    );
    expect(ambiguousEntry?.matchStatus).toBe("UNMATCHED");
    expect(ambiguousEntry?.suggestedMovementId).toBeTruthy();

    const suggestions = await apiRequest<MatchSuggestions>(
      financeToken,
      `/finance/bank-statement-entries/${ambiguousEntry!.id}/suggestions`,
    );
    expect(suggestions.candidates.length).toBeGreaterThanOrEqual(2);

    await apiRequest(
      financeToken,
      `/finance/bank-statement-entries/${ambiguousEntry!.id}/match`,
      {
        method: "POST",
        body: { movementId: suggestions.candidates[0].movement.id },
      },
    );

    const ignoredEntry = ambiguousEntries.find(
      (entry) =>
        entry.type === "DEBIT" &&
        Math.round(entry.amount * 100) === Math.round(ignoreAmount * 100),
    );
    expect(ignoredEntry?.id).toBeTruthy();
    await apiRequest(
      financeToken,
      `/finance/bank-statement-entries/${ignoredEntry!.id}/ignore`,
      {
        method: "POST",
        body: { reason: "Tarifa bancaria fora da politica de ajuste do E2E" },
      },
    );

    const entriesAfterManualReview = await apiRequest<BankStatementEntry[]>(
      financeToken,
      `/finance/bank-statements/${ambiguousImport.id}/entries`,
    );
    expect(
      entriesAfterManualReview.find((entry) => entry.id === ambiguousEntry!.id)
        ?.matchStatus,
    ).toBe("MANUAL_MATCHED");
    expect(
      entriesAfterManualReview.find((entry) => entry.id === ignoredEntry!.id)
        ?.matchStatus,
    ).toBe("IGNORED");

    const profileEntry = profileImport.entries?.[0];
    expect(profileEntry?.id).toBeTruthy();
    const periodDate = new Date(paidAt);
    const closePayload = {
      year: periodDate.getUTCFullYear(),
      month: periodDate.getUTCMonth() + 1,
      reason: `Fechamento bancario E2E ${suffix}`,
    };
    const blockedClosing = await apiRequestRaw(
      financeToken,
      `/finance/bank-accounts/${bankAccount.id}/reconciliation-closings/close`,
      {
        method: "POST",
        body: closePayload,
      },
    );
    expect(blockedClosing.status).toBeGreaterThanOrEqual(400);

    const auditorClosing = await apiRequestRaw(
      auditorSession.access_token,
      `/finance/bank-accounts/${bankAccount.id}/reconciliation-closings/close`,
      {
        method: "POST",
        body: { ...closePayload, allowOpenIssues: true },
      },
    );
    expect(auditorClosing.status).toBe(403);

    const financeClosingWithCaveat = await apiRequestRaw(
      financeToken,
      `/finance/bank-accounts/${bankAccount.id}/reconciliation-closings/close`,
      {
        method: "POST",
        body: { ...closePayload, allowOpenIssues: true },
      },
    );
    expect(financeClosingWithCaveat.status).toBeGreaterThanOrEqual(400);

    const bankClosing = await apiRequest<BankReconciliationClosing>(
      adminToken,
      `/finance/bank-accounts/${bankAccount.id}/reconciliation-closings/close`,
      {
        method: "POST",
        body: { ...closePayload, allowOpenIssues: true },
      },
    );
    expect(bankClosing.status).toBe("CLOSED");

    const blockedClosedPeriodAction = await apiRequestRaw(
      financeToken,
      `/finance/bank-statement-entries/${profileEntry!.id}/ignore`,
      {
        method: "POST",
        body: { reason: "Tentativa bloqueada por fechamento bancario" },
      },
    );
    expect(blockedClosedPeriodAction.status).toBeGreaterThanOrEqual(400);

    await apiRequest(
      financeToken,
      `/finance/bank-reconciliation-closings/${bankClosing.id}/reopen`,
      {
        method: "PATCH",
        body: { reason: "Reabertura E2E para tratar pendencia" },
      },
    );
    await apiRequest(
      financeToken,
      `/finance/bank-statement-entries/${profileEntry!.id}/ignore`,
      {
        method: "POST",
        body: { reason: "Tarifa pequena tratada apos reabertura" },
      },
    );

    const technicianImport = await apiRequestRaw(
      technicianSession.access_token,
      `/finance/bank-accounts/${bankAccount.id}/statements`,
    );
    expect(technicianImport.status).toBe(403);

    const clientReport = await apiRequestRaw(
      clientSession.access_token,
      `/finance/reconciliation/report?bankAccountId=${bankAccount.id}`,
    );
    expect(clientReport.status).toBe(403);

    const salesReport = await apiRequestRaw(
      salesSession.access_token,
      `/finance/reconciliation/report?bankAccountId=${bankAccount.id}`,
    );
    expect(salesReport.status).toBe(403);

    const auditorReport = await apiRequestRaw(
      auditorSession.access_token,
      `/finance/reconciliation/report?bankAccountId=${bankAccount.id}&from=${paidAt.slice(0, 10)}T00:00:00.000Z&to=${paidAt.slice(0, 10)}T23:59:59.999Z`,
    );
    expect(auditorReport.status).toBe(200);

    const auditorImport = await apiRequestRaw(
      auditorSession.access_token,
      `/finance/bank-accounts/${bankAccount.id}/statements/import`,
      {
        method: "POST",
        body: {
          fileName: `auditor-bloqueado-${suffix}.csv`,
          fileType: "CSV",
          content: csv,
        },
      },
    );
    expect(auditorImport.status).toBe(403);

    await loginByApi(page, accounts.finance);
    await page.goto("/dashboard/finance/reconciliation", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Conciliação bancária|Financeiro/i);
  });

  test("periodo financeiro fechado bloqueia baixa dentro do mes", async () => {
    const [adminSession, financeSession] = await Promise.all([
      apiLogin(accounts.admin),
      apiLogin(accounts.finance),
    ]);
    const adminToken = adminSession.access_token;
    const financeToken = financeSession.access_token;

    const contract = await firstContract(adminToken);
    const clientId = contract.clientId ?? contract.client?.id;
    expect(clientId).toBeTruthy();

    const bankAccount = await firstActiveBankAccount(financeToken);
    const suffix = Date.now();
    const closedDate = new Date(Date.now() + 370 * 24 * 60 * 60 * 1000);
    const year = 2200 + (suffix % 500);
    const month = closedDate.getUTCMonth() + 1;
    const paidAt = new Date(
      Date.UTC(year, month - 1, 15, 12, 0, 0),
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
          description: `Ciclo 13 periodo fechado ${suffix}`,
          competenceDate: paidAt,
          dueDate: paidAt,
          grossAmount: 321.45,
          discountAmount: 0,
        },
      },
    );

    const period = await apiRequest<FinancialPeriodClosing>(
      adminToken,
      "/finance/period-closings/close",
      {
        method: "POST",
        body: {
          year,
          month,
          reason: `Fechamento E2E Ciclo 13 ${suffix}`,
        },
      },
    );
    expect(period.status).toBe("CLOSED");

    const blockedPayment = await apiRequestRaw(
      financeToken,
      `/finance/receivables/${receivable.id}/pay`,
      {
        method: "PATCH",
        body: {
          amount: 321.45,
          method: "TRANSFER",
          bankAccountId: bankAccount.id,
          paidAt,
        },
      },
    );
    expect(blockedPayment.status).toBeGreaterThanOrEqual(400);

    const reopened = await apiRequest<FinancialPeriodClosing>(
      adminToken,
      `/finance/period-closings/${period.id}/reopen`,
      {
        method: "PATCH",
        body: { reason: `Reabertura E2E Ciclo 13 ${suffix}` },
      },
    );
    expect(reopened.status).toBe("OPEN");
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

    const technicianStatement = await apiRequestRaw(
      technicianSession.access_token,
      "/finance/bank-movements",
    );
    expect(technicianStatement.status).toBe(403);

    const clientStatement = await apiRequestRaw(
      clientSession.access_token,
      "/finance/bank-movements",
    );
    expect(clientStatement.status).toBe(403);

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

function formatBrDate(value: string) {
  const date = new Date(value);
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(
    date.getUTCMonth() + 1,
  ).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

function formatBrMoney(value: number) {
  return value.toFixed(2).replace(".", ",");
}
