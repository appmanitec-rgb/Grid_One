import { expect, test } from "@playwright/test";

test("arquivo original de proposta externa fica em Documentos", async ({ page }) => {
  const id = "external-document-test";
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF");
  await page.route("http://127.0.0.1:3100/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("http://127.0.0.1:3100/proposals/" + id, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id,
        code: "EXT-001",
        status: "CLIENT_REVIEW",
        type: "PARTS_AND_SERVICES",
        origin: "EXTERNAL",
        externalDocumentFileName: "proposta-recebida.pdf",
        totalValue: 1000,
        items: [],
        movements: [],
        revisions: [],
        client: { id: "client-test", companyName: "Cliente Teste" },
      }),
    }),
  );
  await page.route("http://127.0.0.1:3100/documents/proposals/" + id, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kind: "proposal",
        company: { tradeName: "Manitec" },
        viewerRole: "ADMIN",
        sourceHref: "/dashboard/proposals/" + id,
        document: {
          id,
          code: "EXT-001",
          status: "CLIENT_REVIEW",
          origin: "EXTERNAL",
          externalDocumentFileName: "proposta-recebida.pdf",
          statusLabel: "Cliente",
          type: "Proposta externa",
          totalValue: 1000,
          revision: 0,
          issuedAt: "2026-10-09T12:00:00.000Z",
        },
        client: { id: "client-test", companyName: "Cliente Teste", cnpj: "12345678000190", city: "São Paulo", state: "SP" },
        related: { revisions: [] },
        items: [],
      }),
    }),
  );
  await page.route("http://127.0.0.1:3100/proposals/" + id + "/external-document", (route) =>
    route.fulfill({ status: 200, contentType: "application/pdf", body: pdf }),
  );
  await page.route("http://127.0.0.1:3100/deliveries/preferences", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ providerStatus: { email: false, whatsapp: false, webhook: false } }),
    }),
  );
  await page.addInitScript(() => {
    const payload = btoa(JSON.stringify({ role: "ADMIN", exp: Math.floor(Date.now() / 1000) + 3600 }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    localStorage.setItem("manitec_token", "header." + payload + ".signature");
    localStorage.setItem("manitec_refresh_token", "test-refresh");
  });

  await page.goto("/dashboard/proposals/" + id);
  await expect(page.getByRole("button", { name: "Baixar documento externo" })).toHaveCount(0);
  await page.getByRole("link", { name: "Arquivos e envio" }).click();
  await expect(page).toHaveURL(new RegExp("/dashboard/documents/proposals/" + id));
  await expect(page.getByRole("button", { name: "Visualizar PDF" })).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar arquivo original" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("proposta-recebida.pdf");
});