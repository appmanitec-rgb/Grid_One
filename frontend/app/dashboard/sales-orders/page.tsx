"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAccessFromToken } from "@/lib/access";
import { apiFetch } from "@/lib/api";

type Status = "OPEN" | "PARTIALLY_DELIVERED" | "DELIVERED" | "CLOSED" | "CANCELED";
type OrderSummary = {
  id: string;
  code: string;
  status: Status;
  totalValue: string | null;
  createdAt: string;
  proposal: { id: string; code: string };
  client: { id: string; companyName: string; tradeName?: string | null };
  orderedQty: number;
  reservedQty: number;
  pickedQty: number;
  deliveredQty: number;
  deliveryCount: number;
  receivableCount: number;
};
type Allocation = {
  id: string;
  warehouseId: string;
  warehouse: { id: string; code: string; name: string };
  reservedQty: number;
  pickedQty: number;
};
type OrderItem = {
  id: string;
  description: string;
  quantity: number;
  deliveredQty: number;
  unitPrice: string | null;
  totalPrice: string | null;
  catalogItemId: string | null;
  catalogItem?: { id: string; sku?: string | null; manufacturerPartNumber?: string | null; name: string } | null;
  allocations: Allocation[];
};
type Delivery = {
  id: string;
  code: string;
  deliveredAt: string;
  receivedByName: string;
  shippingReference?: string | null;
  notes?: string | null;
  items: Array<{ id: string; quantity: number; returnedQty: number; salesOrderItem: { description: string }; warehouse: { name: string } }>;
};
type OrderDetail = Omit<OrderSummary, "orderedQty" | "reservedQty" | "pickedQty" | "deliveredQty" | "deliveryCount" | "receivableCount"> & {
  paymentTerm?: string | null;
  closedReason?: string | null;
  items: OrderItem[];
  deliveries: Delivery[];
  returns: Array<{ id: string; salesDeliveryItemId: string; quantity: number; reason: string; createdAt: string }>;
  receivables: Array<{ id: string; status: string }>;
};
type Warehouse = { id: string; name: string; code: string };
type StockRow = { catalogItemId: string; warehouseId: string; availableQty: number };
type CatalogOption = { id: string; name: string; sku?: string | null; manufacturerPartNumber?: string | null };

const statusLabel: Record<Status, string> = {
  OPEN: "Aguardando separação",
  PARTIALLY_DELIVERED: "Entrega parcial",
  DELIVERED: "Entregue",
  CLOSED: "Encerrado com saldo",
  CANCELED: "Cancelado",
};
const statusTone: Record<Status, string> = {
  OPEN: "bg-amber-50 text-amber-800 border-amber-200",
  PARTIALLY_DELIVERED: "bg-sky-50 text-sky-800 border-sky-200",
  DELIVERED: "bg-emerald-50 text-emerald-800 border-emerald-200",
  CLOSED: "bg-zinc-100 text-zinc-700 border-zinc-200",
  CANCELED: "bg-rose-50 text-rose-800 border-rose-200",
};
const money = (value: string | number | null | undefined) => value == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

