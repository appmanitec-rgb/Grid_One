import { expect, test, type Page } from "@playwright/test";
import { loginByApi } from "./helpers/auth";
import { accounts } from "./helpers/test-data";

const sidebarFor = (page: Page) =>
  page.getByRole("complementary", { name: "Navegação principal" });

async function checkHeaderAlignment(page: Page) {
  const brand = await page.locator(".dashboard-sidebar-brand").boundingBox();
  const bar = await page.locator(".dashboard-topbar").boundingBox();
  expect(Math.abs(brand!.y - bar!.y)).toBeLessThan(1);
  expect(Math.abs(brand!.height - bar!.height)).toBeLessThan(1);
  expect(bar!.height).toBe(72);
  const backgrounds = await page.evaluate(() =>
    [".dashboard-sidebar-brand", ".dashboard-topbar"].map(
      (selector) =>
        getComputedStyle(document.querySelector(selector)!).backgroundImage,
    ),
  );
  expect(backgrounds[0]).toBe(backgrounds[1]);
}

for (const width of [1366, 1024, 768]) {
  test(
    "menu lateral alinha barras, expande no mouse e abre apenas um bloco em " +
      width +
      "px",
    async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.mouse.move(width - 20, 220);
      await loginByApi(page, accounts.admin);
      await page.addInitScript(() => {
        localStorage.setItem("manitec_sidebar_collapsed", "0");
        localStorage.setItem(
          "manitec_sidebar_sections",
          JSON.stringify({
            overview: true,
            crm: true,
            ops: true,
            finance: true,
          }),
        );
        localStorage.removeItem("manitec_sidebar_favorites");
      });
      await page.goto("/dashboard/proposals");
      const sidebar = sidebarFor(page);
      await expect(sidebar).toHaveAttribute("data-expanded", "false");
      await expect
        .poll(async () => (await sidebar.boundingBox())?.width)
        .toBe(80);
      await expect(
        sidebar.getByTitle("Expandir menu", { exact: true }),
      ).toHaveCount(0);
      await expect(
        sidebar.getByTitle("Minimizar menu", { exact: true }),
      ).toHaveCount(0);
      await checkHeaderAlignment(page);
      const logo = sidebar.getByRole("img", { name: "Manitec", exact: true });
      await expect(logo).toBeVisible();
      await logo.evaluate((image) => (image as HTMLImageElement).decode());
      if (width === 1366)
        await page.screenshot({
          path: "../runtime-logs/sidebar-collapsed-1366.png",
        });
      const mainBefore = await page.locator(".dashboard-main").boundingBox();
      const barBefore = await page.locator(".dashboard-topbar").boundingBox();
      await sidebar.hover({ position: { x: 35, y: 35 } });
      await expect(sidebar).toHaveAttribute("data-expanded", "true");
      await expect(sidebar.locator(".dashboard-sidebar-drawer")).toBeVisible();
      expect((await sidebar.boundingBox())?.width).toBe(80);
      expect(
        (await sidebar.locator(".dashboard-sidebar-drawer").boundingBox())
          ?.width,
      ).toBe(296);
      expect(await page.locator(".dashboard-main").boundingBox()).toEqual(
        mainBefore,
      );
      expect(await page.locator(".dashboard-topbar").boundingBox()).toEqual(
        barBefore,
      );
      await checkHeaderAlignment(page);
      const operations = sidebar.getByRole("button", {
        name: "Operação",
        exact: true,
      });
      const commercial = sidebar.getByRole("button", {
        name: "Comercial",
        exact: true,
      });
      await expect(commercial).toHaveAttribute("aria-expanded", "true");
      await expect(sidebar.getByRole("button", { expanded: true })).toHaveCount(
        1,
      );
      await operations.click();
      await expect(operations).toHaveAttribute("aria-expanded", "true");
      await expect(commercial).toHaveAttribute("aria-expanded", "false");
      await commercial.click();
      await expect(sidebar.getByRole("button", { expanded: true })).toHaveCount(
        1,
      );
      await expect(operations).toHaveAttribute("aria-expanded", "false");
      await commercial.click();
      await expect(sidebar.getByRole("button", { expanded: true })).toHaveCount(
        0,
      );
      await operations.click();
      await sidebar
        .locator('#sidebar-section-ops a[href="/dashboard/orders"]')
        .click();
      await expect(page).toHaveURL(new RegExp("/dashboard/orders$"));
      await expect(operations).toHaveAttribute("aria-expanded", "true");
      expect(
        await page
          .locator(".dashboard-main")
          .evaluate((el) => el.scrollWidth - el.clientWidth),
      ).toBeLessThanOrEqual(1);
      if (width !== 1024)
        await page.screenshot({
          path: "../runtime-logs/sidebar-expanded-" + width + ".png",
        });
      await page.mouse.move(width - 20, 220);
      await expect(sidebar).toHaveAttribute("data-expanded", "false");
      await expect
        .poll(async () => (await sidebar.boundingBox())?.width)
        .toBe(80);
      await expect(sidebar.getByRole("button", { expanded: true })).toHaveCount(
        0,
      );
      await checkHeaderAlignment(page);
    },
  );
}

