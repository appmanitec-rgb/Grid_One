"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAccessFromToken } from "@/lib/access";
import { apiFetch, apiUrl } from "@/lib/api";

type CatalogItem = {
  id: string;
  name: string;
  description?: string | null;
  type: "PART" | "SERVICE";
  basePrice: number;
  costPrice?: number | null;
  taxPercentage?: number | null;
  profitMargin?: number | null;
};

export default function CatalogPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [canViewCosts, setCanViewCosts] = useState(false);
  const [canManageItems, setCanManageItems] = useState(false);

  useEffect(() => {
    const access = getAccessFromToken();
    setCanViewCosts(access.catalog.viewCosts);
    setCanManageItems(access.catalog.manageItems);
    setHydrated(true);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("manitec_token");
    if (!token) return;

    async function load() {
      try {
        const res = await apiFetch(apiUrl("/catalogs"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error("Falha ao carregar catalogo.");
        }
        setItems(await res.json());
      } catch (e: any) {
        setError(e.message || "Erro ao carregar catalogo.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-zinc-800">Catalogo de Pecas e Servicos</h1>
          <p className="text-zinc-500 mt-1">Controle de itens e precificacao por perfil de usuario.</p>
        </div>

        <div className="flex items-center gap-2">
          {hydrated && canManageItems && (
            <Link
              href="/dashboard/suppliers"
              className="ml-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 font-semibold text-zinc-700 transition-colors hover:bg-zinc-100"
            >
              Fornecedores
            </Link>
          )}
          {hydrated && canManageItems && (
            <Link
              href="/dashboard/catalog/new"
              className="ml-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg font-semibold transition-colors shadow-sm"
            >
              Novo Item
            </Link>
          )}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 text-zinc-500 text-sm border-b border-zinc-200">
                <th className="p-4 font-medium">Item</th>
                <th className="p-4 font-medium">Descricao</th>
                <th className="p-4 font-medium">Tipo</th>
                <th className="p-4 font-medium">Preco Final</th>
                {hydrated && canViewCosts && <th className="p-4 font-medium">Custo</th>}
                {hydrated && canViewCosts && <th className="p-4 font-medium">Margem</th>}
                <th className="p-4 font-medium text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {!loading &&
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="p-4 font-bold text-zinc-800">{item.name}</td>
                    <td className="p-4 text-zinc-600 text-sm max-w-md truncate">{item.description || "Sem descricao"}</td>
                    <td className="p-4">
                      <span
                        className={`px-3 py-1 text-xs rounded-full font-semibold ${
                          item.type === "SERVICE" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {item.type === "SERVICE" ? "SERVICO" : "PECA"}
                      </span>
                    </td>
                    <td className="p-4 text-zinc-800 font-medium">R$ {Number(item.basePrice).toFixed(2)}</td>
                    {hydrated && canViewCosts && <td className="p-4 text-zinc-700">{item.costPrice != null ? `R$ ${Number(item.costPrice).toFixed(2)}` : "-"}</td>}
                    {hydrated && canViewCosts && <td className="p-4 text-zinc-700">{item.profitMargin != null ? `${Number(item.profitMargin).toFixed(2)}%` : "-"}</td>}
                    <td className="p-4 text-right">
                      <Link href={`/dashboard/catalog/${item.id}`} className="text-sm font-semibold text-zinc-600 hover:text-zinc-900 hover:underline">
                        Ver detalhes
                      </Link>
                      {hydrated && canManageItems && (
                        <Link href={`/dashboard/catalog/new?editItemId=${item.id}`} className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 hover:underline ml-4">
                          Editar
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}

              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={hydrated && canViewCosts ? 7 : 5} className="p-8 text-center text-zinc-500">
                    Nenhum item encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
