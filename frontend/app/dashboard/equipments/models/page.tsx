"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";

type CatalogItem = { id: string; name: string; type: string; basePrice: number };
type ModelBaseItem = { catalogItemId: string; serviceGroup: "TOF" | "TM" | "TB" | "TMA" | "OUTROS"; defaultQuantity: number };
type ModelRow = {
  id: string;
  name: string;
  brand?: string | null;
  baseItems?: Array<{ id: string; serviceGroup: string; defaultQuantity: number; catalogItem: { id: string; name: string } }>;
};

const GROUPS: Array<ModelBaseItem["serviceGroup"]> = ["TOF", "TM", "TB", "TMA", "OUTROS"];

export default function EquipmentModelsPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [items, setItems] = useState<ModelBaseItem[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const [catalogRes, modelsRes] = await Promise.all([
        apiFetch("/catalogs"),
        apiFetch("/generators/models"),
      ]);
      if (catalogRes.ok) setCatalog((await catalogRes.json()) as CatalogItem[]);
      if (modelsRes.ok) setModels((await modelsRes.json()) as ModelRow[]);
    } catch {
      setError("Falha ao carregar dados.");
    }
  }

  function addBaseItem() {
    setItems((prev) => [...prev, { catalogItemId: "", serviceGroup: "OUTROS", defaultQuantity: 1 }]);
  }

  function updateBaseItem(index: number, patch: Partial<ModelBaseItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeBaseItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveModel(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/generators/models", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          brand: brand || undefined,
          baseItems: items.filter((it) => it.catalogItemId),
        }),
      });

      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "Falha ao salvar modelo."));
      }

      setName("");
      setBrand("");
      setItems([]);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao salvar modelo.");
    } finally {
      setSaving(false);
    }
  }

  const catalogOptions = useMemo(() => catalog.sort((a, b) => a.name.localeCompare(b.name)), [catalog]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-800">Cadastro de Modelos</h1>
          <p className="text-zinc-500 mt-1">Defina itens base por grupo (TOF, TM, TB, TMA, OUTROS).</p>
        </div>
        <Link href="/dashboard/equipments/new" className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100">
          Voltar para Novo Equipamento
        </Link>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <form onSubmit={saveModel} className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-zinc-800">Novo modelo</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do modelo" className="rounded-lg border border-zinc-300 p-3" required />
          <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Marca" className="rounded-lg border border-zinc-300 p-3" />
          <button type="button" onClick={addBaseItem} className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 font-semibold text-blue-700 hover:bg-blue-100">
            + Adicionar item base
          </button>
        </div>

        {items.length > 0 && (
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2 rounded-lg border border-zinc-200 p-3">
                <select value={item.catalogItemId} onChange={(e) => updateBaseItem(idx, { catalogItemId: e.target.value })} className="rounded-lg border border-zinc-300 p-2">
                  <option value="">Item de catalogo</option>
                  {catalogOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                  ))}
                </select>
                <select value={item.serviceGroup} onChange={(e) => updateBaseItem(idx, { serviceGroup: e.target.value as ModelBaseItem["serviceGroup"] })} className="rounded-lg border border-zinc-300 p-2">
                  {GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
                </select>
                <input type="number" min={1} value={item.defaultQuantity} onChange={(e) => updateBaseItem(idx, { defaultQuantity: Number(e.target.value || 1) })} className="rounded-lg border border-zinc-300 p-2" />
                <button type="button" onClick={() => removeBaseItem(idx)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-semibold text-red-700 hover:bg-red-100">
                  Remover
                </button>
              </div>
            ))}
          </div>
        )}

        <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-60">
          {saving ? "Salvando..." : "Salvar modelo"}
        </button>
      </form>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-zinc-800 mb-3">Modelos cadastrados</h2>
        <div className="space-y-3">
          {models.map((model) => (
            <div key={model.id} className="rounded-lg border border-zinc-200 p-3">
              <p className="font-bold text-zinc-800">{model.brand ? `${model.brand} - ` : ""}{model.name}</p>
              <p className="text-xs text-zinc-500 mt-1">{model.baseItems?.length || 0} itens base</p>
            </div>
          ))}
          {models.length === 0 && <p className="text-sm text-zinc-500">Nenhum modelo cadastrado.</p>}
        </div>
      </section>
    </div>
  );
}
