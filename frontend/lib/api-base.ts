const rawApiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

export const API_BASE_URL = (
  rawApiBaseUrl && rawApiBaseUrl.length > 0 ? rawApiBaseUrl : "http://localhost:3000"
).replace(/\/+$/, "");

export function apiUrl(path: string): string {
  if (!path) return API_BASE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
