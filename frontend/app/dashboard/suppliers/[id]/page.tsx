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
  catalogItem: { id: string; name: string; sku?: string | null };
};

type Supplier = {
  id: string;
  companyName: string;
  tradeName?: string | null;
  cnpj?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  stateRegistration?: string | null;
  municipalRegistration?: string | null;
  categories?: string[];
  representedBrands?: string[];
  paymentTerm?: string | null;
  qualityScore?: number | null;
  punctualityScore?: number | null;
  notes?: string | null;
  items?: SupplierItem[];
};

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;

    (async () => {
      try {
        const res = await apiFetch(`/suppliers/${id}`);
        if (!res.ok) {
          throw new Error(
            await readApiErrorMessage(res, "Nao foi possivel carregar fornecedor."),
          );
        }
        setSupplier(await res.json());
      } catch (loadError: unknown) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Erro ao carregar fornecedor.",
        );
      }
    })();
  }, [id]);

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!supplier) return <div className="p-8 text-zinc-500">Carregando...</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-800">Perfil do Fornecedor</h1>
          <p className="mt-1 text-zinc-500">Dados cadastrais, avaliacao e itens negociados.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard/suppliers" className="rounded-lg border border-zinc-300 px-4 py-2 text-zinc-700">Voltar</Link>
          <Link href={`/dashboard/suppliers/new?editSupplierId=${supplier.id}`} className="rounded-lg bg-blue-600 px-4 py-2 text-white">Editar</Link>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 rounded-xl border border-zinc-200 bg-white p-6 md:grid-cols-3">
        <Info label="Razao Social" value={supplier.companyName} />
        <Info label="Nome Fantasia" value={supplier.tradeName || "-"} />
        <Info label="CNPJ" value={supplier.cnpj || "-"} />
        <Info label="E-mail" value={supplier.email || "-"} />
        <Info label="Telefone" value={supplier.phone || "-"} />
        <Info label="Pagamento" value={supplier.paymentTerm || "-"} />
        <Info label="Cidade/UF" value={`${supplier.city || "-"}${supplier.state ? `/${supplier.state}` : ""}`} />
        <Info label="IE" value={supplier.stateRegistration || "-"} />
        <Info label="IM" value={supplier.municipalRegistration || "-"} />
        <Info label="Qualidade" value={supplier.qualityScore != null ? `${supplier.qualityScore}/5` : "-"} />
        <Info label="Pontualidade" value={supplier.punctualityScore != null ? `${supplier.punctualityScore}/5` : "-"} />
        <Info label="Endereco" value={supplier.address || "-"} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-bold text-zinc-800">Atuacao</h2>
        <p className="text-sm text-zinc-600"><strong>Categorias:</strong> {(supplier.categories || []).join(", ") || "-"}</p>
        <p className="mt-1 text-sm text-zinc-600"><strong>Marcas:</strong> {(supplier.representedBrands || []).join(", ") || "-"}</p>
        <p className="mt-1 text-sm text-zinc-600"><strong>Observacoes:</strong> {supplier.notes || "-"}</p>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 p-4">
          <h2 className="text-lg font-bold text-zinc-800">Itens Vinculados</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-zinc-50 text-sm text-zinc-500">
                <th className="p-4 font-medium">Item</th>
                <th className="p-4 font-medium">SKU fornecedor</th>
                <th className="p-4 font-medium">Preco</th>
                <th className="p-4 font-medium">Lead time</th>
                <th className="p-4 font-medium">Principal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {(supplier.items || []).map((item) => (
                <tr key={item.id}>
                  <td className="p-4">
                    <p className="font-medium text-zinc-800">{item.catalogItem.name}</p>
                    <p className="text-xs text-zinc-500">{item.catalogItem.sku || "-"}</p>
                  </td>
                  <td className="p-4 text-sm text-zinc-600">{item.supplierSku || "-"}</td>
                  <td className="p-4 text-sm text-zinc-600">{item.supplierPrice != null ? `R$ ${Number(item.supplierPrice).toFixed(2)}` : "-"}</td>
                  <td className="p-4 text-sm text-zinc-600">{item.leadTimeDays != null ? `${item.leadTimeDays} dia(s)` : "-"}</td>
                  <td className="p-4 text-sm text-zinc-600">{item.isPrimary ? "Sim" : "Nao"}</td>
                </tr>
              ))}
              {(supplier.items || []).length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-zinc-500">Nenhum item vinculado.</td>
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
      <p className="text-sm font-medium text-zinc-800">{value}</p>
    </div>
  );
}
