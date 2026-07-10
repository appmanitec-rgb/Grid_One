"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";

type SupplierItem = {
  id: string;
  supplierSku?: string | null;
  supplierPrice?: number | null;
  leadTimeDays?: number | null;
  isPrimary: boolean;
  supplier: {
    id: string;
    companyName: string;
    cnpj?: string | null;
  };
};

type Item = {
  id: string;
  sku?: string | null;
  name: string;
  commercialDescription?: string | null;
  type: "PART" | "SERVICE";
  category?: string | null;
  subcategory?: string | null;
  unit?: string | null;
  brand?: string | null;
  manufacturerPartNumber?: string | null;
  supplier?: string | null;
  applicationNotes?: string | null;
  technicalSpecs?: Record<string, any> | null;
  ncm?: string | null;
  cest?: string | null;
  origin?: string | null;
  costPrice?: number | null;
  averageCost?: number | null;
  lastCost?: number | null;
  taxPercentage?: number | null;
  profitMargin?: number | null;
  basePrice: number;
  stockCurrent?: number | null;
  stockMin?: number | null;
  stockMax?: number | null;
  storageLocation?: string | null;
  grossWeight?: number | null;
  netWeight?: number | null;
  taxProfile?: Record<string, any> | null;
  isActive: boolean;
  supplierItems?: SupplierItem[];
};

