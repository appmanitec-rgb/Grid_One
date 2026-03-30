"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";

type Vehicle = {
  id: string;
  plate: string;
  model: string;
  currentKm: number;
  nextOilChangeKm?: number | null;
  status: "AVAILABLE" | "IN_USE" | "MAINTENANCE" | "BLOCKED";
};

const API_URL = apiUrl("");

export default function FleetPage() {
  const [items, setItems] = useState<Vehicle[]>([]);

  useEffect(() => {
    async function load() {
      const token = localStorage.getItem("manitec_token");
      const res = await apiFetch(`${API_URL}/hr-admin/fleet/vehicles`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      if (!res.ok) return;
      setItems((await res.json()) as Vehicle[]);
    }

    void load();
  }, []);

  return (
    <div className="space-y-6 p-8">
      <h1 className="text-3xl font-bold text-zinc-900">Gestao de Frota</h1>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="overflow-x-auto">
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
              {items.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100">
                  <td className="px-2 py-2 font-semibold text-zinc-800">{row.plate}</td>
                  <td className="px-2 py-2 text-zinc-700">{row.model}</td>
                  <td className="px-2 py-2 text-zinc-700">{Number(row.currentKm || 0)}</td>
                  <td className="px-2 py-2 text-zinc-700">{row.nextOilChangeKm || "-"}</td>
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
