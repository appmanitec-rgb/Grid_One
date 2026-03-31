import { decodeJwtPayload, getStoredAccessToken } from "./auth-session";

export type DashboardThemeId = "mist" | "linen" | "sage" | "slate";

export type DashboardThemeOption = {
  id: DashboardThemeId;
  label: string;
  description: string;
  preview: [string, string, string];
};

const STORAGE_KEY_PREFIX = "manitec_dashboard_theme";

export const DEFAULT_DASHBOARD_THEME: DashboardThemeId = "mist";

export const DASHBOARD_THEME_OPTIONS: DashboardThemeOption[] = [
  {
    id: "mist",
    label: "Neblina",
    description: "Base fria e discreta.",
    preview: ["#eef2f6", "#dce4ec", "#8fa1b4"],
  },
  {
    id: "linen",
    label: "Marfim",
    description: "Base quente e leve.",
    preview: ["#f4f1eb", "#e4ddd3", "#a69278"],
  },
  {
    id: "sage",
    label: "Mineral",
    description: "Cinza esverdeado suave.",
    preview: ["#edf1ee", "#dbe2dd", "#87978d"],
  },
  {
    id: "slate",
    label: "Grafite",
    description: "Aco azulado discreto.",
    preview: ["#ebeff3", "#d7dfe7", "#7e8e9f"],
  },
];

function resolveUserStorageKey() {
  const token = getStoredAccessToken();
  const payload = token ? decodeJwtPayload<{ sub?: string }>(token) : null;
  const userId =
    typeof payload?.sub === "string" && payload.sub.trim().length > 0
      ? payload.sub
      : "default";

  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

export function isDashboardThemeId(value: string | null | undefined): value is DashboardThemeId {
  return DASHBOARD_THEME_OPTIONS.some((option) => option.id === value);
}

export function resolveDashboardTheme(value: string | null | undefined): DashboardThemeId {
  return isDashboardThemeId(value) ? value : DEFAULT_DASHBOARD_THEME;
}

export function readStoredDashboardTheme() {
  if (typeof window === "undefined") {
    return DEFAULT_DASHBOARD_THEME;
  }

  return resolveDashboardTheme(localStorage.getItem(resolveUserStorageKey()));
}

export function saveStoredDashboardTheme(themeId: DashboardThemeId) {
  if (typeof window === "undefined") return;
  localStorage.setItem(resolveUserStorageKey(), themeId);
}

export function applyDashboardTheme(themeId: DashboardThemeId) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-manitec-theme", themeId);
  document.body.setAttribute("data-manitec-theme", themeId);
}

export function clearAppliedDashboardTheme() {
  if (typeof document === "undefined") return;
  document.documentElement.removeAttribute("data-manitec-theme");
  document.body.removeAttribute("data-manitec-theme");
}
