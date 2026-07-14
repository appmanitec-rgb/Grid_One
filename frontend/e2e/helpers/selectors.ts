import { mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { expect, Page } from "@playwright/test";

export async function expectNoAppCrash(page: Page) {
  await expect(page.locator("body")).not.toContainText(/Unhandled Runtime Error/i);
  await expect(page.locator("body")).not.toContainText(/Application error/i);
  await expect(page.locator("body")).not.toContainText(/Erro 500/i);
  await expect(page.locator("body")).not.toContainText(/404 This page could not be found/i);
}

export async function expectLoaded(
  page: Page,
  pattern: RegExp,
  timeout = 45_000,
) {
  await expect(page.locator("body")).toContainText(pattern, { timeout });
  await expectNoAppCrash(page);
}

export async function saveQaScreenshot(page: Page, name: string) {
  const filePath = resolve("..", "docs", "screenshots", "ciclo-9", `${name}.png`);
  mkdirSync(dirname(filePath), { recursive: true });
  await page.screenshot({ path: filePath, fullPage: true });
}
