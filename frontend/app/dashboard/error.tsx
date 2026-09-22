"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Falha ao renderizar uma pagina do painel", error);
  }, [error]);

  return (
    <section
      role="alert"
      className="mx-auto mt-10 max-w-2xl rounded-2xl border border-rose-200 bg-white p-6 shadow-sm"
    >
      <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-600">
        Nao foi possivel abrir esta pagina
      </p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">
        O restante do sistema continua disponivel
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Tente carregar esta area novamente. Se o problema continuar, recarregue
        o painel para renovar a sessao e os dados locais.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500"
        >
          Tentar novamente
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
        >
          Recarregar painel
        </button>
      </div>
    </section>
  );
}
