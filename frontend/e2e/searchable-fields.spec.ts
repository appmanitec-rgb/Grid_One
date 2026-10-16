import { expect, test, type Page } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  getE2eEntityData,
  loginByApi,
} from "./helpers/auth";
import { accounts } from "./helpers/test-data";

let token: string, clientId: string, generatorId: string, operatorId: string;
const targetClient = "Ação Automação Cliente 25";
const targetEquipment = "Gerador Selecionado 25";
test.beforeAll(async () => {
  const [admin, operator, data] = await Promise.all([
    apiLogin(accounts.admin),
    apiLogin(accounts.operation),
    getE2eEntityData(),
  ]);
  token = admin.access_token;
  operatorId = JSON.parse(
    Buffer.from(operator.access_token.split(".")[1], "base64url").toString(),
  ).sub;
  generatorId = data.clientAEquipmentId;
  clientId = (
    await apiRequest<{ clientId: string }>(token, "/generators/" + generatorId)
  ).clientId;
});
async function manyOptions(page: Page) {
  const clients = Array.from({ length: 24 }, (_, index) => ({
    id: "search-client-" + index,
    companyName: "Cliente exemplo " + String(index + 1).padStart(2, "0"),
  }));
  clients.push({ id: clientId, companyName: targetClient });
  await page.route("**/tickets/create-options*", async (route) => {
    const selected = new URL(route.request().url()).searchParams.get(
      "clientId",
    );
    const generators =
      selected === clientId
        ? [
            ...Array.from({ length: 24 }, (_, index) => ({
              id: "search-equipment-" + index,
              name: "Gerador exemplo " + String(index + 1).padStart(2, "0"),
              clientId,
            })),
            { id: generatorId, name: targetEquipment, clientId },
          ]
        : [];
    await route.fulfill({ json: { clients, generators } });
  });
  await page.route("**/tickets/assignees", (route) =>
    route.fulfill({
      json: [
        ...Array.from({ length: 24 }, (_, index) => ({
          id: "search-user-" + index,
          name: "Responsável exemplo " + index,
        })),
        { id: operatorId, name: "Operação Selecionada 25" },
      ],
    }),
  );
}

for (const width of [1366, 390]) {
  test(
    "busca encontra cliente e equipamento além dos dez primeiros em " +
      width +
      "px",
    async ({ page }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await loginByApi(page, accounts.admin);
      await manyOptions(page);
      await page.goto("/dashboard/atendimento#novo-chamado");
      const form = page.getByRole("form", { name: "Novo chamado" });
      const client = form.getByRole("combobox", {
        name: "Cliente",
        exact: true,
      });
      const equipment = form.getByRole("combobox", {
        name: "Equipamento",
        exact: true,
      });
      await expect(client).toBeEnabled();
      await client.click();
      await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(
        10,
      );
      await client.fill("acao automacao");
      await expect(
        page.getByRole("option", { name: targetClient, exact: true }),
      ).toBeVisible();
      await client.press("Enter");
      await expect(client).toHaveValue(targetClient);
      await expect(equipment).toBeEnabled();
      await equipment.click();
      await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(
        10,
      );
      await equipment.fill("Selecionado 25");
      await page
        .getByRole("option", { name: targetEquipment, exact: true })
        .click();
      await expect(equipment).toHaveValue(targetEquipment);
      // Abandoning a search retains the existing selection.
      await equipment.fill("não existe este gerador");
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "Nenhum resultado encontrado." }),
      ).toBeVisible();
      await equipment.press("Escape");
      await expect(equipment).toHaveValue(targetEquipment);
      // A client change removes equipment from the previous client.
      await client.fill("Cliente exemplo 01");
      await client.press("Enter");
      await expect(equipment).toBeEnabled();
      await expect(equipment).toHaveValue("Não vincular agora");
      await client.fill("acao automacao");
      await client.press("Enter");
      await expect(equipment).toBeEnabled();
      await equipment.fill("Selecionado 25");
      await equipment.press("Enter");
      const owner = form.getByRole("combobox", {
        name: "Responsável",
        exact: true,
      });
      await owner.fill("operacao selecionada");
      await owner.press("Enter");
      await expect(owner).toHaveValue("Operação Selecionada 25");
      await client.click();
      await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(
        10,
      );
      const bounds = await page.getByRole("listbox").boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: info.outputPath("pesquisa-cliente.png") });
      await client.press("Escape");
      await form
        .getByLabel("Título", { exact: true })
        .fill("Busca de cliente e equipamento E2E " + Date.now());
      await form
        .getByLabel("Descrição", { exact: true })
        .fill(
          "Validação dos vínculos após pesquisar em listas com mais de dez registros.",
        );
      const saved = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/tickets" &&
          response.request().method() === "POST",
      );
      await form
        .getByRole("button", { name: "Criar chamado", exact: true })
        .click();
      const response = await saved;
      expect(response.ok()).toBeTruthy();
      const ticket = await response.json();
      const persisted = await apiRequest<{
        clientId: string;
        generatorId: string;
        assignedToUserId: string;
      }>(token, "/tickets/" + ticket.id);
      expect(persisted.clientId).toBe(clientId);
      expect(persisted.generatorId).toBe(generatorId);
      expect(persisted.assignedToUserId).toBe(operatorId);
    },
  );
}

