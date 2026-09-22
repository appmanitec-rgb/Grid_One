"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-slate-900">
        <main
          role="alert"
          className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-xl"
        >
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
            Manitec GridOne
          </p>
          <h1 className="mt-3 text-2xl font-bold">O sistema encontrou uma falha inesperada</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Seus dados nao foram apagados. Tente reconstruir a tela ou volte ao
            acesso inicial para renovar a sessao.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => window.location.assign("/")}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700"
            >
              Voltar ao acesso
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
