import { expect, test } from "@playwright/test";
import { loginByApi } from "./helpers/auth";
import { accounts } from "./helpers/test-data";
const routes = [
  "/dashboard",
  "/dashboard/team",
  "/dashboard/reports",
  "/dashboard/management/users",
  "/dashboard/clients",
  "/dashboard/proposals",
  "/dashboard/contracts",
  "/dashboard/equipments",
  "/dashboard/orders",
];

for (const width of [1366, 768, 390]) {
  test(`títulos e ações ficam legíveis sem cortes em ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: 900 });
    await loginByApi(page, accounts.admin);

    for (const route of routes) {
      await test.step(route, async () => {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        const header = page.locator(".dashboard-page-header");
        await expect(header).toHaveCount(1, { timeout: 45_000 });
        await expect(header.getByRole("heading", { level: 1 })).toBeVisible();
        const layout = await header.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const heading = element.querySelector("h1")!;
          const titleRect = heading.getBoundingClientRect();
          const main = document.querySelector(".dashboard-main")!;
          const actions = [...element.querySelectorAll("button, a")].map((action) => {
            const bounds = action.getBoundingClientRect();
            return { left: bounds.left, right: bounds.right, height: bounds.height };
          });
          return {
            height: rect.height,
            left: rect.left,
            right: rect.right,
            titleLeft: titleRect.left,
            titleRight: titleRect.right,
            font: getComputedStyle(heading).fontFamily,
            overflow: main.scrollWidth - main.clientWidth,
            actions,
          };
        });
        expect(layout.height, route).toBeLessThan(width >= 1024 ? 180 : 300);
        expect(layout.font, route).toContain("Manrope");
        expect(layout.titleLeft, route).toBeGreaterThanOrEqual(layout.left);
        expect(layout.titleRight, route).toBeLessThanOrEqual(layout.right + 1);
        expect(layout.overflow, route).toBeLessThanOrEqual(1);
        if ([1366, 390].includes(width) && ["/dashboard/proposals", "/dashboard/orders"].includes(route)) {
          await page.screenshot({ path: testInfo.outputPath(`${route.split("/").pop()}-${width}.png`), fullPage: false });
        }
        for (const action of layout.actions) {
          expect(action.left, route).toBeGreaterThanOrEqual(layout.left);
          expect(action.right, route).toBeLessThanOrEqual(layout.right + 1);
          // Browsers can return a tiny floating-point difference for a 38px control.
          expect(Math.round(action.height * 100) / 100, route).toBeGreaterThanOrEqual(38);
        }
      });
    }
  });
}

test("contexto e formatos de proposta continuam acessíveis por teclado", async ({ page }) => {
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/contracts");
  const context = page.locator(".dashboard-page-context").first();
  await expect(context).not.toHaveAttribute("open");
  await context.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(context.locator(".dashboard-page-context-body")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(context.locator(".dashboard-page-context-body")).not.toBeVisible();

  await page.goto("/dashboard/proposals");
  await page.getByText("Nova proposta: escolher o tipo", { exact: true }).click();
  await expect(page.getByRole("link", { name: /Gerador Venda de equipamento/ }))
    .toHaveAttribute("href", "/dashboard/proposals/new/generator");
  await expect(page.getByRole("link", { name: /Proposta externa Registre/ }))
    .toHaveAttribute("href", "/dashboard/proposals/new/external");
});
