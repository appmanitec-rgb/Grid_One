"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";

type ClientAddress = {
  type?: string;
  street?: string;
  number?: string;
  city?: string;
  state?: string;
};

type Client = {
  id: string;
  companyName: string;
  addresses?: ClientAddress[];
};

type Generator = {
  id: string;
  name: string;
  installationSite?: string | null;
  client?: { companyName?: string | null } | null;
};

type SiteRow = {
  key: string;
  name: string;
  city: string;
  state: string;
  clients: string[];
  equipmentCount: number;
};

const API_URL = apiUrl("");

export default function SitesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [generators, setGenerators] = useState<Generator[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      const [clientsRes, generatorsRes] = await Promise.allSettled([
        apiFetch(`${API_URL}/clients`, { cache: "no-store" }),
        apiFetch(`${API_URL}/generators`, { cache: "no-store" }),
      ]);

      if (clientsRes.status === "fulfilled" && clientsRes.value.ok) {
        setClients((await clientsRes.value.json()) as Client[]);
      }
      if (generatorsRes.status === "fulfilled" && generatorsRes.value.ok) {
        setGenerators((await generatorsRes.value.json()) as Generator[]);
      }
    }

    void load();
  }, []);

  const rows = useMemo(() => {
    const map = new Map<string, SiteRow>();

    for (const generator of generators) {
      const key = (generator.installationSite || "Sem local definido").trim();
      const clientName = generator.client?.companyName || "Sem cliente";
      if (!map.has(key)) {
        map.set(key, { key, name: key, city: "-", state: "-", clients: [], equipmentCount: 0 });
      }
      const row = map.get(key);
      if (!row) continue;
      row.equipmentCount += 1;
      if (!row.clients.includes(clientName)) row.clients.push(clientName);
    }

    for (const client of clients) {
      const installation = (client.addresses || []).filter((addr) => addr.type === "INSTALLATION");
      for (const address of installation) {
        const key = `${address.street || "Endereco"}${address.number ? `, ${address.number}` : ""}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            name: key,
            city: address.city || "-",
            state: address.state || "-",
            clients: [client.companyName],
            equipmentCount: 0,
          });
        } else {
          const row = map.get(key);
          if (row && !row.clients.includes(client.companyName)) row.clients.push(client.companyName);
        }
      }
    }

    return [...map.values()].sort((a, b) => b.equipmentCount - a.equipmentCount);
  }, [clients, generators]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => `${row.name} ${row.city} ${row.state} ${row.clients.join(" ")}`.toLowerCase().includes(q));
  }, [rows, search]);

  const totalClients = useMemo(() => new Set(rows.flatMap((row) => row.clients)).size, [rows]);
  const totalEquipments = useMemo(() => rows.reduce((acc, row) => acc + row.equipmentCount, 0), [rows]);

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-zinc-900">Locais e Obras</h1>
        <Link href="/dashboard/clients/new" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
          Novo cliente com obra
        </Link>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Metric title="Locais" value={String(rows.length)} />
        <Metric title="Clientes por local" value={String(totalClients)} />
        <Metric title="Equipamentos mapeados" value={String(totalEquipments)} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Pesquisar por endereco, cidade ou cliente..."
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        {filtered.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum local encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-2 py-2">Local</th>
                  <th className="px-2 py-2">Cidade/UF</th>
                  <th className="px-2 py-2">Clientes</th>
                  <th className="px-2 py-2">Equipamentos</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.key} className="border-b border-zinc-100">
                    <td className="px-2 py-2 font-semibold text-zinc-800">{row.name}</td>
                    <td className="px-2 py-2 text-zinc-700">
                      {row.city} / {row.state}
                    </td>
                    <td className="px-2 py-2 text-zinc-700">{row.clients.join(", ") || "-"}</td>
                    <td className="px-2 py-2 text-zinc-700">{row.equipmentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      <p className="mt-1 text-2xl font-bold text-zinc-900">{value}</p>
    </div>
  );
}
