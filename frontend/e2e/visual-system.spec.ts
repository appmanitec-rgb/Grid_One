import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { apiLogin, apiRequest, getE2eEntityData, loginByApi } from "./helpers/auth";
import { accounts, PUBLIC_TOKENS } from "./helpers/test-data";

function pageFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? pageFiles(path.join(root, entry.name)) : entry.name === "page.tsx" ? [path.join(root, entry.name)] : [],
  );
}
const redirects = new Set(["/dashboard/developer", "/dashboard/management", "/dashboard/client-portal", "/portal"]);
const staticRoutes = (root: string) => pageFiles(path.join(process.cwd(), "app", root))
  .map((file) => "/" + path.relative(path.join(process.cwd(), "app"), path.dirname(file)).replaceAll(path.sep, "/"))
  .filter((route) => !route.includes("[") && !redirects.has(route));
const captures = new Set(["/dashboard", "/dashboard/proposals", "/dashboard/orders", "/dashboard/clients", "/dashboard/clients/new", "/dashboard/contracts", "/dashboard/dispatch", "/dashboard/finance/accounts-receivable", "/dashboard/management/users", "/dashboard/team", "/dashboard/equipments", "/dashboard/reports", "/portal/dashboard", "/portal/propostas", "/portal/financeiro", "/portal/feedback"]);

for (const width of [1366, 768, 390]) {
  test(`revisao visual completa em ${width}px`, async ({ browser }, testInfo) => {
    test.setTimeout(1_200_000);
    const admin = await apiLogin(accounts.admin);
    const entities = await getE2eEntityData();
    const dynamic: string[] = [
      `/dashboard/equipments/${entities.clientAEquipmentId}`,
      `/dashboard/orders/${entities.technicianOrderId}`,
      `/dashboard/atendimento/${entities.clientATicketId}`,
      `/dashboard/relatorios-tecnicos/${entities.serviceReportAId}`,
      "/dashboard/developer/data/clients",
      `/dashboard/documents/orders/${entities.technicianOrderId}`,
    ];
    for (const [endpoint, route] of [["/clients", "clients"], ["/proposals", "proposals"], ["/contracts", "contracts"], ["/catalogs", "catalog"], ["/suppliers", "suppliers"], ["/crm/opportunities", "opportunities"]]) {
      const rows = await apiRequest<Array<{id: string}>>(admin.access_token, endpoint);
      if (rows[0]?.id) {
        dynamic.push(`/dashboard/${route}/${rows[0].id}`);
        if (route === "contracts") dynamic.push(`/dashboard/documents/contracts/${rows[0].id}`);
        if (route === "proposals") dynamic.push(`/dashboard/documents/proposals/${rows[0].id}`);
        if (route === "clients") dynamic.push(`/dashboard/clients/${rows[0].id}/portal`);
      }
    }
    const portalSession = await apiLogin(accounts.clientA);
    const portalProposals = await apiRequest<Array<{id: string}>>(portalSession.access_token, "/customer-portal/proposals");
    const report: Array<Record<string, unknown>> = [];
    for (const [account, routes] of [
      [accounts.admin, [...staticRoutes("dashboard").filter((route) => !route.startsWith("/dashboard/tecnico")), ...dynamic]],
      [accounts.technician, ["/dashboard/tecnico", `/dashboard/tecnico/ordens/${entities.technicianOrderId}`]],
      [accounts.clientA, [...staticRoutes("portal"), ...portalProposals.slice(0, 1).map((row) => `/portal/propostas/${row.id}`), `/portal/equipamentos/${entities.clientAEquipmentId}`, `/portal/chamados/${entities.clientATicketId}`, `/portal/laudos/${entities.serviceReportAId}`]],
    ] as const) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      await loginByApi(page, account);
      for (const route of routes) {
        await test.step(route, async () => {
          await page.goto(route, { waitUntil: "domcontentloaded", timeout: 60_000 });
          await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 45_000 });
          await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
          await expect.poll(async () => page.locator("main").last().evaluate((main) => (main as HTMLElement).innerText.split("\n").some((line) => /^(?:Carregando|Atualizando|Montando documento|Sincronizando)(?:\b|\.\.\.)/i.test(line.trim()))), { timeout: 45_000, message: route + " terminou o carregamento" }).toBe(false);
          await page.evaluate(() => document.fonts.ready);
          const layout = await page.evaluate(() => {
            const main = document.querySelector(".dashboard-main") || document.querySelector("main")!;
            const headings = [...main.querySelectorAll("h1")].filter((el) => el.getBoundingClientRect().height > 0);
            const text = (main as HTMLElement).innerText;
            return {
              title: headings.map((h) => h.textContent).join(" | "),
              headings: headings.length,
              overflow: main.scrollWidth - main.clientWidth,
              bodyOverflow: document.documentElement.scrollWidth - innerWidth,
              headerCount: main.querySelectorAll(".dashboard-page-header").length,
              rawLabels: text.match(/\b(?:FIELD_SERVICE|COMMERCIAL_0[123]_[A-Z_]+|A_VISTA|BILLED_SEPARATELY|MONTHLY|QUARTERLY|SEMIANNUAL|YEARLY)\b/g) || [],
              brokenText: text.match(/[A-Za-z]\?\?[A-Za-z]/g) || [],
            };
          });
          report.push({ route, width, ...layout });
          fs.writeFileSync(testInfo.outputPath("visual-inventory.json"), JSON.stringify(report, null, 2));
          if (captures.has(route)) {
            await page.screenshot({ path: testInfo.outputPath(route.slice(1).replaceAll("/", "-") + ".png"), fullPage: false });
          }
          if (process.env.E2E_VISUAL_BASELINE !== "1") {
            expect.soft(layout.overflow, route).toBeLessThanOrEqual(1);
            expect.soft(layout.bodyOverflow, route).toBeLessThanOrEqual(1);
            expect.soft(layout.headings, route).toBe(1);
            expect.soft(layout.headerCount, route).toBe(1);
            expect.soft(layout.rawLabels, route).toEqual([]);
            expect.soft(layout.brokenText, route).toEqual([]);
          }
        });
      }
      await context.close();
    }
    await testInfo.attach("visual-inventory.json", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
    fs.writeFileSync(testInfo.outputPath("visual-inventory.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ width, pages: report.length, issues: report.filter((row) => Number(row.overflow) > 1 || Number(row.bodyOverflow) > 1 || row.headings !== 1 || row.headerCount !== 1 || (row.rawLabels as string[]).length || (row.brokenText as string[]).length) }));
  });
}

