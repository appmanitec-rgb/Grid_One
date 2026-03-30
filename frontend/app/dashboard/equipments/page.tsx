"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";

type EquipmentListItem = {
  id: string;
  name?: string | null;
  serialNumber?: string | null;
  model?: { name?: string | null } | null;
  client?: { companyName?: string | null } | null;
};

export default function EquipmentsPage() {
  const [equipments, setEquipments] = useState<EquipmentListItem[]>([]);

  useEffect(() => {
    void loadEquipments();
  }, []);

  async function loadEquipments() {
    try {
      const res = await apiFetch(apiUrl("/generators"), { cache: "no-store" });
      if (!res.ok) return;
      setEquipments((await res.json()) as EquipmentListItem[]);
    } catch {
      setEquipments([]);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-zinc-800">Frota e Equipamentos</h1>
          <p className="mt-1 text-zinc-500">Gerencie os geradores dos clientes, historico de manutencoes e modelos.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/equipments/models" className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100">
            Modelos
          </Link>
          <Link href="/dashboard/equipments/new" className="ml-2 flex items-center rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white shadow-sm transition-colors hover:bg-blue-500">
            <span className="mr-2">+</span> Novo Equipamento
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
                <th className="p-4 font-medium">Equipamento / Modelo</th>
                <th className="p-4 font-medium">N de Serie</th>
                <th className="p-4 font-medium">Cliente Proprietario</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 text-right font-medium">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {equipments.map((eq) => (
                <tr key={eq.id} className="transition-colors hover:bg-zinc-50">
                  <td className="p-4">
                    <p className="font-bold text-zinc-800">{eq.name || "Gerador"}</p>
                    <p className="text-xs text-zinc-500">Modelo: {eq.model?.name || "Nao especificado"}</p>
                  </td>
                  <td className="p-4 font-mono text-sm text-zinc-600">{eq.serialNumber || "S/N"}</td>
                  <td className="p-4 font-medium text-zinc-800">{eq.client?.companyName || "Cliente nao vinculado"}</td>
                  <td className="p-4"><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">ATIVO</span></td>
                  <td className="p-4 text-right"><Link href={`/dashboard/equipments/${eq.id}`} className="text-sm font-semibold text-zinc-600 hover:text-blue-700 hover:underline">Ver detalhes</Link></td>
                </tr>
              ))}
              {equipments.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-zinc-500">Nenhum equipamento cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
