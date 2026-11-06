import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
type Fixture = {
  userId: string;
  viewerUserId: string;
  warehouse: { id: string; code: string; name: string };
  locationId: string;
  emptyLocationId: string;
  balanceId: string;
  oilBalanceId: string;
  itemId: string;
  clientId: string;
  reservationId: string;
};
let fixture: Fixture;
const fixtureFile = process.env.E2E_WAREHOUSE_FIXTURE;
const output =
  process.env.E2E_WAREHOUSE_OUTPUT ||
  path.resolve("../runtime-logs/warehouse-qr-20261106/screens");
const api = "http://127.0.0.1:3006";
async function authenticated(page: Page, mode = "light", viewer = false) {
  const token = viewer
    ? process.env.E2E_WAREHOUSE_VIEW_TOKEN
    : process.env.E2E_WAREHOUSE_TOKEN;
  await page.context().addInitScript(
    ({ token, id, mode, viewer }) => {
      if (window !== window.top) return;
      localStorage.setItem("manitec_token", token!);
      localStorage.setItem(
        "manitec_user",
        JSON.stringify({
          id,
          name: viewer
            ? "Consulta do almoxarifado"
            : "Validador do almoxarifado",
          role: viewer ? "NORMAL" : "ADMIN",
        }),
      );
      localStorage.setItem("manitec_dashboard_mode:" + id, mode);
      localStorage.setItem("manitec_dashboard_theme:" + id, "mist");
    },
    { token, id: viewer ? fixture.viewerUserId : fixture.userId, mode, viewer },
  );
}
async function selectWarehouse(page: Page) {
  const picker = page.getByRole("combobox", { name: /Almoxarifado/ });
  if ((await picker.evaluate((x) => x.tagName)) === "SELECT")
    await picker.selectOption(fixture.warehouse.id);
  else {
    await picker.fill(fixture.warehouse.code);
    await page
      .getByRole("option", { name: new RegExp(fixture.warehouse.code) })
      .click();
  }
}
function filterCard(page: Page) {
  return page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "Filtro de óleo — validação QR",
      exact: true,
    }),
  });
}
async function stock() {
  const response = await fetch(
    api + "/inventory/locations/" + fixture.locationId + "/items",
    { headers: { Authorization: "Bearer " + process.env.E2E_WAREHOUSE_TOKEN } },
  );
  expect(response.ok).toBeTruthy();
  return (await response.json()).items.find(
    (x: { id: string }) => x.id === fixture.balanceId,
  );
}
test.describe("warehouse QR: real isolated flow", () => {
  test.skip(
    !fixtureFile,
    "Requires the explicitly isolated warehouse fixture; never use the principal database.",
  );
  test.beforeAll(async () => {
    expect(process.env.E2E_BASE_URL).toBe("http://127.0.0.1:3004");
    expect(process.env.E2E_API_URL).toBe(api);
    expect(process.env.E2E_SKIP_WEBSERVER).toBe("1");
    expect(process.env.E2E_WAREHOUSE_TOKEN).toBeTruthy();
    fixture = JSON.parse(fs.readFileSync(fixtureFile!, "utf8"));
    expect((await (await fetch(api + "/health")).json()).environment).toBe(
      "test",
    );
    fs.mkdirSync(output, { recursive: true });
  });
  for (const width of [1366, 390])
    for (const mode of ["light", "dark"])
      test(`position board and details at ${width}px ${mode}`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 900,
        });
        await authenticated(page, mode);
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto("/dashboard/inventory/locations");
        await selectWarehouse(page);
        await expect(page.getByRole("link", { name: /A-01-02/ })).toBeVisible();
        await page.screenshot({
          path: path.join(output, `mapa-${mode}-${width}.png`),
        });
        await page.goto("/dashboard/inventory/locations/" + fixture.locationId);
        await expect(filterCard(page)).toBeVisible();
        await page.screenshot({
          path: path.join(output, `posicao-${mode}-${width}.png`),
        });
        for (const tab of [
          "Reservas de clientes",
          "Demandas",
          "Histórico",
          "Itens da posição",
        ]) {
          await page.getByRole("button", { name: tab, exact: true }).click();
          await expect(
            page.getByRole("heading", { name: tab, exact: true }),
          ).toBeVisible();
          await expect(page.locator("main")).not.toContainText(
            "Algo deu errado",
          );
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
        expect(errors).toEqual([]);
      });
  test("count keeps input after a dropped response and retry changes stock exactly once", async ({
    page,
  }) => {
    await authenticated(page);
    await page.goto("/dashboard/inventory/locations/" + fixture.locationId);
    await expect(filterCard(page)).toBeVisible();
    const before = await stock(),
      target = before.physicalQty - 1;
    let first = true;
    const keys: string[] = [];
    await page.route("**/api/inventory/locations/*/count", async (route) => {
      keys.push(route.request().postDataJSON().requestKey);
      if (first) {
        first = false;
        const response = await route.fetch();
        expect(response.ok()).toBeTruthy();
        await route.abort("failed");
      } else await route.continue();
    });
    await filterCard(page)
      .getByRole("button", { name: "Conferir contagem" })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { name: /Quantidade contada/ })
      .fill(String(target));
    await dialog
      .getByRole("textbox", { name: /Motivo obrigatório/ })
      .fill("Conferência com resposta interrompida");
    await dialog
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(
      dialog.getByRole("textbox", { name: /Quantidade contada/ }),
    ).toHaveValue(String(target));
    await dialog
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect((await stock()).physicalQty).toBe(target);
  });
  test("a competing adjustment blocks an old count and keeps its typed values", async ({
    page,
  }) => {
    await authenticated(page);
    await page.goto("/dashboard/inventory/locations/" + fixture.locationId);
    await expect(filterCard(page)).toBeVisible();
    await filterCard(page)
      .getByRole("button", { name: "Conferir contagem" })
      .click();
    const dialog = page.getByRole("dialog"),
      before = await stock();
    await dialog
      .getByRole("textbox", { name: /Quantidade contada/ })
      .fill(String(before.physicalQty));
    const update = await fetch(
      api + "/inventory/locations/" + fixture.locationId + "/count",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.E2E_WAREHOUSE_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestKey: crypto.randomUUID(),
          balanceId: fixture.balanceId,
          expectedState: before.expectedState,
          countedQty: before.physicalQty + 1,
          reason: "Contagem concorrente de validação",
        }),
      },
    );
    expect(update.ok).toBeTruthy();
    await dialog
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText("mudou");
    await expect(
      dialog.getByRole("textbox", { name: /Quantidade contada/ }),
    ).toHaveValue(String(before.physicalQty));
    expect((await stock()).physicalQty).toBe(before.physicalQty + 1);
  });
  test("searchable client selection works inside the native dialog and Escape only closes results", async ({
    page,
  }) => {
    await authenticated(page);
    await page.goto("/dashboard/inventory/locations/" + fixture.locationId);
    await expect(filterCard(page)).toBeVisible();
    await filterCard(page)
      .getByRole("button", { name: "Reservar para cliente" })
      .click();
    const dialog = page.getByRole("dialog"),
      picker = dialog.getByRole("combobox", { name: "Cliente", exact: true });
    await picker.fill("Cliente de validação");
    await expect(dialog.getByRole("option").first()).toBeVisible();
    expect(await dialog.getByRole("option").count()).toBeLessThanOrEqual(10);
    await picker.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("listbox")).not.toBeVisible();
    await picker.fill("Cliente de validação");
    await dialog.getByRole("option").first().click();
    await expect(picker).not.toHaveValue("");
    await dialog.getByRole("textbox", { name: /Quantidade/ }).fill("1");
    await page.screenshot({
      path: path.join(output, "reserva-pesquisavel.png"),
    });
    await dialog
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
  });
  test("operator creates and edits a position, protects a draft and moves all stock back safely", async ({
    page,
  }) => {
    await authenticated(page);
    await page.goto("/dashboard/inventory/locations");
    await selectWarehouse(page);
    await page
      .getByRole("button", { name: "Nova posição", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const warehousePicker = dialog.getByRole("combobox", {
      name: "Almoxarifado",
      exact: true,
    });
    if ((await warehousePicker.evaluate((x) => x.tagName)) === "SELECT")
      await warehousePicker.selectOption(fixture.warehouse.id);
    else {
      await warehousePicker.fill(fixture.warehouse.code);
      await dialog
        .getByRole("option", { name: new RegExp(fixture.warehouse.code) })
        .click();
    }
    const code = "C-UI-" + Date.now().toString(36).toUpperCase();
    await dialog
      .getByRole("textbox", { name: "Código da posição", exact: true })
      .fill(code);
    await dialog
      .getByRole("textbox", { name: "Descrição", exact: true })
      .fill("Óleos de manutenção");
    await dialog
      .getByRole("textbox", { name: "Descrição", exact: true })
      .press("Escape");
    await expect(
      dialog.getByRole("heading", { name: "Descartar os dados desta janela?" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Continuar editando" }).click();
    await expect(
      dialog.getByRole("textbox", { name: "Código da posição", exact: true }),
    ).toHaveValue(code);
    await dialog
      .getByRole("button", { name: "Salvar posição", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: code, exact: true }),
    ).toBeVisible();
    const targetUrl = page.url();
    await page
      .getByRole("button", { name: "Editar posição", exact: true })
      .click();
    await dialog
      .getByRole("textbox", { name: "Descrição", exact: true })
      .fill("Óleos conferidos");
    await dialog
      .getByRole("button", { name: "Salvar posição", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByText("Óleos conferidos", { exact: true }),
    ).toBeVisible();
    const oilCard = () =>
      page
        .locator("article")
        .filter({
          has: page.getByRole("heading", {
            name: "Óleo lubrificante 15W40 — validação QR",
            exact: true,
          }),
        });
    const move = async (to: string) => {
      await oilCard()
        .getByRole("button", { name: "Mover posição", exact: true })
        .click();
      await dialog
        .getByRole("combobox", { name: "Posição de destino", exact: true })
        .fill(to);
      await dialog.getByRole("option").filter({ hasText: to }).first().click();
      await dialog
        .getByRole("textbox", { name: "Motivo obrigatório", exact: true })
        .fill("Organização de prateleira de validação");
      await dialog
        .getByRole("button", { name: "Confirmar", exact: true })
        .click();
      await expect(dialog).not.toBeVisible();
      await expect(oilCard()).toHaveCount(0);
    };
    await page.goto("/dashboard/inventory/locations/" + fixture.locationId);
    await expect(oilCard()).toBeVisible();
    await move(code);
    await page.goto(targetUrl);
    await expect(oilCard()).toBeVisible();
    await expect(oilCard()).toContainText("12,5");
    await move("A-01-02");
    await page.goto("/dashboard/inventory/locations/" + fixture.locationId);
    await expect(oilCard()).toBeVisible();
    await expect(oilCard()).toContainText("12,5");
  });

  test("viewer can consult stock but cannot discover client choices or submit an adjustment", async ({
    page,
  }) => {
    await authenticated(page, "light", true);
    await page.goto("/dashboard/inventory/locations/" + fixture.locationId);
    await expect(filterCard(page)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Conferir contagem" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Reservar para cliente" }),
    ).toHaveCount(0);
    const headers = {
      Authorization: "Bearer " + process.env.E2E_WAREHOUSE_VIEW_TOKEN,
    };
    const choices = await fetch(
      api + "/inventory/locations/options?kind=CLIENTS",
      { headers },
    );
    expect(choices.status).toBe(403);
    const before = await stock();
    const result = await fetch(
      api + "/inventory/locations/" + fixture.locationId + "/count",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey: crypto.randomUUID(),
          balanceId: fixture.balanceId,
          expectedState: before.expectedState,
          countedQty: 999,
          reason: "Tentativa bloqueada de teste",
        }),
      },
    );
    expect(result.status).toBe(403);
    expect((await stock()).physicalQty).toBe(before.physicalQty);
  });
  test("scanned position returns after login and untrusted redirects are ignored", async ({
    page,
  }) => {
    await page.goto("/dashboard/inventory/locations/" + fixture.locationId);
    await expect(page).toHaveURL(/returnTo=/);
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({
        json: {
          access_token: process.env.E2E_WAREHOUSE_TOKEN,
          user: {
            id: fixture.userId,
            role: "ADMIN",
            name: "Validador do almoxarifado",
          },
        },
      }),
    );
    await page.getByLabel("E-mail", { exact: true }).fill("qr@example.invalid");
    await page.getByLabel("Senha", { exact: true }).fill("ficticio");
    await page
      .getByRole("button", { name: "Acessar o GridOne", exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp("/dashboard/inventory/locations/" + fixture.locationId + "$"),
    );
    await expect(filterCard(page)).toBeVisible();
  });
  test("label preview prints a branded A4 sheet and does not expose inventory in the QR URL", async ({
    page,
  }) => {
    await authenticated(page);
    await page.goto("/dashboard/inventory/locations");
    await selectWarehouse(page);
    for (const code of ["A-01-01", "A-01-02"])
      await page
        .getByRole("checkbox", {
          name: `Selecionar ${code} para etiquetas`,
          exact: true,
        })
        .check();
    await page
      .getByRole("button", { name: "Etiquetas (2)", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Gerar prévia", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("img", {
        name: "QR Code da posição A-01-02",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("img", { name: "Manitec", exact: true }),
    ).toHaveCount(2);
    await page.screenshot({ path: path.join(output, "etiquetas-previa.png") });
    await page.emulateMedia({ media: "print" });
    await page.screenshot({
      path: path.join(output, "etiquetas-impressao.png"),
    });
    const bytes = await page.pdf({
      path: path.join(output, "etiquetas-a4.pdf"),
      preferCSSPageSize: true,
      printBackground: true,
    });
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    await page.emulateMedia({ media: "screen" });
  });
});