for (const width of [1366, 390]) {
  test(`paginas publicas ficam legiveis em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/cliente/entrar", "/cliente/ativar#token=visual-review-invalid", `/public/service-reports/share/${PUBLIC_TOKENS.shareValid}`, `/public/service-reports/verify/${PUBLIC_TOKENS.validation}`, "/share/visual-review-invalid"]) {
      await page.goto(route, { waitUntil: "networkidle" });
      const text = page.locator("body");
      await expect(text).not.toContainText(/Application error|Internal server error/);
      if (route.startsWith("/public/")) await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect.soft(overflow, route).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(route.split("#")[0].slice(1).replaceAll("/", "-") + "public.png"), fullPage: false });
    }
  });
}

test("atalhos antigos continuam conectados as telas atuais", async ({ browser }) => {
  for (const [account, routes] of [
    [accounts.admin, [["/dashboard/developer", "/dashboard/developer/data"], ["/dashboard/management", "/dashboard/management/users"]]],
    [accounts.clientA, [["/portal", "/portal/dashboard"], ["/dashboard/client-portal", "/portal/dashboard"]]],
  ] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginByApi(page, account);
    for (const [origin, destination] of routes) {
      await page.goto(origin);
      await expect(page).toHaveURL(new RegExp(destination + "/?$"));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
    await context.close();
  }
});
