import { expect, test } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  apiRequestRaw,
  loginByApi,
} from "./helpers/auth";
import { accounts, API_BASE_URL } from "./helpers/test-data";

test.beforeAll(() => {
  if (new URL(API_BASE_URL).port !== "3100")
    throw new Error("Exige a base isolada E2E.");
});

type Entry = { id: string; name?: string; companyName?: string };
type Result = {
  items: Entry[];
  total: number;
  page: number;
  pageSize: number;
  summary?: { total: number };
};

test("API pagina os registros, pesquisa fora da primeira p\u00e1gina e limita o tamanho da resposta", async () => {
  const token = (await apiLogin(accounts.admin)).access_token;
  for (const endpoint of ["/catalogs", "/clients", "/generators"]) {
    const full = await apiRequest<Entry[]>(token, endpoint);
    const first = await apiRequest<Result>(
      token,
      endpoint + "/page?pageSize=2",
    );
    expect(first.total).toBe(full.length);
    expect(first.items).toHaveLength(Math.min(2, full.length));
    expect(first.page).toBe(1);
    if (first.summary) expect(first.summary.total).toBe(full.length);
    if (endpoint === "/catalogs") {
      const summary = await apiRequest<{ total: number }>(
        token,
        "/catalogs/list-summary",
      );
      expect(summary.total).toBe(full.length);
    }
    const invalid = await apiRequestRaw(
      token,
      endpoint + "/page?pageSize=100000",
    );
    expect(invalid.status).toBe(400);
    const invalidPage = await apiRequestRaw(token, endpoint + "/page?page=-1");
    expect(invalidPage.status).toBe(400);
    const hugePage = await apiRequest<Result>(
      token,
      endpoint + "/page?page=1000000&pageSize=2",
    );
    expect(hugePage.page).toBe(Math.max(1, Math.ceil(full.length / 2)));
    if (full.length > 2) {
      const second = await apiRequest<Result>(
        token,
        endpoint + "/page?page=2&pageSize=2",
      );
      expect(
        second.items.every(
          (item) => !first.items.some((row) => row.id === item.id),
        ),
      ).toBe(true);
    }
    const target = full.at(-1)!;
    const q = target.name || target.companyName || "";
    const found = await apiRequest<Result>(
      token,
      endpoint + "/page?pageSize=100&q=" + encodeURIComponent(q),
    );
    expect(found.items.some((item) => item.id === target.id)).toBe(true);
  }
  expect((await apiRequestRaw(undefined, "/catalogs/page")).status).toBe(401);
});

