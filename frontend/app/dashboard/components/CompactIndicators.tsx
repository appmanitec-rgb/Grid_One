"use client";
import { useEffect, useState, type ReactNode } from "react";
import { InterfaceIcon } from "./InterfaceIcon";

export default function CompactIndicators({
  summary,
  children,
  initiallyOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  initiallyOpen?: boolean;
}) {
  const [expanded, setExpanded] = useState(initiallyOpen);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setExpanded(initiallyOpen || media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [initiallyOpen]);
  return (
    <details
      className="dashboard-indicators"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <span className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1">
          {expanded ? "Indicadores do módulo" : summary}
        </span>
        <span className="ml-auto inline-flex shrink-0 items-center gap-2 text-xs text-[var(--text-muted)]">
          {expanded ? "Recolher" : "Indicadores"}
          <InterfaceIcon name="chevron-down" className="h-4 w-4" />
        </span>
      </summary>
      <div className="dashboard-indicators-body">{children}</div>
    </details>
  );
}
