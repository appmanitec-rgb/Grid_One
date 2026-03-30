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
    label: "Brisa Azul",
    description: "Mantem a leitura clara, mas com um azul bem mais suave.",
    preview: ["#eff4fa", "#dbe7f3", "#9bb7d2"],
  },
  {
    id: "linen",
    label: "Areia Quente",
    description: "Tira o gelo do fundo e traz uma base mais cremosa.",
    preview: ["#f5efe6", "#eadfcf", "#b88a55"],
  },
  {
    id: "sage",
    label: "Sage Operacao",
    description: "Mais fosco e tecnico, com verde acinzentado discreto.",
    preview: ["#edf3ef", "#d8e5dc", "#7a9484"],
  },
  {
    id: "slate",
    label: "Aco Suave",
    description: "Mais denso e elegante sem cair em dark mode.",
    preview: ["#e8edf3", "#d4dde8", "#6f879e"],
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
}

export function clearAppliedDashboardTheme() {
  if (typeof document === "undefined") return;
  document.documentElement.removeAttribute("data-manitec-theme");
}
