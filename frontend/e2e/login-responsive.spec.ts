import { expect, test } from "@playwright/test";

test("login keeps the sign-in action accessible across window sizes", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  for (const [width, height] of [
    [1366, 768],
    [1280, 720],
    [1093, 614],
    [375, 667],
  ]) {
    await page.setViewportSize({ width, height });
    const submit = page.getByRole("button", { name: "Acessar o GridOne" });
    await expect(submit).toBeVisible();

    const layout = await page.evaluate(() => {
      const action = document.querySelector<HTMLButtonElement>('button[type="submit"]');
      return {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        actionBottom: action?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
      };
    });

    expect(layout.scrollWidth, "horizontal overflow at " + width + "x" + height)
      .toBeLessThanOrEqual(width);
    expect(layout.actionBottom, "sign-in action below viewport at " + width + "x" + height)
      .toBeLessThanOrEqual(height);
    if (width >= 1024 && height >= 720) {
      expect(layout.scrollHeight, "desktop login scrolls at " + width + "x" + height)
        .toBeLessThanOrEqual(height);
    }
  }
});