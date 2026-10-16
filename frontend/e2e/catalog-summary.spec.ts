import { expect, test } from "@playwright/test";
import { apiLogin, apiRequest, loginByApi } from "./helpers/auth";
import { accounts } from "./helpers/test-data";

type CatalogItem = { id: string; name: string; type: "PART" | "SERVICE"; photoUrl?: string | null };
let token: string;
let items: CatalogItem[];
test.beforeAll(async () => {
  token = (await apiLogin(accounts.admin)).access_token;
  items = await apiRequest<CatalogItem[]>(token, "/catalogs");
});

for (const scenario of [
  { type: "PART", label: "peça", photo: "Foto da peça", width: 1366 },
  { type: "SERVICE", label: "serviço", photo: "Foto do serviço", width: 390 },
] as const) {
  test("foto da " + scenario.label + " persiste no resumo e na ficha completa", async ({ page }, info) => {
    const selected = items.find(item => item.type === scenario.type);
    expect(selected, "Cadastro de teste disponível").toBeTruthy();
    const original = await apiRequest<CatalogItem>(token, "/catalogs/" + selected!.id);
    await page.setViewportSize({ width: scenario.width, height: 900 });
    await loginByApi(page, accounts.admin);

    async function openSummary() {
      await page.goto("/dashboard/catalog");
      await page.getByPlaceholder("Item, SKU, PN, outros codigos, descricao ou localizacao...").fill(selected!.name);
      await page.getByRole("button", { name: selected!.name, exact: true }).first().click();
      const dialog = page.getByRole("dialog", { name: new RegExp("Resumo d[ao] " + scenario.label) });
      await expect(dialog).toBeVisible();
      return dialog;
    }

    try {
      let dialog = await openSummary();
      await dialog.getByLabel("Anexar " + scenario.photo.toLocaleLowerCase("pt-BR"), { exact: true }).setInputFiles({
        name: "item.png",
        mimeType: "image/png",
        buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64"),
      });
      await expect(dialog.getByRole("img", { name: scenario.photo, exact: true })).toHaveJSProperty("naturalWidth", 1);
      const saved = page.waitForResponse(response => response.url().endsWith("/catalogs/" + selected!.id) && response.request().method() === "PATCH");
      await dialog.getByRole("button", { name: "Salvar alterações", exact: true }).click();
      expect((await saved).ok()).toBeTruthy();
      await expect(dialog).not.toBeVisible();
      const persisted = await apiRequest<CatalogItem>(token, "/catalogs/" + selected!.id);
      expect(persisted.photoUrl).toMatch(/^data:image\/webp;base64,/);
      dialog = await openSummary();
      await expect(dialog.getByRole("img", { name: scenario.photo, exact: true })).toHaveAttribute("src", persisted.photoUrl!);
      await dialog.screenshot({ path: info.outputPath("resumo.png") });
      expect(await dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);

      await dialog.getByRole("link", { name: "Ver ficha completa", exact: true }).click();
      await expect(page).toHaveURL(new RegExp("/dashboard/catalog/" + selected!.id + "$"));
      const photo = page.getByRole("img", { name: scenario.photo, exact: true });
      await expect(photo).toBeVisible();
      await expect(photo).toHaveAttribute("src", persisted.photoUrl!);
      await expect(photo).toHaveJSProperty("naturalWidth", 1);
      await page.screenshot({ path: info.outputPath("ficha-completa.png") });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

      dialog = await openSummary();
      await dialog.getByRole("button", { name: "Remover foto", exact: true }).click();
      await dialog.getByRole("button", { name: "Salvar alterações", exact: true }).click();
      await expect(dialog).not.toBeVisible();
      expect((await apiRequest<CatalogItem>(token, "/catalogs/" + selected!.id)).photoUrl).toBeNull();
    } finally {
      await apiRequest(token, "/catalogs/" + selected!.id, { method: "PATCH", body: { photoUrl: original.photoUrl || null } });
    }
  });
}
