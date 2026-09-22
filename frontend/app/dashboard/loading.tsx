export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Carregando pagina">
      <div className="space-y-3">
        <div className="h-4 w-32 rounded bg-slate-200" />
        <div className="h-9 w-full max-w-xl rounded-lg bg-slate-200" />
        <div className="h-4 w-full max-w-2xl rounded bg-slate-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-24 rounded-2xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="h-80 rounded-2xl border border-slate-200 bg-white" />
    </div>
  );
}
