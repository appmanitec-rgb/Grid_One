"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Collaborator = {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string | null;
  hourCost?: number | null;
};

export default function CollaboratorsPage() {
  const [items, setItems] = useState<Collaborator[]>([]);

  useEffect(() => {
    async function load() {
      const res = await apiFetch("/hr-admin/collaborators", {
        cache: "no-store",
      });
      if (!res.ok) return;
      setItems((await res.json()) as Collaborator[]);
    }

    void load();
  }, []);

  return (
    <div className="space-y-6 p-8">
      <h1 className="text-3xl font-bold text-zinc-900">Colaboradores (Cadastro Geral)</h1>
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2">Nome</th>
                <th className="px-2 py-2">Email</th>
                <th className="px-2 py-2">Perfil</th>
                <th className="px-2 py-2">Departamento</th>
                <th className="px-2 py-2">Custo hora</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100">
                  <td className="px-2 py-2 font-semibold text-zinc-800">{row.name}</td>
                  <td className="px-2 py-2 text-zinc-700">{row.email}</td>
                  <td className="px-2 py-2 text-zinc-700">{row.role}</td>
                  <td className="px-2 py-2 text-zinc-700">{row.department || "-"}</td>
                  <td className="px-2 py-2 text-zinc-700">R$ {Number(row.hourCost || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
