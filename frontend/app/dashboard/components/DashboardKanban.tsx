"use client";

import { ReactNode, useCallback, useRef } from "react";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function DashboardKanban({
  children,
  className,
  trackClassName,
  ariaLabel = "Kanban",
}: {
  children: ReactNode;
  className?: string;
  trackClassName?: string;
  ariaLabel?: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const getTrack = useCallback((source?: HTMLElement | null) => {
    if (scrollRef.current) return scrollRef.current;
    return source
      ?.closest("[data-kanban-frame]")
      ?.querySelector<HTMLElement>("[data-kanban-track]") ?? null;
  }, []);

  const nudgeScroll = useCallback(
    (direction: "left" | "right", source?: HTMLElement | null) => {
      const element = getTrack(source);
      if (!element) return;

      const amount = Math.max(360, Math.round(element.clientWidth * 0.78));
      const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth);
      const next = Math.min(
        maxScroll,
        Math.max(0, element.scrollLeft + (direction === "left" ? -amount : amount)),
      );

      element.scrollLeft = next;
    },
    [getTrack],
  );

  return (
    <div
      className="dashboard-kanban-frame grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[3rem_minmax(0,1fr)_3rem]"
      data-kanban-frame
      aria-label={ariaLabel}
    >
      <KanbanScrollButton direction="left" onNudge={nudgeScroll} />
      <div
        className={cx(
          "dashboard-kanban-shell min-w-0 rounded-[30px] border border-slate-200 bg-[radial-gradient(circle_at_top,rgba(19,104,180,0.08),transparent_35%),linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-4 shadow-[0_32px_80px_-60px_rgba(15,31,50,0.45)]",
          className,
        )}
      >
        <div
          ref={scrollRef}
          data-kanban-track
          className={cx(
            "dashboard-kanban-track flex gap-4 overflow-x-auto px-1 pb-2",
            trackClassName,
          )}
        >
          {children}
        </div>
      </div>
      <KanbanScrollButton direction="right" onNudge={nudgeScroll} />
    </div>
  );
}

function KanbanScrollButton({
  direction,
  onNudge,
}: {
  direction: "left" | "right";
  onNudge: (direction: "left" | "right", source?: HTMLElement | null) => void;
}) {
  return (
    <button
      type="button"
      aria-label={
        direction === "left"
          ? "Rolar kanban para a esquerda"
          : "Rolar kanban para a direita"
      }
      onPointerDownCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onNudge(direction, event.currentTarget);
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.detail === 0) {
          onNudge(direction, event.currentTarget);
        }
      }}
      className="dashboard-kanban-side-button hidden sm:flex"
    >
      {direction === "left" ? "<" : ">"}
    </button>
  );
}
