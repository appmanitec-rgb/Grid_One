import type { ReactNode } from "react";

export function WorkspaceState({ title, description, tone = "empty", actions }: {
  title: string;
  description?: string;
  tone?: "empty" | "loading" | "error" | "success";
  actions?: ReactNode;
}) {
  return (
    <div className={`workspace-state workspace-state--${tone}`} role={tone === "error" ? "alert" : tone === "loading" || tone === "success" ? "status" : undefined} aria-live={tone === "empty" ? undefined : "polite"}>
      <span className="workspace-state-icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          {tone === "loading" ? <path d="M20 12a8 8 0 1 1-8-8" /> : tone === "success" ? <path d="m5 12 4 4L19 6" /> : <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 8h8M8 12h8M8 16h4" /></>}
        </svg>
      </span>
      <div className="min-w-0 flex-1"><p className="workspace-state-title">{title}</p>{description && <p className="workspace-state-description">{description}</p>}{actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}</div>
    </div>
  );
}
