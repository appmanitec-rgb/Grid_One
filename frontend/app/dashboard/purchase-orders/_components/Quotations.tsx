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
  modes,
  money,
  Paging,
  request,
  secondaryClass,
  Status,
} from "./shared";
import type { Choice, Offer, OfferItem, Quote, QuoteItem } from "./types";
type OfferLine = {
  quoteItemId: string;
  catalogItemId?: string;
  description: string;
  reference: string;
  manufacturer: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPercent: number;
  taxAmount: number;
  otherExpenses: number;
  compatibility: string;
  technicalReason: string;
  available: boolean;
  included: boolean;
};
type Draft = {
  supplierId: string;
  validUntil: string;
  paymentTerm: string;
  deliveryDays: number;
  expectedAt: string;
  warranty: string;
  notes: string;
  negotiatedContract: string;
  freightAmount: number;
  freightAllocation: string;
  items: OfferLine[];
};
const draft = (quote: Quote): Draft => ({
  supplierId: "",
  validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  paymentTerm: "30 dias",
  deliveryDays: 7,
  expectedAt: "",
  warranty: "",
  notes: "",
  negotiatedContract: "",
  freightAmount: 0,
  freightAllocation: "VALUE",
  items: quote.items.map((item) => ({
    quoteItemId: item.id,
    catalogItemId: item.sources[0]?.requestItem.catalogItemId,
    description: item.description,
    reference: "",
    manufacturer: "",
    quantity: Number(item.quantity),
    unit: item.unit,
    unitPrice: 0,
    discountPercent: 0,
    taxAmount: 0,
    otherExpenses: 0,
    compatibility: "PENDING",
    technicalReason: "",
    available: true,
    included: true,
  })),
});
export function QuoteList() {
  const [rows, setRows] = useState<Quote[]>([]),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController(),
      timer = setTimeout(() => {
        setLoading(true);
        void request<{ items: Quote[]; total: number }>(
          "/purchasing/quotes?page=" +
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
            setRows(data.items);
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
      title="Cotações e mapa comparativo"
      description="Consulte fornecedores e selecione a melhor proposta para cada item."
      actions={
        allowed("purchaseQuotations", "quote") ? (
          <Link
            className={buttonClass}
            href="/dashboard/purchase-orders/quotations/new"
          >
            Nova cotação
          </Link>
        ) : null
      }
    >
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <Field label="Buscar cotação">
          <input
            className={inputClass}
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Código ou título"
          />
        </Field>
        <Field label="Situação da cotação">
          <SelectField
            value={status}
            className={inputClass}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {[
              "PREPARATION",
              "CONSULTING",
              "OFFERS_RECEIVED",
              "AWAITING_APPROVAL",
              "APPROVED",
              "REJECTED",
              "REVISION",
              "ORDERED",
              "CANCELED",
            ].map((value) => (
              <option key={value} value={value}>
                {
                  (
                    {
                      PREPARATION: "Preparação",
                      CONSULTING: "Consultando fornecedores",
                      OFFERS_RECEIVED: "Propostas recebidas",
                      AWAITING_APPROVAL: "Aguardando aprovação",
                      APPROVED: "Aprovada",
                      REJECTED: "Reprovada",
                      REVISION: "Em revisão",
                      ORDERED: "Pedidos gerados",
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
        <p className="py-6 text-sm text-slate-500">Carregando cotações...</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={"/dashboard/purchase-orders/quotations/" + row.id}
              className="block rounded-2xl border border-slate-200 p-4 hover:border-sky-400"
            >
              <div className="flex justify-between gap-3">
                <strong className="text-slate-900">
                  {row.code} · {row.title}
                </strong>
                <Status value={row.status} />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Rodada {row.round} · Revisão {row.revision} ·{" "}
                {row.orders?.length ?? 0} pedido(s) gerado(s)
              </p>
            </Link>
          ))}
          {!rows.length ? (
            <p className="py-6 text-sm text-slate-500">
              Nenhuma cotação encontrada.
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
export function NewQuote({ enabled }: { enabled: boolean }) {
  const router = useRouter(),
    [title, setTitle] = useState(""),
    [selected, setSelected] = useState<Array<Choice & { qty: number }>>([]),
    [merge, setMerge] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function create() {
    setBusy(true);
    setError("");
    try {
      const groups = new Map<
        string,
        Array<{ requestItemId: string; quantity: number }>
      >();
      selected.forEach((item, index) => {
        const key = merge
          ? JSON.stringify([
              item.name,
              item.unit,
              item.specification,
              item.neededAt,
              item.type,
            ])
          : String(index);
        groups.set(key, [
          ...(groups.get(key) ?? []),
          { requestItemId: item.id, quantity: item.qty },
        ]);
      });
      const result = await request<{ id: string }>("/purchasing/quotes", {
        requestKey: crypto.randomUUID(),
        title,
        groups: [...groups.values()].map((sources) => ({ sources })),
        supplierIds: [],
      });
      router.push("/dashboard/purchase-orders/quotations/" + result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <SectionCard
      title="Nova cotação"
      description="Escolha itens analisados por Suprimentos. É possível reunir necessidades de várias solicitações."
    >
      {error ? <InlineMessage tone="warning">{error}</InlineMessage> : null}
      <div className="space-y-4">
        <Field label="Título da cotação">
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Lookup
          kind="requestItems"
          label="Item de solicitação"
          onPick={(choice) => {
            if (choice && !selected.some((i) => i.id === choice.id))
              setSelected([
                ...selected,
                { ...choice, qty: Number(choice.quantity) },
              ]);
          }}
        />
        {selected.map((item, index) => (
          <div
            key={item.id}
            className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-3"
          >
            <p className="min-w-0 flex-1 text-sm font-semibold text-slate-800">
              {item.label}
            </p>
            <Field label="Quantidade a cotar">
              <input
                className={inputClass}
                type="number"
                step="any"
                min="0.000001"
                value={item.qty}
                onChange={(e) =>
                  setSelected(
                    selected.map((i, n) =>
                      n === index ? { ...i, qty: Number(e.target.value) } : i,
                    ),
                  )
                }
              />
            </Field>
            <button
              className={secondaryClass}
              onClick={() =>
                setSelected(selected.filter((i) => i.id !== item.id))
              }
            >
              Remover
            </button>
          </div>
        ))}
        <label className="flex gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={merge}
            onChange={(e) => setMerge(e.target.checked)}
          />
          Consolidar itens com especificação, unidade e prazo idênticos
        </label>
        <button
          className={buttonClass}
          disabled={busy || !enabled || !selected.length || !title.trim()}
          onClick={() => void create()}
        >
          Criar cotação
        </button>
      </div>
    </SectionCard>
  );
}
export function QuoteDetail({ id }: { id: string }) {
  const [quote, setQuote] = useState<Quote | null>(null),
    [form, setForm] = useState<Draft | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [supplier, setSupplier] = useState(""),
    [reason, setReason] = useState(""),
    [winner, setWinner] = useState<{
      item: QuoteItem;
      line: OfferItem;
      offer: Offer;
    } | null>(null),
    [justification, setJustification] = useState(""),
    [mode, setMode] = useState("WAREHOUSE"),
    [technicalException, setTechnicalException] = useState("");
  const load = useCallback(async () => {
    try {
      const data = await request<Quote>("/purchasing/quotes/" + id);
      setQuote(data);
      setForm((previous) => previous ?? draft(data));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na cotação.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [id, load]);
  async function mutate(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await request("/purchasing/quotes/" + id + path, body);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na operação.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function action(action: string) {
    if (
      ["CANCEL", "REVISE", "NEW_ROUND", "GENERATE", "SUBMIT"].includes(
        action,
      ) &&
      !window.confirm("Confirmar esta etapa da cotação?")
    )
      return;
    await mutate("/actions", { action, reason });
  }
  async function saveOffer() {
    if (!form) return;
    const success = await mutate("/offers", {
      ...form,
      validUntil: new Date(form.validUntil + "T23:59:59").toISOString(),
      expectedAt: form.expectedAt || undefined,
      items: form.items
        .filter((i) => i.included)
        .map((item) =>
          Object.fromEntries(
            Object.entries(item).filter(
              ([key, value]) =>
                key !== "included" &&
                (key !== "catalogItemId" || Boolean(value)),
            ),
          ),
        ),
    });
    if (success && quote) setForm(draft(quote));
  }
  async function saveWinner() {
    if (!winner) return;
    const success = await mutate("/selections", {
      quoteItemId: winner.item.id,
      offerItemId: winner.line.id,
      justification,
      fulfillmentMode: mode,
      exceptionReason: technicalException || undefined,
    });
    if (success) {
      setWinner(null);
      setJustification("");
      setTechnicalException("");
    }
  }
  if (!quote || !form)
    return error ? (
      <InlineMessage tone="warning">{error}</InlineMessage>
    ) : (
      <p className="text-sm text-slate-500">Carregando cotação...</p>
    );
  const editable = [
    "PREPARATION",
    "CONSULTING",
    "OFFERS_RECEIVED",
    "REVISION",
  ].includes(quote.status);
  const offers = quote.offers.filter(
    (offer) =>
      offer.round === quote.round &&
      quote.invitations.some(
        (invite) =>
          invite.supplierId === offer.supplierId &&
          invite.round === quote.round &&
          invite.status === "RESPONDED",
      ) &&
      !quote.offers.some(
        (other) =>
          other.supplierId === offer.supplierId &&
          other.round === quote.round &&
          other.version > offer.version,
      ),
  );
  function line(index: number, changes: Partial<OfferLine>) {
    setForm((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item, i) =>
              i === index ? { ...item, ...changes } : item,
            ),
          }
        : null,
    );
  }
  return (
    <div className="space-y-5">
      {error ? <InlineMessage tone="warning">{error}</InlineMessage> : null}
      <SectionCard
        title={quote.code + " · " + quote.title}
        description={"Rodada " + quote.round + " · Revisão " + quote.revision}
        actions={<Status value={quote.status} />}
      >
        <div className="flex flex-wrap gap-2">
          {["PREPARATION", "REVISION"].includes(quote.status) &&
          allowed("purchaseQuotations", "quote") ? (
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={() => void action("OPEN")}
            >
              Abrir consulta aos fornecedores
            </button>
          ) : null}
          {editable && allowed("purchaseQuotations", "quote") ? (
            <button
              className={buttonClass}
              disabled={busy}
              onClick={() => void action("SUBMIT")}
            >
              Encaminhar para aprovação
            </button>
          ) : null}
          {quote.status === "APPROVED" &&
          allowed("purchaseQuotations", "generate") ? (
            <button
              className={buttonClass}
              disabled={busy}
              onClick={() => void action("GENERATE")}
            >
              Gerar pedidos aprovados
            </button>
          ) : null}
        </div>
        {quote.status !== "ORDERED" &&
        quote.status !== "CANCELED" &&
        allowed("purchaseQuotations", "quote") ? (
          <div className="mt-4 space-y-3">
            <Field label="Justificativa de revisão, fornecedor exclusivo ou exceção">
              <textarea
                className={inputClass}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button
                className={secondaryClass}
                disabled={busy}
                onClick={() => void action("REVISE")}
              >
                Abrir revisão
              </button>
              <button
                className={secondaryClass}
                disabled={busy}
                onClick={() => void action("NEW_ROUND")}
              >
                Nova rodada de cotação
              </button>
              {allowed("purchaseQuotations", "cancel") ? (
                <button
                  className={secondaryClass}
                  disabled={busy}
                  onClick={() => void action("CANCEL")}
                >
                  Cancelar cotação
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {quote.orders.length ? (
          <div className="mt-4 space-y-2">
            <h3 className="font-semibold text-slate-800">Pedidos oficiais</h3>
            {quote.orders.map((order) => (
              <Link
                key={order.id}
                href={"/dashboard/purchase-orders/" + order.id}
                className="mr-4 inline-block text-sm font-semibold text-blue-700 underline"
              >
                {order.code} · {money(order.totalAmount)}
              </Link>
            ))}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ...new Map(
              quote.items.flatMap((i) =>
                i.sources.map(
                  (source) =>
                    [
                      source.requestItem.request.id,
                      source.requestItem.request,
                    ] as const,
                ),
              ),
            ).values(),
          ].map((source) => (
            <Link
              key={source.id}
              className={secondaryClass}
              href={"/dashboard/purchase-orders/requests/" + source.id}
            >
              {source.code}
            </Link>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Fornecedores consultados">
        <div className="grid gap-3 md:grid-cols-2">
          {quote.invitations
            .filter((i) => i.round === quote.round)
            .map((invitation) => (
              <div
                key={invitation.id}
                className="rounded-xl border border-slate-200 p-3"
              >
                <p className="font-semibold text-slate-900">
                  {invitation.supplier.companyName}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {
                    (
                      {
                        INVITED: "Convidado",
                        RESPONDED: "Proposta recebida",
                        DECLINED: "Recusou participar",
                        NO_RESPONSE: "Sem resposta",
                        REMOVED: "Removido",
                      } as Record<string, string>
                    )[invitation.status]
                  }
                </p>
                {editable && allowed("purchaseQuotations", "quote") ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[
                      ["DECLINED", "Registrar recusa"],
                      ["NO_RESPONSE", "Sem resposta"],
                      ["REMOVED", "Remover"],
                    ].map(([status, label]) => (
                      <button
                        key={status}
                        className={secondaryClass}
                        disabled={busy}
                        onClick={() =>
                          void mutate("/invitations", {
                            supplierId: invitation.supplierId,
                            status,
                            notes: reason,
                          })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
        </div>
        {editable && allowed("purchaseQuotations", "quote") ? (
          <div className="mt-4 grid items-end gap-3 md:grid-cols-[1fr_auto]">
            <Lookup
              kind="suppliers"
              label="Adicionar fornecedor"
              value={supplier}
              onPick={(choice) => setSupplier(choice?.id ?? "")}
            />
            <button
              className={buttonClass}
              disabled={busy || !supplier}
              onClick={() =>
                void mutate("/invitations", {
                  supplierId: supplier,
                  status: "INVITED",
                })
              }
            >
              Incluir fornecedor
            </button>
          </div>
        ) : null}
      </SectionCard>
      <SectionCard
        title="Mapa comparativo"
        description="A escolha é feita por item. Menor custo ou menor prazo são referências para a decisão."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="p-3">Item / necessidade</th>
                {offers.map((offer) => (
                  <th key={offer.id} className="min-w-[240px] p-3">
                    <p className="font-semibold text-slate-900">
                      {offer.supplier.companyName}
                    </p>
                    <p className="mt-1 text-xs font-normal text-slate-500">
                      Versão {offer.version} · {offer.deliveryDays} dia(s) ·{" "}
                      {offer.paymentTerm}
                    </p>
                    <p className="mt-1 text-xs font-normal text-slate-500">
                      Garantia: {offer.warranty || "Não informada"} · Validade:{" "}
                      {date(offer.validUntil)}
                    </p>
                    {offer.expectedAt ? (
                      <p className="mt-1 text-xs font-normal text-slate-500">
                        Previsão: {date(offer.expectedAt)}
                      </p>
                    ) : null}
                    {offer.supplier.qualityScore != null ||
                    offer.supplier.punctualityScore != null ? (
                      <p className="mt-1 text-xs font-normal text-slate-500">
                        Histórico cadastrado · Qualidade:{" "}
                        {offer.supplier.qualityScore ?? "—"} · Pontualidade:{" "}
                        {offer.supplier.punctualityScore ?? "—"}
                      </p>
                    ) : null}
                    {offer.negotiatedContract ? (
                      <p className="mt-1 text-xs font-normal text-slate-500">
                        Contrato negociado: {offer.negotiatedContract}
                      </p>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quote.items.map((item) => {
                const eligible = offers.flatMap((o) =>
                  o.items
                    .filter(
                      (l) =>
                        l.quoteItemId === item.id &&
                        l.compatibility === "APPROVED" &&
                        l.available &&
                        Number(l.quantity) === Number(item.quantity) &&
                        new Date(o.validUntil).getTime() > Date.now(),
                    )
                    .map((l) => ({ offer: o, line: l })),
                );
                const min = Math.min(
                    ...eligible.map((e) => Number(e.line.totalAmount)),
                  ),
                  fastest = Math.min(
                    ...eligible.map((e) => e.offer.deliveryDays),
                  );
                return (
                  <tr
                    key={item.id}
                    className="border-b border-slate-200 align-top"
                  >
                    <th className="p-3 font-normal">
                      <p className="font-semibold text-slate-900">
                        {item.description}
                      </p>
                      <p className="mt-2 text-slate-600">
                        {item.quantity} {item.unit} · Necessário em{" "}
                        {date(item.neededAt)}
                      </p>
                      {item.specification ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {item.specification}
                        </p>
                      ) : null}
                      {item.sources.map((source) => (
                        <Link
                          key={source.id}
                          className="mt-2 block text-xs text-blue-700 underline"
                          href={
                            "/dashboard/purchase-orders/requests/" +
                            source.requestItem.request.id
                          }
                        >
                          {source.requestItem.request.code}
                        </Link>
                      ))}
                    </th>
                    {offers.map((offer) => {
                      const offerLine = offer.items.find(
                        (l) => l.quoteItemId === item.id,
                      );
                      if (!offerLine)
                        return (
                          <td key={offer.id} className="p-3 text-slate-500">
                            Sem proposta para este item
                          </td>
                        );
                      const selected =
                          item.selection?.offerItemId === offerLine.id,
                        expired =
                          new Date(offer.validUntil).getTime() <= Date.now();
                      return (
                        <td
                          key={offer.id}
                          className={"p-3 " + (selected ? "bg-emerald-50" : "")}
                        >
                          <div className="space-y-2">
                            <p className="text-lg font-bold text-slate-900">
                              {money(offerLine.totalAmount)}
                            </p>
                            <p className="text-xs text-slate-500">
                              Unitário {money(offerLine.unitPrice)} ·{" "}
                              {offerLine.quantity} {offerLine.unit}
                            </p>
                            <p className="text-xs text-slate-500">
                              Desconto {offerLine.discountPercent}% · Tributos{" "}
                              {money(offerLine.taxAmount)}
                            </p>
                            <p className="text-xs text-slate-500">
                              Frete rateado {money(offerLine.freightShare)} ·
                              Despesas {money(offerLine.otherExpenses)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {offerLine.description}
                              {offerLine.reference
                                ? " · Ref. " + offerLine.reference
                                : ""}
                              {offerLine.manufacturer
                                ? " · " + offerLine.manufacturer
                                : ""}
                            </p>
                            <p className="text-xs text-slate-500">
                              {offerLine.available
                                ? "Disponibilidade confirmada"
                                : "Indisponível"}
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {Number(offerLine.totalAmount) === min ? (
                                <span className="rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-800">
                                  Menor custo
                                </span>
                              ) : null}
                              {offer.deliveryDays === fastest ? (
                                <span className="rounded bg-sky-100 px-2 py-1 text-xs text-sky-800">
                                  Menor prazo
                                </span>
                              ) : null}
                              {expired ? (
                                <span className="rounded bg-rose-100 px-2 py-1 text-xs text-rose-800">
                                  Vencida
                                </span>
                              ) : null}
                              <span
                                className={
                                  "rounded px-2 py-1 text-xs " +
                                  (offerLine.compatibility === "APPROVED"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-800")
                                }
                              >
                                {
                                  (
                                    {
                                      APPROVED: "Compatível",
                                      PENDING: "Análise técnica pendente",
                                      REJECTED: "Incompatível",
                                    } as Record<string, string>
                                  )[offerLine.compatibility]
                                }
                              </span>
                            </div>
                            {offerLine.technicalReason ? (
                              <p className="text-xs text-slate-500">
                                {offerLine.technicalReason}
                              </p>
                            ) : null}
                            {selected ? (
                              <p className="text-sm font-semibold text-emerald-700">
                                Selecionada ·{" "}
                                {modes[item.selection!.fulfillmentMode]}
                              </p>
                            ) : null}
                            {editable &&
                            allowed("purchaseQuotations", "selectOffer") ? (
                              <button
                                className={
                                  selected ? secondaryClass : buttonClass
                                }
                                disabled={
                                  busy || expired || !offerLine.available
                                }
                                onClick={() => {
                                  setWinner({ item, line: offerLine, offer });
                                  setJustification(
                                    item.selection?.justification ?? "",
                                  );
                                  setMode(
                                    item.sources[0]?.requestItem.catalogItem
                                      ?.type === "SERVICE"
                                      ? "SERVICE"
                                      : "WAREHOUSE",
                                  );
                                }}
                              >
                                Selecionar proposta
                              </button>
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!offers.length ? (
          <p className="py-5 text-sm text-slate-500">
            Registre propostas para iniciar a comparação.
          </p>
        ) : null}
        <p className="mt-4 text-xs text-slate-500">
          O frete global é rateado pelo critério informado. Na aprovação, o
          valor integral é recalculado entre os itens efetivamente escolhidos de
          cada fornecedor.
        </p>
      </SectionCard>
      {winner ? (
        <SectionCard
          title={"Confirmar escolha: " + winner.item.description}
          description={winner.offer.supplier.companyName}
        >
          <div className="space-y-4">
            <Field label="Justificativa da escolha comercial">
              <textarea
                className={inputClass}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
              />
            </Field>
            <Field label="Forma de atendimento">
              <SelectField
                className={inputClass}
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                {Object.entries(modes).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </SelectField>
            </Field>
            {winner.line.compatibility !== "APPROVED" ? (
              <Field
                label="Justificativa da exceção técnica"
                hint="Exige permissão específica de exceção."
              >
                <textarea
                  className={inputClass}
                  value={technicalException}
                  onChange={(e) => setTechnicalException(e.target.value)}
                />
              </Field>
            ) : null}
            <div className="flex gap-3">
              <button
                className={buttonClass}
                disabled={busy || !justification.trim()}
                onClick={() => void saveWinner()}
              >
                Confirmar seleção
              </button>
              <button
                className={secondaryClass}
                onClick={() => setWinner(null)}
              >
                Voltar ao comparativo
              </button>
            </div>
          </div>
        </SectionCard>
      ) : null}
      {editable && allowed("purchaseQuotations", "quote") ? (
        <SectionCard
          title="Registrar proposta do fornecedor"
          description="Cada envio gera uma versão e preserva as propostas anteriores."
        >
          <fieldset disabled={busy} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Fornecedor da proposta">
                <SelectField
                  className={inputClass}
                  value={form.supplierId}
                  onChange={(e) =>
                    setForm({ ...form, supplierId: e.target.value })
                  }
                >
                  <option value="">Selecione...</option>
                  {quote.invitations
                    .filter(
                      (i) => i.round === quote.round && i.status !== "REMOVED",
                    )
                    .map((i) => (
                      <option key={i.id} value={i.supplierId}>
                        {i.supplier.companyName}
                      </option>
                    ))}
                </SelectField>
              </Field>
              <Field label="Validade da proposta">
                <input
                  type="date"
                  className={inputClass}
                  value={form.validUntil}
                  onChange={(e) =>
                    setForm({ ...form, validUntil: e.target.value })
                  }
                />
              </Field>
              <Field label="Condição de pagamento">
                <input
                  className={inputClass}
                  value={form.paymentTerm}
                  onChange={(e) =>
                    setForm({ ...form, paymentTerm: e.target.value })
                  }
                />
              </Field>
              <Field label="Prazo de entrega em dias">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={form.deliveryDays}
                  onChange={(e) =>
                    setForm({ ...form, deliveryDays: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Data prevista">
                <input
                  type="date"
                  className={inputClass}
                  value={form.expectedAt}
                  onChange={(e) =>
                    setForm({ ...form, expectedAt: e.target.value })
                  }
                />
              </Field>
              <Field label="Garantia ofertada">
                <input
                  className={inputClass}
                  value={form.warranty}
                  onChange={(e) =>
                    setForm({ ...form, warranty: e.target.value })
                  }
                />
              </Field>
              <Field label="Frete global">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClass}
                  value={form.freightAmount}
                  onChange={(e) =>
                    setForm({ ...form, freightAmount: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Critério do rateio de frete">
                <SelectField
                  className={inputClass}
                  value={form.freightAllocation}
                  onChange={(e) =>
                    setForm({ ...form, freightAllocation: e.target.value })
                  }
                >
                  <option value="VALUE">Valor dos itens</option>
                  <option value="QUANTITY">Quantidade dos itens</option>
                </SelectField>
              </Field>
              <Field label="Referência de preço negociado / contrato">
                <input
                  className={inputClass}
                  value={form.negotiatedContract}
                  onChange={(e) =>
                    setForm({ ...form, negotiatedContract: e.target.value })
                  }
                />
              </Field>
            </div>
            {form.items.map((item, index) => (
              <div
                key={item.quoteItemId}
                className="space-y-3 rounded-2xl border border-slate-200 p-4"
              >
                <label className="flex gap-2 font-semibold text-slate-900">
                  <input
                    type="checkbox"
                    checked={item.included}
                    onChange={(e) =>
                      line(index, { included: e.target.checked })
                    }
                  />
                  {item.description}
                </label>
                {item.included ? (
                  <>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      {(
                        [
                          ["quantity", "Quantidade ofertada"],
                          ["unitPrice", "Preço unitário"],
                          ["discountPercent", "Desconto %"],
                          ["taxAmount", "Tributos do item"],
                          ["otherExpenses", "Outras despesas"],
                        ] as const
                      ).map(([key, label]) => (
                        <Field key={key} label={label}>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            className={inputClass}
                            value={item[key]}
                            onChange={(e) =>
                              line(index, { [key]: Number(e.target.value) })
                            }
                          />
                        </Field>
                      ))}
                      <Field label="Referência ofertada">
                        <input
                          className={inputClass}
                          value={item.reference}
                          onChange={(e) =>
                            line(index, { reference: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Fabricante">
                        <input
                          className={inputClass}
                          value={item.manufacturer}
                          onChange={(e) =>
                            line(index, { manufacturer: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Compatibilidade técnica">
                        <SelectField
                          className={inputClass}
                          value={item.compatibility}
                          onChange={(e) =>
                            line(index, { compatibility: e.target.value })
                          }
                        >
                          <option value="PENDING">Pendente de análise</option>
                          <option value="APPROVED">
                            Compatível / aprovado
                          </option>
                          <option value="REJECTED">
                            Incompatível / rejeitado
                          </option>
                        </SelectField>
                      </Field>
                    </div>
                    <Lookup
                      kind="catalog"
                      label="Produto ofertado / substituto aprovado"
                      value={item.catalogItemId}
                      onPick={(choice) =>
                        line(index, { catalogItemId: choice?.id })
                      }
                    />
                    <Field label="Justificativa técnica">
                      <input
                        className={inputClass}
                        value={item.technicalReason}
                        onChange={(e) =>
                          line(index, { technicalReason: e.target.value })
                        }
                      />
                    </Field>
                    <label className="flex gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={item.available}
                        onChange={(e) =>
                          line(index, { available: e.target.checked })
                        }
                      />
                      Disponível para fornecimento
                    </label>
                  </>
                ) : null}
              </div>
            ))}
            <Field label="Observações e negociação">
              <textarea
                className={inputClass}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
            <button
              className={buttonClass}
              disabled={busy || !form.supplierId}
              onClick={() => void saveOffer()}
            >
              Salvar nova versão da proposta
            </button>
          </fieldset>
        </SectionCard>
      ) : null}
      <SectionCard title="Versões e decisões">
        <div className="space-y-2">
          {quote.offers.map((offer) => (
            <details
              key={offer.id}
              className="rounded-xl border border-slate-200 p-3"
            >
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                {offer.supplier.companyName} · Rodada {offer.round} · Versão{" "}
                {offer.version} · Validade {date(offer.validUntil)}
              </summary>
              <div className="mt-3 space-y-3">
                <p className="text-sm text-slate-500">
                  Pagamento: {offer.paymentTerm} · Prazo: {offer.deliveryDays}{" "}
                  dia(s) · {offer.notes}
                </p>
                <Attachments
                  type="OFFER"
                  id={offer.id}
                  items={offer.attachments}
                  onChanged={() => void load()}
                  editable={editable && allowed("purchaseQuotations", "quote")}
                />
              </div>
            </details>
          ))}
          {quote.approvals?.map((approval) => (
            <div
              key={approval.id}
              className="flex flex-wrap gap-3 rounded-xl border border-slate-200 p-3 text-sm"
            >
              <span>{approval.approverUser?.name}</span>
              <Status value={approval.status} />
              <span>{approval.decisionNote}</span>
            </div>
          ))}
        </div>
      </SectionCard>
      <Attachments
        type="QUOTE"
        id={id}
        items={quote.attachments}
        onChanged={() => void load()}
        editable={editable && allowed("purchaseQuotations", "quote")}
      />
      <History items={quote.history} />
    </div>
  );
}
