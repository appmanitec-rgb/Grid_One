export type DashboardTone = "blue" | "emerald" | "amber" | "rose" | "slate";
export type DashboardFeedItem = {
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
  status?: string;
  dueAt?: string | null;
  tone?: DashboardTone;
};
export type DashboardOverview = {
  audience: "EXECUTIVE" | "SUPPLIES" | "COMMERCIAL" | "DEPARTMENT";
  department: string;
  title: string;
  description: string;
  metrics: Array<{
    id: string;
    label: string;
    value: number;
    helper: string;
    href?: string;
    tone: DashboardTone;
  }>;
  sections: Array<{
    id: string;
    title: string;
    description: string;
    total: number;
    items: DashboardFeedItem[];
    href?: string;
    emptyMessage: string;
    notice?: string;
  }>;
  shortcuts: Array<{ id: string; label: string; href: string }>;
  canViewCommercial: boolean;
  canSeparate: boolean;
  canManageValidity: boolean;
  generatedAt: string;
};
