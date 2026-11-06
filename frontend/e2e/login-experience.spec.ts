import { expect, test, type Page, type Route } from "@playwright/test";

type FixtureHandler = (path: string, route: Route) => Promise<void>;

async function mockAuthentication(page: Page, handler: FixtureHandler) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    await handler(path, route);
  });
}

async function enterCredentials(page: Page) {
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("visual@example.invalid");
  await page.getByLabel("Senha", { exact: true }).fill("senha-ficticia");
}

const unknownEndpoint = (route: Route) =>
  route.fulfill({ status: 404, json: {} });

test("login preserves input, keyboard access and recoverable authentication errors", async ({
  page,
}) => {
  let pending: Route | undefined;
  await mockAuthentication(page, async (path, route) => {
    if (path === "/auth/login") {
      pending = route;
      return;
    }
    await unknownEndpoint(route);
  });
  await page.goto("/");
  await enterCredentials(page);
  const password = page.getByLabel("Senha", { exact: true });
  await password.focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Mostrar senha", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("senha-ficticia");
  await page
    .getByRole("button", { name: "Ocultar senha", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "password");
  await page
    .getByRole("button", { name: "Acessar o GridOne", exact: true })
    .click();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await expect(
    page.getByRole("button", { name: "Entrando...", exact: true }),
  ).toBeDisabled();
  await pending!.fulfill({
    status: 401,
    json: { message: "E-mail ou senha incorretos. Confira e tente novamente." },
  });
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "E-mail ou senha incorretos",
  );
  await expect(password).toHaveValue("senha-ficticia");
  await expect(
    page.getByRole("button", { name: "Acessar o GridOne", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("link", { name: "Acessar portal do cliente", exact: true }),
  ).toHaveAttribute("href", "/cliente/entrar");
});

test("MFA challenge remains usable on mobile and can return to login", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let verified = false;
  await mockAuthentication(page, async (path, route) => {
    if (path === "/auth/login")
      return route.fulfill({
        json: { mfa_required: true, challengeToken: "visual-fixture" },
      });
    if (path === "/auth/mfa/verify") {
      const body = route.request().postDataJSON();
      verified =
        body.challengeToken === "visual-fixture" && body.code === "123456";
      return route.fulfill({
        status: 401,
        json: { message: "Código inválido. Tente novamente." },
      });
    }
    await unknownEndpoint(route);
  });
  await page.goto("/");
  await enterCredentials(page);
  await page
    .getByRole("button", { name: "Acessar o GridOne", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Confirme seu acesso", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Código de verificação", { exact: true })
    .fill("123456");
  await page
    .getByRole("button", { name: "Validar código", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Código inválido");
  expect(verified).toBe(true);
  await page
    .getByRole("button", { name: "Voltar ao login", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Acesse sua conta", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(
    "visual@example.invalid",
  );
});

test("MFA setup displays the QR code and submits the existing setup flow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const payload = Buffer.from(
    JSON.stringify({
      sub: "visual-fixture",
      role: "ADMIN",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url");
  let verified = false;
  await mockAuthentication(page, async (path, route) => {
    if (path === "/auth/login")
      return route.fulfill({
        json: {
          mfa_setup_required: true,
          access_token: "fixture." + payload + ".fixture",
        },
      });
    if (path === "/auth/mfa/setup")
      return route.fulfill({
        json: {
          issuer: "Manitec",
          otpAuthUrl: "otpauth://totp/Visual?secret=FICTICIO",
          qrCodeDataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG3cAAAAASUVORK5CYII=",
        },
      });
    if (path === "/auth/mfa/verify-setup") {
      verified = route.request().postDataJSON().code === "123456";
      return route.fulfill({
        status: 400,
        json: { message: "Código inválido. Confira seu aplicativo." },
      });
    }
    await unknownEndpoint(route);
  });
  await page.goto("/");
  await enterCredentials(page);
  await page
    .getByRole("button", { name: "Acessar o GridOne", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Proteja sua conta", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "QR Code para configurar autenticação",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Código do aplicativo", { exact: true }).fill("123456");
  await page
    .getByRole("button", { name: "Concluir configuração", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Código inválido");
  expect(verified).toBe(true);
});
