import { expect, test, type Page } from "@playwright/test";

const sidebarFor = (page: Page) =>
  page.getByRole("complementary", { name: "Navegação principal", exact: true });

async function fixture(page: Page, role = "ADMIN") {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    let data: unknown = [],
      status = 200;
    if (path.endsWith("/page"))
      data = { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
    else if (path === "/auth/me")
      data = { id: "sidebar-fixture", role, name: "Validação de navegação" };
    else if (path === "/notifications/inbox")
      data = {
        userRole: role,
        summary: { total: 0, actionRequired: 0, highPriority: 0 },
        items: [],
      };
    else if (path === "/proposals")
      data = [
        { id: "approval-a", status: "BOARD_REVIEW" },
        { id: "approval-b", status: "DISCOUNT_REVIEW" },
      ];
    else if (path === "/maintenance-orders")
      data = [
        { id: "order-a", status: "OPEN" },
        { id: "order-b", status: "IN_PROGRESS" },
      ];
    else if (path === "/contracts")
      data = [{ id: "contract-a", status: "SUSPENDED" }];
    else if (path === "/team/channels")
      data = [{ id: "team-a", unreadCount: 3 }];
    else if (path === "/proposals/editor/context")
      data = {
        enabled: true,
        unrestricted: true,
        discountLimit: 100,
        expenseRules: [],
      };
    else if (path.startsWith("/proposals/editor/drafts/")) {
      if (route.request().method() === "PUT")
        data = {
          id: path.split("/").at(-1),
          revision: 1,
          updatedAt: new Date().toISOString(),
          formData: route.request().postDataJSON().formData,
        };
      else {
        status = 404;
        data = { message: "Rascunho ainda não salvo." };
      }
    } else if (path === "/proposals/pricing-options")
      data = { hourTypes: [], technicianTypes: [], rates: [] };
    await route.fulfill({ status, json: data });
  });
  await page.addInitScript((role) => {
    const sub =
      localStorage.getItem("sidebar_fixture_user") || "sidebar-fixture-a";
    const payload = btoa(
      JSON.stringify({ sub, role, exp: Math.floor(Date.now() / 1000) + 3600 }),
    );
    localStorage.setItem("manitec_token", "fixture." + payload + ".signature");
    localStorage.setItem(
      "manitec_user",
      JSON.stringify({ id: sub, role, name: "Validação de navegação" }),
    );
  }, role);
}

async function alignment(page: Page) {
  const brand = await page.locator(".dashboard-sidebar-brand").boundingBox(),
    bar = await page.locator(".dashboard-topbar").boundingBox();
  expect(brand!.height).toBe(72);
  expect(bar!.height).toBe(72);
  expect(brand!.y).toBe(bar!.y);
  const side = await sidebarFor(page).boundingBox(),
    main = await page.locator(".dashboard-main").boundingBox();
  expect(main!.x).toBeGreaterThanOrEqual(side!.x + side!.width);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
}