export default function CatalogItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await apiFetch(`/catalogs/${id}`);
        if (!res.ok) {
          throw new Error(
            await readApiErrorMessage(
              res,
              "Nao foi possivel carregar a peca/servico.",
            ),
          );
        }
        setItem(await res.json());
      } catch (loadError: unknown) {
        setError(
          loadError instanceof Error ? loadError.message : "Erro ao carregar item.",
        );
      }
    })();
  }, [id]);

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!item) return <div className="p-8 text-zinc-500">Carregando...</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-800">Ficha do Item</h1>
          <p className="mt-1 text-zinc-500">Visao completa de cadastro, fiscal, estoque e compras.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard/catalog" className="rounded-lg border border-zinc-300 px-4 py-2 text-zinc-700">Voltar</Link>
          <Link href={`/dashboard/catalog/new?editItemId=${item.id}`} className="rounded-lg bg-blue-600 px-4 py-2 text-white">Editar</Link>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 rounded-xl border border-zinc-200 bg-white p-6 md:grid-cols-4">
        <Info label="Nome" value={item.name} />
        <Info label="SKU" value={item.sku || "-"} />
        <Info label="Tipo" value={item.type === "PART" ? "Peca" : "Servico"} />
        <Info label="Status" value={item.isActive ? "Ativo" : "Inativo"} />
        <Info label="Categoria" value={item.category || "-"} />
        <Info label="Subcategoria" value={item.subcategory || "-"} />
        <Info label="Unidade" value={item.unit || "-"} />
        <Info label="Marca" value={item.brand || "-"} />
        <Info label="Part Number" value={item.manufacturerPartNumber || "-"} />
        <Info label="Fornecedor principal" value={item.supplier || "-"} />
        <Info label="Preco de venda" value={`R$ ${Number(item.basePrice || 0).toFixed(2)}`} />
        <Info label="Margem" value={item.profitMargin == null ? "Oculta" : `${Number(item.profitMargin).toFixed(2)}%`} />
      </section>

      <section className="grid grid-cols-1 gap-4 rounded-xl border border-zinc-200 bg-white p-6 md:grid-cols-4">
        <Info label="Custo" value={item.costPrice == null ? "Oculto" : `R$ ${Number(item.costPrice).toFixed(2)}`} />
        <Info label="Custo medio" value={item.averageCost == null ? "-" : `R$ ${Number(item.averageCost).toFixed(2)}`} />
        <Info label="Ultimo custo" value={item.lastCost == null ? "-" : `R$ ${Number(item.lastCost).toFixed(2)}`} />
        <Info label="Carga tributaria" value={item.taxPercentage == null ? "Oculta" : `${Number(item.taxPercentage).toFixed(2)}%`} />
        <Info label="Estoque atual" value={item.stockCurrent == null ? "-" : `${Number(item.stockCurrent).toFixed(2)}`} />
        <Info label="Estoque minimo" value={item.stockMin == null ? "-" : `${Number(item.stockMin).toFixed(2)}`} />
        <Info label="Estoque maximo" value={item.stockMax == null ? "-" : `${Number(item.stockMax).toFixed(2)}`} />
        <Info label="Localizacao" value={item.storageLocation || "-"} />
        <Info label="NCM" value={item.ncm || "-"} />
        <Info label="CEST" value={item.cest || "-"} />
        <Info label="Origem" value={item.origin || "-"} />
        <Info label="Peso Bruto/Liquido" value={`${item.grossWeight ?? "-"} / ${item.netWeight ?? "-"}`} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-bold text-zinc-800">Descricao e Aplicacao</h2>
        <p className="text-sm text-zinc-700">{item.commercialDescription || "Sem descricao comercial."}</p>
        <p className="mt-2 text-sm text-zinc-600">{item.applicationNotes || "Sem observacoes tecnicas."}</p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-3 text-lg font-bold text-zinc-800">Especificacoes Tecnicas</h2>
          <KeyValueList data={item.technicalSpecs} emptyLabel="Sem dados tecnicos detalhados." />
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-3 text-lg font-bold text-zinc-800">Perfil Tributario</h2>
          <KeyValueList data={item.taxProfile} emptyLabel="Sem regras tributarias adicionais." />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 p-4">
          <h2 className="text-lg font-bold text-zinc-800">Fornecedores vinculados</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-zinc-50 text-sm text-zinc-500">
                <th className="p-4 font-medium">Fornecedor</th>
                <th className="p-4 font-medium">SKU fornecedor</th>
                <th className="p-4 font-medium">Preco</th>
                <th className="p-4 font-medium">Prazo</th>
                <th className="p-4 font-medium">Principal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {(item.supplierItems || []).map((supplierItem) => (
                <tr key={supplierItem.id}>
                  <td className="p-4">
                    <p className="font-medium text-zinc-800">{supplierItem.supplier.companyName}</p>
                    <p className="text-xs text-zinc-500">{supplierItem.supplier.cnpj || "-"}</p>
                  </td>
                  <td className="p-4 text-sm text-zinc-600">{supplierItem.supplierSku || "-"}</td>
                  <td className="p-4 text-sm text-zinc-600">{supplierItem.supplierPrice != null ? `R$ ${Number(supplierItem.supplierPrice).toFixed(2)}` : "-"}</td>
                  <td className="p-4 text-sm text-zinc-600">{supplierItem.leadTimeDays != null ? `${supplierItem.leadTimeDays} dia(s)` : "-"}</td>
                  <td className="p-4 text-sm text-zinc-600">{supplierItem.isPrimary ? "Sim" : "Nao"}</td>
                </tr>
              ))}
              {(item.supplierItems || []).length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-zinc-500">Nenhum fornecedor vinculado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <p className="mb-1 text-xs font-bold uppercase text-zinc-500">{label}</p>
      <p className="break-words text-sm font-medium text-zinc-800">{value}</p>
    </div>
  );
}

function KeyValueList({ data, emptyLabel }: { data?: Record<string, any> | null; emptyLabel: string }) {
  const entries = Object.entries(data || {}).filter(([, value]) => value !== null && value !== undefined && value !== "");

  if (entries.length === 0) {
    return <p className="text-sm text-zinc-500">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
          <p className="text-xs font-bold uppercase text-zinc-500">{key}</p>
          <p className="text-sm font-medium text-zinc-800">{String(value)}</p>
        </div>
      ))}
    </div>
  );
}
