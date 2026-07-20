"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Order = {
  id: string;
  title: string;
  status: string;
  openedAt?: string | null;
  closedAt?: string | null;
  technician?: { user?: { name?: string | null; department?: string | null } | null } | null;
};

type CatalogItem = {
  id: string;
  name: string;
  stockCurrent?: number | null;
  costPrice?: number | null;
};

export default function CostsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const [ordersRes, catalogRes] = await Promise.allSettled([
        apiFetch("/maintenance-orders", { cache: "no-store" }),
        apiFetch("/catalogs", { cache: "no-store" }),
      ]);

      if (ordersRes.status === "fulfilled" && ordersRes.value.ok) {
        setOrders((await ordersRes.value.json()) as Order[]);
      } else {
        setOrders([]);
      }

      if (catalogRes.status === "fulfilled" && catalogRes.value.ok) {
        setCatalog((await catalogRes.value.json()) as CatalogItem[]);
      } else {
        setCatalog([]);
        setMessage("Custos de pecas podem estar ocultos para seu perfil.");
      }
    }

    void load();
  }, []);

  const kpi = useMemo(() => {
    const stockValue = catalog.reduce((acc, item) => acc + Number(item.stockCurrent || 0) * Number(item.costPrice || 0), 0);
    const ordersWithTechnician = orders.filter((order) => order.technician?.user?.name).length;
    return { stockValue, ordersWithTechnician };
  }, [orders, catalog]);

  return (
    <div className="space-y-6 p-8">
      <h1 className="text-3xl font-bold text-zinc-900">Custos de Operacao</h1>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Metric title="Valor do estoque" value={`R$ ${kpi.stockValue.toFixed(2)}`} />
        <Metric title="OS listadas" value={String(orders.length)} />
        <Metric title="OS com tecnico" value={String(kpi.ordersWithTechnician)} />
      </section>

      {message ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{message}</section>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-bold text-zinc-800">Ordens e alocacao tecnica</h2>
        <p className="mb-3 text-sm text-zinc-500">
          Custos sensiveis de HH ficam restritos ao modulo de Pessoas com permissao especifica.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2">OS</th>
                <th className="px-2 py-2">Tecnico</th>
                <th className="px-2 py-2">Departamento</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-zinc-100">
                  <td className="px-2 py-2 font-semibold text-zinc-800">{order.title}</td>
                  <td className="px-2 py-2 text-zinc-700">{order.technician?.user?.name || "Nao definido"}</td>
                  <td className="px-2 py-2 text-zinc-700">{order.technician?.user?.department || "-"}</td>
                  <td className="px-2 py-2 text-zinc-700">{order.status}</td>
                </tr>
              ))}
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-2 py-3 text-sm text-zinc-500">
                    Nenhuma OS encontrada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
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
