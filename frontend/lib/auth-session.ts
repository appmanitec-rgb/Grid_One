import { apiUrl } from "./api-base";

const TOKEN_KEY = "manitec_token";
const REFRESH_TOKEN_KEY = "manitec_refresh_token";
const REFRESH_EXPIRES_AT_KEY = "manitec_refresh_token_expires_at";
const USER_KEY = "manitec_user";
const DEVICE_ID_KEY = "manitec_device_id";
const TOKEN_REFRESH_WINDOW_SECONDS = 90;

export type AuthTokenPayload = {
  sub?: string;
  email?: string;
  name?: string;
  role?: string;
  exp?: number;
  accessPolicy?: unknown;
  isSystemMaster?: boolean;
  mfaSetupRequired?: boolean;
};

type PersistedAuthSession = {
  access_token?: string | null;
  refresh_token?: string | null;
  refresh_token_expires_at?: string | null;
  user?: unknown;
};

let refreshPromise: Promise<boolean> | null = null;

function isBrowser() {
  return typeof window !== "undefined";
}

function decodeBase64UrlValue(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function decodeJwtPayload<T extends Record<string, unknown> = AuthTokenPayload>(
  token: string,
) {
  try {
    const payloadBase64 = token.split(".")[1];
    if (!payloadBase64) {
      return null;
    }
    return JSON.parse(decodeBase64UrlValue(payloadBase64)) as T;
  } catch {
    return null;
  }
}

export function getStoredAccessToken() {
  if (!isBrowser()) return null;
  return localStorage.getItem(TOKEN_KEY);
}

function getStoredRefreshToken() {
  if (!isBrowser()) return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function createDeviceId() {
  if (!isBrowser()) return null;
  if (typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `device-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function getOrCreateDeviceId() {
  if (!isBrowser()) return null;

  const saved = localStorage.getItem(DEVICE_ID_KEY);
  if (saved) {
    return saved;
  }

  const nextId = createDeviceId();
  if (!nextId) {
    return null;
  }

  localStorage.setItem(DEVICE_ID_KEY, nextId);
  return nextId;
}

export function getDeviceName() {
  if (!isBrowser()) return undefined;

  const parts = [navigator.platform, navigator.language].filter(Boolean);
  const summary = `${parts.join(" | ")}${parts.length ? " | " : ""}${navigator.userAgent}`;
  return summary.slice(0, 255);
}

export function clearAuthSession(options: { keepDeviceId?: boolean } = {}) {
  if (!isBrowser()) return;

  const keepDeviceId = options.keepDeviceId !== false;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(REFRESH_EXPIRES_AT_KEY);
  localStorage.removeItem(USER_KEY);

  if (!keepDeviceId) {
    localStorage.removeItem(DEVICE_ID_KEY);
  }
}

export function persistPendingAccessToken(accessToken: string) {
  if (!isBrowser()) return;

  clearAuthSession();
  localStorage.setItem(TOKEN_KEY, accessToken);
}

export function persistAuthenticatedSession(session: PersistedAuthSession) {
  if (!isBrowser()) return;

  if (session.access_token) {
    localStorage.setItem(TOKEN_KEY, session.access_token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }

  if (session.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refresh_token);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  if (session.refresh_token_expires_at) {
    localStorage.setItem(REFRESH_EXPIRES_AT_KEY, session.refresh_token_expires_at);
  } else {
    localStorage.removeItem(REFRESH_EXPIRES_AT_KEY);
  }

  if (typeof session.user !== "undefined") {
    localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

function isTokenExpiringSoon(token: string, withinSeconds = TOKEN_REFRESH_WINDOW_SECONDS) {
  const payload = decodeJwtPayload<AuthTokenPayload>(token);
  if (!payload?.exp) {
    return true;
  }

  return payload.exp * 1000 <= Date.now() + withinSeconds * 1000;
}

async function runRefreshRequest() {
  const refreshToken = getStoredRefreshToken();
  const deviceId = getOrCreateDeviceId();
  if (!refreshToken || !deviceId) {
    return false;
  }

  try {
    const response = await fetch(apiUrl("/auth/refresh"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refreshToken,
        deviceId,
        deviceName: getDeviceName(),
      }),
    });

    if (!response.ok) {
      if (response.status >= 400 && response.status < 500) {
        clearAuthSession();
      }
      return false;
    }

    const payload = (await response.json()) as PersistedAuthSession | null;
    if (!payload?.access_token || !payload?.refresh_token) {
      clearAuthSession();
      return false;
    }

    persistAuthenticatedSession(payload);
    return true;
  } catch {
    return false;
  }
}

export async function refreshAccessSession() {
  if (!isBrowser()) {
    return false;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = runRefreshRequest().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export async function ensureValidSession() {
  const accessToken = getStoredAccessToken();
  if (accessToken && !isTokenExpiringSoon(accessToken)) {
    return true;
  }

  if (!getStoredRefreshToken()) {
    return false;
  }

  return refreshAccessSession();
}
