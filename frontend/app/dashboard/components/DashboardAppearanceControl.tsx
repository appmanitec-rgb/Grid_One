"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  DASHBOARD_THEME_OPTIONS,
  type DashboardColorMode,
  type DashboardThemeId,
} from "@/lib/dashboard-appearance";

function ModeIcon({ dark }: { dark: boolean }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {dark ? (
        <path d="M20.5 13.2A8.5 8.5 0 0 1 10.8 3.5 8.5 8.5 0 1 0 20.5 13.2Z" />
      ) : (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4" />
        </>
      )}
    </svg>
  );
}
export default function DashboardAppearanceControl({
  themeId,
  colorMode,
  onChange,
  onChangeMode,
}: {
  themeId: DashboardThemeId;
  colorMode: DashboardColorMode;
  onChange: (themeId: DashboardThemeId) => void;
  onChangeMode: (mode: DashboardColorMode) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const popoverId = useId();
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node))
        setIsOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [isOpen]);
  const activeTheme =
    DASHBOARD_THEME_OPTIONS.find((o) => o.id === themeId) ||
    DASHBOARD_THEME_OPTIONS[0];
  const dark = colorMode === "dark";
  return (
    <div ref={containerRef} className="relative">
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="dashboard-topbar-control inline-flex h-9 w-9 items-center justify-center rounded-xl border text-xs font-semibold shadow-sm"
        title="Tema"
        aria-label="Tema"
        aria-expanded={isOpen}
        aria-controls={popoverId}
        aria-haspopup="dialog"
      >
        <span className="flex items-center gap-1" aria-hidden="true">
          {(dark ? activeTheme.darkPreview : activeTheme.preview).map(
            (color, index) => (
              <span
                key={index}
                className="h-2.5 w-2.5 rounded-full border border-white/40"
                style={{ backgroundColor: color }}
              />
            ),
          )}
        </span>
      </button>
      {isOpen ? (
        <section
          id={popoverId}
          role="dialog"
          aria-labelledby={popoverId + "-title"}
          className="dashboard-appearance-popover fixed right-3 top-[82px] z-30 sm:absolute sm:right-0 sm:top-[calc(100%+0.6rem)] w-[min(320px,calc(100vw-1.5rem))] overflow-y-auto rounded-[22px] border p-3 shadow-xl"
          style={{ maxHeight: "calc(100dvh - 100px)" }}
        >
          <div className="px-2 pb-3">
            <h2
              id={popoverId + "-title"}
              className="appearance-heading text-sm font-bold"
            >
              Aparência
            </h2>
            <p className="appearance-description mt-1 text-xs leading-5">
              Um ambiente confortável para o seu dia.
            </p>
          </div>
          <div
            role="group"
            aria-label="Luminosidade do tema"
            className="appearance-modes mb-4 grid grid-cols-2 gap-1 rounded-xl border p-1"
          >
            {(["light", "dark"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={colorMode === mode}
                onClick={() => onChangeMode(mode)}
                className="appearance-mode flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold"
              >
                <ModeIcon dark={mode === "dark"} />
                {mode === "dark" ? "Escuro" : "Claro"}
              </button>
            ))}
          </div>
          <p className="appearance-description mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.14em]">
            Paleta de cores
          </p>
          <div role="group" aria-label="Paleta de cores" className="space-y-2">
            {DASHBOARD_THEME_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={option.id === themeId}
                onClick={() => onChange(option.id)}
                className="appearance-palette flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left"
              >
                <span
                  className="flex shrink-0 items-center -space-x-1"
                  aria-hidden="true"
                >
                  {(dark ? option.darkPreview : option.preview).map(
                    (color, index) => (
                      <span
                        key={index}
                        className="appearance-swatch h-4 w-4 rounded-full border"
                        style={{ backgroundColor: color }}
                      />
                    ),
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {option.label}
                  </span>
                  <span className="appearance-description mt-0.5 block text-[11px] leading-4">
                    {option.description}
                  </span>
                </span>
                {option.id === themeId ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.3"
                    aria-hidden="true"
                  >
                    <path d="m5 12 4 4 10-10" />
                  </svg>
                ) : null}
              </button>
            ))}
          </div>
          <p className="appearance-description mt-3 px-2 text-[11px] leading-4">
            Preferência salva para o seu usuário neste navegador.
          </p>
        </section>
      ) : null}
    </div>
  );
}
