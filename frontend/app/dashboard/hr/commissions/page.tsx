"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";

type Commission = {
  id: string;
  amount: number;
  percent: number;
  status: "PENDING" | "RELEASED" | "PAID" | "CANCELED";
  user: { name: string };
  contract?: { code?: string } | null;
  maintenanceOrder?: { title?: string } | null;
};

const API_URL = apiUrl("");

export default function CommissionsPage() {
  const [items, setItems] = useState<Commission[]>([]);

  useEffect(() => {
    async function load() {
      const token = localStorage.getItem("manitec_token");
      const res = await apiFetch(`${API_URL}/hr-admin/commissions`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      if (!res.ok) return;
      setItems((await res.json()) as Commission[]);
    }

    void load();
  }, []);

  return (
    <div className="space-y-6 p-8">
      <h1 className="text-3xl font-bold text-zinc-900">Comissoes e Premiacao</h1>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="overflow-x-auto">
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
              {items.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100">
                  <td className="px-2 py-2 font-semibold text-zinc-800">{row.user?.name || "-"}</td>
                  <td className="px-2 py-2 text-zinc-700">{row.contract?.code || row.maintenanceOrder?.title || "-"}</td>
                  <td className="px-2 py-2 text-zinc-700">{Number(row.percent || 0).toFixed(2)}%</td>
                  <td className="px-2 py-2 text-zinc-700">R$ {Number(row.amount || 0).toFixed(2)}</td>
                  <td className="px-2 py-2 text-zinc-700">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
