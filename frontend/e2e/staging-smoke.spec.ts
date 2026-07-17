import { expect, test } from "@playwright/test";
import { apiLogin, apiRequest, loginByApi } from "./helpers/auth";
import { expectLoaded } from "./helpers/selectors";
import { accounts } from "./helpers/test-data";

type HealthPayload = {
  status: string;
  environment?: string;
  database?: string;
  storage?: string;
  driver?: string;
};

test.describe("staging remote smoke", () => {
  test.skip(
    process.env.E2E_TARGET_ENV !== "staging",
    "Executado apenas contra staging real com E2E_TARGET_ENV=staging.",
  );

  test("valida health remoto, login interno, portal e RBAC basico", async ({
    page,
  }) => {
    const [health, dbHealth, storageHealth] = await Promise.all([
      apiRequest<HealthPayload>(undefined, "/health"),
      apiRequest<HealthPayload>(undefined, "/health/db"),
      apiRequest<HealthPayload>(undefined, "/health/storage"),
    ]);

    expect(health.status).toBe("ok");
    expect(dbHealth.status).toBe("ok");
    expect(storageHealth.status).toBe("ok");
    expect(JSON.stringify({ health, dbHealth, storageHealth })).not.toMatch(
      /DATABASE_URL|storageKey|S3_SECRET|SECRET_ACCESS_KEY|postgres:\/\/|postgresql:\/\//i,
    );

    const [adminSession, clientSession] = await Promise.all([
      apiLogin(accounts.admin),
      apiLogin(accounts.clientA),
    ]);

    await loginByApi(page, accounts.admin);
    await page.goto("/dashboard", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Dashboard|Painel/i);

    await loginByApi(page, accounts.clientA);
    await page.goto("/portal", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expectLoaded(page, /Portal|Cliente|Chamados|Equipamentos/i);

    const clientFinance = await fetch(
      `${process.env.E2E_API_URL}/finance/reconciliation/report?bankAccountId=00000000-0000-0000-0000-000000000000`,
      {
        headers: { Authorization: `Bearer ${clientSession.access_token}` },
      },
    );
    expect(clientFinance.status).toBe(403);
    expect(adminSession.access_token).toBeTruthy();
  });
});
