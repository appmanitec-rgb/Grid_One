"use client";

import { PageHeader } from "../../components/DashboardPageKit";

import { useEffect, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { commercialLabel } from "@/lib/commercial-labels";

type Commission = {
  id: string;
  amount: number;
  percent: number;
  status: "PENDING" | "RELEASED" | "PAID" | "CANCELED";
  user: { name: string };
  contract?: { code?: string } | null;
  maintenanceOrder?: { title?: string } | null;
};

export default function CommissionsPage() {
  const [items, setItems] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await apiFetch("/hr-admin/commissions", { cache: "no-store" });
        if (!res.ok) throw new Error(await readApiErrorMessage(res, "Não foi possível carregar os dados."));
        const rows = (await res.json()) as Commission[];
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
        title="Comissões e premiações"
        description="Acompanhe comissões, metas e premiações da equipe."
      />

      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela de registros. Role horizontalmente para ver todas as colunas.">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2">Colaborador</th>
                <th className="px-2 py-2">Origem</th>
                <th className="px-2 py-2">Percentual</th>
                <th className="px-2 py-2">Valor</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {!items.length ? <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">{loading ? "Carregando..." : error ? "Dados indisponíveis." : "Nenhuma comissão registrada."}</td></tr> : null}
              {items.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100">
                  <td className="px-2 py-2 font-semibold text-zinc-800">{row.user?.name || "-"}</td>
                  <td className="px-2 py-2 text-zinc-700">{row.contract?.code || row.maintenanceOrder?.title || "-"}</td>
                  <td className="px-2 py-2 text-zinc-700">{Number(row.percent || 0).toFixed(2)}%</td>
                  <td className="px-2 py-2 text-zinc-700">R$ {Number(row.amount || 0).toFixed(2)}</td>
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
