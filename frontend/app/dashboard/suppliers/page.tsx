"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";

type Supplier = {
  id: string;
  companyName: string;
  tradeName?: string | null;
  cnpj?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  representedBrands?: string[];
  categories?: string[];
};

export default function SuppliersPage() {
  const [items, setItems] = useState<Supplier[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const res = await apiFetch("/suppliers");

      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Nao foi possivel carregar fornecedores."),
        );
      }
      setItems(await res.json());
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar fornecedores.",
      );
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-zinc-800">Cadastro de Fornecedores</h1>
          <p className="mt-1 text-zinc-500">Gerencie parceiros, marcas, categorias e condicoes de compra.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/suppliers/new" className="ml-2 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white shadow-sm transition-colors hover:bg-blue-500">
            Novo Fornecedor
          </Link>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
                <th className="p-4 font-medium">Fornecedor</th>
                <th className="p-4 font-medium">CNPJ</th>
                <th className="p-4 font-medium">Contato</th>
                <th className="p-4 font-medium">Atuacao</th>
                <th className="p-4 text-right font-medium">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {items.map((supplier) => (
                <tr key={supplier.id} className="transition-colors hover:bg-zinc-50">
                  <td className="p-4">
                    <p className="font-bold text-zinc-800">{supplier.companyName}</p>
                    <p className="text-xs text-zinc-500">{supplier.tradeName || "-"}</p>
                  </td>
                  <td className="p-4 text-sm text-zinc-600">{supplier.cnpj || "Nao informado"}</td>
                  <td className="p-4 text-sm text-zinc-600">
                    <p>{supplier.email || "Sem e-mail"}</p>
                    <p>{supplier.phone || "Sem telefone"}</p>
                  </td>
                  <td className="p-4 text-sm text-zinc-600">
                    <p>{supplier.city || "-"}{supplier.state ? `/${supplier.state}` : ""}</p>
                    <p className="truncate">{(supplier.categories || []).slice(0, 2).join(", ") || "Sem categorias"}</p>
                  </td>
                  <td className="p-4 text-right">
                    <Link href={`/dashboard/suppliers/${supplier.id}`} className="text-sm font-semibold text-zinc-600 hover:text-blue-700 hover:underline">
                      Ver detalhes
                    </Link>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-zinc-500">Nenhum fornecedor cadastrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
