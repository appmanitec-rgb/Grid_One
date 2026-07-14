import { createHmac } from "crypto";
import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import { expect, Page } from "@playwright/test";
import {
  API_BASE_URL,
  E2E_TOTP_SECRET,
  E2eAccount,
  E2eEntityData,
  accounts,
  findEntityId,
} from "./test-data";

type LoginResponse = {
  access_token: string;
  refresh_token?: string;
  refresh_token_expires_at?: string;
  user?: unknown;
};

type ApiRequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

let e2eEntityDataPromise: Promise<E2eEntityData> | null = null;
const apiLoginPromises = new Map<string, Promise<LoginResponse>>();

function persistBrowserSession(value: LoginResponse) {
  localStorage.setItem("manitec_token", value.access_token);
  if (value.refresh_token) {
    localStorage.setItem("manitec_refresh_token", value.refresh_token);
  }
  if (value.refresh_token_expires_at) {
    localStorage.setItem(
      "manitec_refresh_token_expires_at",
      value.refresh_token_expires_at,
    );
  }
  if (typeof value.user !== "undefined") {
    localStorage.setItem("manitec_user", JSON.stringify(value.user));
  }
  localStorage.setItem("manitec_device_id", `playwright-${Date.now()}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function gotoWithRetry(page: Page, url: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      return;
    } catch (error) {
      lastError = error;
      await sleep(500 * attempt);
    }
  }
  throw lastError;
}

async function fillLoginFields(
  emailInput: ReturnType<Page["locator"]>,
  passwordInput: ReturnType<Page["locator"]>,
  account: E2eAccount,
) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await emailInput.fill("");
    await emailInput.fill(account.email);
    await passwordInput.fill("");
    await passwordInput.fill(account.password);
    await sleep(250 * attempt);

    const [emailValue, passwordValue] = await Promise.all([
      emailInput.inputValue(),
      passwordInput.inputValue(),
    ]);
    if (emailValue === account.email && passwordValue === account.password) {
      return;
    }
  }

  await expect(emailInput).toHaveValue(account.email);
  await expect(passwordInput).toHaveValue(account.password);
}

function base32Decode(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = value.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = "";
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error(`Base32 invalido: ${char}`);
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotp(secret = E2E_TOTP_SECRET, now = Date.now()) {
  const counter = Math.floor(now / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter & 0xffffffff, 4);
  const hmac = createHmac("sha1", base32Decode(secret))
    .update(counterBuffer)
    .digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export async function apiRequest<T>(
  token: string | undefined,
  path: string,
  options: ApiRequestOptions = {},
) {
  const response = await apiRequestRaw(token, path, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${options.method ?? "GET"} ${path} falhou: ${response.status} ${text}`);
  }
  return (await response.json()) as T;
}

export async function apiRequestRaw(
  token: string | undefined,
  path: string,
  options: ApiRequestOptions = {},
) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const method = options.method ?? "GET";
  const body = options.body ? JSON.stringify(options.body) : undefined;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Connection: "close",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  if (body) {
    headers["Content-Length"] = String(Buffer.byteLength(body));
  }

  return new Promise<Response>((resolve, reject) => {
    const url = new URL(`${API_BASE_URL}${path}`);
    const client = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = client(
      url,
      {
        method,
        headers,
        timeout: timeoutMs,
        agent: false,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          const responseHeaders = new Headers();
          for (const [key, value] of Object.entries(response.headers)) {
            if (Array.isArray(value)) {
              for (const item of value) responseHeaders.append(key, item);
            } else if (typeof value === "string") {
              responseHeaders.append(key, value);
            }
          }
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode ?? 500,
              headers: responseHeaders,
            }),
          );
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error(`${method} ${path} excedeu ${timeoutMs}ms`));
    });
    request.on("error", reject);
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

async function requestApiLogin(account: E2eAccount) {
  const payload: Record<string, unknown> = {
    email: account.email,
    password: account.password,
  };
  if (account.internal) {
    payload.mfaCode = generateTotp();
  }
  return apiRequest<LoginResponse>(undefined, "/auth/login", {
    method: "POST",
    body: payload,
    timeoutMs: 60_000,
  });
}

export async function apiLogin(account: E2eAccount) {
  const cached = apiLoginPromises.get(account.key);
  if (cached) return cached;

  const loginPromise = (async () => {
    try {
      return await requestApiLogin(account);
    } catch {
      await sleep(1_000);
      return requestApiLogin(account);
    }
  })().catch((error) => {
    apiLoginPromises.delete(account.key);
    throw error;
  });

  apiLoginPromises.set(account.key, loginPromise);
  return loginPromise;
}

export async function loginByUi(page: Page, account: E2eAccount) {
  await gotoWithRetry(page, "/");
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  await expect(emailInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  await fillLoginFields(emailInput, passwordInput, account);
  await page.getByRole("button", { name: /entrar no sistema/i }).click();

  if (account.internal) {
    await expect(page.getByText(/MFA habilitado/i)).toBeVisible();
    await page.locator('input[type="text"]').first().fill(generateTotp());
    await page.getByRole("button", { name: /validar MFA/i }).click();
  }

  await expect(page).toHaveURL(new RegExp(account.expectedStartPath));
}

export async function loginByApi(page: Page, account: E2eAccount) {
  const session = await apiLogin(account);
  await page.addInitScript(persistBrowserSession, session);
  return session;
}

async function loadE2eEntityData(): Promise<E2eEntityData> {
  const admin = await apiLogin(accounts.admin);
  const token = admin.access_token;
  const [generators, tickets, orders, reports] = await Promise.all([
    apiRequest<Record<string, unknown>[]>(token, "/generators"),
    apiRequest<Record<string, unknown>[]>(token, "/tickets"),
    apiRequest<Record<string, unknown>[]>(token, "/maintenance-orders"),
    apiRequest<Record<string, unknown>[]>(token, "/service-reports"),
  ]);

  return {
    clientAEquipmentId: findEntityId(
      generators,
      (row) => row.serialNumber === "DEMO-GMG-0001",
      "equipamento Cliente A",
    ),
    clientBEquipmentId: findEntityId(
      generators,
      (row) => row.serialNumber === "DEMO-GMG-B-0001",
      "equipamento Cliente B",
    ),
    clientATicketId: findEntityId(
      tickets,
      (row) => row.code === "TCK-E2E-A",
      "chamado Cliente A",
    ),
    clientBTicketId: findEntityId(
      tickets,
      (row) => row.code === "TCK-E2E-B",
      "chamado Cliente B",
    ),
    technicianOrderId: findEntityId(
      orders,
      (row) => row.title === "OS DEMO - Preventiva contratual mensal",
      "OS do tecnico principal",
    ),
    otherTechnicianOrderId: findEntityId(
      orders,
      (row) => row.title === "OS DEMO - Atendimento Cliente B tecnico secundario",
      "OS de outro tecnico",
    ),
    serviceReportAId: findEntityId(
      reports,
      (row) => row.code === "LR-E2E-90001",
      "laudo Cliente A",
    ),
    serviceReportBId: findEntityId(
      reports,
      (row) => row.code === "LR-E2E-90002",
      "laudo Cliente B",
    ),
  };
}

export async function getE2eEntityData(): Promise<E2eEntityData> {
  e2eEntityDataPromise ??= loadE2eEntityData();
  return e2eEntityDataPromise;
}
