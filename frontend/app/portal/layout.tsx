"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  clearAuthSession,
  decodeJwtPayload,
  ensureValidSession,
  getStoredAccessToken,
} from "@/lib/auth-session";

const NAV_ITEMS = [
  { href: "/portal/dashboard", label: "Resumo" },
  { href: "/portal/equipamentos", label: "Equipamentos" },
  { href: "/portal/propostas", label: "Propostas" },
  { href: "/portal/chamados", label: "Chamados" },
  { href: "/portal/solicitacoes", label: "Solicitacoes" },
  { href: "/portal/laudos", label: "Laudos" },
  { href: "/portal/documentos", label: "Documentos" },
  { href: "/portal/financeiro", label: "Financeiro" },
];

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [clientName, setClientName] = useState("Portal do Cliente");

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const hasSession = await ensureValidSession();
      const token = getStoredAccessToken();

      if (cancelled) return;

      if (!hasSession || !token) {
        clearAuthSession();
        router.replace("/");
        return;
      }

      const payload = decodeJwtPayload<{ role?: string; name?: string }>(token);
      if (payload?.role !== "CLIENT") {
        router.replace("/dashboard");
        return;
      }

      setClientName(payload?.name || "Portal do Cliente");
      setReady(true);
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleLogout() {
    clearAuthSession();
    router.replace("/");
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-6xl rounded-lg border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-600 shadow-sm">
          Carregando portal...
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f7fb] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link
              href="/portal/dashboard"
              className="text-lg font-extrabold text-slate-950"
            >
              MANITEC Portal
            </Link>
            <p className="text-sm font-medium text-slate-500">{clientName}</p>
          </div>

          <nav className="flex gap-2 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-bold transition ${
                    active
                      ? "bg-blue-600 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:border-red-200 hover:text-red-700"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
