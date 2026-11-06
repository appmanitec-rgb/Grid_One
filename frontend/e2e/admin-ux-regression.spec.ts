import { expect, test } from "@playwright/test";
import { financialComposition, reviewProposal } from "../lib/proposal-review";
import {
  formatCurrency,
  formatDocument,
  formatPercent,
} from "../lib/formatters";
import { matchesSearch, selectedLookupRecord } from "../lib/search";
import { withPreviewDeadline, readPreviewWithRetry } from "../lib/pdf-preview";

test("PDF read recovers from one proxy failure without retrying a permission denial", async () => {
  let calls = 0;
  const pdf = await readPreviewWithRetry(
    async () =>
      new Response(++calls === 1 ? "Internal Server Error" : "%PDF-", {
        status: calls === 1 ? 500 : 200,
      }),
  );
  expect(pdf.status).toBe(200);
  expect(calls).toBe(2);
  calls = 0;
  const denied = await readPreviewWithRetry(async () => {
    calls += 1;
    return new Response("Aprovação necessária", { status: 403 });
  });
  expect(denied.status).toBe(403);
  expect(calls).toBe(1);
});

test("PDF network retry is bounded and persistent failure gives a recovery instruction", async () => {
  let calls = 0;
  await expect(
    readPreviewWithRetry(async () => {
      calls += 1;
      throw new TypeError("ECONNRESET");
    }),
  ).rejects.toThrow('Clique em "Visualizar proposta"');
  expect(calls).toBe(2);
});

test("a lookup refresh preserves the selected client's canonical restrictions without applying them to another client", () => {
  const selected = {
    id: "client-a",
    companyName: "Cliente selecionado",
    proposalCreationBlocked: true,
    blockedPaymentTerms: ["30_DIAS"],
  };
  const other = {
    id: "client-b",
    companyName: "Outro cliente",
    proposalCreationBlocked: false,
    blockedPaymentTerms: [],
  };
  expect(selectedLookupRecord([other], selected.id, selected)).toEqual(
    selected,
  );
  expect(selectedLookupRecord([other], other.id, selected)).toEqual(other);
  expect(selectedLookupRecord([other], "", selected)).toBeNull();
});

test("PDF preview failures propagate and a stalled renderer offers recovery instead of waiting forever", async () => {
  let cancelled = false;
  await expect(
    withPreviewDeadline(
      () => new Promise<never>(() => {}),
      () => {
        cancelled = true;
      },
      10,
    ),
  ).rejects.toThrow("tempo de espera");
  expect(cancelled).toBe(true);
  await expect(
    withPreviewDeadline(() => Promise.reject(new Error("PDF inválido"))),
  ).rejects.toThrow("PDF inválido");
  await expect(
    withPreviewDeadline(() => Promise.resolve("renderizado")),
  ).resolves.toBe("renderizado");
});

test("technical warnings reach the same review source without granting approval", () => {
  const result = reviewProposal({
    items: [],
    scopeSnapshot: {
      alerts: [
        {
          code: "UNMAPPED_ITEM",
          severity: "warning",
          message: "Material sem classificação",
        },
      ],
    },
  });
  expect(result.warnings).toBe(1);
  expect(
    result.issues.find((issue) => issue.code === "SCOPE_UNMAPPED_ITEM")?.blocks,
  ).toEqual([]);
  expect(
    result.blocks("approve").some((issue) => issue.code === "CLIENT_REQUIRED"),
  ).toBe(true);
});
test("layout changes preserve the seller's reference calculation", () => {
  const totals = financialComposition(
    [
      { kind: "PART_MATERIAL", quantity: 1, unitPrice: 521.28 },
      { kind: "CATALOG_SERVICE", quantity: 1, unitPrice: 489.76 },
    ],
    [{ expenseType: "MEAL", quantity: 1, unitPrice: 100 }],
    0,
    false,
  );
  expect(totals.total).toBe(1111.04);
  expect(formatCurrency(totals.total).replace(/\s/g, " ")).toBe("R$ 1.111,04");
});
test("Brazilian formatting does not mutate document identifiers or percentages", () => {
  expect(formatPercent(100)).toBe("100,0%");
  expect(formatCurrency(2009.3).replace(/\s/g, " ")).toBe("R$ 2.009,30");
  expect(formatDocument("52963630000186")).toBe("52.963.630/0001-86");
  expect(formatDocument("AB1234560001CD")).toBe("AB1234560001CD");
});
test("independent search terms and aliases refine choices without broad substring matches", () => {
  expect(
    matchesSearch("ELEMENTO DO ÓLEO LUBRIFICANTE PERKINS", "perkins oleo"),
  ).toBe(true);
  expect(matchesSearch("BATTERY 24 V", "bateria 24")).toBe(true);
  expect(matchesSearch("Filtro de ar", "filtro combustivel")).toBe(false);
});
