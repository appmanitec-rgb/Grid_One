const rawApiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "");
const API_PROXY_BASE_URL = "/api";

function getApiBaseUrl(): string {
  if (rawApiBaseUrl) return rawApiBaseUrl;

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const isLocalhost =
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

    return isLocalhost ? "http://localhost:3000" : API_PROXY_BASE_URL;
  }

  return "http://localhost:3000";
}

export const API_BASE_URL = getApiBaseUrl();

export function apiUrl(path: string): string {
  const baseUrl = getApiBaseUrl();

  if (!path) return baseUrl;
  if (/^https?:\/\//i.test(path)) return path;

  if (
    baseUrl === API_PROXY_BASE_URL &&
    (path === API_PROXY_BASE_URL || path.startsWith(`${API_PROXY_BASE_URL}/`))
  ) {
    return path;
  }

  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
