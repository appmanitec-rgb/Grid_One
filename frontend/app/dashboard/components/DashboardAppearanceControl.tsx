"use client";

import { useEffect, useRef, useState } from "react";
import {
  DASHBOARD_THEME_OPTIONS,
  type DashboardThemeId,
} from "@/lib/dashboard-appearance";

type DashboardAppearanceControlProps = {
  themeId: DashboardThemeId;
  onChange: (themeId: DashboardThemeId) => void;
};

export default function DashboardAppearanceControl({
  themeId,
  onChange,
}: DashboardAppearanceControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const activeTheme =
    DASHBOARD_THEME_OPTIONS.find((option) => option.id === themeId) ||
    DASHBOARD_THEME_OPTIONS[0];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-white"
      >
        <span className="flex items-center gap-1.5">
          {activeTheme.preview.map((color, index) => (
            <span
              key={`${activeTheme.id}-${index}`}
              className="h-3 w-3 rounded-full border border-white/70 shadow-sm"
              style={{ backgroundColor: color }}
            />
          ))}
        </span>
        <span>Fundo</span>
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.6rem)] z-30 w-[min(320px,calc(100vw-1.5rem))] rounded-[24px] border border-slate-200 bg-white/96 p-3 shadow-[0_26px_60px_-42px_rgba(15,31,50,0.55)] backdrop-blur">
          <div className="px-2 pb-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Aparencia do ambiente
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Escolha o fundo que deixa sua rotina mais confortavel. A preferencia fica salva por usuario.
            </p>
          </div>

          <div className="space-y-2">
            {DASHBOARD_THEME_OPTIONS.map((option) => {
              const active = option.id === themeId;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onChange(option.id);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-start gap-3 rounded-[20px] border px-3 py-3 text-left transition ${
                    active
                      ? "border-slate-900 bg-slate-950 text-white shadow-[0_20px_36px_-28px_rgba(15,31,50,0.9)]"
                      : "border-slate-200 bg-slate-50/85 text-slate-700 hover:border-slate-300 hover:bg-white"
                  }`}
                >
                  <span className="mt-0.5 flex items-center gap-1.5">
                    {option.preview.map((color, index) => (
                      <span
                        key={`${option.id}-${index}`}
                        className={`h-4 w-4 rounded-full border shadow-sm ${
                          active ? "border-white/60" : "border-white"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </span>

                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{option.label}</span>
                    <span
                      className={`mt-1 block text-xs leading-5 ${
                        active ? "text-slate-200" : "text-slate-500"
                      }`}
                    >
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
