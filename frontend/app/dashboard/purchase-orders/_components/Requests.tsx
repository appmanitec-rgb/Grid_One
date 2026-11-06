"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SelectField } from "../../components/SelectField";
import { InlineMessage, SectionCard } from "../../components/DashboardPageKit";
import {
  allowed,
  Attachments,
  buttonClass,
  date,
  Field,
  History,
  inputClass,
  Lookup,
  origins,
  Paging,
  request,
  secondaryClass,
  Status,
} from "./shared";
import type { Allocation, PurchaseRequest, RequestItem } from "./types";
const newItem = (origin: string): RequestItem => ({
  description: "",
  quantity: 1,
  unit: "UN",
  allocations: [{ origin, quantity: 1 }],
});
type Form = {
  requestKey: string;
  department: string;
  origin: string;
  priority: string;
  justification: string;
  neededAt: string;
  notes: string;
  items: RequestItem[];
};
export function RequestList() {
  const [items, setItems] = useState<PurchaseRequest[]>([]),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      void request<{ items: PurchaseRequest[]; total: number }>(
        "/purchasing/requests?page=" +
          page +
          "&q=" +
          encodeURIComponent(q) +
          "&status=" +
          status,
        undefined,
        "GET",
        controller.signal,
      )
        .then((data) => {
          setItems(data.items);
          setTotal(data.total);
          setError("");
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, status, page]);
  return (
    <SectionCard
      title="Solicitações de compra"
      description="Registre a necessidade antes de escolher o fornecedor."
      actions={
        allowed("purchaseRequests", "request") ? (
          <Link
            className={buttonClass}
            href="/dashboard/purchase-orders/requests/new"
          >
            Nova solicitação
          </Link>
        ) : null
      }
    >
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <Field label="Buscar solicitação">
          <input
            type="search"
            className={inputClass}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Código, justificativa ou item"
          />
        </Field>
        <Field label="Situação">
          <SelectField
            className={inputClass}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {[
              "DRAFT",
              "AWAITING_ANALYSIS",
              "ANALYZED",
              "IN_QUOTATION",
              "PARTIALLY_FULFILLED",
              "FULFILLED",
              "REVISION",
              "CANCELED",
            ].map((value) => (
              <option key={value} value={value}>
                {
                  (
                    {
                      DRAFT: "Rascunho",
                      AWAITING_ANALYSIS: "Aguardando análise",
                      ANALYZED: "Analisada",
                      IN_QUOTATION: "Em cotação",
                      PARTIALLY_FULFILLED: "Parcialmente atendida",
                      FULFILLED: "Atendida",
                      REVISION: "Em revisão",
                      CANCELED: "Cancelada",
                    } as Record<string, string>
                  )[value]
                }
              </option>
            ))}
          </SelectField>
        </Field>
      </div>
      {error ? <InlineMessage tone="warning">{error}</InlineMessage> : null}
      {loading ? (
        <p className="py-6 text-sm text-slate-500">
          Carregando solicitações...
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Link
              key={item.id}
              href={"/dashboard/purchase-orders/requests/" + item.id}
              className="block rounded-2xl border border-slate-200 p-4 hover:border-sky-400"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <strong className="text-slate-900">{item.code}</strong>
                <Status value={item.status} />
              </div>
              <p className="mt-2 text-sm text-slate-700">
                {item.justification}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {item.requester?.name} · {item.department} ·{" "}
                {origins[item.origin]} · Necessário em {date(item.neededAt)} ·{" "}
                {item._count?.items ?? item.items.length} item(ns)
              </p>
            </Link>
          ))}
          {!items.length ? (
            <p className="py-6 text-sm text-slate-500">
              Nenhuma solicitação encontrada.
            </p>
          ) : null}
        </div>
      )}
      <div className="mt-5">
        <Paging page={page} total={total} onPage={setPage} />
      </div>
    </SectionCard>
  );
}
export function RequestDetail({
  id,
  enabled,
}: {
  id: string;
  enabled: boolean;
}) {
  const router = useRouter(),
    [record, setRecord] = useState<PurchaseRequest | null>(null),
    [form, setForm] = useState<Form>({
      requestKey: "",
      department: "",
      origin: "STOCK",
      priority: "NORMAL",
      justification: "",
      neededAt: "",
      notes: "",
      items: [newItem("STOCK")],
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(id !== "new"),
    [reason, setReason] = useState("");
  const isNew = id === "new",
    editable =
      (isNew || ["DRAFT", "REVISION"].includes(record?.status ?? "")) &&
      allowed("purchaseRequests", isNew ? "request" : "update");
  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const result = await request<PurchaseRequest>(
        "/purchasing/requests/" + id,
      );
      setRecord(result);
      setForm({
        requestKey: result.requestKey,
        department: result.department,
        origin: result.origin,
        priority: result.priority,
        justification: result.justification,
        neededAt: result.neededAt?.slice(0, 10) ?? "",
        notes: result.notes ?? "",
        items: result.items,
      });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => {
    if (isNew) {
      setForm((f) => ({ ...f, requestKey: crypto.randomUUID() }));
      void request<{ department?: string }>("/users/me")
        .then((user) =>
          setForm((f) => ({ ...f, department: user.department ?? "" })),
        )
        .catch(() => {});
    } else void load();
  }, [id, isNew, load]);
  function patchItem(index: number, changes: Partial<RequestItem>) {
    setForm((f) => ({
      ...f,
      items: f.items.map((item, i) =>
        i === index ? { ...item, ...changes } : item,
      ),
    }));
  }
  function patchAllocation(
    index: number,
    position: number,
    changes: Partial<Allocation>,
  ) {
    const item = form.items[index];
    patchItem(index, {
      allocations: item.allocations.map((a, i) =>
        i === position ? { ...a, ...changes } : a,
      ),
    });
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await request<PurchaseRequest>(
        "/purchasing/requests" + (isNew ? "" : "/" + id),
        {
          ...form,
          neededAt: form.neededAt || undefined,
          items: form.items.map((item) => ({
            catalogItemId: item.catalogItemId || undefined,
            description: item.description,
            specification: item.specification || undefined,
            originalReference: item.originalReference || undefined,
            quantity: Number(item.quantity),
            unit: item.unit,
            neededAt: item.neededAt || form.neededAt || undefined,
            notes: item.notes || undefined,
            allocations: item.allocations.map((a) =>
              Object.fromEntries(
                Object.entries(a)
                  .filter(
                    ([key, value]) =>
                      [
                        "origin",
                        "quantity",
                        "clientId",
                        "orderId",
                        "contractId",
                        "generatorId",
                        "serialNumber",
                        "salesOrderId",
                        "warrantyId",
                        "costCenterId",
                        "warehouseId",
                      ].includes(key) &&
                      value !== "" &&
                      value !== undefined,
                  )
                  .map(([key, value]) => [
                    key,
                    key === "quantity" ? Number(value) : value,
                  ]),
              ),
            ),
          })),
        },
        isNew ? "POST" : "PATCH",
      );
      if (isNew)
        router.push("/dashboard/purchase-orders/requests/" + result.id);
      else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function action(action: string) {
    if (
      ["CANCEL", "REVISE"].includes(action) &&
      !window.confirm("Confirmar esta alteração na solicitação?")
    )
      return;
    setBusy(true);
    setError("");
    try {
      await request("/purchasing/requests/" + id + "/actions", {
        action,
        reason,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  }
  async function quote() {
    setBusy(true);
    setError("");
    try {
      const result = await request<{ id: string }>("/purchasing/quotes", {
        requestKey: crypto.randomUUID(),
        title: "Cotação — " + record?.code,
        groups: record!.items.map((i) => ({
          sources: [
            {
              requestItemId: i.id,
              quantity: Number(i.quantity) - Number(i.fulfilledQty ?? 0),
            },
          ],
        })),
        supplierIds: [],
      });
      router.push("/dashboard/purchase-orders/quotations/" + result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na cotação.");
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return <p className="text-sm text-slate-500">Carregando solicitação...</p>;
  return (
    <div className="space-y-5">
      {error ? <InlineMessage tone="warning">{error}</InlineMessage> : null}
      <SectionCard
        title={isNew ? "Nova solicitação" : (record?.code ?? "Solicitação")}
        description="O fornecedor será definido durante a cotação."
        actions={record ? <Status value={record.status} /> : null}
      >
        <fieldset
          disabled={busy || !editable || !enabled}
          className="space-y-5"
        >
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Departamento solicitante">
              <input
                className={inputClass}
                value={form.department}
                onChange={(e) =>
                  setForm({ ...form, department: e.target.value })
                }
              />
            </Field>
            <Field label="Origem da necessidade">
              <SelectField
                className={inputClass}
                value={form.origin}
                onChange={(e) =>
                  setForm({
                    ...form,
                    origin: e.target.value,
                    items: form.items.map((item) => ({
                      ...item,
                      allocations: item.allocations.map((a) => ({
                        quantity: a.quantity,
                        origin: e.target.value,
                      })),
                    })),
                  })
                }
              >
                {Object.entries(origins).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Prioridade">
              <SelectField
                className={inputClass}
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                {[
                  ["LOW", "Baixa"],
                  ["NORMAL", "Normal"],
                  ["HIGH", "Alta"],
                  ["EMERGENCY", "Emergencial"],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Data necessária">
              <input
                className={inputClass}
                type="date"
                value={form.neededAt}
                onChange={(e) => setForm({ ...form, neededAt: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Justificativa da necessidade">
            <textarea
              className={inputClass}
              rows={3}
              value={form.justification}
              onChange={(e) =>
                setForm({ ...form, justification: e.target.value })
              }
            />
          </Field>
          <Field label="Observações">
            <textarea
              className={inputClass}
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          {form.items.map((item, index) => (
            <div
              key={index}
              className="space-y-4 rounded-2xl border border-slate-200 p-4"
            >
              <div className="flex justify-between gap-3">
                <h3 className="font-semibold text-slate-900">
                  Item {index + 1}
                </h3>
                {editable && form.items.length > 1 ? (
                  <button
                    type="button"
                    className="text-sm text-rose-600"
                    onClick={() =>
                      setForm({
                        ...form,
                        items: form.items.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remover item
                  </button>
                ) : null}
              </div>
              {record ? (
                <p className="text-sm text-slate-500">
                  Solicitado: {item.quantity} · Atendido:{" "}
                  {item.fulfilledQty ?? 0} · Pendente:{" "}
                  {Number(
                    Math.max(
                      0,
                      Number(item.quantity) - Number(item.fulfilledQty ?? 0),
                    ).toFixed(6),
                  )}
                </p>
              ) : null}
              {editable ? (
                <Lookup
                  label={"Produto ou serviço " + (index + 1)}
                  kind="catalog"
                  value={item.catalogItemId}
                  onPick={(choice) =>
                    patchItem(index, {
                      catalogItemId: choice?.id,
                      description: choice?.name ?? item.description,
                      unit: choice?.unit ?? item.unit,
                    })
                  }
                />
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label={"Descrição do item " + (index + 1)}
                  hint="Também permite necessidade descritiva ainda não cadastrada."
                >
                  <input
                    className={inputClass}
                    value={item.description}
                    onChange={(e) =>
                      patchItem(index, { description: e.target.value })
                    }
                  />
                </Field>
                <Field label="Referência original">
                  <input
                    className={inputClass}
                    value={item.originalReference ?? ""}
                    onChange={(e) =>
                      patchItem(index, { originalReference: e.target.value })
                    }
                  />
                </Field>
                <Field label="Quantidade">
                  <input
                    className={inputClass}
                    type="number"
                    min="0.000001"
                    step="any"
                    value={item.quantity}
                    onChange={(e) =>
                      patchItem(index, {
                        quantity: e.target.value,
                        allocations:
                          item.allocations.length === 1
                            ? [
                                {
                                  ...item.allocations[0],
                                  quantity: e.target.value,
                                },
                              ]
                            : item.allocations,
                      })
                    }
                  />
                </Field>
                <Field label="Unidade">
                  <input
                    className={inputClass}
                    value={item.unit}
                    onChange={(e) => patchItem(index, { unit: e.target.value })}
                  />
                </Field>
                <Field label="Especificação técnica">
                  <textarea
                    className={inputClass}
                    value={item.specification ?? ""}
                    onChange={(e) =>
                      patchItem(index, { specification: e.target.value })
                    }
                  />
                </Field>
                <Field label="Prazo do item">
                  <input
                    type="date"
                    className={inputClass}
                    value={item.neededAt?.slice(0, 10) ?? ""}
                    onChange={(e) =>
                      patchItem(index, { neededAt: e.target.value })
                    }
                  />
                </Field>
              </div>
              {item.allocations.map((a, position) => (
                <div
                  key={position}
                  className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-2 lg:grid-cols-3"
                >
                  <Field label="Destinação">
                    <SelectField
                      value={a.origin}
                      className={inputClass}
                      onChange={(e) =>
                        patchAllocation(index, position, {
                          origin: e.target.value,
                        })
                      }
                    >
                      {Object.entries(origins).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </SelectField>
                  </Field>
                  <Field label="Quantidade destinada">
                    <input
                      className={inputClass}
                      type="number"
                      step="any"
                      value={a.quantity}
                      onChange={(e) =>
                        patchAllocation(index, position, {
                          quantity: e.target.value,
                        })
                      }
                    />
                  </Field>
                  {a.origin === "STOCK" ? (
                    <Lookup
                      label="Almoxarifado de destino"
                      kind="warehouses"
                      value={a.warehouseId}
                      onPick={(choice) =>
                        patchAllocation(index, position, {
                          warehouseId: choice?.id,
                        })
                      }
                    />
                  ) : null}
                  {a.origin === "ORDER" ? (
                    <Lookup
                      label="Ordem de Serviço"
                      kind="orders"
                      value={a.orderId}
                      onPick={(choice) =>
                        patchAllocation(index, position, {
                          orderId: choice?.id,
                          clientId: choice?.clientId,
                          generatorId: choice?.generatorId,
                        })
                      }
                    />
                  ) : null}
                  {a.origin === "CONTRACT" ? (
                    <Lookup
                      label="Contrato"
                      kind="contracts"
                      value={a.contractId}
                      onPick={(choice) =>
                        patchAllocation(index, position, {
                          contractId: choice?.id,
                        })
                      }
                    />
                  ) : null}
                  {["PARTS_SALE", "GENERATOR_SALE"].includes(a.origin) ? (
                    <Lookup
                      label="Pedido de venda"
                      kind="sales"
                      value={a.salesOrderId}
                      onPick={(choice) =>
                        patchAllocation(index, position, {
                          salesOrderId: choice?.id,
                        })
                      }
                    />
                  ) : null}
                  {a.origin === "WARRANTY" ? (
                    <Lookup
                      label="Processo de garantia"
                      kind="warranties"
                      value={a.warrantyId}
                      onPick={(choice) =>
                        patchAllocation(index, position, {
                          warrantyId: choice?.id,
                        })
                      }
                    />
                  ) : null}
                  {[
                    "ORDER",
                    "CONTRACT",
                    "PARTS_SALE",
                    "GENERATOR_SALE",
                    "WARRANTY",
                  ].includes(a.origin) ? (
                    <>
                      <Lookup
                        label="Cliente"
                        kind="clients"
                        value={a.clientId}
                        onPick={(choice) =>
                          patchAllocation(index, position, {
                            clientId: choice?.id,
                          })
                        }
                      />
                      <Lookup
                        label="Equipamento"
                        kind="equipments"
                        value={a.generatorId}
                        onPick={(choice) =>
                          patchAllocation(index, position, {
                            generatorId: choice?.id,
                            clientId: choice?.clientId ?? a.clientId,
                            serialNumber: choice?.serialNumber,
                          })
                        }
                      />
                    </>
                  ) : null}
                  <Lookup
                    label="Centro de custo"
                    kind="costCenters"
                    value={a.costCenterId}
                    onPick={(choice) =>
                      patchAllocation(index, position, {
                        costCenterId: choice?.id,
                      })
                    }
                  />
                  {a.serialNumber ? (
                    <p className="text-xs text-slate-500">
                      Série: {a.serialNumber}
                    </p>
                  ) : null}
                  {editable && item.allocations.length > 1 ? (
                    <button
                      type="button"
                      className="text-sm text-rose-600"
                      onClick={() =>
                        patchItem(index, {
                          allocations: item.allocations.filter(
                            (_, i) => i !== position,
                          ),
                        })
                      }
                    >
                      Remover destinação
                    </button>
                  ) : null}
                </div>
              ))}
              {editable ? (
                <button
                  type="button"
                  className={secondaryClass}
                  onClick={() =>
                    patchItem(index, {
                      allocations: [
                        ...item.allocations,
                        { origin: form.origin, quantity: 1 },
                      ],
                    })
                  }
                >
                  Adicionar destinação / rateio
                </button>
              ) : null}
            </div>
          ))}
          {editable ? (
            <button
              type="button"
              className={secondaryClass}
              onClick={() =>
                setForm({
                  ...form,
                  items: [...form.items, newItem(form.origin)],
                })
              }
            >
              Adicionar item
            </button>
          ) : null}
        </fieldset>
        <div className="mt-5 flex flex-wrap gap-3">
          {editable &&
          allowed("purchaseRequests", isNew ? "request" : "update") ? (
            <button
              className={buttonClass}
              disabled={busy || !enabled}
              onClick={() => void save()}
            >
              {busy ? "Salvando..." : "Salvar solicitação"}
            </button>
          ) : null}
          {record &&
          ["DRAFT", "REVISION"].includes(record.status) &&
          allowed("purchaseRequests", "request") ? (
            <button
              className={buttonClass}
              disabled={busy}
              onClick={() => void action("SUBMIT")}
            >
              Enviar para análise
            </button>
          ) : null}
          {record?.status === "AWAITING_ANALYSIS" &&
          allowed("purchaseRequests", "analyze") ? (
            <button
              className={buttonClass}
              disabled={busy}
              onClick={() => void action("ANALYZE")}
            >
              Concluir análise de Suprimentos
            </button>
          ) : null}
          {record?.status === "ANALYZED" &&
          allowed("purchaseQuotations", "quote") ? (
            <button
              className={buttonClass}
              disabled={busy || !enabled}
              onClick={() => void quote()}
            >
              Iniciar cotação
            </button>
          ) : null}
        </div>
        {record && ["AWAITING_ANALYSIS", "ANALYZED"].includes(record.status) ? (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <Field label="Motivo da revisão ou cancelamento">
              <input
                className={inputClass}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            {allowed("purchaseRequests", "request") ? (
              <button
                className={secondaryClass}
                disabled={busy}
                onClick={() => void action("REVISE")}
              >
                Solicitar revisão
              </button>
            ) : null}
            {allowed("purchaseRequests", "cancel") ? (
              <button
                className={secondaryClass}
                disabled={busy}
                onClick={() => void action("CANCEL")}
              >
                Cancelar solicitação
              </button>
            ) : null}
          </div>
        ) : null}
      </SectionCard>
      {record && record.items.some((item) => item.quoteSources?.length) ? (
        <SectionCard title="Cotações vinculadas">
          <div className="flex flex-wrap gap-3">
            {[
              ...new Map(
                record.items.flatMap((item) =>
                  (item.quoteSources ?? []).map(
                    (source) =>
                      [
                        source.quoteItem.quote.id,
                        source.quoteItem.quote,
                      ] as const,
                  ),
                ),
              ).values(),
            ].map((quote) =>
              allowed("purchaseQuotations") ? (
                <Link
                  key={quote.id}
                  className={secondaryClass}
                  href={"/dashboard/purchase-orders/quotations/" + quote.id}
                >
                  {quote.code} · <Status value={quote.status} />
                </Link>
              ) : (
                <span key={quote.id} className="text-sm text-slate-700">
                  {quote.code} · <Status value={quote.status} />
                </span>
              ),
            )}
          </div>
        </SectionCard>
      ) : null}
      {record?.analysis?.length ? (
        <SectionCard
          title="Análise de disponibilidade"
          description="Disponível considera reservas existentes. Pedidos pendentes aparecem separadamente."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {record.analysis.map((a) => (
              <div
                key={a.itemId}
                className="rounded-xl border border-slate-200 p-4"
              >
                <h3 className="font-semibold text-slate-900">
                  {record.items.find((i) => i.id === a.itemId)?.description}
                </h3>
                {a.descriptive ? (
                  <p className="mt-2 text-sm text-amber-700">
                    Item descritivo: vincule um cadastro válido na proposta
                    antes de gerar o pedido.
                  </p>
                ) : (
                  <>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <dt>Físico</dt>
                      <dd>{a.physicalQty}</dd>
                      <dt>Reservado</dt>
                      <dd>{a.reservedQty}</dd>
                      <dt>Disponível</dt>
                      <dd className="font-semibold">{a.availableQty}</dd>
                      <dt>Encomendado</dt>
                      <dd>{a.inboundQty}</dd>
                      <dt>Projetado</dt>
                      <dd>{a.projectedQty}</dd>
                    </dl>
                    {a.availableQty > 0 ? (
                      <p className="mt-3 text-sm text-emerald-700">
                        Verifique o aproveitamento do material disponível antes
                        de comprar.
                      </p>
                    ) : null}
                    {a.unassignedInboundQty ? (
                      <p className="mt-2 text-xs text-amber-700">
                        {a.unassignedInboundQty} unidade(s) em pedidos sem
                        almoxarifado definido.
                      </p>
                    ) : null}
                  </>
                )}
                {a.duplicates.length ? (
                  <div className="mt-3 text-sm text-amber-700">
                    Outras necessidades:{" "}
                    {a.duplicates.map((other) => (
                      <Link
                        key={other.request.id}
                        className="mr-2 underline"
                        href={
                          "/dashboard/purchase-orders/requests/" +
                          other.request.id
                        }
                      >
                        {other.request.code}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}
      {record ? (
        <>
          <Attachments
            type="REQUEST"
            id={id}
            items={record.attachments}
            onChanged={() => void load()}
            editable={allowed("purchaseRequests", "request")}
          />
          <History items={record.history} />
        </>
      ) : null}
    </div>
  );
}
