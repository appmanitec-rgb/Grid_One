import { expect, test, type Page } from "@playwright/test";
import { loginByApi, loginByUi } from "./helpers/auth";
import { accounts, API_BASE_URL } from "./helpers/test-data";

test.beforeAll(() => {
  if (new URL(API_BASE_URL).port !== "3100")
    throw new Error("Os testes visuais exigem a base isolada na porta 3100.");
});
async function appearance(page: Page) {
  await page.getByRole("button", { name: "Tema", exact: true }).click();
  return page.getByRole("dialog", { name: "Aparência", exact: true });
}
async function assertDarkContrast(target: ReturnType<Page["locator"]>) {
  const colors = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    const luminance = (color: string) => {
      const channels = (color.match(/[0-9.]+/g) || [])
        .slice(0, 3)
        .map(Number)
        .map((n) => {
          const v = n / 255;
          return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    let surface: Element | null = element;
    let background = style.backgroundColor;
    while (
      surface &&
      (background === "rgba(0, 0, 0, 0)" || background === "transparent")
    ) {
      surface = surface.parentElement;
      if (surface) background = getComputedStyle(surface).backgroundColor;
    }
    const bg = luminance(background),
      fg = luminance(style.color);
    return { bg, ratio: (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05) };
  });
  expect(colors.bg).toBeLessThan(0.15);
  expect(colors.ratio).toBeGreaterThanOrEqual(4.5);
}
test("quatro paletas escuras preservam o formulário e a preferência do usuário", async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/clients/new");
  const company = page.locator("input[required]").first();
  await company.fill("Rascunho visual sem gravar");
  const panel = await appearance(page);
  await panel.getByRole("button", { name: "Escuro", exact: true }).click();
  for (const [label, id] of [
    ["Neblina", "mist"],
    ["Marfim", "linen"],
    ["Mineral", "sage"],
    ["Grafite", "slate"],
  ]) {
    await panel.getByRole("button", { name: new RegExp(label) }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-manitec-theme",
      id,
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-manitec-mode",
      "dark",
    );
    await expect(company).toHaveValue("Rascunho visual sem gravar");
    await assertDarkContrast(company);
  }
  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  const uf = page.getByRole("combobox", { name: "UF", exact: true }).last();
  await uf.fill("SP");
  const results = page.getByRole("listbox", { name: "Resultados da pesquisa" });
  const searchPopup = results.locator("..");
  await expect(searchPopup).toBeVisible();
  await assertDarkContrast(searchPopup);
  expect(await results.getByRole("option").count()).toBeLessThanOrEqual(10);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-manitec-mode",
    "dark",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-manitec-theme",
    "slate",
  );
  await page.screenshot({
    path: info.outputPath("grafite-escuro-formulario.png"),
    fullPage: false,
  });
  const again = await appearance(page);
  await again.getByRole("button", { name: "Claro", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-manitec-mode",
    "light",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-manitec-theme",
    "slate",
  );
});
test("telas, tabelas e resumo do cliente usam superfícies escuras legíveis", async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/clients");
  const panel = await appearance(page);
  await panel.getByRole("button", { name: "Escuro", exact: true }).click();
  await panel.getByRole("button", { name: /Neblina/ }).click();
  await page.keyboard.press("Escape");
  for (const route of [
    "/dashboard/proposals",
    "/dashboard/orders",
    "/dashboard/equipments",
    "/dashboard/catalog",
    "/dashboard/finance/accounts-receivable",
    "/dashboard/hr/collaborators",
  ]) {
    await page.goto(route);
    await expect(page.locator(".dashboard-page-header h1")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "data-manitec-mode",
      "dark",
    );
    const header = page.locator(".dashboard-page-header");
    expect(
      await header.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).not.toBe("rgb(255, 255, 255)");
    const overflow = await page
      .locator(".dashboard-main")
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow, route).toBeLessThanOrEqual(1);
    if (route.endsWith("proposals"))
      await page.screenshot({
        path: info.outputPath("neblina-escuro-propostas.png"),
        fullPage: false,
      });
  }
  await page.goto("/dashboard/clients");
  await page
    .getByTitle("Abrir resumo do cliente", { exact: true })
    .first()
    .click();
  const summary = page.getByRole("dialog", { name: /Resumo do cliente/ });
  await expect(summary).toBeVisible();
  await assertDarkContrast(
    summary.getByLabel("Empresa / nome", { exact: false }),
  );
  await page.screenshot({
    path: info.outputPath("resumo-cliente-escuro.png"),
    fullPage: false,
  });
});
test("seletor funciona no celular e o tema não altera impressão nem a tela de entrada", async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginByUi(page, accounts.admin);
  await page.goto("/dashboard/proposals");
  const panel = await appearance(page);
  await panel.getByRole("button", { name: "Escuro", exact: true }).click();
  const bounds = await panel.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: info.outputPath("seletor-escuro-celular.png"),
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Tema", exact: true }),
  ).toBeFocused();
  await page.emulateMedia({ media: "print" });
  expect(
    await page
      .locator(".dashboard-page-header")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(255, 255, 255)");
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.locator(".dashboard-sidebar").hover();
  await page
    .getByRole("button", { name: "Encerrar sessão", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-manitec-mode",
    "dark",
  );
});
