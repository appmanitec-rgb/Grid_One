"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";

type Equipment = {
  id: string;
  name: string;
  brand: string;
  serialNumber?: string | null;
  power: number;
  client?: { id: string; companyName: string } | null;
  model?: { id: string; name: string } | null;
  proposals?: Array<{ id: string; code: string; status: string; totalValue: number }>;
  orders?: Array<{ id: string; title: string; status: string; priority: string }>;
};

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await apiFetch(apiUrl(`/generators/${id}`), { cache: "no-store" });
        if (!res.ok) throw new Error("Nao foi possivel carregar o equipamento.");
        setEquipment(await res.json());
      } catch (e: any) {
        setError(e.message || "Erro ao carregar equipamento.");
      }
    })();
  }, [id]);

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!equipment) return <div className="p-8 text-zinc-500">Carregando...</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-800">Detalhes do Equipamento</h1>
          <p className="text-zinc-500 mt-1">Prontuario tecnico e comercial da maquina.</p>
        </div>
        <Link href="/dashboard/equipments" className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700">Voltar</Link>
      </div>

      <section className="bg-white border border-zinc-200 rounded-xl p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Info label="Nome" value={equipment.name} />
        <Info label="Marca" value={equipment.brand} />
        <Info label="Modelo" value={equipment.model?.name || "-"} />
        <Info label="Numero de serie" value={equipment.serialNumber || "-"} />
        <Info label="Potencia" value={`${equipment.power} kVA`} />
        <Info label="Cliente" value={equipment.client?.companyName || "-"} />
      </section>

      <section className="bg-white border border-zinc-200 rounded-xl p-6">
        <h2 className="font-bold text-zinc-800 mb-3">Propostas vinculadas</h2>
        {(equipment.proposals || []).length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma proposta vinculada.</p>
        ) : (
          <div className="space-y-2">
            {(equipment.proposals || []).map((p) => (
              <Link key={p.id} href={`/dashboard/proposals/${p.id}`} className="block border border-zinc-200 rounded-lg p-3 hover:bg-zinc-50">
                <p className="font-medium text-zinc-800">{p.code}</p>
                <p className="text-xs text-zinc-500">{p.status} - R$ {Number(p.totalValue || 0).toFixed(2)}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white border border-zinc-200 rounded-xl p-6">
        <h2 className="font-bold text-zinc-800 mb-3">Ordens de servico</h2>
        {(equipment.orders || []).length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma O.S. vinculada.</p>
        ) : (
          <div className="space-y-2">
            {(equipment.orders || []).map((o) => (
              <Link key={o.id} href={`/dashboard/orders/${o.id}`} className="block border border-zinc-200 rounded-lg p-3 hover:bg-zinc-50">
                <p className="font-medium text-zinc-800">{o.title}</p>
                <p className="text-xs text-zinc-500">{o.status} - {o.priority}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
      <p className="text-xs font-bold text-zinc-500 uppercase mb-1">{label}</p>
      <p className="text-sm font-medium text-zinc-800 break-words">{value}</p>
    </div>
  );
}
