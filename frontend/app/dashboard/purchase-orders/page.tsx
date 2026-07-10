"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Supplier = { id: string; companyName: string; paymentTerm?: string | null };
type Warehouse = { id: string; code: string; name: string };

type DraftItem = {
  warehouseId: string;
  warehouse: string;
  catalogItemId: string;
  item: string;
  suggestedQty: number;
  supplierSuggestion: { supplierId: string; supplierName: string; supplierPrice?: number | null } | null;
};

type PurchaseOrderItem = {
  id: string;
  catalogItemId: string;
  quantity: number;
  receivedQty: number;
  unitPrice: number;
  totalPrice: number;
  catalogItem: { id: string; name: string; sku?: string | null; manufacturerPartNumber?: string | null };
};

type PurchaseOrder = {
  id: string;
  code: string;
  status: "DRAFT" | "SENT" | "APPROVED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELED";
  supplier: { id: string; companyName: string };
  expectedDate?: string | null;
  totalAmount: number;
  paymentTerm?: string | null;
  notes?: string | null;
  items: PurchaseOrderItem[];
};

export default function PurchaseOrdersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [message, setMessage] = useState("");

  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedDrafts, setSelectedDrafts] = useState<string[]>([]);
  const [receiveWarehouseId, setReceiveWarehouseId] = useState("");

  async function loadData() {
    const [supRes, whRes, draftRes, poRes] = await Promise.all([
      apiFetch("/suppliers", { cache: "no-store" }),
      apiFetch("/inventory/warehouses", { cache: "no-store" }),
      apiFetch("/inventory/replenishment-drafts", { cache: "no-store" }),
      apiFetch("/purchase-orders", { cache: "no-store" }),
    ]);

    if (supRes.ok) setSuppliers((await supRes.json()) as Supplier[]);
    if (whRes.ok) {
      const wh = (await whRes.json()) as Warehouse[];
      setWarehouses(wh);
      if (!receiveWarehouseId && wh.length > 0) setReceiveWarehouseId(wh[0].id);
    }
    if (draftRes.ok) setDrafts((await draftRes.json()) as DraftItem[]);
    if (poRes.ok) setOrders((await poRes.json()) as PurchaseOrder[]);
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createPurchaseOrder() {
    if (!supplierId || selectedDrafts.length === 0) {
      setMessage("Selecione fornecedor e ao menos um item sugerido.");
      return;
    }

    const draftItems = drafts.filter((item) => selectedDrafts.includes(`${item.warehouseId}:${item.catalogItemId}`));
    if (draftItems.length === 0) {
      setMessage("Itens de reposicao invalidos.");
      return;
    }

    const supplier = suppliers.find((item) => item.id === supplierId);

    const res = await apiFetch("/purchase-orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        supplierId,
        expectedDate: expectedDate || undefined,
        paymentTerm: paymentTerm || supplier?.paymentTerm || undefined,
        notes,
        items: draftItems.map((item) => ({
          catalogItemId: item.catalogItemId,
          quantity: item.suggestedQty,
          unitPrice: Number(item.supplierSuggestion?.supplierPrice || 0),
        })),
      }),
    });

    if (!res.ok) {
      setMessage("Falha ao criar pedido de compra.");
      return;
    }

    setSupplierId("");
    setExpectedDate("");
    setPaymentTerm("");
    setNotes("");
    setSelectedDrafts([]);
    setMessage("Pedido de compra criado.");
    await loadData();
  }

  async function updateStatus(orderId: string, status: PurchaseOrder["status"]) {
    const res = await apiFetch(`/purchase-orders/${orderId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      setMessage("Falha ao atualizar status do pedido.");
      return;
    }

    await loadData();
  }

  async function receiveOrder(order: PurchaseOrder) {
    if (!receiveWarehouseId) {
      setMessage("Selecione o almoxarifado de recebimento.");
      return;
    }

    const pendingItems = order.items
      .filter((item) => Number(item.quantity) > Number(item.receivedQty))
      .map((item) => ({
        purchaseOrderItemId: item.id,
        quantity: Number(item.quantity) - Number(item.receivedQty),
        unitCost: Number(item.unitPrice),
      }));

    if (pendingItems.length === 0) {
      setMessage("Pedido ja recebido por completo.");
      return;
    }

    const res = await apiFetch(`/purchase-orders/${order.id}/receive`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        warehouseId: receiveWarehouseId,
        notes: "Recebimento integral do saldo pendente",
        items: pendingItems,
      }),
    });

    if (!res.ok) {
      setMessage("Falha ao receber material.");
      return;
    }

    setMessage("Recebimento registrado no estoque.");
    await loadData();
  }

  const draftsBySupplier = useMemo(() => {
    return drafts.filter((item) => !supplierId || item.supplierSuggestion?.supplierId === supplierId);
  }, [drafts, supplierId]);

  return (
    <div className="space-y-6 p-8">
      <h1 className="text-3xl font-bold text-zinc-900">Pedidos de Compra</h1>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
        <h2 className="text-lg font-bold text-zinc-800">Novo Pedido (a partir da reposicao sugerida)</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
            <option value="">Fornecedor</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>{supplier.companyName}</option>
            ))}
          </select>

          <input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
          <input value={paymentTerm} onChange={(event) => setPaymentTerm(event.target.value)} placeholder="Prazo (30/60/90)" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Observacoes" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
        </div>

        <div className="rounded-lg border border-zinc-200 p-3">
          <p className="mb-2 text-sm font-semibold text-zinc-700">Itens sugeridos para compra</p>
          <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
            {draftsBySupplier.map((item) => {
              const key = `${item.warehouseId}:${item.catalogItemId}`;
              return (
                <label key={key} className="flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={selectedDrafts.includes(key)}
                    onChange={(event) => {
                      if (event.target.checked) setSelectedDrafts((prev) => [...prev, key]);
                      else setSelectedDrafts((prev) => prev.filter((id) => id !== key));
                    }}
                  />
                  <span>{item.item} ({item.suggestedQty}) - {item.supplierSuggestion?.supplierName || "Sem sugestao"}</span>
                </label>
              );
            })}
          </div>
        </div>

        <button type="button" onClick={() => void createPurchaseOrder()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">Criar pedido</button>
        {message ? <p className="text-sm text-zinc-600">{message}</p> : null}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-zinc-700">Almoxarifado para recebimento:</p>
          <select value={receiveWarehouseId} onChange={(event) => setReceiveWarehouseId(event.target.value)} className="rounded border border-zinc-300 px-2 py-1 text-xs">
            {warehouses.map((wh) => (
              <option key={wh.id} value={wh.id}>{wh.code} - {wh.name}</option>
            ))}
          </select>
        </div>

        {orders.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum pedido de compra encontrado.</p>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <article key={order.id} className="rounded-lg border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-zinc-800">{order.code} - {order.supplier.companyName}</p>
                    <p className="text-xs text-zinc-500">Status: {order.status} | Total: R$ {Number(order.totalAmount || 0).toFixed(2)}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <select value={order.status} onChange={(event) => void updateStatus(order.id, event.target.value as PurchaseOrder["status"])} className="rounded border border-zinc-300 px-2 py-1 text-xs">
                      <option value="DRAFT">Rascunho</option>
                      <option value="SENT">Enviado</option>
                      <option value="APPROVED">Aprovado</option>
                      <option value="PARTIALLY_RECEIVED">Parcial</option>
                      <option value="RECEIVED">Recebido</option>
                      <option value="CANCELED">Cancelado</option>
                    </select>

                    <button type="button" onClick={() => void receiveOrder(order)} className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">Receber saldo</button>
                  </div>
                </div>

                <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
                  {order.items.map((item) => (
                    <li key={item.id}>{item.catalogItem.name} - {item.receivedQty}/{item.quantity} (R$ {Number(item.unitPrice).toFixed(2)})</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
