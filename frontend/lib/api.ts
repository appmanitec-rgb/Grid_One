import { apiUrl } from "./api-base";
import {
  clearAuthSession,
  ensureValidSession,
  getStoredAccessToken,
  refreshAccessSession,
} from "./auth-session";

export { apiUrl } from "./api-base";

function shouldBypassSessionHandling(url: string) {
  return /\/auth\/(login|mfa\/verify|refresh)(?:$|\?)/.test(url);
}

export function withAuthHeaders(
  headers?: HeadersInit,
  options: { overrideAuthorization?: boolean } = {},
): Headers {
  const merged = new Headers(headers);
  if (typeof window !== "undefined") {
    const token = getStoredAccessToken();
    if (token && (options.overrideAuthorization || !merged.has("Authorization"))) {
      merged.set("Authorization", `Bearer ${token}`);
    }
  }
  return merged;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const targetUrl = apiUrl(path);
  const bypassSessionHandling = shouldBypassSessionHandling(targetUrl);

  if (typeof window !== "undefined" && !bypassSessionHandling) {
    await ensureValidSession();
  }

  let response = await fetch(targetUrl, {
    ...init,
    headers: bypassSessionHandling
      ? new Headers(init.headers)
      : withAuthHeaders(init.headers, { overrideAuthorization: true }),
  });

  if (typeof window !== "undefined" && !bypassSessionHandling && response.status === 401) {
    const refreshed = await refreshAccessSession();
    if (refreshed) {
      response = await fetch(targetUrl, {
        ...init,
        headers: withAuthHeaders(init.headers, { overrideAuthorization: true }),
      });
    } else {
      clearAuthSession();
    }
  }

  return response;
}

export async function readApiErrorMessage(
  response: Response,
  fallback: string,
) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const payload = (await response.clone().json()) as {
        message?: string | string[];
      };
      if (Array.isArray(payload.message)) {
        return payload.message.join(", ") || fallback;
      }
      if (typeof payload.message === "string" && payload.message.trim()) {
        return payload.message;
      }
    } catch {}
  }

  try {
    const text = (await response.clone().text()).trim();
    if (text) return text;
  } catch {}

  return fallback;
}
