import { expect, test, type Page } from "@playwright/test";
import { reviewProposal } from "../lib/proposal-review";

async function editorFixture(page: Page) {
  let saved: Record<string, unknown> | null = null;
  await page.route(/\/api\/|http:\/\/127\.0\.0\.1:3100\//, async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname.replace(/^\/api/, "");
    let status = 200,
      data: unknown = [];
    if (path === "/proposals/editor/context")
      data = {
        enabled: true,
        unrestricted: true,
        discountLimit: 100,
        expenseRules: [],
      };
    else if (path.startsWith("/proposals/editor/drafts/")) {
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON();
        saved = {
          id: path.split("/").at(-1),
          revision: Number(saved?.revision || 0) + 1,
          updatedAt: new Date().toISOString(),
          formData: body.formData,
        };
        data = saved;
      } else if (saved) data = saved;
      else {
        status = 404;
        data = { message: "Rascunho ainda não salvo." };
      }
    } else if (path === "/proposals/editor/conference") {
      const form = route.request().postDataJSON().data;
      const report = reviewProposal({
        items: [],
        clientId: form.selectedClientId,
        sellerId: form.selectedSellerId,
        unrestricted: true,
      });
      data = {
        issues: report.issues,
        pending: report.pending,
        resolved: [],
        totals: report.totals,
        errors: report.errors,
        warnings: report.warnings,
        readyForApproval: false,
      };
    } else if (path === "/notifications/inbox")
      data = {
        userRole: "ADMIN",
        summary: { total: 0, actionRequired: 0, highPriority: 0 },
        items: [],
      };
    else if (path === "/proposals/pricing-options")
      data = { hourTypes: [], technicianTypes: [], rates: [] };
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.addInitScript(() => {
    const payload = btoa(
      JSON.stringify({
        sub: "phase1-browser-fixture",
        role: "ADMIN",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    localStorage.setItem("manitec_token", "header." + payload + ".signature");
    localStorage.setItem("manitec_refresh_token", "phase1-fixture");
  });
  return () => saved;
}

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`fase 1: rascunho incompleto recupera, conserva quatro etapas e corrige pelo campo em ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const saved = await editorFixture(page);
    await page.goto("/dashboard/proposals/new");
    const save = page
      .getByRole("button", { name: "Salvar rascunho", exact: true })
      .first();
    await expect(save).toBeEnabled();
    await page
      .locator("#proposal-review-client")
      .fill("Cliente ainda em seleção");
    const dock = page.getByRole("region", {
      name: "Resumo financeiro da proposta",
      exact: true,
    });
    for (let step = 0; step < 3; step++)
      await dock
        .getByRole("button", { name: "Continuar", exact: true })
        .click();
    await expect(
      page.getByRole("heading", {
        name: "Conferência da proposta",
        exact: true,
      }),
    ).toBeVisible();
    await save.click();
    await expect(
      page.getByRole("status").filter({ hasText: "Rascunho salvo no sistema" }),
    ).toBeVisible();
    expect((saved()?.formData as Record<string, unknown>).clientSearch).toBe(
      "Cliente ainda em seleção",
    );
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Conferência da proposta",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Selecionar cliente", exact: true })
      .click();
    await expect(page.locator("#proposal-review-client")).toBeFocused();
    await expect(page.locator("#proposal-review-client")).toHaveValue(
      "Cliente ainda em seleção",
    );
    expect(
      await page
        .locator("body")
        .evaluate((element) => element.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(1);
  });
}
