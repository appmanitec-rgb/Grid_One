import { expect, test } from "@playwright/test";

test("rascunho só libera arquivos após aprovação da diretoria", async ({ page }) => {
  const id = "proposal-preview-test";
  let proposalStatus = "DRAFT";
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
        code: "90001/00",
        status: proposalStatus,
        type: "PARTS_AND_SERVICES",
        origin: "MANITEC",
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
        company: { tradeName: "Manitec", cnpj: "3915244000107" },
        viewerRole: "ADMIN",
        sourceHref: "/dashboard/proposals/" + id,
        document: {
          id,
          code: "90001/00",
          status: "CLIENT_REVIEW",
          statusLabel: "Cliente",
          type: "Peças e serviços",
          totalValue: 1000,
          revision: 0,
          issuedAt: "2026-10-09T12:00:00.000Z",
        },
        client: {
          id: "client-test",
          companyName: "Cliente Teste",
          cnpj: "12345678000190",
          city: "São Paulo",
          state: "SP",
        },
        related: { revisions: [] },
        items: [],
      }),
    }),
  );
  await page.route("http://127.0.0.1:3100/documents/proposals/" + id + "/download-document-pdf", (route) =>
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
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    localStorage.setItem("manitec_token", "header." + payload + ".signature");
    localStorage.setItem("manitec_refresh_token", "test-refresh");
  });

  await page.goto("/dashboard/proposals/" + id);
  await expect(page.getByRole("button", { name: "Enviar para diretoria" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Editar rascunho" }))
    .toHaveAttribute("href", "/dashboard/proposals/new?editId=" + id);
  await expect(page.getByRole("button", { name: "Abrir PDF da proposta" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Arquivos e envio/ })).toHaveCount(0);
  await expect(page.getByText("Arquivos e envio ficam disponíveis após a aprovação da diretoria.")).toBeVisible();
  proposalStatus = "CLIENT_REVIEW";
  await page.reload();
  await page.getByRole("link", { name: /Arquivos e envio/ }).click();

  await expect(page).toHaveURL(new RegExp("/dashboard/documents/proposals/" + id));
  await expect(page.getByRole("button", { name: "Visualizar PDF" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Compartilhar com cliente" }))
    .toHaveAttribute("href", "#compartilhar-documento");
  await page.getByRole("button", { name: "Visualizar PDF" }).click();
  const preview = page.getByRole("dialog", { name: "PDF da proposta 90001/00" });
  await expect(preview).toBeVisible();
  await expect(preview.getByTitle("Visualizacao do PDF da proposta 90001/00"))
    .toHaveAttribute("src", /^blob:/);
  const downloadPromise = page.waitForEvent("download");
  await preview.getByRole("button", { name: "Baixar PDF" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("proposta-90001-00.pdf");
  await preview.getByRole("button", { name: "Fechar" }).click();
  await expect(preview).not.toBeVisible();
});