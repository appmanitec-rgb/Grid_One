import { decodeJwtPayload, getStoredAccessToken } from "./auth-session";

export type DashboardThemeId = "mist" | "linen" | "sage" | "slate";
export type DashboardColorMode = "light" | "dark";
export type DashboardThemeOption = {
  id: DashboardThemeId;
  label: string;
  description: string;
  preview: [string, string, string];
  darkPreview: [string, string, string];
};
const STORAGE_KEY_PREFIX = "manitec_dashboard_theme";
const MODE_KEY_PREFIX = "manitec_dashboard_mode";
export const DEFAULT_DASHBOARD_THEME: DashboardThemeId = "mist";
export const DEFAULT_DASHBOARD_MODE: DashboardColorMode = "light";
export const DASHBOARD_THEME_OPTIONS: DashboardThemeOption[] = [
  {
    id: "mist",
    label: "Neblina",
    description: "Azul suave e discreto.",
    preview: ["#eef2f6", "#dce4ec", "#8fa1b4"],
    darkPreview: ["#0d1522", "#182538", "#7da8f5"],
  },
  {
    id: "linen",
    label: "Marfim",
    description: "Tons quentes e acolhedores.",
    preview: ["#f4f1eb", "#e4ddd3", "#a69278"],
    darkPreview: ["#191614", "#28231e", "#d1a477"],
  },
  {
    id: "sage",
    label: "Mineral",
    description: "Verde mineral equilibrado.",
    preview: ["#edf1ee", "#dbe2dd", "#87978d"],
    darkPreview: ["#101a18", "#1c2b27", "#83bba4"],
  },
  {
    id: "slate",
    label: "Grafite",
    description: "Cinza contemporâneo.",
    preview: ["#ebeff3", "#d7dfe7", "#7e8e9f"],
    darkPreview: ["#13161c", "#222731", "#a0b0c8"],
  },
];
function resolveUserStorageKey(prefix: string) {
  const token = getStoredAccessToken();
  const payload = token ? decodeJwtPayload<{ sub?: string }>(token) : null;
  const userId =
    typeof payload?.sub === "string" && payload.sub.trim()
      ? payload.sub
      : "default";
  return `${prefix}:${userId}`;
}
export function isDashboardThemeId(
  value: string | null | undefined,
): value is DashboardThemeId {
  return DASHBOARD_THEME_OPTIONS.some((option) => option.id === value);
}
export function resolveDashboardTheme(
  value: string | null | undefined,
): DashboardThemeId {
  return isDashboardThemeId(value) ? value : DEFAULT_DASHBOARD_THEME;
}
export function readStoredDashboardTheme() {
  if (typeof window === "undefined") return DEFAULT_DASHBOARD_THEME;
  try {
    return resolveDashboardTheme(
      localStorage.getItem(resolveUserStorageKey(STORAGE_KEY_PREFIX)),
    );
  } catch {
    return DEFAULT_DASHBOARD_THEME;
  }
}
export function readStoredDashboardMode(): DashboardColorMode {
  if (typeof window === "undefined") return DEFAULT_DASHBOARD_MODE;
  try {
    return localStorage.getItem(resolveUserStorageKey(MODE_KEY_PREFIX)) ===
      "dark"
      ? "dark"
      : "light";
  } catch {
    return DEFAULT_DASHBOARD_MODE;
  }
}
export function saveStoredDashboardTheme(themeId: DashboardThemeId) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(resolveUserStorageKey(STORAGE_KEY_PREFIX), themeId);
  } catch {
    /* Preference storage may be unavailable. */
  }
}
export function saveStoredDashboardMode(mode: DashboardColorMode) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(resolveUserStorageKey(MODE_KEY_PREFIX), mode);
  } catch {
    /* Keep the selected appearance for this visit. */
  }
}
export function applyDashboardTheme(
  themeId: DashboardThemeId,
  mode: DashboardColorMode = DEFAULT_DASHBOARD_MODE,
) {
  if (typeof document === "undefined") return;
  for (const element of [document.documentElement, document.body]) {
    element.setAttribute("data-manitec-theme", themeId);
    element.setAttribute("data-manitec-mode", mode);
  }
}
export function clearAppliedDashboardTheme() {
  if (typeof document === "undefined") return;
  for (const element of [document.documentElement, document.body]) {
    element.removeAttribute("data-manitec-theme");
    element.removeAttribute("data-manitec-mode");
  }
}
