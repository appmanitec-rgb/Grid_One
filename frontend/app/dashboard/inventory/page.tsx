"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Warehouse = {
  id: string;
  name: string;
  code: string;
  type: "MAIN" | "MOBILE";
};

type InventoryRow = {
  id: string;
  warehouseId: string;
  warehouse: string;
  catalogItemId: string;
  sku?: string | null;
  partNumber?: string | null;
  item: string;
  physicalQty: number;
  reservedQty: number;
  availableQty: number;
  minQty: number;
  maxQty: number;
  avgCost?: number | null;
};

type ReplenishmentDraft = {
  warehouseId: string;
  warehouse: string;
  catalogItemId: string;
  item: string;
  availableQty: number;
  minQty: number;
  maxQty: number;
  suggestedQty: number;
  supplierSuggestion: {
    supplierId: string;
    supplierName: string;
    leadTimeDays?: number | null;
    supplierPrice?: number | null;
  } | null;
};

export default function InventoryPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [drafts, setDrafts] = useState<ReplenishmentDraft[]>([]);
  const [search, setSearch] = useState("");
  const [adjustItemId, setAdjustItemId] = useState("");
  const [adjustWarehouseId, setAdjustWarehouseId] = useState("");
  const [adjustDelta, setAdjustDelta] = useState("");
  const [message, setMessage] = useState("");

  async function fetchAll(selectedWarehouseId?: string) {
    const warehouseQuery = selectedWarehouseId ? `?warehouseId=${selectedWarehouseId}` : "";

    const [whRes, summaryRes, draftRes] = await Promise.all([
      apiFetch("/inventory/warehouses", { cache: "no-store" }),
      apiFetch(`/inventory/summary${warehouseQuery}`, { cache: "no-store" }),
      apiFetch(`/inventory/replenishment-drafts${warehouseQuery}`, { cache: "no-store" }),
    ]);

    if (whRes.ok) {
      const data = (await whRes.json()) as Warehouse[];
      setWarehouses(data);
      if (!warehouseId && data.length > 0) setWarehouseId(data[0].id);
    }

    if (summaryRes.ok) {
      setRows((await summaryRes.json()) as InventoryRow[]);
    } else {
      setRows([]);
    }

    if (draftRes.ok) {
      setDrafts((await draftRes.json()) as ReplenishmentDraft[]);
    } else {
      setDrafts([]);
    }
  }

  useEffect(() => {
    void fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void fetchAll(warehouseId || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId]);

  async function applyAdjustment() {
    if (!adjustWarehouseId || !adjustItemId || !adjustDelta) {
      setMessage("Selecione almoxarifado, item e ajuste.");
      return;
    }

    const delta = Number(adjustDelta);
    if (Number.isNaN(delta) || delta === 0) {
      setMessage("Informe um ajuste numerico valido.");
      return;
    }

    const res = await apiFetch("/inventory/adjust", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        warehouseId: adjustWarehouseId,
        reason: "Ajuste manual de inventario",
        items: [{ catalogItemId: adjustItemId, delta }],
      }),
    });

    if (!res.ok) {
      setMessage("Falha ao aplicar ajuste.");
      return;
    }

    setMessage("Ajuste aplicado com sucesso.");
    setAdjustDelta("");
    await fetchAll(warehouseId || undefined);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => `${row.item} ${row.sku || ""} ${row.partNumber || ""} ${row.warehouse}`.toLowerCase().includes(q));
  }, [rows, search]);

  const kpi = useMemo(() => {
    const low = rows.filter((row) => row.availableQty <= Number(row.minQty || 0)).length;
    const value = rows.reduce((acc, row) => acc + Number(row.physicalQty || 0) * Number(row.avgCost || 0), 0);
    return { total: rows.length, low, value };
  }, [rows]);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl font-bold text-zinc-900">Controle de Estoque (Multilocal)</h1>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Metric title="Saldos controlados" value={String(kpi.total)} />
        <Metric title="Abaixo do minimo" value={String(kpi.low)} />
        <Metric title="Valor total" value={`R$ ${kpi.value.toFixed(2)}`} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
            <option value="">Todos almoxarifados</option>
            {warehouses.map((wh) => (
              <option key={wh.id} value={wh.id}>{wh.code} - {wh.name}</option>
            ))}
          </select>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar item, SKU, PN, almoxarifado"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <select value={adjustWarehouseId} onChange={(event) => setAdjustWarehouseId(event.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
            <option value="">Almoxarifado do ajuste</option>
            {warehouses.map((wh) => (
              <option key={wh.id} value={wh.id}>{wh.code} - {wh.name}</option>
            ))}
          </select>

          <select value={adjustItemId} onChange={(event) => setAdjustItemId(event.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
            <option value="">Item</option>
            {rows.map((row) => (
              <option key={`${row.warehouseId}-${row.catalogItemId}`} value={row.catalogItemId}>{row.item}</option>
            ))}
          </select>

          <input value={adjustDelta} onChange={(event) => setAdjustDelta(event.target.value)} placeholder="+10 ou -2" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" />

          <button type="button" onClick={() => void applyAdjustment()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">Aplicar ajuste</button>
        </div>

        {message ? <p className="text-sm text-zinc-600">{message}</p> : null}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-bold text-zinc-800">Fisico x Reservado x Disponivel</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2">Almoxarifado</th>
                <th className="px-2 py-2">Item</th>
                <th className="px-2 py-2">SKU / PN</th>
                <th className="px-2 py-2">Fisico</th>
                <th className="px-2 py-2">Reservado</th>
                <th className="px-2 py-2">Disponivel</th>
                <th className="px-2 py-2">Min / Max</th>
                <th className="px-2 py-2 text-right">Acao</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const low = row.availableQty <= Number(row.minQty || 0);
                return (
                  <tr key={row.id} className="border-b border-zinc-100">
                    <td className="px-2 py-2 text-zinc-700">{row.warehouse}</td>
                    <td className="px-2 py-2 font-semibold text-zinc-800">{row.item}</td>
                    <td className="px-2 py-2 text-zinc-700">{row.sku || "-"} / {row.partNumber || "-"}</td>
                    <td className="px-2 py-2 text-zinc-700">{row.physicalQty}</td>
                    <td className="px-2 py-2 text-zinc-700">{row.reservedQty}</td>
                    <td className={`px-2 py-2 font-semibold ${low ? "text-red-600" : "text-zinc-800"}`}>{row.availableQty}</td>
                    <td className="px-2 py-2 text-zinc-700">{row.minQty} / {row.maxQty}</td>
                    <td className="px-2 py-2 text-right">
                      <Link
                        href={`/dashboard/catalog/${row.catalogItemId}`}
                        className="text-xs font-semibold text-blue-700 hover:underline"
                      >
                        Abrir ficha
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h2 className="mb-3 text-lg font-bold text-amber-900">Gatilho de reposicao</h2>
        {drafts.length === 0 ? (
          <p className="text-sm text-amber-800">Nenhum item abaixo do ponto de reposicao.</p>
        ) : (
          <div className="space-y-2">
            {drafts.map((draft) => (
              <article key={`${draft.warehouseId}-${draft.catalogItemId}`} className="rounded-lg border border-amber-200 bg-white p-3">
                <p className="text-sm font-semibold text-zinc-900">{draft.item}</p>
                <p className="text-xs text-zinc-600">{draft.warehouse} | Disp: {draft.availableQty} | Min: {draft.minQty} | Sugerido: {draft.suggestedQty}</p>
                {draft.supplierSuggestion ? (
                  <p className="mt-1 text-xs text-zinc-700">Sugestao: {draft.supplierSuggestion.supplierName} ({draft.supplierSuggestion.leadTimeDays ?? "?"} dias)</p>
                ) : null}
              </article>
            ))}
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
