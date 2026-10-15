"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { canAccessDashboardPath } from "@/lib/access";
import { MAIN_SECTIONS, type SidebarAccess } from "./SidebarNavigation";

function searchKey(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR"); }

export default function MobileNavigation({ pathname, access, onLogout }: { pathname: string; access: SidebarAccess; onLogout: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => { dialog.current?.close(); }, [pathname]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (media.matches) dialog.current?.close(); };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);
  const key = searchKey(query.trim());
  const sections = MAIN_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.href && canAccessDashboardPath(item.href, access) && (!key || searchKey(section.title + " " + item.label).includes(key))),
  })).filter((section) => section.items.length);
  function showMenu() { setQuery(""); dialog.current?.showModal(); setOpen(true); }
  function logout() { dialog.current?.close(); onLogout(); }
  return <>
    <button type="button" onClick={showMenu} aria-label="Abrir todos os menus" aria-haspopup="dialog" aria-expanded={open} aria-controls="mobile-navigation" className="flex min-h-11 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-slate-950 text-xs font-semibold text-white">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>Menu
    </button>
    <dialog ref={dialog} id="mobile-navigation" aria-labelledby="mobile-navigation-title" onClose={() => setOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }} className="mobile-navigation-dialog">
      <div className="flex h-full min-h-0 flex-col bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><p className="text-xs font-semibold text-blue-700">Manitec GridOne</p><h2 id="mobile-navigation-title" className="mt-1 text-lg font-bold text-slate-950">Todos os menus</h2></div><button type="button" aria-label="Fechar menu" onClick={() => dialog.current?.close()} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-xl text-slate-600">×</button></header>
        <div className="px-5 pt-4"><label htmlFor="mobile-menu-search" className="sr-only">Pesquisar menus</label><input id="mobile-menu-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar uma área ou rotina" className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /></div>
        <nav aria-label="Menu completo" className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {sections.length ? sections.map((section) => <section key={section.id}><h3 className="mb-2 text-xs font-bold text-slate-500">{section.title}</h3><div className="grid grid-cols-2 gap-2">{section.items.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
            return <Link key={item.key} href={item.href!} aria-current={active ? "page" : undefined} onClick={() => dialog.current?.close()} className={active ? "flex min-h-12 items-center rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800" : "flex min-h-12 items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"}>{item.label}</Link>;
          })}</div></section>) : <p className="py-6 text-center text-sm text-slate-500">Nenhum menu encontrado. Tente outro nome.</p>}
        </nav>
        <footer className="flex gap-2 border-t border-slate-200 p-4"><Link href="/dashboard/profile" onClick={() => dialog.current?.close()} className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700">Meu perfil</Link><button type="button" onClick={logout} className="min-h-11 flex-1 rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-800">Encerrar sessão</button></footer>
      </div>
    </dialog>
  </>;
}