for (const width of [1366, 1024, 768]) {
  test(`manual navigation opens without covering content and keeps one department open at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page);
    await page.goto("/dashboard/clients");
    const sidebar = sidebarFor(page);
    await expect(sidebar).toHaveAttribute("data-expanded", "false");
    await sidebar.hover();
    await expect(sidebar).toHaveAttribute("data-expanded", "false");
    await sidebar
      .getByRole("button", { name: "Abrir menu lateral", exact: true })
      .click();
    await expect(sidebar).toHaveAttribute("data-expanded", "true");
    await alignment(page);
    const logo = await sidebar
      .getByRole("img", { name: "Manitec Grupos Geradores", exact: true })
      .boundingBox();
    expect(logo!.width).toBeGreaterThan(100);
    const commercial = sidebar.getByRole("button", {
        name: "Comercial",
        exact: true,
      }),
      operations = sidebar.getByRole("button", {
        name: "Operação",
        exact: true,
      });
    await expect(commercial).toHaveAttribute("aria-expanded", "true");
    await operations.click();
    await expect(operations).toHaveAttribute("aria-expanded", "true");
    await expect(commercial).toHaveAttribute("aria-expanded", "false");
    await expect(
      sidebar.locator(
        'button[aria-controls^="sidebar-section-"][aria-expanded="true"]',
      ),
    ).toHaveCount(1);
    await page.mouse.move(width - 20, 220);
    await expect(sidebar).toHaveAttribute("data-expanded", "true");
    await sidebar
      .getByRole("button", { name: "Recolher menu lateral", exact: true })
      .click();
    await expect(sidebar).toHaveAttribute("data-expanded", "false");
    await alignment(page);
    await sidebar
      .getByRole("button", { name: "Abrir menu lateral", exact: true })
      .click();
    await sidebar
      .getByRole("button", { name: "Suprimentos", exact: true })
      .click();
    await sidebar
      .locator('#sidebar-section-supplies a[href="/dashboard/suppliers"]')
      .click();
    await expect(page).toHaveURL(/\/dashboard\/suppliers(?:\?|$)/);
    await expect(sidebar).toHaveAttribute("data-expanded", "false");
  });
}

test("pin preference survives reload and navigation and belongs to the current user", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/dashboard/clients");
  const sidebar = sidebarFor(page);
  await sidebar
    .getByRole("button", { name: "Abrir menu lateral", exact: true })
    .click();
  await sidebar
    .getByRole("button", { name: "Fixar menu lateral", exact: true })
    .click();
  await page.reload();
  await expect(sidebar).toHaveAttribute("data-pinned", "true");
  await sidebar
    .getByRole("button", { name: "Suprimentos", exact: true })
    .click();
  await sidebar
    .locator('#sidebar-section-supplies a[href="/dashboard/suppliers"]')
    .click();
  await expect(page).toHaveURL(/\/dashboard\/suppliers(?:\?|$)/);
  await expect(sidebar).toHaveAttribute("data-expanded", "true");
  await page.evaluate(() =>
    localStorage.setItem("sidebar_fixture_user", "sidebar-fixture-b"),
  );
  await page.reload();
  await expect(sidebar).toHaveAttribute("data-expanded", "false");
  await page.evaluate(() =>
    localStorage.setItem("sidebar_fixture_user", "sidebar-fixture-a"),
  );
  await page.reload();
  await expect(sidebar).toHaveAttribute("data-pinned", "true");
  await sidebar
    .getByRole("button", { name: "Recolher menu lateral", exact: true })
    .click();
  await page.reload();
  await expect(sidebar).toHaveAttribute("data-expanded", "false");
});

test("keyboard opens explicitly, clears search with Escape and returns focus when closed", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/dashboard/clients");
  const sidebar = sidebarFor(page),
    open = sidebar.getByRole("button", {
      name: "Abrir menu lateral",
      exact: true,
    });
  await open.focus();
  await expect(sidebar).toHaveAttribute("data-expanded", "false");
  await page.keyboard.press("Enter");
  const search = sidebar.getByRole("searchbox", {
    name: "Pesquisar no menu",
    exact: true,
  });
  await expect(search).toBeFocused();
  await search.fill("proposta");
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
  await expect(sidebar).toHaveAttribute("data-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(sidebar).toHaveAttribute("data-expanded", "false");
  await expect(open).toBeFocused();
  await page.keyboard.press("Enter");
  await sidebar
    .getByRole("button", { name: "Fixar menu lateral", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(sidebar).toHaveAttribute("data-pinned", "true");
});

test("favorites, search limit and actionable counters preserve their meaning", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/dashboard/clients");
  const sidebar = sidebarFor(page);
  await sidebar
    .getByRole("button", { name: "Abrir menu lateral", exact: true })
    .click();
  await expect(
    sidebar.getByRole("button", { name: "Comercial", exact: true }),
  ).toHaveAttribute("title", /2 propostas aguardando aprovação/);
  await expect(
    sidebar.getByRole("button", { name: "Contratos", exact: true }),
  ).toHaveAttribute("title", /1 contrato que exige atenção/);
  await expect(sidebar.getByText("6", { exact: true })).toHaveCount(0);
  await sidebar
    .getByRole("button", {
      name: "Adicionar aos favoritos: Clientes",
      exact: true,
    })
    .click();
  await expect(
    sidebar.locator('.dashboard-nav-favorites a[href="/dashboard/clients"]'),
  ).toBeVisible();
  const search = sidebar.getByRole("searchbox", {
    name: "Pesquisar no menu",
    exact: true,
  });
  await search.fill("financeiro");
  await expect(
    sidebar
      .getByRole("navigation", { name: "Áreas e rotinas", exact: true })
      .getByRole("link"),
  ).toHaveCount(10);
  await expect(sidebar.getByText(/Mostrando 10/)).toBeVisible();
  await search.fill("QA-SEM-RESULTADO");
  await expect(
    sidebar.getByText("Nenhuma rotina encontrada.", { exact: true }),
  ).toBeVisible();
});

test("tablet navigation works by tap without a hover state", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 900 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    await fixture(page);
    await page.goto("/dashboard/clients");
    const sidebar = sidebarFor(page);
    await expect(sidebar).toHaveAttribute("data-expanded", "false");
    await sidebar
      .getByRole("button", { name: "Abrir menu lateral", exact: true })
      .tap();
    await sidebar.getByRole("button", { name: "Operação", exact: true }).tap();
    await expect(
      sidebar.getByRole("button", { name: "Comercial", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    await alignment(page);
  } finally {
    await context.close();
  }
});

test("restricted technician menus remain absent including search results", async ({
  page,
}) => {
  await fixture(page, "TECHNICIAN");
  await page.goto("/dashboard/clients");
  const sidebar = sidebarFor(page);
  await sidebar
    .getByRole("button", { name: "Abrir menu lateral", exact: true })
    .click();
  for (const name of [
    "Financeiro",
    "Recursos Humanos",
    "Administração",
    "Manitec Studio",
    "Contratos",
  ])
    await expect(
      sidebar.getByRole("button", { name, exact: true }),
    ).toHaveCount(0);
  await sidebar
    .getByRole("searchbox", { name: "Pesquisar no menu", exact: true })
    .fill("financeiro");
  await expect(
    sidebar.getByText("Nenhuma rotina encontrada.", { exact: true }),
  ).toBeVisible();
});

test("opening and closing never remounts or clears the proposal in progress", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/dashboard/proposals/new");
  const sidebar = sidebarFor(page),
    field = page.locator("#proposal-review-client");
  await field.fill("Cliente em seleção — manter edição");
  const original = await field.elementHandle();
  for (let i = 0; i < 4; i++) {
    await sidebar
      .getByRole("button", { name: "Abrir menu lateral", exact: true })
      .click();
    await alignment(page);
    await field.click();
    await expect(sidebar).toHaveAttribute("data-expanded", "true");
    await expect(field).toBeFocused();
    await sidebar
      .getByRole("button", { name: "Recolher menu lateral", exact: true })
      .click();
  }
  await expect(field).toHaveValue("Cliente em seleção — manter edição");
  expect(await original!.evaluate((e) => e.isConnected)).toBe(true);
  await expect(
    page.getByRole("region", {
      name: "Resumo financeiro da proposta",
      exact: true,
    }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await sidebar
    .getByRole("button", { name: "Abrir menu lateral", exact: true })
    .click();
  expect(
    await sidebar
      .locator(".dashboard-sidebar-drawer")
      .evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe("0s");
});

test("mobile keeps searchable department navigation with the same permission filters", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.goto("/dashboard/clients");
  await expect(sidebarFor(page)).toBeHidden();
  await page
    .getByRole("button", { name: "Abrir todos os menus", exact: true })
    .click();
  const menu = page.getByRole("dialog", {
    name: "Áreas e rotinas",
    exact: true,
  });
  await expect(menu).toBeVisible();
  await menu
    .getByLabel("Pesquisar menus", { exact: true })
    .fill("almoxarifado");
  await expect(
    menu.getByRole("link", { name: /Recebimento e separação/ }),
  ).toBeVisible();
  await menu.getByRole("button", { name: "Fechar menu", exact: true }).click();
  await expect(menu).toBeHidden();
});