export default function SalesOrdersPage() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [proposalId, setProposalId] = useState("");
  const [orderIdFilter, setOrderIdFilter] = useState("");
  const [warehouseByItem, setWarehouseByItem] = useState<Record<string, string>>({});
  const [reserveQty, setReserveQty] = useState<Record<string, string>>({});
  const [pickQty, setPickQty] = useState<Record<string, string>>({});
  const [releaseQty, setReleaseQty] = useState<Record<string, string>>({});
  const [deliveryQty, setDeliveryQty] = useState<Record<string, string>>({});
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState<Record<string, string>>({});
  const [restockApproved, setRestockApproved] = useState<Record<string, boolean>>({});
  const returnRequests = useRef<Record<string, string>>({});
  const [recipient, setRecipient] = useState("");
  const [shippingReference, setShippingReference] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [billingDueDate, setBillingDueDate] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogForItem, setCatalogForItem] = useState("");
  const [catalogOptions, setCatalogOptions] = useState<CatalogOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [permissions, setPermissions] = useState({ canReserve: false, canDeliver: false, canReturn: false, canManage: false, canSeeStock: false, canSearchCatalog: false, canCreateFinance: false });

  const loadList = useCallback(async () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (status) params.set("status", status);
    if (proposalId) params.set("proposalId", proposalId);
    if (orderIdFilter) params.set("orderId", orderIdFilter);
    const response = await apiFetch(`/sales-orders?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível carregar os pedidos de venda.");
    const rows = await response.json() as OrderSummary[];
    setOrders(rows);
    setSelectedId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id || "");
    setLoading(false);
  }, [query, status, proposalId, orderIdFilter]);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) { setDetail(null); return; }
    const response = await apiFetch(`/sales-orders/${id}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível abrir o pedido.");
    setDetail(await response.json() as OrderDetail);
  }, []);

  const loadStock = useCallback(async () => {
    const response = await apiFetch("/inventory/summary", { cache: "no-store" });
    if (response.ok) setStock(await response.json() as StockRow[]);
  }, []);

  useEffect(() => {
    const access = getAccessFromToken();
    setPermissions({
      canReserve: access.inventory.reserve,
      canDeliver: access.inventory.consume,
      canReturn: access.inventory.consume && access.finance.update,
      canManage: access.inventory.update || access.proposals.approve,
      canSeeStock: access.inventory.view,
      canSearchCatalog: access.catalog.view,
      canCreateFinance: access.finance.create,
    });
    const linkedProposal = new URLSearchParams(window.location.search).get("proposalId") || "";
    const linkedOrder = new URLSearchParams(window.location.search).get("orderId") || "";
    setProposalId(linkedProposal);
    setOrderIdFilter(linkedOrder);
    if (access.inventory.view) {
      void apiFetch("/inventory/warehouses", { cache: "no-store" }).then(async (response) => {
        if (response.ok) setWarehouses(await response.json() as Warehouse[]);
      });
      void loadStock();
    }
  }, [loadStock]);

  useEffect(() => { void loadList().catch((cause) => { setError(cause.message); setLoading(false); }); }, [loadList]);
  useEffect(() => { void loadDetail(selectedId).catch((cause) => setError(cause.message)); }, [selectedId, loadDetail]);

  async function run(path: string, body?: unknown, method: "POST" | "PATCH" = "POST") {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await apiFetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(payload.message) ? payload.message.join(" ") : payload.message || "Não foi possível concluir a ação.");
      await Promise.all([loadList(), selectedId ? loadDetail(selectedId) : Promise.resolve(), permissions.canSeeStock ? loadStock() : Promise.resolve()]);
      setMessage("Alteração registrada com sucesso.");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha inesperada.");
      return false;
    } finally { setBusy(false); }
  }

  async function searchCatalog(itemId: string) {
    setCatalogForItem(itemId);
    setCatalogOptions([]);
    if (!catalogSearch.trim()) return;
    const response = await apiFetch(`/catalogs/lookup?q=${encodeURIComponent(catalogSearch.trim())}&type=PART&take=12`, { cache: "no-store" });
    if (response.ok) setCatalogOptions(await response.json() as CatalogOption[]);
    else setError("Não foi possível pesquisar o catálogo.");
  }

  async function submitDelivery() {
    if (!detail) return;
    const items = detail.items.flatMap((item) => item.allocations.map((allocation) => ({
      itemId: item.id,
      warehouseId: allocation.warehouseId,
      quantity: Number(deliveryQty[`${item.id}:${allocation.warehouseId}`] || 0),
    }))).filter((line) => line.quantity > 0);
    if (!items.length) { setError("Informe a quantidade a entregar em pelo menos uma linha separada."); return; }
    const saved = await run(`/sales-orders/${detail.id}/deliveries`, { receivedByName: recipient, shippingReference, notes: deliveryNotes, items });
    if (saved) { setDeliveryQty({}); setRecipient(""); setShippingReference(""); setDeliveryNotes(""); }
  }

  async function submitReturn(salesDeliveryItemId: string) {
    if (!detail) return;
    const quantity = Number(returnQty[salesDeliveryItemId]);
    const reason = returnReason[salesDeliveryItemId]?.trim() || "";
    const signature = `${detail.id}:${salesDeliveryItemId}:${quantity}:${reason}`;
    const previous = returnRequests.current[salesDeliveryItemId];
    const requestId = previous?.startsWith(`${signature}|`) ? previous.slice(signature.length + 1) : crypto.randomUUID();
    returnRequests.current[salesDeliveryItemId] = `${signature}|${requestId}`;
    const saved = await run(`/sales-orders/${detail.id}/returns`, { requestId, salesDeliveryItemId, quantity, reason, restockApproved: restockApproved[salesDeliveryItemId] === true });
    if (saved) {
      delete returnRequests.current[salesDeliveryItemId];
      setReturnQty((current) => ({ ...current, [salesDeliveryItemId]: "" }));
      setReturnReason((current) => ({ ...current, [salesDeliveryItemId]: "" }));
      setRestockApproved((current) => ({ ...current, [salesDeliveryItemId]: false }));
    }
  }

  const active = detail && (detail.status === "OPEN" || detail.status === "PARTIALLY_DELIVERED");
  const canDeliverNow = detail?.items.some((item) => item.allocations.some((allocation) => allocation.pickedQty > 0));
  const hasActiveReceivable = detail?.receivables.some((receivable) => receivable.status !== "CANCELED") ?? false;

  return <div className="mx-auto max-w-[1600px] space-y-5 p-4 pb-16 md:p-7">
    <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex md:items-end md:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Suprimentos · expedição</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Pedidos de venda</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">Da proposta aceita à entrega das peças, com reserva por almoxarifado e histórico de cada entrega.</p>
      </div>
      {permissions.canManage ? <button type="button" disabled={busy} onClick={() => void run("/sales-orders/sync-approved")} className="mt-4 rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-50 md:mt-0">Buscar propostas aprovadas sem pedido</button> : null}
    </header>

    {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-800">{error}</div> : null}
    {message ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{message}</div> : null}

    <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <input aria-label="Pesquisar pedidos" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pedido, proposta ou cliente" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select aria-label="Filtrar por situação" value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Todas as situações</option>{Object.entries(statusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        {proposalId ? <button type="button" onClick={() => setProposalId("")} className="mt-2 text-xs font-semibold text-blue-700">Limpar filtro da proposta</button> : null}
        {orderIdFilter ? <button type="button" onClick={() => setOrderIdFilter("")} className="mt-2 ml-2 text-xs font-semibold text-blue-700">Mostrar todos os pedidos</button> : null}
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{loading ? "Carregando" : `${orders.length} pedido(s)`}</p>
        <div className="mt-2 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
          {!loading && orders.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">Nenhum pedido encontrado. Os pedidos de peças são criados quando a proposta é aceita.</p> : null}
          {orders.map((order) => <button type="button" key={order.id} onClick={() => setSelectedId(order.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === order.id ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-200 hover:bg-slate-50"}`}>
            <div className="flex items-center justify-between gap-2"><strong className="text-sm text-slate-950">{order.code}</strong><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone[order.status]}`}>{statusLabel[order.status]}</span></div>
            <p className="mt-1 truncate text-sm text-slate-700">{order.client.tradeName || order.client.companyName}</p>
            <p className="mt-2 text-xs text-slate-500">{order.deliveredQty}/{order.orderedQty} peças entregues · {order.pickedQty} separadas</p>
          </button>)}
        </div>
      </aside>

      <main className="min-w-0 space-y-4">
        {!detail ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Selecione um pedido para acompanhar a separação e as entregas.</div> : <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Pedido {detail.code}</p><h2 className="mt-1 text-xl font-bold text-slate-950">{detail.client.tradeName || detail.client.companyName}</h2><p className="mt-1 text-sm text-slate-500">Criado em {date(detail.createdAt)} · Proposta <Link className="font-semibold text-blue-700 hover:underline" href={`/dashboard/proposals/${detail.proposal.id}`}>{detail.proposal.code}</Link></p></div>
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusTone[detail.status]}`}>{statusLabel[detail.status]}</span>
            </div>
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3"><span className="block text-xs text-slate-500">Valor do pedido</span><strong>{money(detail.totalValue)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><span className="block text-xs text-slate-500">Condição de pagamento</span><strong>{detail.paymentTerm || "—"}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><span className="block text-xs text-slate-500">Cobrança vinculada</span><strong>{detail.receivables.length ? `${detail.receivables.length} título(s)` : "Nenhum título"}</strong></div>
            </div>
            {detail.closedReason ? <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">Motivo do encerramento: {detail.closedReason}</p> : null}
            {permissions.canCreateFinance && (detail.status === "DELIVERED" || detail.status === "CLOSED") && !hasActiveReceivable && detail.items.some((item) => item.deliveredQty > 0) ? <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><label className="text-xs font-semibold text-emerald-900">Vencimento do título<input type="date" value={billingDueDate} onChange={(event) => setBillingDueDate(event.target.value)} className="mt-1 block rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm" /></label><button type="button" disabled={busy || !billingDueDate} onClick={() => void run(`/finance/receivables/sync/sales-orders/${detail.id}`, { dueDate: `${billingDueDate}T12:00:00.000Z` })} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Gerar título do pedido</button><p className="w-full text-xs text-emerald-800">O valor é calculado pelas peças entregues; o vencimento é informado pelo financeiro.</p></div> : null}
            {detail.receivables.length > 0 ? <Link href="/dashboard/finance/accounts-receivable" className="mt-3 inline-block text-sm font-semibold text-blue-700 hover:underline">Ver cobrança no financeiro →</Link> : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4"><h3 className="text-lg font-bold text-slate-950">Itens e separação</h3><p className="text-sm text-slate-500">Reserve o saldo, confirme a separação física e registre a entrega ao cliente.</p></div>
            <div className="space-y-4">{detail.items.map((item) => {
              const reserved = item.allocations.reduce((sum, allocation) => sum + allocation.reservedQty, 0);
              const pending = item.quantity - item.deliveredQty - reserved;
              return <article key={item.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="font-semibold text-slate-900">{item.description}</h4><p className="mt-1 text-xs text-slate-500">SKU {item.catalogItem?.sku || "—"} · PN {item.catalogItem?.manufacturerPartNumber || "—"}</p></div><span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{item.deliveredQty}/{item.quantity} entregues</span></div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-md bg-blue-50 px-2 py-1 text-blue-800">{reserved} reservadas</span><span className="rounded-md bg-amber-50 px-2 py-1 text-amber-800">{item.allocations.reduce((sum, row) => sum + row.pickedQty, 0)} separadas</span><span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">{pending} pendentes</span>{item.totalPrice != null ? <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">{money(item.totalPrice)}</span> : null}</div>
                {!item.catalogItemId && active ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Peça sem vínculo ao catálogo.</strong> É preciso relacioná-la antes da separação.
                  {permissions.canManage && permissions.canSearchCatalog ? <div className="mt-2"><div className="flex gap-2"><input aria-label="Buscar peça no catálogo" value={catalogForItem === item.id ? catalogSearch : ""} onChange={(event) => { setCatalogForItem(item.id); setCatalogSearch(event.target.value); }} placeholder="Buscar por nome, SKU ou PN" className="min-w-0 flex-1 rounded-lg border border-amber-300 px-3 py-2 text-sm" /><button type="button" disabled={busy} onClick={() => void searchCatalog(item.id)} className="rounded-lg bg-amber-200 px-3 py-2 text-xs font-bold">Buscar</button></div>{catalogForItem === item.id && catalogOptions.length ? <div className="mt-2 space-y-1">{catalogOptions.map((option) => <button type="button" key={option.id} disabled={busy} onClick={() => void run(`/sales-orders/${detail.id}/items/${item.id}/catalog`, { catalogItemId: option.id }, "PATCH").then((saved) => { if (saved) setCatalogOptions([]); })} className="block w-full rounded-lg border border-amber-200 bg-white p-2 text-left text-xs hover:bg-amber-100">{option.sku || "Sem SKU"} · {option.manufacturerPartNumber || "Sem PN"} · {option.name}</button>)}</div> : null}</div> : null}
                </div> : null}
                {active && item.catalogItemId && pending > 0 && permissions.canReserve ? <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_90px_auto]">
                  <select aria-label={`Almoxarifado para ${item.description}`} value={warehouseByItem[item.id] || ""} onChange={(event) => setWarehouseByItem((current) => ({ ...current, [item.id]: event.target.value }))} className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">Selecione o almoxarifado</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} · disponível {stock.find((row) => row.catalogItemId === item.catalogItemId && row.warehouseId === warehouse.id)?.availableQty ?? 0}</option>)}</select>
                  <input aria-label={`Quantidade a reservar de ${item.description}`} type="number" min="1" max={pending} value={reserveQty[item.id] || ""} onChange={(event) => setReserveQty((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Qtd" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <button type="button" disabled={busy || !warehouseByItem[item.id]} onClick={() => void run(`/sales-orders/${detail.id}/reserve`, { itemId: item.id, warehouseId: warehouseByItem[item.id], quantity: Number(reserveQty[item.id]) })} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Reservar</button>
                </div> : null}
                {item.allocations.filter((allocation) => allocation.reservedQty > 0).map((allocation) => <div key={allocation.id} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2 text-xs"><strong className="mr-auto text-slate-700">{allocation.warehouse.name}: {allocation.reservedQty} reservadas · {allocation.pickedQty} separadas</strong>{active && permissions.canReserve ? <><input aria-label={`Quantidade da reserva em ${allocation.warehouse.name}`} type="number" min="1" max={allocation.reservedQty} value={pickQty[allocation.id] || ""} onChange={(event) => setPickQty((current) => ({ ...current, [allocation.id]: event.target.value }))} placeholder="Qtd" className="w-20 rounded-md border border-slate-300 px-2 py-1" /><button type="button" disabled={busy || allocation.reservedQty <= allocation.pickedQty} onClick={() => void run(`/sales-orders/${detail.id}/pick`, { itemId: item.id, warehouseId: allocation.warehouseId, quantity: Number(pickQty[allocation.id]) })} className="rounded-md bg-amber-100 px-2 py-1 font-bold text-amber-900 disabled:opacity-40">Separar</button><input aria-label={`Quantidade a liberar em ${allocation.warehouse.name}`} type="number" min="1" max={allocation.reservedQty - allocation.pickedQty} value={releaseQty[allocation.id] || ""} onChange={(event) => setReleaseQty((current) => ({ ...current, [allocation.id]: event.target.value }))} placeholder="Qtd" className="w-20 rounded-md border border-slate-300 px-2 py-1" /><button type="button" disabled={busy || allocation.reservedQty <= allocation.pickedQty} onClick={() => void run(`/sales-orders/${detail.id}/release`, { itemId: item.id, warehouseId: allocation.warehouseId, quantity: Number(releaseQty[allocation.id]) })} className="rounded-md border border-slate-300 px-2 py-1 font-bold text-slate-700 disabled:opacity-40">Liberar</button></> : null}</div>)}
              </article>;
            })}</div>
          </section>

          {active && canDeliverNow && permissions.canDeliver ? <section className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm"><h3 className="text-lg font-bold text-slate-950">Registrar entrega</h3><p className="mt-1 text-sm text-slate-600">Escolha as quantidades efetivamente entregues. O saldo permanece no pedido.</p><div className="mt-4 space-y-2">{detail.items.flatMap((item) => item.allocations.filter((allocation) => allocation.pickedQty > 0).map((allocation) => <label key={`${item.id}:${allocation.warehouseId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 bg-white p-3 text-sm"><span>{item.description} · {allocation.warehouse.name} · até {allocation.pickedQty}</span><input type="number" min="0" max={allocation.pickedQty} value={deliveryQty[`${item.id}:${allocation.warehouseId}`] || ""} onChange={(event) => setDeliveryQty((current) => ({ ...current, [`${item.id}:${allocation.warehouseId}`]: event.target.value }))} placeholder="Qtd entregue" className="w-36 rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>))}</div><div className="mt-3 grid gap-2 md:grid-cols-2"><input aria-label="Nome de quem recebeu" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Quem recebeu as peças?" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /><input aria-label="Referência de envio" value={shippingReference} onChange={(event) => setShippingReference(event.target.value)} placeholder="Rastreio ou referência de envio (opcional)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div><textarea aria-label="Observações da entrega" value={deliveryNotes} onChange={(event) => setDeliveryNotes(event.target.value)} placeholder="Observações da entrega (opcional)" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={2} /><button type="button" disabled={busy || !recipient.trim()} onClick={() => void submitDelivery()} className="mt-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Confirmar entrega</button></section> : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-bold text-slate-950">Histórico de entregas</h3>{detail.deliveries.length === 0 ? <p className="mt-3 text-sm text-slate-500">Nenhuma entrega registrada.</p> : <div className="mt-3 space-y-3">{detail.deliveries.map((delivery) => <article key={delivery.id} className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{delivery.code}</strong><span className="text-slate-500">{date(delivery.deliveredAt)}</span></div><p className="mt-1 text-xs text-slate-600">Recebido por {delivery.receivedByName}{delivery.shippingReference ? ` · Referência ${delivery.shippingReference}` : ""}</p><ul className="mt-2 space-y-1 text-xs text-slate-700">{delivery.items.map((line) => <li key={line.id}>{line.quantity} × {line.salesOrderItem.description} · {line.warehouse.name}</li>)}</ul>{delivery.notes ? <p className="mt-2 text-xs text-slate-500">{delivery.notes}</p> : null}</article>)}</div>}</section>

          {active && permissions.canManage ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-bold text-slate-900">Encerrar saldo pendente</h3><p className="mt-1 text-xs text-slate-500">Libera reservas restantes. As quantidades já entregues permanecem registradas.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input aria-label="Motivo do encerramento" value={closeReason} onChange={(event) => setCloseReason(event.target.value)} placeholder="Motivo obrigatório" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button type="button" disabled={busy || !closeReason.trim()} onClick={() => void run(`/sales-orders/${detail.id}/close`, { reason: closeReason }).then((saved) => { if (saved) setCloseReason(""); })} className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">Encerrar pedido</button></div></section> : null}
          {detail.deliveries.length > 0 ? <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Devoluções de peças</h3>
            <p className="mt-1 text-sm text-slate-600">Registre apenas peças conferidas e aptas a voltar ao estoque. Se já houver boleto, pagamento ou nota, regularize primeiro com o financeiro.</p>
            <div className="mt-3 space-y-3">{detail.deliveries.flatMap((delivery) => delivery.items.map((line) => <div key={line.id} className="rounded-xl border border-slate-200 p-3 text-sm">
              <p className="font-semibold text-slate-900">{delivery.code} · {line.salesOrderItem.description}</p>
              <p className="mt-1 text-xs text-slate-600">{line.quantity} entregue(s) · {line.returnedQty} devolvida(s) · {line.warehouse.name}</p>
              {permissions.canReturn && line.returnedQty < line.quantity ? <div className="mt-3 flex flex-wrap gap-2">
                <input aria-label={`Quantidade devolvida de ${line.salesOrderItem.description}`} type="number" min="1" max={line.quantity - line.returnedQty} value={returnQty[line.id] || ""} onChange={(event) => setReturnQty((current) => ({ ...current, [line.id]: event.target.value }))} placeholder="Qtd" className="w-20 rounded-lg border border-slate-300 px-2 py-1" />
                <input aria-label={`Motivo da devolução de ${line.salesOrderItem.description}`} value={returnReason[line.id] || ""} onChange={(event) => setReturnReason((current) => ({ ...current, [line.id]: event.target.value }))} placeholder="Motivo da devolução" className="min-w-44 flex-1 rounded-lg border border-slate-300 px-2 py-1" />
                <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={restockApproved[line.id] || false} onChange={(event) => setRestockApproved((current) => ({ ...current, [line.id]: event.target.checked }))} />Peça conferida e apta ao estoque</label>
                <button type="button" disabled={busy || !restockApproved[line.id] || !returnReason[line.id]?.trim() || Number(returnQty[line.id]) < 1 || Number(returnQty[line.id]) > line.quantity - line.returnedQty} onClick={() => void submitReturn(line.id)} className="rounded-lg bg-amber-700 px-3 py-1 font-bold text-white disabled:opacity-50">Receber devolução</button>
              </div> : null}
            </div>))}</div>
            {detail.returns?.length ? <ul className="mt-4 space-y-1 text-xs text-slate-600">{detail.returns.map((entry) => <li key={entry.id}>{date(entry.createdAt)} · {entry.quantity} peça(s) · {entry.reason}</li>)}</ul> : null}
          </section> : null}
        </>}
      </main>
    </div>
  </div>;
}
