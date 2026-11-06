import { expect, test } from "@playwright/test";
import { apiLogin, apiRequest, apiRequestRaw, loginByApi } from "./helpers/auth";
import { accounts } from "./helpers/test-data";

type Person = { id: string; name: string };
type Post = { id: string; body: string; category: string };
type Channel = {
  id: string;
  name: string;
  isPrivate: boolean;
  directKey?: string | null;
  members?: Person[];
};

test("feeds comercial, obras e serviços aceitam publicações e filtram por assunto", async ({ page }) => {
  const admin = await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/team");

  for (const [label, category] of [
    ["Comercial", "COMMERCIAL"],
    ["Obras", "WORKS"],
    ["Serviços", "SERVICES"],
  ] as const) {
    const body = `Comunicado ${label} E2E ${Date.now()}`;
    await page.getByRole("navigation", { name: /Feeds da equipe/i }).getByRole("button", { name: label }).click();
    await page.getByRole("region", { name: /Nova publicação/i }).getByRole("textbox").fill(body);
    await page.getByRole("button", { name: /^Publicar$/i }).click();
    await expect(page.locator("article", { hasText: body })).toBeVisible();

    const result = await apiRequest<{ items: Post[] }>(admin.access_token, `/team/feed?category=${category}`);
    expect(result.items.find((post) => post.body === body)?.category).toBe(category);
  }
});

test("canal privado e conversa direta respeitam os participantes", async ({ page }) => {
  const [admin, sales, auditor] = await Promise.all([
    apiLogin(accounts.admin),
    apiLogin(accounts.sales),
    apiLogin(accounts.auditor),
  ]);
  const people = await apiRequest<Person[]>(admin.access_token, "/team/people");
  const salesPerson = people.find((person) => person.name === "Comercial Demo");
  expect(salesPerson?.id).toBeTruthy();

  await loginByApi(page, accounts.admin);
  await page.goto("/dashboard/team");
  await page.getByRole("tab", { name: /Canais/i }).click();
  await page.getByRole("button", { name: "Criar canal", exact: true }).click();
  const name = `E2E privado ${Date.now()}`;
  await page.getByRole("textbox", { name: "Nome do canal" }).fill(name);
  await page.getByRole("checkbox", { name: "Comercial Demo" }).check();
  await page.getByRole("button", { name: "Criar canal", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: `# ${name}` })).toBeVisible();

  const message = `Mensagem reservada E2E ${Date.now()}`;
  await page.getByRole("textbox", { name: "Escrever mensagem" }).fill(message);
  await page.getByRole("button", { name: /^Enviar$/i }).click();
  await expect(page.getByRole("log", { name: "Mensagens do canal" })).toContainText(message);

  const channels = await apiRequest<Channel[]>(admin.access_token, "/team/channels");
  const privateChannel = channels.find((channel) => channel.name === name);
  expect(privateChannel?.isPrivate).toBe(true);
  expect(privateChannel?.members?.map((member) => member.id)).toContain(salesPerson!.id);

  const salesChannels = await apiRequest<Channel[]>(sales.access_token, "/team/channels");
  expect(salesChannels.some((channel) => channel.id === privateChannel!.id)).toBe(true);
  const auditorChannels = await apiRequest<Channel[]>(auditor.access_token, "/team/channels");
  expect(auditorChannels.some((channel) => channel.id === privateChannel!.id)).toBe(false);
  const denied = await apiRequestRaw(auditor.access_token, `/team/channels/${privateChannel!.id}/messages`);
  expect(denied.status).toBe(404);

  await page.getByRole("combobox", { name: "Conversar com uma pessoa" }).selectOption(salesPerson!.id);
  await page.getByRole("button", { name: "Abrir conversa" }).click();
  await expect(page.getByRole("heading", { name: /@ Comercial Demo/i })).toBeVisible();
  const withDirect = await apiRequest<Channel[]>(admin.access_token, "/team/channels");
  expect(withDirect.some((channel) => channel.directKey && channel.members?.some((member) => member.id === salesPerson!.id))).toBe(true);
});