test("menu lateral abre com teclado, respeita a sanfona e recolhe ao sair do foco", async ({
  page,
}) => {
  await page.mouse.move(1200, 220);
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/clients");
  const sidebar = sidebarFor(page);
  await expect(sidebar).toHaveAttribute("data-expanded", "false");
  await page.keyboard.press("Tab");
  await expect(
    sidebar.getByRole("link", { name: "Manitec — página inicial" }),
  ).toBeFocused();
  await expect(sidebar).toHaveAttribute("data-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(
    sidebar.getByRole("searchbox", { name: "Pesquisar no menu" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    sidebar.getByRole("button", { name: "Meu espa\u00e7o", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    sidebar.getByRole("button", { name: "Comercial", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(sidebar.getByRole("button", { expanded: true })).toHaveCount(1);
  await page
    .getByRole("link", { name: "Abrir meu perfil", exact: true })
    .focus();
  await expect(sidebar).toHaveAttribute("data-expanded", "false");
});

test("menu lateral continua acessivel em tablet sem mouse", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 900 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    await loginByApi(page, accounts.admin);
    await page.goto("/dashboard/proposals");
    const sidebar = sidebarFor(page);
    await expect(sidebar).toHaveAttribute("data-expanded", "true");
    await sidebar.getByRole("button", { name: "Operação", exact: true }).tap();
    await expect(
      sidebar.getByRole("button", { name: "Comercial", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    await sidebar
      .locator('#sidebar-section-ops a[href="/dashboard/orders"]')
      .tap();
    await expect(page).toHaveURL(new RegExp("/dashboard/orders$"));
    await checkHeaderAlignment(page);
  } finally {
    await context.close();
  }
});

test("menu lateral preserva as permissoes do tecnico", async ({ page }) => {
  await loginByApi(page, accounts.technician);
  await page.goto("/dashboard/tecnico");
  const sidebar = sidebarFor(page);
  await sidebar.hover({ position: { x: 35, y: 35 } });
  await expect(sidebar).toHaveAttribute("data-expanded", "true");
  await expect(
    sidebar.getByRole("button", { name: "Financeiro", exact: true }),
  ).toHaveCount(0);
  await expect(
    sidebar.locator('a[href="/dashboard/management/users"]'),
  ).toHaveCount(0);
  await expect(
    sidebar.getByRole("button", { name: "Operação", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await sidebar
    .locator('#sidebar-section-ops a[href="/dashboard/tecnico"]')
    .click();
  await expect(page).toHaveURL(new RegExp("/dashboard/tecnico$"));
});

test("menu lateral preserva a pagina e os elementos durante aberturas repetidas", async ({
  page,
}) => {
  await page.mouse.move(1200, 220);
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/proposals/new");
  const sidebar = sidebarFor(page);
  const drawer = sidebar.locator(".dashboard-sidebar-drawer");
  const originalButton = await drawer
    .getByRole("button", {
      name: "Comercial",
      exact: true,
      includeHidden: true,
    })
    .elementHandle();
  const originalLogo = await sidebar
    .getByRole("img", { name: "Manitec", exact: true })
    .elementHandle();
  const main = page.locator(".dashboard-main");
  const originalBounds = await main.boundingBox();
  const dock = page.locator(".proposal-finance-dock");
  await expect(dock).toBeVisible();
  const dockBounds = await dock.boundingBox();
  const samplesPromise = page.evaluate(async () => {
    const main = document.querySelector(".dashboard-main")!;
    const rows: Array<{ left: number; width: number }> = [];
    const startedAt = performance.now();
    await new Promise<void>((resolve) => {
      function sample() {
        const rect = main.getBoundingClientRect();
        rows.push({ left: rect.left, width: rect.width });
        if (performance.now() - startedAt < 1200) requestAnimationFrame(sample);
        else resolve();
      }
      requestAnimationFrame(sample);
    });
    return rows;
  });
  for (let cycle = 0; cycle < 4; cycle++) {
    await sidebar.hover({ position: { x: 35, y: 35 } });
    await expect(sidebar).toHaveAttribute("data-expanded", "true");
    await expect(
      drawer.getByRole("button", { name: "Comercial", exact: true }),
    ).toBeVisible();
    await page.mouse.move(1200, 220);
    await expect(sidebar).toHaveAttribute("data-expanded", "false");
  }
  const samples = await samplesPromise;
  expect(samples.length).toBeGreaterThan(1);
  for (const sample of samples) {
    expect(sample.left).toBe(originalBounds!.x);
    expect(sample.width).toBe(originalBounds!.width);
  }
  expect(await originalButton!.evaluate((el) => el.isConnected)).toBe(true);
  expect(await originalLogo!.evaluate((el) => el.isConnected)).toBe(true);
  expect(await dock.boundingBox()).toEqual(dockBounds);
  const transition = await drawer.evaluate(
    (el) => getComputedStyle(el).transitionProperty,
  );
  expect(transition).toContain("transform");
  expect(transition).not.toContain("width");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await drawer.evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
});
