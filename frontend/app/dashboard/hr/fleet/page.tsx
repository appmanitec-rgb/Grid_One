"use client";

import { PageHeader } from "../../components/DashboardPageKit";

import { useEffect, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { commercialLabel } from "@/lib/commercial-labels";

type Vehicle = {
  id: string;
  plate: string;
  model: string;
  currentKm: number;
  nextOilChangeKm?: number | null;
  status: "AVAILABLE" | "IN_USE" | "MAINTENANCE" | "BLOCKED";
};

export default function FleetPage() {
  const [items, setItems] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await apiFetch("/hr-admin/fleet/vehicles", { cache: "no-store" });
        if (!res.ok) throw new Error(await readApiErrorMessage(res, "Não foi possível carregar os dados."));
        const rows = (await res.json()) as Vehicle[];
        if (active) setItems(rows);
      } catch (issue) {
        if (active) setError(issue instanceof Error ? issue.message : "Não foi possível carregar os dados.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  return (
    <div className="dashboard-page space-y-5">
      <PageHeader
        eyebrow="Pessoas"
        title="Gestão de frota"
        description="Acompanhe veículos, disponibilidade e custos da frota."
      />

      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela de registros. Role horizontalmente para ver todas as colunas.">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2">Placa</th>
                <th className="px-2 py-2">Modelo</th>
                <th className="px-2 py-2">KM atual</th>
                <th className="px-2 py-2">Prox. troca oleo</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {!items.length ? <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">{loading ? "Carregando..." : error ? "Dados indisponíveis." : "Nenhum veículo cadastrado."}</td></tr> : null}
              {items.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100">
                  <td className="px-2 py-2 font-semibold text-zinc-800">{row.plate}</td>
                  <td className="px-2 py-2 text-zinc-700">{row.model}</td>
                  <td className="px-2 py-2 text-zinc-700">{Number(row.currentKm || 0)}</td>
                  <td className="px-2 py-2 text-zinc-700">{row.nextOilChangeKm || "-"}</td>
                  <td className="px-2 py-2 text-zinc-700">{commercialLabel(row.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
