"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { canAccessDashboardPath } from "@/lib/access";
import {
  MAIN_SECTIONS,
  navigationContext,
  isNavigationItemActive,
  searchNavigation,
} from "@/lib/dashboard-navigation";
import type { SidebarAccess } from "./SidebarNavigation";
export default function MobileNavigation({
  pathname,
  access,
  onLogout,
}: {
  pathname: string;
  access: SidebarAccess;
  onLogout: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const close = () => {
      if (media.matches) dialog.current?.close();
    };
    media.addEventListener("change", close);
    return () => media.removeEventListener("change", close);
  }, []);
  const sections = MAIN_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) =>
        item.enabled !== false &&
        item.href &&
        canAccessDashboardPath(item.href, access),
    ),
  })).filter((section) => section.items.length);
  const results = searchNavigation(sections, query);
  function show() {
    setQuery("");
    setExpanded(navigationContext(pathname, sections)?.section.id || null);
    dialog.current?.showModal();
    setOpen(true);
  }
  function close() {
    dialog.current?.close();
  }
  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label="Abrir todos os menus"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="mobile-navigation"
        className="flex min-h-11 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-slate-950 text-xs font-semibold text-white"
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        Menu
      </button>
      <dialog
        ref={dialog}
        id="mobile-navigation"
        aria-labelledby="mobile-navigation-title"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="mobile-navigation-dialog"
      >
        <div className="flex h-full min-h-0 flex-col bg-white">
          <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-semibold text-blue-700">
                Manitec GridOne
              </p>
              <h2
                id="mobile-navigation-title"
                className="mt-1 text-lg font-bold text-slate-950"
              >
                Áreas e rotinas
              </h2>
            </div>
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={close}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-xl text-slate-600"
            >
              ×
            </button>
          </header>
          <div className="px-5 pt-4">
            <label htmlFor="mobile-menu-search" className="sr-only">
              Pesquisar menus
            </label>
            <input
              ref={search}
              type="search"
              id="mobile-menu-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) {
                  e.preventDefault();
                  setQuery("");
                }
              }}
              placeholder="Pesquisar uma área ou rotina"
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <nav
            aria-label="Menu completo"
            className="min-h-0 flex-1 space-y-2 overflow-y-auto p-5"
          >
            {query.trim() ? (
              <div aria-live="polite">
                <p className="mb-3 text-xs text-slate-500">
                  {results.total} rotina(s) encontrada(s)
                  {results.total > 10 ? " · Mostrando 10; refine a busca." : ""}
                </p>
                {results.items.map(({ section, item }) => (
                  <Link
                    key={item.key}
                    href={item.href!}
                    aria-current={
                      isNavigationItemActive(pathname, item.href)
                        ? "page"
                        : undefined
                    }
                    onClick={close}
                    className="mb-2 block rounded-xl border border-slate-200 p-3"
                  >
                    <span className="block text-xs text-slate-500">
                      {section.title} · {item.group}
                    </span>
                    <span className="mt-1 block text-sm font-semibold text-slate-800">
                      {item.label}
                    </span>
                  </Link>
                ))}
                {!results.total ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="py-3 text-sm font-semibold text-blue-700"
                  >
                    Limpar busca e ver áreas
                  </button>
                ) : null}
              </div>
            ) : (
              sections.map((section) => (
                <section
                  key={section.id}
                  className="overflow-hidden rounded-xl border border-slate-200"
                >
                  <h3>
                    <button
                      type="button"
                      aria-expanded={expanded === section.id}
                      aria-controls={"mobile-area-" + section.id}
                      onClick={() =>
                        setExpanded(expanded === section.id ? null : section.id)
                      }
                      className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left"
                    >
                      <span>
                        <span className="block text-sm font-bold text-slate-800">
                          {section.title}
                        </span>
                        <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                          {section.description}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="text-sm text-slate-400"
                      >
                        {expanded === section.id ? "−" : "+"}
                      </span>
                    </button>
                  </h3>
                  <div
                    id={"mobile-area-" + section.id}
                    hidden={expanded !== section.id}
                    className="border-t border-slate-100 px-3 pb-2"
                  >
                    {section.items.map((item, index) => (
                      <div key={item.key}>
                        {item.group &&
                        (index === 0 ||
                          section.items[index - 1].group !== item.group) ? (
                          <p className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            {item.group}
                          </p>
                        ) : null}
                        <Link
                          href={item.href!}
                          aria-current={
                            isNavigationItemActive(pathname, item.href)
                              ? "page"
                              : undefined
                          }
                          onClick={close}
                          className={
                            isNavigationItemActive(pathname, item.href)
                              ? "flex min-h-11 items-center rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800"
                              : "flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          }
                        >
                          {item.label}
                        </Link>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </nav>
          <footer className="flex gap-2 border-t border-slate-200 p-4">
            <Link
              href="/dashboard/profile"
              onClick={close}
              className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700"
            >
              Meu perfil
            </Link>
            <button
              type="button"
              onClick={() => {
                close();
                onLogout();
              }}
              className="min-h-11 flex-1 rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-800"
            >
              Encerrar sessão
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
