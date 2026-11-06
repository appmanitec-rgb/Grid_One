import { expect, test, type Page, type Route } from "@playwright/test";

async function clientCredentials(page: Page) {
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("cliente@example.invalid");
  await page.getByLabel("Senha", { exact: true }).fill("senha-ficticia");
}

test("client sign-in preserves credentials and rejects an employee session", async ({
  page,
}) => {
  let pending: Route | undefined;
  let attempts = 0;
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/auth/client-login") {
      attempts++;
      if (attempts === 1) {
        pending = route;
        return;
      }
      return route.fulfill({
        json: { access_token: "fixture", user: { role: "ADMIN" } },
      });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto("/cliente/entrar");
  await clientCredentials(page);
  const password = page.getByLabel("Senha", { exact: true });
  await password.focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Mostrar senha", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "text");
  await page
    .getByRole("button", { name: "Ocultar senha", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "password");
  await page
    .getByRole("button", { name: "Entrar no portal", exact: true })
    .click();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await expect(
    page.getByRole("button", { name: "Aguarde...", exact: true }),
  ).toBeDisabled();
  await pending!.fulfill({
    status: 401,
    json: { message: "E-mail ou senha inválidos." },
  });
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "E-mail ou senha inválidos",
  );
  await expect(password).toHaveValue("senha-ficticia");
  await page
    .getByRole("button", { name: "Entrar no portal", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "não está vinculada a um cliente",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("manitec_token")),
  ).toBeNull();
  await expect(page).toHaveURL(/\/cliente\/entrar$/);
  await page
    .getByRole("link", { name: "Acesso da equipe", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Acesse sua conta", exact: true }),
  ).toBeVisible();
});

test("client MFA retains its challenge and allows returning to email and password", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let verified = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/client-login")
      return route.fulfill({
        json: { mfa_required: true, challengeToken: "client-visual-fixture" },
      });
    if (path === "/api/auth/mfa/verify") {
      const body = route.request().postDataJSON();
      verified =
        body.challengeToken === "client-visual-fixture" &&
        body.code === "123456";
      return route.fulfill({
        status: 401,
        json: { message: "Código de verificação inválido." },
      });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto("/cliente/entrar");
  await clientCredentials(page);
  await page
    .getByRole("button", { name: "Entrar no portal", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Confirme seu acesso", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Código de verificação", { exact: true })
    .fill("123456");
  await page
    .getByRole("button", { name: "Confirmar código", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Código de verificação inválido",
  );
  expect(verified).toBe(true);
  await page
    .getByRole("button", { name: "Voltar para e-mail e senha", exact: true })
    .click();
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(
    "cliente@example.invalid",
  );
});

test("incomplete activation link explains how to recover without requesting a password", async ({
  page,
}) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 404, json: {} }),
  );
  await page.goto("/cliente/ativar");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Link de ativação incompleto",
  );
  await expect(page.getByLabel("Nova senha", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Acesso da equipe", exact: true }),
  ).toHaveAttribute("href", "/");
});

test("activation validates confirmation, recovers from an error and clears the token on completion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let requests = 0,
    validBody = false;
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname !== "/api/auth/client-activate")
      return route.fulfill({ status: 404, json: {} });
    requests++;
    const body = route.request().postDataJSON();
    validBody =
      body.token === "client-activation-fixture" &&
      body.password === "SenhaFicticia123!";
    return route.fulfill(
      requests === 1
        ? {
            status: 503,
            json: { message: "Falha temporária. Tente novamente." },
          }
        : { json: {} },
    );
  });
  await page.goto("/cliente/ativar#token=client-activation-fixture");
  const password = page.getByLabel("Nova senha", { exact: true }),
    confirmation = page.getByLabel("Confirme a senha", { exact: true });
  await password.fill("SenhaFicticia123!");
  await confirmation.fill("OutraSenhaFicticia123!");
  await page
    .getByRole("button", { name: "Mostrar senhas", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(confirmation).toHaveAttribute("type", "text");
  await page
    .getByRole("button", { name: "Ocultar senhas", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ativar meu acesso", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "As senhas não coincidem",
  );
  expect(requests).toBe(0);
  await confirmation.fill("SenhaFicticia123!");
  await page
    .getByRole("button", { name: "Ativar meu acesso", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Falha temporária",
  );
  await expect(password).toHaveValue("SenhaFicticia123!");
  await page
    .getByRole("button", { name: "Ativar meu acesso", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Acesso pronto", exact: true }),
  ).toBeVisible();
  expect(validBody).toBe(true);
  expect(new URL(page.url()).hash).toBe("");
  await expect(page.getByLabel("Nova senha", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Entrar no meu portal", exact: true }),
  ).toHaveAttribute("href", "/cliente/entrar");
});
