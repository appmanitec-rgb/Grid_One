import { readFileSync } from "fs";
import { resolve } from "path";
import { expect, test } from "@playwright/test";
import { loginByApi } from "./helpers/auth";
import { expectNoAppCrash } from "./helpers/selectors";
import { accounts } from "./helpers/test-data";

function menuRoutes(file: string, prefix: string) {
  const source = readFileSync(resolve(process.cwd(), file), "utf8");
  const expression = new RegExp(`href:\\s*"(${prefix}[^"\\s]*)"`, "g");
  return [...new Set([...source.matchAll(expression)].map((match) => match[1]))];
}

const internalRoutes = menuRoutes(
  "app/dashboard/components/SidebarNavigation.tsx",
  "/dashboard",
).filter((route) => route !== "/dashboard/client-portal");
const portalRoutes = menuRoutes("app/portal/layout.tsx", "/portal/");

test.describe("todos os menus internos", () => {
  test.describe.configure({ mode: "parallel" });
  for (const route of internalRoutes) {
    test(`${route} abre sem falha`, async ({ page }) => {
      await loginByApi(page, route === "/dashboard/tecnico" ? accounts.technician : accounts.admin);
      const serverErrors: string[] = [];
      page.on("response", (response) => {
        if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
      });
      const response = await page.goto(route, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      expect(response?.status(), route).toBeLessThan(500);
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
      await expect(page, route).toHaveURL(new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?$`));
      await expectNoAppCrash(page);
      await expect(page.locator("body")).not.toContainText(/Internal server error/i);
      expect(serverErrors, route).toEqual([]);
    });
  }
});

test.describe("todos os menus do cliente", () => {
  test.describe.configure({ mode: "parallel" });
  for (const route of portalRoutes) {
    test(`${route} abre sem falha`, async ({ page }) => {
      await loginByApi(page, accounts.clientA);
      const serverErrors: string[] = [];
      page.on("response", (response) => {
        if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
      });
      const response = await page.goto(route, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      expect(response?.status(), route).toBeLessThan(500);
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
      await expect(page, route).toHaveURL(new RegExp(`${route}/?$`));
      await expectNoAppCrash(page);
      await expect(page.locator("body")).not.toContainText(/Internal server error/i);
      expect(serverErrors, route).toEqual([]);
    });
  }
});

test("rota antiga do portal redireciona para o portal atual", async ({ page }) => {
  await loginByApi(page, accounts.clientA);
  await page.goto("/dashboard/client-portal");
  await expect(page).toHaveURL(/\/portal(?:\/dashboard)?\/?$/);
  await expectNoAppCrash(page);
});
