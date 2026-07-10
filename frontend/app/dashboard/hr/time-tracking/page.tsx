"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type PayrollRow = {
  userId: string;
  name: string;
  transitMinutes: number;
  workMinutes: number;
  extraMinutes: number;
  nightMinutes: number;
};

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function TimeTrackingPage() {
  const [month, setMonth] = useState(currentMonthKey());
  const [rows, setRows] = useState<PayrollRow[]>([]);

  useEffect(() => {
    async function load() {
      const res = await apiFetch(`/hr-admin/time-entries/payroll-export?month=${month}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { collaborators: PayrollRow[] };
      setRows(data.collaborators || []);
    }
    void load();
  }, [month]);

  return (
    <div className="space-y-6 p-8">
      <h1 className="text-3xl font-bold text-zinc-900">Apontamento / Banco de Horas</h1>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <label className="text-sm font-semibold text-zinc-700">Competencia</label>
        <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="ml-2 rounded border border-zinc-300 px-2 py-1 text-sm" />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2">Colaborador</th>
                <th className="px-2 py-2">Transito (h)</th>
                <th className="px-2 py-2">Trabalho (h)</th>
                <th className="px-2 py-2">Extra (h)</th>
                <th className="px-2 py-2">Noturno (h)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId} className="border-b border-zinc-100">
                  <td className="px-2 py-2 font-semibold text-zinc-800">{row.name}</td>
                  <td className="px-2 py-2 text-zinc-700">{(row.transitMinutes / 60).toFixed(2)}</td>
                  <td className="px-2 py-2 text-zinc-700">{(row.workMinutes / 60).toFixed(2)}</td>
                  <td className="px-2 py-2 text-zinc-700">{(row.extraMinutes / 60).toFixed(2)}</td>
                  <td className="px-2 py-2 text-zinc-700">{(row.nightMinutes / 60).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