test("filtro com mais de dez estados permite busca e preserva listas pequenas", async ({
  page,
}) => {
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/atendimento");
  await page.getByRole("button", { name: /^Filtros/ }).click();
  const status = page.getByRole("combobox", { name: "Status", exact: true });
  await expect(status).toHaveJSProperty("tagName", "INPUT");
  await status.click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(10);
  await status.fill("Aguardando cliente");
  const changed = page.waitForResponse(
    (response) =>
      response.url().includes("/tickets/workspace?") &&
      new URL(response.url()).searchParams.get("status") === "WAITING_CUSTOMER",
  );
  await status.press("Enter");
  expect((await changed).ok()).toBeTruthy();
  const priority = page.getByRole("combobox", {
    name: "Prioridade",
    exact: true,
  });
  await expect(priority).toHaveJSProperty("tagName", "SELECT");
  await priority.selectOption("HIGH");
});

test("sugestões pesquisam a lista completa, limitam dez e aceitam condição especial", async ({
  page,
}) => {
  await loginByApi(page, accounts.admin);
  await page.route("**/studio/control-options/PAYMENT_TERM", (route) =>
    route.fulfill({
      json: Array.from({ length: 25 }, (_, index) => ({
        id: "term-" + index,
        code: "P" + index,
        name: "Condição especial " + String(index + 1).padStart(2, "0"),
        isActive: true,
      })),
    }),
  );
  await page.goto("/dashboard/suppliers/new");
  const payment = page.getByRole("combobox", {
    name: "Condição de pagamento",
    exact: true,
  });
  await payment.click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(10);
  await payment.fill("Condição especial 25");
  await page.getByRole("option", { name: /Condição especial 25/ }).click();
  await expect(payment).toHaveValue("Condição especial 25");
  await payment.fill("Entrada de 35% e saldo na entrega");
  await payment.press("Tab");
  await expect(payment).toHaveValue("Entrada de 35% e saldo na entrega");
});

test("catálogo pesquisa no servidor com dez resultados e mantém a escolha", async ({
  page,
}) => {
  await loginByApi(page, accounts.admin);
  const calls: Array<{ take: string | null; q: string | null }> = [];
  await page.route("**/catalogs/lookup?*", (route) => {
    const params = new URL(route.request().url()).searchParams;
    calls.push({ take: params.get("take"), q: params.get("q") });
    const all = Array.from({ length: 25 }, (_, index) => ({
      id: "catalog-search-" + index,
      name: "Produto de teste " + String(index + 1).padStart(2, "0"),
      code: "PC" + index,
      type: "PART",
    }));
    const query = params.get("q");
    const results = query
      ? all.filter((item) => item.name.includes(query))
      : all;
    return route.fulfill({ json: results });
  });
  await page.goto("/dashboard/equipments/models");
  await page
    .getByRole("button", { name: "Adicionar item base", exact: true })
    .click();
  const product = page.getByRole("combobox", {
    name: "Buscar item no catalogo",
    exact: true,
  });
  await product.click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(10);
  await product.fill("Produto de teste 25");
  await expect(
    page.getByRole("option", { name: /Produto de teste 25/ }),
  ).toBeVisible();
  await product.press("Enter");
  await expect(product).toHaveValue("PC24 - Produto de teste 25");
  await product.click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(10);
  await product.press("Escape");
  await expect(product).toHaveValue("PC24 - Produto de teste 25");
  expect(calls.every((call) => call.take === "10")).toBeTruthy();
  expect(calls.some((call) => call.q === "Produto de teste 25")).toBeTruthy();
});
