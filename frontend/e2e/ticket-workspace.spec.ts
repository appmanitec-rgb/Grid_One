import { selectFieldOption } from "./helpers/select-field";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  apiLogin,
  apiRequest,
  apiRequestRaw,
  getE2eEntityData,
  loginByApi,
} from "./helpers/auth";
import { accounts } from "./helpers/test-data";
import type { ServiceTicket } from "../lib/tickets";

let token: string, clientId: string, generatorId: string, operatorId: string;
let queueTicket: ServiceTicket, formulaTicket: ServiceTicket;
const prefix = "Central GridOne E2E " + Date.now();
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
  const generator = await apiRequest<{ clientId: string }>(
    token,
    "/generators/" + generatorId,
  );
  clientId = generator.clientId;
  queueTicket = await createTicket(prefix + " · falha na partida");
  formulaTicket = await createTicket("=" + prefix + " · exportação");
});
async function createTicket(title: string) {
  return apiRequest<ServiceTicket>(token, "/tickets", {
    method: "POST",
    body: {
      clientId,
      generatorId,
      title,
      description:
        "Solicitação de atendimento para validar a central do GridOne.",
      category: "TECHNICAL_SUPPORT",
      priority: "HIGH",
      origin: "PHONE",
    },
  });
}
async function searchQueue(page: Page, value: string) {
  const response = page.waitForResponse(
    (response) =>
      response.url().includes("/tickets/workspace?") &&
      new URL(response.url()).searchParams.get("search") === value,
  );
  await page.getByRole("searchbox", { name: "Buscar chamado" }).fill(value);
  await response;
  await expect(
    page.getByText("Carregando fila...", { exact: true }),
  ).toHaveCount(0);
}
async function fits(page: Page) {
  const layout = await page.evaluate(() => {
    const main = document.querySelector(".dashboard-main")!;
    return {
      mainOverflow: main.scrollWidth - main.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(layout.mainOverflow).toBeLessThanOrEqual(1);
  expect(layout.pageOverflow).toBeLessThanOrEqual(1);
}

test("fila filtra no servidor, alterna entre lista e quadro e exporta CSV seguro", async ({
  page,
}) => {
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/atendimento");
  await searchQueue(page, prefix);
  await expect(
    page.getByRole("heading", { name: "Central de Atendimento", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Itens por pagina", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText("2 chamado(s) encontrado(s)", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: queueTicket.title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  const changedOrigin = page.waitForResponse(
    (response) =>
      response.url().includes("/tickets/workspace?") &&
      new URL(response.url()).searchParams.get("origin") === "WHATSAPP",
  );
  await page
    .getByRole("combobox", { name: "Origem", exact: true })
    .selectOption("WHATSAPP");
  await changedOrigin;
  await expect(
    page.getByText("0 chamado(s) encontrado(s)", { exact: true }),
  ).toBeVisible();
  const restoredOrigin = page.waitForResponse(
    (response) =>
      response.url().includes("/tickets/workspace?") &&
      new URL(response.url()).searchParams.get("origin") === "PHONE",
  );
  await page
    .getByRole("combobox", { name: "Origem", exact: true })
    .selectOption("PHONE");
  await restoredOrigin;
  await expect(
    page.getByText("2 chamado(s) encontrado(s)", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Quadro", exact: true }).click();
  const board = page.getByRole("region", {
    name: /Quadro de chamados por etapa/,
  });
  await expect(
    board.getByRole("link", {
      name: queueTicket.code + " · " + queueTicket.title,
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await searchQueue(page, formulaTicket.title);
  await expect(
    page.getByText("1 chamado(s) encontrado(s)", { exact: true }),
  ).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV", exact: true }).click();
  const file = await downloaded;
  const text = await readFile((await file.path())!, "utf8");
  expect(text).toContain("\"'=" + prefix);
  expect(text).toContain("Prazo de solução");
  expect(text).toContain(formulaTicket.code);
  expect(text).not.toContain(queueTicket.code);
});

test("quadro carrega mais de 20 chamados de uma etapa sem limitar a fila à primeira página", async ({
  page,
}) => {
  await loginByApi(page, accounts.admin);
  const tickets = Array.from({ length: 45 }, (_, index) => ({
    ...queueTicket,
    id: "board-" + index,
    code: "TCK-BOARD-" + index,
    title: "Atendimento " + index,
  }));
  const requestedPages: number[] = [];
  await page.route("**/tickets/workspace?**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("view") === "board") {
      const columns = [
        "NEW",
        "IN_PROGRESS",
        "WAITING",
        "SCHEDULED",
        "ORDER",
        "DONE",
      ].map((key, index) => ({
        key,
        label: [
          "Entrada e triagem",
          "Em atendimento",
          "Aguardando retorno",
          "Programados",
          "Encaminhados para O.S.",
          "Finalizados",
        ][index],
        total: index ? 0 : 45,
        page: 1,
        hasMore: !index,
        items: index ? [] : tickets.slice(0, 20),
      }));
      return route.fulfill({
        json: {
          items: [],
          total: 45,
          page: 1,
          pageSize: 20,
          summary: { ACTIVE: 45 },
          columns,
        },
      });
    }
    if (params.get("column") === "NEW") {
      const pageNumber = Number(params.get("page"));
      requestedPages.push(pageNumber);
      return route.fulfill({
        json: {
          items: tickets.slice((pageNumber - 1) * 20, pageNumber * 20),
          total: 45,
          page: pageNumber,
          pageSize: 20,
          summary: { ACTIVE: 45 },
          columns: [],
        },
      });
    }
    return route.continue();
  });
  await page.goto("/dashboard/atendimento");
  await page.getByRole("button", { name: "Quadro", exact: true }).click();
  const column = page
    .getByRole("region", { name: /Quadro de chamados por etapa/ })
    .getByRole("region", { name: "Entrada e triagem", exact: true });
  await expect(column.getByRole("link")).toHaveCount(20);
  await column
    .getByRole("button", { name: "Carregar mais de Entrada e triagem" })
    .click();
  await expect(column.getByRole("link")).toHaveCount(40);
  await column
    .getByRole("button", { name: "Carregar mais de Entrada e triagem" })
    .click();
  await expect(column.getByRole("link")).toHaveCount(45);
  await expect(column.getByRole("button")).toHaveCount(0);
  expect(requestedPages).toEqual([2, 3]);
});

test("responsável e classificação são persistidos e deixam histórico legível", async ({
  page,
}) => {
  const ticket = await createTicket(prefix + " · atribuição");
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/atendimento/" + ticket.id);
  await expect(
    page.getByRole("heading", { name: ticket.title, exact: true }),
  ).toBeVisible();
  await selectFieldOption(page.getByRole("combobox", { name: "Atribu\u00eddo a", exact: true }), operatorId);
  let saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/tickets/" + ticket.id + "/assign") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Salvar responsável", exact: true })
    .click();
  expect((await saved).ok()).toBeTruthy();
  await expect(
    page.getByText("Responsável atualizado.", { exact: true }),
  ).toBeVisible();
  let updated = await apiRequest<ServiceTicket>(token, "/tickets/" + ticket.id);
  expect(updated.assignedToUser?.id).toBe(operatorId);
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("WAITING_INTERNAL");
  await page
    .getByRole("combobox", { name: "Prioridade", exact: true })
    .selectOption("CRITICAL");
  saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/tickets/" + ticket.id) &&
      response.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Salvar classificação", exact: true })
    .click();
  expect((await saved).ok()).toBeTruthy();
  await expect(
    page.getByText("Classificação salva.", { exact: true }),
  ).toBeVisible();
  updated = await apiRequest<ServiceTicket>(token, "/tickets/" + ticket.id);
  expect(updated.status).toBe("WAITING_INTERNAL");
  expect(updated.priority).toBe("CRITICAL");
  await page.getByRole("tab", { name: "Histórico", exact: true }).click();
  await expect(
    page.getByText(/Status: Triagem → Aguardando equipe/),
  ).toBeVisible();
  await expect(page.getByText(/Prioridade: Alta → Crítica/)).toBeVisible();
  await selectFieldOption(page.getByRole("combobox", { name: "Atribu\u00eddo a", exact: true }), "");
  saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/tickets/" + ticket.id + "/assign") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Salvar responsável", exact: true })
    .click();
  expect((await saved).ok()).toBeTruthy();
  await expect(
    page.getByText("Responsável atualizado.", { exact: true }),
  ).toBeVisible();
  expect(
    (await apiRequest<ServiceTicket>(token, "/tickets/" + ticket.id))
      .assignedToUser,
  ).toBeNull();
  await page
    .getByRole("button", { name: "Assumir chamado", exact: true })
    .click();
  await expect(
    page.getByText("Você assumiu este chamado.", { exact: true }),
  ).toBeVisible();
  expect(
    (await apiRequest<ServiceTicket>(token, "/tickets/" + ticket.id))
      .assignedToUser?.id,
  ).toBe(
    JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub,
  );
});

test("resposta aparece no portal, nota interna fica privada e os rascunhos permanecem separados", async ({
  page,
  browser,
}) => {
  const ticket = await createTicket(prefix + " · conversa");
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/atendimento/" + ticket.id);
  const composer = page.getByRole("form", { name: "Responder chamado" });
  await composer
    .getByRole("button", { name: "Nota interna", exact: true })
    .click();
  await composer
    .getByRole("textbox", { name: "Nota interna", exact: true })
    .fill("Nota privada E2E: equipe verificará a causa técnica.");
  await composer
    .getByRole("button", { name: "Resposta ao cliente", exact: true })
    .click();
  await expect(
    composer.getByRole("textbox", { name: "Resposta ao cliente", exact: true }),
  ).toHaveValue("");
  await composer
    .getByRole("textbox", { name: "Resposta ao cliente", exact: true })
    .fill("Resposta pública E2E: recebemos seu pedido e vamos acompanhar.");
  await composer
    .getByRole("button", { name: "Nota interna", exact: true })
    .click();
  await expect(
    composer.getByRole("textbox", { name: "Nota interna", exact: true }),
  ).toHaveValue(/Nota privada E2E/);
  await composer
    .getByRole("button", { name: "Salvar nota interna", exact: true })
    .click();
  await expect(
    page.getByText("Nota interna registrada.", { exact: true }),
  ).toBeVisible();
  await composer
    .getByRole("button", { name: "Resposta ao cliente", exact: true })
    .click();
  await expect(
    composer.getByRole("textbox", { name: "Resposta ao cliente", exact: true }),
  ).toHaveValue(/Resposta pública E2E/);
  await composer
    .getByRole("button", { name: "Enviar resposta", exact: true })
    .click();
  await expect(
    page.getByText("Resposta registrada na central do cliente.", {
      exact: true,
    }),
  ).toBeVisible();
  const client = await apiLogin(accounts.clientA);
  const portalTicket = await apiRequest<ServiceTicket>(
    client.access_token,
    "/customer-portal/tickets/" + ticket.id,
  );
  expect(
    portalTicket.comments?.some((comment) =>
      comment.message.includes("Resposta pública E2E"),
    ),
  ).toBe(true);
  expect(JSON.stringify(portalTicket)).not.toContain("Nota privada E2E");
  const context = await browser.newContext();
  const portal = await context.newPage();
  try {
    await loginByApi(portal, accounts.clientA);
    await portal.goto("/portal/chamados/" + ticket.id);
    await expect(portal.getByText(/Resposta pública E2E/)).toBeVisible();
    await expect(portal.getByText(/Nota privada E2E/)).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("auditor consulta a central sem receber botões de edição ou escrita", async ({
  page,
}) => {
  const auditor = await loginByApi(page, accounts.auditor);
  await page.goto("/dashboard/atendimento");
  await expect(
    page.getByRole("heading", { name: "Chamados e atendimento", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "+ Novo chamado", exact: true }),
  ).toHaveCount(0);
  await page.goto("/dashboard/atendimento/" + queueTicket.id);
  await expect(
    page.getByRole("heading", { name: queueTicket.title, exact: true }),
  ).toBeVisible();
  for (const name of [
    "Salvar responsável",
    "Salvar classificação",
    "Converter para OS",
    "Enviar resposta",
    "Salvar nota interna",
    "Resolver",
    "Fechar",
    "Cancelar",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
      0,
    );
  for (const path of ["/assign", "/comment"]) {
    const response = await apiRequestRaw(
      auditor.access_token,
      "/tickets/" + queueTicket.id + path,
      {
        method: "POST",
        body:
          path === "/assign"
            ? { assignedToUserId: operatorId }
            : { message: "Não permitido", customerVisible: true },
      },
    );
    expect(response.status).toBe(403);
  }
});

test("atalho prepara proposta com o cliente correto e mantém vínculos navegáveis", async ({
  page,
}) => {
  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/atendimento/" + queueTicket.id);
  await expect(
    page.locator('a[href="/dashboard/clients/' + clientId + '"]').first(),
  ).toBeVisible();
  await expect(
    page.locator('a[href="/dashboard/equipments/' + generatorId + '"]').first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "Nova proposta", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp("/dashboard/proposals/new\\?clientId=" + clientId),
  );
  await expect(
    page.getByRole("textbox", { name: "Cliente", exact: true }),
  ).not.toHaveValue("");
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]) {
  test(
    "central se adapta a " + viewport.width + "px com lista, quadro e detalhe",
    async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await loginByApi(page, accounts.admin);
      await page.goto("/dashboard/atendimento");
      await searchQueue(page, prefix);
      if (viewport.width <= 550) {
        const searchBox = await page
          .getByRole("searchbox", { name: "Buscar chamado" })
          .boundingBox();
        expect(searchBox?.width).toBeGreaterThan(280);
      }
      await fits(page);
      await page.screenshot({ path: testInfo.outputPath("01-lista.png") });
      await page.getByRole("button", { name: "Quadro", exact: true }).click();
      await expect(
        page.getByRole("region", { name: /Quadro de chamados por etapa/ }),
      ).toBeVisible();
      await fits(page);
      await page.screenshot({ path: testInfo.outputPath("02-quadro.png") });
      await page.goto("/dashboard/atendimento/" + queueTicket.id);
      await expect(
        page.getByRole("heading", { name: queueTicket.title, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("form", { name: "Responder chamado" }),
      ).toBeVisible();
      await fits(page);
      await page.screenshot({ path: testInfo.outputPath("03-detalhe.png") });
      await page
        .getByRole("combobox", { name: "Atribuído a", exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        page.getByRole("combobox", { name: "Atribuído a", exact: true }),
      ).toBeInViewport();
      await fits(page);
    },
  );
}
