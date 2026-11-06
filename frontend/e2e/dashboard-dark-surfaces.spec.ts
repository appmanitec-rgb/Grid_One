import { expect, test, type Page } from "@playwright/test";
import { loginByApi } from "./helpers/auth";
import { accounts, API_BASE_URL } from "./helpers/test-data";

test.beforeAll(() => {
  if (new URL(API_BASE_URL).port !== "3100")
    throw new Error("Exige a base isolada na porta 3100.");
});
async function setDark(page: Page) {
  await page.getByRole("button", { name: "Tema", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Aparência" });
  await dialog.getByRole("button", { name: "Escuro", exact: true }).click();
  await dialog.getByRole("button", { name: /Grafite/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveAttribute(
    "data-manitec-mode",
    "dark",
  );
}
async function settled(page: Page) {
  await expect(page.locator(".dashboard-page-header h1")).toBeVisible();
  await expect(page.locator('.dashboard-main [aria-busy="true"]')).toHaveCount(
    0,
    { timeout: 60_000 },
  );
  await expect(
    page
      .locator(".dashboard-main")
      .getByText(/^(Carregando|Atualizando|Buscando)(?:\.\.\.| .*|\u2026)$/),
  ).toHaveCount(0, { timeout: 60_000 });
}
async function inspectSurfaces(page: Page, contrastWithin?: string) {
  return page.evaluate(
    ({ contrastWithin }) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      const cache = new Map<string, number[]>();
      const rgba = (value: string) => {
        if (!cache.has(value)) {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = value;
          ctx.fillRect(0, 0, 1, 1);
          cache.set(value, Array.from(ctx.getImageData(0, 0, 1, 1).data));
        }
        return cache.get(value)!;
      };
      const lum = (c: number[]) => {
        const v = c
          .slice(0, 3)
          .map((n) => n / 255)
          .map((n) =>
            n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4,
          );
        return v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;
      };
      const paints = (element: Element) => {
        const s = getComputedStyle(element);
        const colors = [rgba(s.backgroundColor)];
        if (s.backgroundImage !== "none") {
          for (const match of s.backgroundImage.matchAll(
            /(?:rgba?|color|oklch|lab|lch|hsla?)\([^)]*\)/g,
          ))
            colors.push(rgba(match[0]));
        }
        return colors.filter((c) => c[3] > 215);
      };
      const visible = (el: Element) => {
        const rect = el.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          getComputedStyle(el).visibility !== "hidden" &&
          !el.closest(
            ".document-print-page,[data-theme-preserve],svg,iframe,canvas",
          )
        );
      };
      const label = (el: Element) =>
        el.tagName.toLowerCase() +
        "." +
        String(el.className).slice(0, 75) +
        " " +
        (el.textContent || "").trim().slice(0, 65);
      const bright = Array.from(
        document.querySelectorAll(
          ".dashboard-main :is(section,article,div,table,thead,th,td,a,button)",
        ),
      )
        .filter((el) => {
          if (!visible(el)) return false;
          const r = el.getBoundingClientRect();
          return (
            r.width >= 70 &&
            r.height >= 30 &&
            paints(el).some((c) => lum(c) > 0.65)
          );
        })
        .slice(0, 15)
        .map(label);
      const contrast: Array<{ element: string; ratio: number }> = [];
      if (contrastWithin) {
        for (const el of Array.from(
          document.querySelectorAll(
            `:is(${contrastWithin}) :is(p,span,strong,h2,h3,small,a,th,td,dt,dd)`,
          ),
        )) {
          if (
            !visible(el) ||
            el.closest(':disabled,[aria-disabled="true"]') ||
            !Array.from(el.childNodes).some(
              (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
            )
          )
            continue;
          let parent: Element | null = el,
            background: number[][] = [];
          while (parent && !background.length) {
            background = paints(parent);
            parent = parent.parentElement;
          }
          if (!background.length) continue;
          const fg = lum(rgba(getComputedStyle(el).color));
          const ratio = Math.min(
            ...background.map(
              (bg) =>
                (Math.max(fg, lum(bg)) + 0.05) / (Math.min(fg, lum(bg)) + 0.05),
            ),
          );
          if (ratio < 4.5)
            contrast.push({
              element: label(el),
              ratio: Math.round(ratio * 100) / 100,
            });
        }
      }
      return { bright, contrast: contrast.slice(0, 15) };
    },
    { contrastWithin },
  );
}
async function expectDark(page: Page, contrastWithin?: string) {
  const result = await inspectSurfaces(page, contrastWithin);
  expect(result.bright, "Superfícies claras indevidas").toEqual([]);
  expect(result.contrast, "Textos sem contraste").toEqual([]);
}

test("processos expandidos e todas as colunas do Kanban acompanham o tema", async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard");
  await setDark(page);
  await settled(page);
  const processes = page.locator(".dashboard-section-card").filter({
    has: page.getByRole("heading", {
      name: "Caminhos de ponta a ponta",
      exact: true,
    }),
  });
  const expand = processes.getByRole("button", { name: /Expandir/ });
  if (await expand.isVisible()) await expand.click();
  await expect(
    processes.getByRole("link", { name: /Venda avulsa/ }),
  ).toBeVisible();
  const allStages = page.getByRole("button", {
    name: "Mostrar todas as etapas",
    exact: true,
  });
  if (await allStages.isVisible()) await allStages.click();
  await expect(page.locator(".dashboard-kanban-column")).toHaveCount(9);
  const columns = page.locator(".dashboard-kanban-column");
  for (const column of await columns.all()) {
    expect((await column.boundingBox())!.width).toBeGreaterThanOrEqual(292);
  }
  const track = page.locator("[data-kanban-track]");
  await page.getByRole("button", { name: "Rolar kanban para a direita" }).click();
  await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await track.evaluate((el) => { el.scrollLeft = 0; });

  await expectDark(page, ".dashboard-tinted-surface");
  await processes.screenshot({
    path: info.outputPath("processos-escuros.png"),
  });
  await page
    .locator(".dashboard-kanban-shell")
    .screenshot({ path: info.outputPath("kanban-escuro.png") });
  await page.getByRole("button", { name: "Tema", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Aparência" })
    .getByRole("button", { name: "Claro", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-manitec-mode",
    "light",
  );
  await expect(
    processes.locator(".dashboard-tinted-surface").first(),
  ).toHaveCSS("background-image", /rgb\(255, 255, 255\)/);
});

test("atendimento mantém contraste nas métricas, lista, quadro, conversa e celular", async ({
  page,
}, info) => {
  test.setTimeout(300_000);
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/atendimento");
  await setDark(page);
  await settled(page);
  // This named section is not an ARIA landmark when implemented without role=region.
  const metricSection = page.locator(
    'section[aria-label="Visão geral dos chamados"]',
  );
  await expect(metricSection.getByRole("button")).toHaveCount(6);
  await expect(page.getByRole("table")).toBeVisible();
  await expectDark(
    page,
    'section[aria-label="Visão geral dos chamados"],table',
  );
  await page.screenshot({
    path: info.outputPath("atendimento-lista-escura.png"),
    fullPage: false,
  });
  await page.getByRole("button", { name: "Quadro", exact: true }).click();
  await expect(page.locator("[data-stage]")).toHaveCount(6);
  await expectDark(page, "[data-stage]");
  await page.getByRole("link", { name: /^TCK-/ }).first().click();
  await settled(page);
  await expect(
    page.getByRole("button", { name: "Nota interna", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nota interna", exact: true }).click();
  await expectDark(page, 'section[aria-label="Conversa e acompanhamento"]');
  await page.screenshot({
    path: info.outputPath("atendimento-conversa-escura.png"),
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/atendimento");
  await settled(page);
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await expectDark(page, 'section[aria-label="Visão geral dos chamados"]');
  await page.screenshot({
    path: info.outputPath("atendimento-escuro-celular.png"),
    fullPage: false,
  });
});

test("alertas e demais áreas não exibem painéis claros no modo escuro", async ({
  page,
}, info) => {
  test.setTimeout(480_000);
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/notifications");
  await setDark(page);
  for (const route of [
    "/dashboard/notifications",
    "/dashboard/team",
    "/dashboard/dispatch",
    "/dashboard/automation",
    "/dashboard/proposals",
    "/dashboard/finance/accounts-receivable",
    "/dashboard/finance/accounts-payable",
    "/dashboard/opportunities",
    "/dashboard/contracts",
  ]) {
    await test.step(route, async () => {
      await page.goto(route);
      await settled(page);
      await expectDark(page, ".dashboard-tinted-surface");
      if (route.endsWith("notifications"))
        await page.screenshot({
          path: info.outputPath("alertas-escuros.png"),
          fullPage: false,
        });
    });
  }
});