for (const scenario of [
  {
    name: "cat\u00e1logo",
    route: "catalog",
    endpoint: "catalogs",
    placeholder: "Item, SKU, PN, outros codigos, descricao ou localizacao...",
    table: true,
  },
  {
    name: "clientes",
    route: "clients",
    endpoint: "clients",
    placeholder:
      "CNPJ, nome, razao social, endereco, contato, e-mail, telefone...",
    table: true,
  },
  {
    name: "equipamentos",
    route: "equipments",
    endpoint: "generators",
    placeholder: "Nome, tag, serie, cliente, local ou modelo...",
    table: false,
  },
]) {
  test(
    scenario.name +
      " renderiza s\u00f3 a p\u00e1gina pedida e mant\u00e9m busca e pagina\u00e7\u00e3o em uma lista grande",
    async ({ page }) => {
      test.setTimeout(180_000);
      await loginByApi(page, accounts.admin);
      const requests: URL[] = [];
      let releaseSummary: (() => void) | undefined;
      const bulkReads: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/" + scenario.endpoint)
          bulkReads.push(request.url());
      });
      if (scenario.route === "catalog") {
        await page.route(
          (url) => url.pathname === "/catalogs/list-summary",
          async (route) => {
            await new Promise<void>((resolve) => {
              releaseSummary = resolve;
            });
            await route.fulfill({
              json: {
                total: 6000,
                parts: 6000,
                services: 0,
                lowStock: 0,
                groups: {
                  all: 6000,
                  generatorParts: 6000,
                  internal: 0,
                  technicalTools: 0,
                  services: 0,
                  lowStock: 0,
                },
              },
            });
          },
        );
      }
      let releaseSlow: (() => void) | undefined;
      await page.route(
        (url) => url.pathname === "/" + scenario.endpoint + "/page",
        async (route) => {
          const url = new URL(route.request().url());
          requests.push(url);
          const q = url.searchParams.get("q") || "";
          if (q === "busca lenta")
            await new Promise<void>((resolve) => {
              releaseSlow = resolve;
            });
          const filtered = q !== "";
          const total = filtered ? 1 : 6000;
          const pageSize = Number(url.searchParams.get("pageSize"));
          const currentPage = Math.min(
            Number(url.searchParams.get("page")),
            Math.ceil(total / pageSize),
          );
          const offset = filtered ? 5000 : (currentPage - 1) * pageSize;
          const items = Array.from(
            {
              length: Math.min(pageSize, total - (currentPage - 1) * pageSize),
            },
            (_, n) => {
              const id = String(offset + n).padStart(5, "0");
              return {
                id,
                code: "LIST-" + id,
                name: (filtered ? q : "Registro") + " " + id,
                companyName: (filtered ? q : "Registro") + " " + id,
                sku: "SKU-" + id,
                type: "PART",
                catalogGroup: "generatorParts",
                description: "Item de teste",
                basePrice: 50,
                operationalSummary: {
                  availableQty: 1,
                  reservedQty: 0,
                  isLowStock: false,
                },
                operationalStatus: "OPERATING",
                criticality: "B",
                client: null,
                orders: [],
                contractLinks: [],
                contractSchedules: [],
                serviceTickets: [],
              };
            },
          );
          await route.fulfill({
            json: {
              items,
              total,
              page: currentPage,
              pageSize,
              summary: {
                total: 6000,
                parts: 6000,
                services: 0,
                lowStock: 0,
                critical: 0,
                contracted: 0,
                openTickets: 0,
                groups: {
                  all: 6000,
                  generatorParts: 6000,
                  internal: 0,
                  technicalTools: 0,
                  services: 0,
                  lowStock: 0,
                },
              },
            },
          });
        },
      );
      await page.goto("/dashboard/" + scenario.route);
      await expect(
        page.getByText("Exibindo 1-20 de 6000", { exact: true }),
      ).toBeVisible();
      const records = page.locator(".dashboard-main .dashboard-record-link");
      await expect(records).toHaveCount(20);
      if (scenario.route === "catalog") {
        const metric = page
          .getByText("Itens ativos", { exact: true })
          .locator("..");
        await expect(metric.getByText("—", { exact: true })).toBeVisible();
        await expect.poll(() => Boolean(releaseSummary)).toBe(true);
        releaseSummary!();
        await expect(metric.getByText("6000", { exact: true })).toBeVisible();
      }
      if (scenario.table) {
        await expect(page.locator("table tbody tr")).toHaveCount(20);
        await expect(page.locator(".dashboard-table-pagination")).toHaveCount(
          0,
        );
      }
      await page
        .getByRole("button", { name: "Proxima pagina", exact: true })
        .click();
      await expect(
        page.getByText("Exibindo 21-40 de 6000", { exact: true }),
      ).toBeVisible();
      await expect(records.first()).toContainText("00020");
      expect(requests.at(-1)!.searchParams.get("page")).toBe("2");
      await page
        .getByRole("combobox", { name: "Itens por pagina", exact: true })
        .selectOption("50");
      await expect(records).toHaveCount(50);
      await expect(
        page.getByText("Exibindo 1-50 de 6000", { exact: true }),
      ).toBeVisible();
      if (scenario.table) {
        await page
          .getByRole("button", { name: /Ordenar por (Item|Empresa)/ })
          .click();
        await expect
          .poll(() => requests.at(-1)?.searchParams.get("direction"))
          .toBe("desc");
        await expect(
          page.getByText("Exibindo 1-50 de 6000", { exact: true }),
        ).toBeVisible();
      }
      const search = page.getByPlaceholder(scenario.placeholder, {
        exact: true,
      });
      await search.fill("Resultado distante");
      await expect(records).toHaveCount(1);
      await expect(records.first()).toContainText("Resultado distante 05000");
      await expect(
        page.getByText("Exibindo 1-1 de 1", { exact: true }),
      ).toBeVisible();
      if (scenario.route === "catalog") {
        const pending = page.waitForRequest(
          (request) =>
            new URL(request.url()).searchParams.get("q") === "busca lenta",
        );
        await search.fill("busca lenta");
        const slowRequest = await pending;
        const canceled = page.waitForEvent("requestfailed", {
          predicate: (request) => request === slowRequest,
        });
        await search.fill("Resultado atual");
        await expect(records.first()).toContainText("Resultado atual 05000");
        await canceled;
        expect(releaseSlow).toBeTruthy();
        releaseSlow!();
        await expect(records.first()).toContainText("Resultado atual 05000");
      }
      await search.fill("");
      await expect(
        page.getByText("Exibindo 1-50 de 6000", { exact: true }),
      ).toBeVisible();
      await expect(records).toHaveCount(50);
      expect(bulkReads).toEqual([]);
    },
  );
}
