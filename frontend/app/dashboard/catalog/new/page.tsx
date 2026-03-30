"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";

type ItemType = "PART" | "SERVICE";
type ProductOrigin =
  | "NACIONAL"
  | "ESTRANGEIRA_IMPORTACAO_DIRETA"
  | "ESTRANGEIRA_MERCADO_INTERNO";

type SectionTab = "basic" | "technical" | "commercial" | "inventory" | "fiscal";

export default function CatalogFormPage() {
  const router = useRouter();
  const [editItemId, setEditItemId] = useState("");
  const isEditing = Boolean(editItemId);

  const [activeTab, setActiveTab] = useState<SectionTab>("basic");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingItem, setIsLoadingItem] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    type: "PART" as ItemType,
    commercialDescription: "",
    category: "",
    subcategory: "",
    unit: "UN",
    brand: "",
    manufacturerPartNumber: "",
    supplier: "",
    applicationNotes: "",
    technicalVoltage: "",
    technicalCurrent: "",
    technicalMaterial: "",
    technicalDimensions: "",

    costPrice: "",
    averageCost: "",
    lastCost: "",
    profitMargin: "",
    basePrice: "",

    stockCurrent: "",
    stockMin: "",
    stockMax: "",
    storageLocation: "",

    ncm: "",
    cest: "",
    origin: "NACIONAL" as ProductOrigin,
    grossWeight: "",
    netWeight: "",

    icms: "",
    iss: "",
    pisCofins: "",
    ipi: "",
    irpj: "",
    csll: "",
    cpp: "",
  });

  const totalTaxPercentage = useMemo(() => {
    return (
      (parseFloat(formData.icms) || 0) +
      (parseFloat(formData.iss) || 0) +
      (parseFloat(formData.pisCofins) || 0) +
      (parseFloat(formData.ipi) || 0) +
      (parseFloat(formData.irpj) || 0) +
      (parseFloat(formData.csll) || 0) +
      (parseFloat(formData.cpp) || 0)
    );
  }, [formData]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("editItemId");
    if (id) setEditItemId(id);
  }, []);

  useEffect(() => {
    const cost = parseFloat(formData.costPrice) || 0;
    const margin = parseFloat(formData.profitMargin) || 0;

    if (cost <= 0) {
      setFormData((prev) => ({ ...prev, basePrice: "" }));
      return;
    }

    const finalPrice = cost * (1 + totalTaxPercentage / 100) * (1 + margin / 100);
    setFormData((prev) => ({ ...prev, basePrice: finalPrice.toFixed(2) }));
  }, [formData.costPrice, formData.profitMargin, totalTaxPercentage]);

  useEffect(() => {
    if (!isEditing) return;

    setIsLoadingItem(true);

    (async () => {
      const token = localStorage.getItem("manitec_token");
      if (!token) return;

      try {
        const res = await apiFetch(apiUrl(`/catalogs/${editItemId}`), {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error("Nao foi possivel carregar item para edicao.");

        const item = await res.json();
        const taxProfile = (item.taxProfile && typeof item.taxProfile === "object") ? item.taxProfile : {};
        const technicalSpecs = (item.technicalSpecs && typeof item.technicalSpecs === "object") ? item.technicalSpecs : {};

        setFormData({
          sku: item.sku || "",
          name: item.name || "",
          type: item.type || "PART",
          commercialDescription: item.commercialDescription || "",
          category: item.category || "",
          subcategory: item.subcategory || "",
          unit: item.unit || "UN",
          brand: item.brand || "",
          manufacturerPartNumber: item.manufacturerPartNumber || "",
          supplier: item.supplier || "",
          applicationNotes: item.applicationNotes || "",
          technicalVoltage: technicalSpecs.voltage || "",
          technicalCurrent: technicalSpecs.current || "",
          technicalMaterial: technicalSpecs.material || "",
          technicalDimensions: technicalSpecs.dimensions || "",

          costPrice: item.costPrice != null ? String(item.costPrice) : "",
          averageCost: item.averageCost != null ? String(item.averageCost) : "",
          lastCost: item.lastCost != null ? String(item.lastCost) : "",
          profitMargin: item.profitMargin != null ? String(item.profitMargin) : "",
          basePrice: item.basePrice != null ? String(item.basePrice) : "",

          stockCurrent: item.stockCurrent != null ? String(item.stockCurrent) : "",
          stockMin: item.stockMin != null ? String(item.stockMin) : "",
          stockMax: item.stockMax != null ? String(item.stockMax) : "",
          storageLocation: item.storageLocation || "",

          ncm: item.ncm || "",
          cest: item.cest || "",
          origin: item.origin || "NACIONAL",
          grossWeight: item.grossWeight != null ? String(item.grossWeight) : "",
          netWeight: item.netWeight != null ? String(item.netWeight) : "",

          icms: taxProfile.icms != null ? String(taxProfile.icms) : "",
          iss: taxProfile.iss != null ? String(taxProfile.iss) : "",
          pisCofins: taxProfile.pisCofins != null ? String(taxProfile.pisCofins) : item.taxPercentage != null ? String(item.taxPercentage) : "",
          ipi: taxProfile.ipi != null ? String(taxProfile.ipi) : "",
          irpj: taxProfile.irpj != null ? String(taxProfile.irpj) : "",
          csll: taxProfile.csll != null ? String(taxProfile.csll) : "",
          cpp: taxProfile.cpp != null ? String(taxProfile.cpp) : "",
        });
      } catch (e: any) {
        setError(e.message || "Erro ao carregar item.");
      } finally {
        setIsLoadingItem(false);
      }
    })();
  }, [editItemId, isEditing]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const token = localStorage.getItem("manitec_token");
    if (!token) {
      setError("Sessao invalida. Faca login novamente.");
      setIsLoading(false);
      return;
    }

    const taxProfile = {
      icms: toNumberOrUndefined(formData.icms),
      iss: toNumberOrUndefined(formData.iss),
      pisCofins: toNumberOrUndefined(formData.pisCofins),
      ipi: toNumberOrUndefined(formData.ipi),
      irpj: toNumberOrUndefined(formData.irpj),
      csll: toNumberOrUndefined(formData.csll),
      cpp: toNumberOrUndefined(formData.cpp),
    };

    const technicalSpecs = {
      voltage: formData.technicalVoltage || undefined,
      current: formData.technicalCurrent || undefined,
      material: formData.technicalMaterial || undefined,
      dimensions: formData.technicalDimensions || undefined,
    };

    const payload = {
      sku: formData.sku,
      name: formData.name,
      type: formData.type,
      commercialDescription: formData.commercialDescription || undefined,
      category: formData.category || undefined,
      subcategory: formData.subcategory || undefined,
      unit: formData.unit || undefined,
      brand: formData.brand || undefined,
      manufacturerPartNumber: formData.manufacturerPartNumber || undefined,
      supplier: formData.supplier || undefined,
      applicationNotes: formData.applicationNotes || undefined,
      technicalSpecs,

      costPrice: toNumberOrUndefined(formData.costPrice),
      averageCost: toNumberOrUndefined(formData.averageCost),
      lastCost: toNumberOrUndefined(formData.lastCost),
      taxPercentage: totalTaxPercentage,
      profitMargin: toNumberOrUndefined(formData.profitMargin),
      basePrice: Number(formData.basePrice || 0),

      stockCurrent: toNumberOrUndefined(formData.stockCurrent),
      stockMin: toNumberOrUndefined(formData.stockMin),
      stockMax: toNumberOrUndefined(formData.stockMax),
      storageLocation: formData.storageLocation || undefined,

      ncm: formData.ncm || undefined,
      cest: formData.cest || undefined,
      origin: formData.origin,
      grossWeight: toNumberOrUndefined(formData.grossWeight),
      netWeight: toNumberOrUndefined(formData.netWeight),
      taxProfile,
    };

    try {
      const url = isEditing
        ? apiUrl(`/catalogs/${editItemId}`)
        : apiUrl("/catalogs");
      const method = isEditing ? "PATCH" : "POST";

      const res = await apiFetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(Array.isArray(errData.message) ? errData.message.join(", ") : errData.message || "Erro ao salvar item.");
      }

      router.push("/dashboard/catalog");
    } catch (e: any) {
      setError(e.message || "Erro de ligacao com o servidor.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto mb-20 max-w-7xl p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-zinc-800">{isEditing ? "Editar Item de Catalogo" : "Novo Item de Catalogo"}</h1>
          <p className="mt-1 text-zinc-500">Cadastro completo com base tecnica, fiscal, estoque e precificacao.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/suppliers" className="rounded-lg border border-zinc-300 px-4 py-2 text-zinc-700">Fornecedores</Link>
          <Link href="/dashboard/catalog" className="rounded-lg border border-zinc-300 px-4 py-2 text-zinc-700">Voltar</Link>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>}
      {isLoadingItem && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-700">Carregando item...</div>}

      <div className="mb-4 flex flex-wrap gap-2">
        <TabButton label="Dados basicos" value="basic" active={activeTab} onClick={setActiveTab} />
        <TabButton label="Tecnico" value="technical" active={activeTab} onClick={setActiveTab} />
        <TabButton label="Comercial" value="commercial" active={activeTab} onClick={setActiveTab} />
        <TabButton label="Estoque" value="inventory" active={activeTab} onClick={setActiveTab} />
        <TabButton label="Fiscal" value="fiscal" active={activeTab} onClick={setActiveTab} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {activeTab === "basic" && (
          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-bold text-zinc-800">Dados Basicos</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <Input label="Codigo (SKU) *" name="sku" value={formData.sku} onChange={handleChange} required />
              <div>
                <label className="mb-1 block text-sm font-bold text-zinc-700">Tipo *</label>
                <select name="type" value={formData.type} onChange={handleChange} className="w-full rounded-lg border border-zinc-300 p-3">
                  <option value="PART">Peca / Produto</option>
                  <option value="SERVICE">Servico / Mao de Obra</option>
                </select>
              </div>
              <Input label="Categoria" name="category" value={formData.category} onChange={handleChange} />
              <Input label="Subcategoria" name="subcategory" value={formData.subcategory} onChange={handleChange} />
              <Input label="Nome do Item *" name="name" value={formData.name} onChange={handleChange} className="md:col-span-2" required />
              <Input label="Descricao Comercial" name="commercialDescription" value={formData.commercialDescription} onChange={handleChange} className="md:col-span-2" />
              <Input label="Unidade" name="unit" value={formData.unit} onChange={handleChange} />
              <Input label="Marca" name="brand" value={formData.brand} onChange={handleChange} />
              <Input label="Part Number" name="manufacturerPartNumber" value={formData.manufacturerPartNumber} onChange={handleChange} />
              <Input label="Fornecedor principal" name="supplier" value={formData.supplier} onChange={handleChange} />
            </div>
          </section>
        )}

        {activeTab === "technical" && (
          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-bold text-zinc-800">Dados Tecnicos</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input label="Tensao" name="technicalVoltage" value={formData.technicalVoltage} onChange={handleChange} />
              <Input label="Corrente" name="technicalCurrent" value={formData.technicalCurrent} onChange={handleChange} />
              <Input label="Material" name="technicalMaterial" value={formData.technicalMaterial} onChange={handleChange} />
              <Input label="Dimensoes" name="technicalDimensions" value={formData.technicalDimensions} onChange={handleChange} />
              <TextArea label="Aplicacao e compatibilidade" name="applicationNotes" value={formData.applicationNotes} onChange={handleChange} />
            </div>
          </section>
        )}

        {activeTab === "commercial" && (
          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-bold text-zinc-800">Dados Comerciais e Precificacao</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <Input label="Custo de aquisicao (R$)" type="number" step="0.01" name="costPrice" value={formData.costPrice} onChange={handleChange} />
              <Input label="Custo medio (R$)" type="number" step="0.01" name="averageCost" value={formData.averageCost} onChange={handleChange} />
              <Input label="Ultimo custo (R$)" type="number" step="0.01" name="lastCost" value={formData.lastCost} onChange={handleChange} />
              <Input label="Margem padrao (%)" type="number" step="0.01" name="profitMargin" value={formData.profitMargin} onChange={handleChange} />

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 md:col-span-2">
                <p className="text-xs font-bold uppercase text-zinc-500">Carga tributaria total</p>
                <p className="text-xl font-bold text-zinc-800">{totalTaxPercentage.toFixed(2)}%</p>
              </div>

              <div className="rounded-lg border-2 border-blue-500 bg-blue-50 p-3 md:col-span-2">
                <p className="text-xs font-bold uppercase text-blue-700">Preco de venda base</p>
                <p className="text-2xl font-bold text-blue-700">R$ {Number(formData.basePrice || 0).toFixed(2)}</p>
              </div>
            </div>
          </section>
        )}

        {activeTab === "inventory" && (
          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-bold text-zinc-800">Estoque e Logistica</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <Input label="Estoque atual" type="number" step="0.01" name="stockCurrent" value={formData.stockCurrent} onChange={handleChange} />
              <Input label="Estoque minimo" type="number" step="0.01" name="stockMin" value={formData.stockMin} onChange={handleChange} />
              <Input label="Estoque maximo" type="number" step="0.01" name="stockMax" value={formData.stockMax} onChange={handleChange} />
              <Input label="Localizacao fisica" name="storageLocation" value={formData.storageLocation} onChange={handleChange} />
              <Input label="Peso bruto (kg)" type="number" step="0.01" name="grossWeight" value={formData.grossWeight} onChange={handleChange} />
              <Input label="Peso liquido (kg)" type="number" step="0.01" name="netWeight" value={formData.netWeight} onChange={handleChange} />
            </div>
          </section>
        )}

        {activeTab === "fiscal" && (
          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-bold text-zinc-800">Fiscal e Tributario</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <Input label="NCM" name="ncm" value={formData.ncm} onChange={handleChange} />
              <Input label="CEST" name="cest" value={formData.cest} onChange={handleChange} />
              <div>
                <label className="mb-1 block text-sm font-bold text-zinc-700">Origem da mercadoria</label>
                <select name="origin" value={formData.origin} onChange={handleChange} className="w-full rounded-lg border border-zinc-300 p-3">
                  <option value="NACIONAL">Nacional</option>
                  <option value="ESTRANGEIRA_IMPORTACAO_DIRETA">Estrangeira - Importacao direta</option>
                  <option value="ESTRANGEIRA_MERCADO_INTERNO">Estrangeira - Mercado interno</option>
                </select>
              </div>
              <div className="md:col-span-4">
                <p className="mb-2 text-sm font-bold text-zinc-700">Impostos (%)</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
                  <Input label="ICMS" type="number" step="0.01" name="icms" value={formData.icms} onChange={handleChange} compact />
                  <Input label="ISS" type="number" step="0.01" name="iss" value={formData.iss} onChange={handleChange} compact />
                  <Input label="PIS/COFINS" type="number" step="0.01" name="pisCofins" value={formData.pisCofins} onChange={handleChange} compact />
                  <Input label="IPI" type="number" step="0.01" name="ipi" value={formData.ipi} onChange={handleChange} compact />
                  <Input label="IRPJ" type="number" step="0.01" name="irpj" value={formData.irpj} onChange={handleChange} compact />
                  <Input label="CSLL" type="number" step="0.01" name="csll" value={formData.csll} onChange={handleChange} compact />
                  <Input label="CPP" type="number" step="0.01" name="cpp" value={formData.cpp} onChange={handleChange} compact />
                </div>
              </div>
              <p className="md:col-span-4 text-xs text-zinc-500">
                Campos fiscais avancados sao montados automaticamente pelo sistema a partir destes valores.
              </p>
            </div>
          </section>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isLoading || isLoadingItem || !formData.sku || !formData.name || !formData.basePrice}
            className="rounded-lg bg-blue-600 px-8 py-3 font-bold text-white disabled:opacity-50"
          >
            {isLoading ? "Salvando..." : isEditing ? "Salvar alteracoes" : "Salvar item"}
          </button>
        </div>
      </form>
    </div>
  );
}

function toNumberOrUndefined(value: string) {
  if (value == null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function TabButton({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: SectionTab;
  active: SectionTab;
  onClick: (value: SectionTab) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${active === value ? "bg-blue-600 text-white" : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"}`}
    >
      {label}
    </button>
  );
}

function Input({
  label,
  className = "",
  compact = false,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; compact?: boolean }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-bold text-zinc-700">{label}</label>
      <input {...props} className={`w-full rounded-lg border border-zinc-300 ${compact ? "p-2" : "p-3"}`} />
    </div>
  );
}

function TextArea({
  label,
  className = "",
  hint,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-bold text-zinc-700">{label}</label>
      <textarea {...props} className="min-h-28 w-full rounded-lg border border-zinc-300 p-3 text-sm" />
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
