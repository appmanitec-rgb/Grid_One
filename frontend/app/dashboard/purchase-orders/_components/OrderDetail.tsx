"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
  request,
  secondaryClass,
  Status,
} from "./shared";
import type { Order } from "./types";
type ReceiptLine = {
  orderItemId: string;
  acceptedQty: number;
  rejectedQty: number;
  serials: string;
  divergence: string;
};
type InvoiceLine = { orderItemId: string; quantity: number; amount: number };
export default function OrderDetail({ id }: { id: string }) {
  const [order, setOrder] = useState<Order | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [method, setMethod] = useState("E-mail"),
    [evidence, setEvidence] = useState(""),
    [reason, setReason] = useState(""),
    [warehouse, setWarehouse] = useState(""),
    [receiptKey, setReceiptKey] = useState(""),
    [receipt, setReceipt] = useState<ReceiptLine[]>([]),
    [fiscalReference, setFiscalReference] = useState(""),
    [receiptNotes, setReceiptNotes] = useState("");
  const [editingInvoice, setEditingInvoice] = useState("");
  const [number, setNumber] = useState(""),
    [series, setSeries] = useState("1"),
    [accessKey, setAccessKey] = useState(""),
    [kind, setKind] = useState("STANDARD"),
    [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10)),
    [amount, setAmount] = useState(0),
    [invoiceEvidence, setInvoiceEvidence] = useState(""),
    [invoiceReason, setInvoiceReason] = useState(""),
    [invoiceLines, setInvoiceLines] = useState<InvoiceLine[]>([]),
    [schedule, setSchedule] = useState([
      {
        dueDate: new Date(Date.now() + 30 * 86400000)
          .toISOString()
          .slice(0, 10),
        amount: 0,
      },
    ]);
  const load = useCallback(async () => {
    try {
      const data = await request<Order>("/purchasing/orders/" + id);
      setOrder(data);
      setReceipt(
        data.items.map((item) => ({
          orderItemId: item.id,
          acceptedQty: 0,
          rejectedQty: 0,
          serials: "",
          divergence: "",
        })),
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no pedido.");
    }
  }, [id]);

  useEffect(() => {
    setReceiptKey(crypto.randomUUID());
    void load();
  }, [id, load]);
  async function mutate(
    path: string,
    body: unknown,
    message: string,
    httpMethod = "POST",
  ) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await request(
        "/purchasing/orders/" + id + path,
        body,
        httpMethod,
      );
      await load();
      setSuccess(message);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na operação.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function action(action: string) {
    if (!window.confirm("Confirmar esta ação no pedido?")) return;
    await mutate(
      "/actions",
      { action, method, evidence, reason },
      "Acompanhamento atualizado.",
    );
  }
  async function receive() {
    if (
      !window.confirm(
        "Confirmar apenas as quantidades aceitas e recusadas informadas?",
      )
    )
      return;
    const result = await mutate(
      "/receive",
      {
        requestKey: receiptKey,
        warehouseId: warehouse || undefined,
        fiscalReference: fiscalReference || undefined,
        notes: receiptNotes || undefined,
        items: receipt
          .filter((i) => i.acceptedQty + i.rejectedQty > 0)
          .map(({ serials, ...item }) => ({
            ...item,
            serialNumbers: serials
              .split(/[\n,;]/)
              .map((s) => s.trim())
              .filter(Boolean),
          })),
      },
      "Recebimento conferido. As quantidades recusadas continuam pendentes.",
    );
    if (result) setReceiptKey(crypto.randomUUID());
  }
  async function createInvoice() {
    const result = await mutate(
      "/invoices" + (editingInvoice ? "/" + editingInvoice : ""),
      {
        number,
        series,
        accessKey: accessKey || undefined,
        kind,
        issueDate,
        amount,
        evidence: invoiceEvidence,
        justification: invoiceReason || undefined,
        lines:
          kind === "STANDARD" ? invoiceLines.filter((i) => i.quantity > 0) : [],
        schedule,
      },
      "Documento registrado para validação. Nenhum pagamento foi realizado.",
      editingInvoice ? "PATCH" : "POST",
    );
    if (result) {
      setEditingInvoice("");
      setNumber("");
      setInvoiceEvidence("");
    }
  }
  function prepareLines() {
    if (!order) return;
    const lines = order.items
      .map((item) => {
        const billed = order.procurementInvoices
          .filter((i) => i.status === "VALIDATED" && i.kind === "STANDARD")
          .flatMap((i) => i.lines)
          .filter((line) => line.orderItemId === item.id)
          .reduce((sum, i) => sum + i.quantity, 0);
        const qty = Math.max(0, item.receivedQty - billed);
        return {
          orderItemId: item.id,
          quantity: qty,
          amount: Number(
            (qty * Number(item.landedUnitCost ?? item.unitPrice)).toFixed(2),
          ),
        };
      })
      .filter((i) => i.quantity > 0);
    setInvoiceLines(lines);
    const total = Number(
      lines.reduce((sum, i) => sum + i.amount, 0).toFixed(2),
    );
    setAmount(total);
    setSchedule([
      {
        dueDate: new Date(Date.now() + 30 * 86400000)
          .toISOString()
          .slice(0, 10),
        amount: total,
      },
    ]);
  }
  if (!order)
    return error ? (
      <InlineMessage tone="warning">{error}</InlineMessage>
    ) : (
      <p className="text-sm text-slate-500">Carregando pedido...</p>
    );
  const v2 = order.workflowVersion === 2,
    receivable =
      v2 &&
      ["APPROVED", "PARTIALLY_RECEIVED"].includes(order.status) &&
      !order.closedAt;
  const origins = [
    ...new Map(
      order.items.flatMap(
        (item) =>
          item.procurementSelection?.quoteItem.sources.map(
            (source) =>
              [
                source.requestItem.request.id,
                source.requestItem.request,
              ] as const,
          ) ?? [],
      ),
    ).values(),
  ];
  const acceptedAdvance =
    order.procurementInvoices
      .filter((i) => i.status === "VALIDATED" && i.kind === "ADVANCE")
      .reduce((sum, i) => sum + Number(i.amount), 0) -
    order.procurementInvoices
      .filter((i) => i.status === "VALIDATED" && i.kind === "STANDARD")
      .reduce((sum, i) => sum + Number(i.advanceApplied), 0);
  return (
    <div className="space-y-5">
      {error ? <InlineMessage tone="warning">{error}</InlineMessage> : null}
      {success ? <InlineMessage>{success}</InlineMessage> : null}
      <SectionCard
        title={order.code + " · " + order.supplier.companyName}
        description={
          "Previsão de entrega: " +
          date(order.expectedDate) +
          " · Pagamento: " +
          (order.paymentTerm ?? "Não informado")
        }
        actions={<Status value={order.status} />}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Valor aprovado", money(order.totalAmount)],
            [
              "Compromisso reconhecido",
              money(order.commitment?.recognizedAmount),
            ],
            [
              "Expedição",
              order.confirmedAt
                ? "Confirmado pelo fornecedor"
                : order.dispatchEvidence
                  ? "Envio registrado"
                  : "Aguardando envio",
            ],
            [
              "Recebimento",
              order.closedAt
                ? "Encerrado"
                : order.items.every((i) => i.receivedQty >= i.quantity)
                  ? "Concluído"
                  : "Pendente / parcial",
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
            >
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-2 font-semibold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {origins.map((source) => (
            <Link
              key={source.id}
              className={secondaryClass}
              href={"/dashboard/purchase-orders/requests/" + source.id}
            >
              {source.code}
            </Link>
          ))}
          {order.procurementQuote ? (
            <Link
              className={secondaryClass}
              href={
                "/dashboard/purchase-orders/quotations/" +
                order.procurementQuote.id
              }
            >
              {order.procurementQuote.code}
            </Link>
          ) : null}
          <Link
            className={secondaryClass}
            href={
              "/dashboard/finance/accounts-payable?purchaseOrderId=" + order.id
            }
          >
            Contas a pagar
          </Link>
        </div>
        {!v2 ? (
          <InlineMessage>
            Pedido legado: o recebimento e a geração financeira seguem as regras
            originais.{" "}
            <Link className="underline" href="/dashboard/purchase-orders">
              Abrir controles legados
            </Link>
          </InlineMessage>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            A aprovação registra o compromisso. Títulos são gerados após
            conferência documental e o pagamento é confirmado pelo Financeiro.
          </p>
        )}
      </SectionCard>
      <SectionCard title="Itens e destinação">
        <div className="space-y-4">
          {order.items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-slate-200 p-4"
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <Link
                    className="font-semibold text-blue-700 underline"
                    href={"/dashboard/catalog/" + item.catalogItemId}
                  >
                    {item.catalogItem.name}
                  </Link>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.catalogItem.sku} ·{" "}
                    {modes[item.fulfillmentMode] ?? "Fluxo legado"}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold text-slate-900">
                    {item.receivedQty} / {item.quantity} aceito(s)
                  </p>
                  <p className="mt-1 text-slate-500">
                    Pendente: {Math.max(0, item.quantity - item.receivedQty)} ·
                    Unitário: {money(item.unitPrice)}
                  </p>
                </div>
              </div>
              {item.procurementSelection?.quoteItem.sources.map((source) => (
                <div key={source.id} className="mt-3 text-xs text-slate-500">
                  <Link
                    className="font-semibold text-blue-700 underline"
                    href={
                      "/dashboard/purchase-orders/requests/" +
                      source.requestItem.request.id
                    }
                  >
                    {source.requestItem.request.code}
                  </Link>{" "}
                  · {source.quantity} {source.requestItem.unit} ·{" "}
                  {source.requestItem.request.department}
                  <div className="mt-2 flex flex-wrap gap-3">
                    {source.requestItem.allocations.map((allocation, index) => (
                      <span key={index}>
                        {allocation.orderId ? (
                          <Link
                            className="text-blue-700 underline"
                            href={"/dashboard/orders/" + allocation.orderId}
                          >
                            Abrir O.S.
                          </Link>
                        ) : null}{" "}
                        {allocation.generatorId ? (
                          <Link
                            className="ml-2 text-blue-700 underline"
                            href={
                              "/dashboard/equipments/" + allocation.generatorId
                            }
                          >
                            Equipamento
                          </Link>
                        ) : null}{" "}
                        {allocation.contractId ? (
                          <Link
                            className="ml-2 text-blue-700 underline"
                            href={
                              "/dashboard/contracts/" + allocation.contractId
                            }
                          >
                            Contrato
                          </Link>
                        ) : null}{" "}
                        {allocation.warrantyId ? (
                          <Link
                            className="ml-2 text-blue-700 underline"
                            href="/dashboard/operation/warranties"
                          >
                            Garantia
                          </Link>
                        ) : null}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </SectionCard>
      {v2 &&
      allowed("purchases", "send") &&
      !order.closedAt &&
      order.status !== "CANCELED" ? (
        <SectionCard
          title="Acompanhamento com evidência"
          description="Registre o envio realizado e a resposta efetivamente recebida do fornecedor."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Meio utilizado">
              <SelectField
                className={inputClass}
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {[
                  "E-mail",
                  "WhatsApp",
                  "Portal do fornecedor",
                  "Presencial",
                  "Outro",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </SelectField>
            </Field>
            <Field label="Referência ou evidência do envio / confirmação">
              <input
                className={inputClass}
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
              />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {!order.dispatchEvidence ? (
              <button
                className={buttonClass}
                disabled={busy}
                onClick={() => void action("SEND")}
              >
                Registrar envio realizado
              </button>
            ) : !order.confirmedAt ? (
              <button
                className={buttonClass}
                disabled={busy}
                onClick={() => void action("CONFIRM")}
              >
                Registrar confirmação do fornecedor
              </button>
            ) : (
              <p className="text-sm text-emerald-700">
                Confirmação registrada em {date(order.confirmedAt)}.
              </p>
            )}
          </div>
        </SectionCard>
      ) : null}
      {receivable && allowed("purchases", "receive") ? (
        <SectionCard
          title="Conferência de recebimento / aceite"
          description="Informe as quantidades desta entrega. Serviços e entregas diretas não criam armazenagem física."
        >
          <fieldset disabled={busy} className="space-y-4">
            <Lookup
              kind="warehouses"
              label="Almoxarifado do recebimento"
              value={warehouse}
              onPick={(choice) => setWarehouse(choice?.id ?? "")}
            />
            <Field label="Referência fiscal da entrega">
              <input
                className={inputClass}
                value={fiscalReference}
                onChange={(e) => setFiscalReference(e.target.value)}
              />
            </Field>
            {receipt.map((item, index) => {
              const source = order.items.find(
                (i) => i.id === item.orderItemId,
              )!;
              return (
                <div
                  key={item.orderItemId}
                  className="space-y-3 rounded-xl border border-slate-200 p-4"
                >
                  <h3 className="font-semibold text-slate-900">
                    {source.catalogItem.name} · Saldo{" "}
                    {source.quantity - source.receivedQty}
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label={"Quantidade aceita " + (index + 1)}>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className={inputClass}
                        value={item.acceptedQty}
                        onChange={(e) =>
                          setReceipt(
                            receipt.map((row, i) =>
                              i === index
                                ? {
                                    ...row,
                                    acceptedQty: Number(e.target.value),
                                  }
                                : row,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label={"Quantidade recusada " + (index + 1)}>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className={inputClass}
                        value={item.rejectedQty}
                        onChange={(e) =>
                          setReceipt(
                            receipt.map((row, i) =>
                              i === index
                                ? {
                                    ...row,
                                    rejectedQty: Number(e.target.value),
                                  }
                                : row,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field
                      label="Números de série"
                      hint="Uma série por unidade aceita; separe por linha ou vírgula."
                    >
                      <textarea
                        className={inputClass}
                        value={item.serials}
                        onChange={(e) =>
                          setReceipt(
                            receipt.map((row, i) =>
                              i === index
                                ? { ...row, serials: e.target.value }
                                : row,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="Divergência ou avaria">
                      <textarea
                        className={inputClass}
                        value={item.divergence}
                        onChange={(e) =>
                          setReceipt(
                            receipt.map((row, i) =>
                              i === index
                                ? { ...row, divergence: e.target.value }
                                : row,
                            ),
                          )
                        }
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
            <Field label="Observações da conferência">
              <textarea
                className={inputClass}
                value={receiptNotes}
                onChange={(e) => setReceiptNotes(e.target.value)}
              />
            </Field>
            <button
              className={buttonClass}
              disabled={
                busy || !receipt.some((i) => i.acceptedQty + i.rejectedQty > 0)
              }
              onClick={() => void receive()}
            >
              Confirmar recebimento conferido
            </button>
          </fieldset>
        </SectionCard>
      ) : null}
      <SectionCard title="Entregas registradas">
        <div className="space-y-3">
          {!v2
            ? order.receipts.map((delivery) => (
                <div
                  key={delivery.id}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <p className="font-semibold text-slate-900">
                    {date(delivery.receivedAt)} · {delivery.warehouse?.name}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    {delivery.notes || "Recebimento histórico preservado."}
                  </p>
                </div>
              ))
            : null}
          {order.procurementReceipts.map((delivery) => (
            <div
              key={delivery.id}
              className="rounded-xl border border-slate-200 p-4"
            >
              <p className="font-semibold text-slate-900">
                {date(delivery.receivedAt)} ·{" "}
                {delivery.warehouse?.name ?? "Aceite / entrega sem armazenagem"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Referência fiscal: {delivery.fiscalReference ?? "Não informada"}
              </p>
              {delivery.items.map((item) => (
                <p
                  key={item.orderItemId}
                  className="mt-2 text-sm text-slate-600"
                >
                  {
                    order.items.find((i) => i.id === item.orderItemId)
                      ?.catalogItem.name
                  }
                  : {item.acceptedQty} aceito(s), {item.rejectedQty}{" "}
                  recusado(s). {item.divergence}{" "}
                  {item.serialNumbers.length
                    ? "Séries: " + item.serialNumbers.join(", ")
                    : ""}
                </p>
              ))}
              {delivery.items
                .flatMap((item) => item.allocations ?? [])
                .map((allocation, index) => {
                  const source = order.items
                    .flatMap(
                      (item) =>
                        item.procurementSelection?.quoteItem.sources ?? [],
                    )
                    .find(
                      (source) =>
                        source.requestItem.id === allocation.requestItemId,
                    );
                  return (
                    <p
                      key={allocation.allocationId + index}
                      className="mt-1 text-xs text-slate-500"
                    >
                      Destinação: {allocation.quantity} unidade(s) ·{" "}
                      {source?.requestItem.request.code ??
                        "Solicitação vinculada"}
                    </p>
                  );
                })}
            </div>
          ))}
          {!order.procurementReceipts.length ? (
            <p className="text-sm text-slate-500">
              {v2
                ? "Nenhuma entrega conferida."
                : "Consulte os recebimentos históricos nos controles legados."}
            </p>
          ) : null}
          <p className="text-xs text-slate-500">
            Receber no estoque não realiza consumo. A reserva ou baixa para O.S.
            continua no fluxo operacional.
          </p>
        </div>
      </SectionCard>
      {v2 &&
      allowed("purchases", "validateInvoice") &&
      order.status !== "CANCELED" ? (
        <SectionCard
          title="Documento de entrada e parcelamento"
          description="Registre o documento e depois confirme sua conferência. Isso cria títulos em aberto, sem realizar pagamento."
        >
          <fieldset disabled={busy} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Natureza do documento">
                <SelectField
                  className={inputClass}
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="STANDARD">
                    Obrigação após recebimento / aceite
                  </option>
                  {allowed("purchases", "exception") ? (
                    <option value="ADVANCE">Adiantamento contratual</option>
                  ) : null}
                </SelectField>
              </Field>
              <Field label="Número do documento">
                <input
                  className={inputClass}
                  id="purchase-invoice-number"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                />
              </Field>
              <Field label="Série">
                <input
                  className={inputClass}
                  value={series}
                  onChange={(e) => setSeries(e.target.value)}
                />
              </Field>
              <Field label="Chave fiscal, quando aplicável">
                <input
                  className={inputClass}
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                />
              </Field>
              <Field label="Emissão">
                <input
                  type="date"
                  className={inputClass}
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </Field>
              <Field label="Valor bruto do documento">
                <input
                  type="number"
                  step="0.01"
                  className={inputClass}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
              </Field>
            </div>
            <Field label="Referência / evidência documental">
              <input
                className={inputClass}
                value={invoiceEvidence}
                onChange={(e) => setInvoiceEvidence(e.target.value)}
              />
            </Field>
            <Field label="Justificativa contratual / observações">
              <textarea
                className={inputClass}
                value={invoiceReason}
                onChange={(e) => setInvoiceReason(e.target.value)}
              />
            </Field>
            {kind === "STANDARD" ? (
              <>
                <button className={secondaryClass} onClick={prepareLines}>
                  Preparar itens recebidos ainda não faturados
                </button>
                {invoiceLines.map((item, index) => (
                  <div
                    key={item.orderItemId}
                    className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-3"
                  >
                    <p className="self-center text-sm font-semibold text-slate-800">
                      {
                        order.items.find((i) => i.id === item.orderItemId)
                          ?.catalogItem.name
                      }
                    </p>
                    <Field label="Quantidade fiscal">
                      <input
                        type="number"
                        step="any"
                        className={inputClass}
                        value={item.quantity}
                        onChange={(e) =>
                          setInvoiceLines(
                            invoiceLines.map((line, i) =>
                              i === index
                                ? { ...line, quantity: Number(e.target.value) }
                                : line,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="Valor deste item">
                      <input
                        type="number"
                        step="0.01"
                        className={inputClass}
                        value={item.amount}
                        onChange={(e) =>
                          setInvoiceLines(
                            invoiceLines.map((line, i) =>
                              i === index
                                ? { ...line, amount: Number(e.target.value) }
                                : line,
                            ),
                          )
                        }
                      />
                    </Field>
                  </div>
                ))}
              </>
            ) : null}
            {acceptedAdvance > 0 && kind === "STANDARD" ? (
              <InlineMessage>
                Adiantamentos a compensar: {money(acceptedAdvance)}. As parcelas
                devem somar o valor bruto menos a compensação.
              </InlineMessage>
            ) : null}
            <h3 className="font-semibold text-slate-900">
              Parcelas e vencimentos
            </h3>
            {schedule.map((part, index) => (
              <div
                key={index}
                className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"
              >
                <Field label={"Vencimento da parcela " + (index + 1)}>
                  <input
                    type="date"
                    className={inputClass}
                    value={part.dueDate}
                    onChange={(e) =>
                      setSchedule(
                        schedule.map((p, i) =>
                          i === index ? { ...p, dueDate: e.target.value } : p,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label={"Valor da parcela " + (index + 1)}>
                  <input
                    type="number"
                    step="0.01"
                    className={inputClass}
                    value={part.amount}
                    onChange={(e) =>
                      setSchedule(
                        schedule.map((p, i) =>
                          i === index
                            ? { ...p, amount: Number(e.target.value) }
                            : p,
                        ),
                      )
                    }
                  />
                </Field>
                <button
                  className={secondaryClass + " self-end"}
                  onClick={() =>
                    setSchedule(schedule.filter((_, i) => i !== index))
                  }
                >
                  Remover parcela
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-3">
              <button
                className={secondaryClass}
                onClick={() =>
                  setSchedule([...schedule, { dueDate: issueDate, amount: 0 }])
                }
              >
                Adicionar parcela
              </button>
              <button
                className={buttonClass}
                disabled={busy || !number.trim() || !invoiceEvidence.trim()}
                onClick={() => void createInvoice()}
              >
                Registrar documento para conferência
              </button>
            </div>
          </fieldset>
        </SectionCard>
      ) : null}
      <SectionCard title="Documentos, títulos e pagamentos">
        <div className="space-y-4">
          {!v2
            ? order.payableEntries.map((payable) => (
                <div
                  key={payable.id}
                  className="flex flex-wrap justify-between gap-3 rounded-xl border border-slate-200 p-4 text-sm"
                >
                  <p className="font-semibold text-slate-900">
                    Título histórico · {money(payable.amount)} ·{" "}
                    {date(payable.dueDate)}
                  </p>
                  <p>Pago: {money(payable.paidAmount)}</p>
                  <Status value={payable.status} />
                </div>
              ))
            : null}
          {order.procurementInvoices.map((invoice) => (
            <div
              key={invoice.id}
              className="space-y-3 rounded-xl border border-slate-200 p-4"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="font-semibold text-slate-900">
                  {invoice.kind === "ADVANCE" ? "Adiantamento" : "Documento"}{" "}
                  {invoice.number}/{invoice.series} · {money(invoice.amount)}
                </h3>
                <Status value={invoice.status} />
              </div>
              <p className="text-sm text-slate-500">
                {invoice.evidence}{" "}
                {Number(invoice.advanceApplied) > 0
                  ? " · Adiantamento compensado: " +
                    money(invoice.advanceApplied)
                  : ""}
              </p>
              {invoice.status === "DRAFT" &&
              allowed("purchases", "validateInvoice") ? (
                <button
                  className={secondaryClass}
                  onClick={() => {
                    setEditingInvoice(invoice.id);
                    setNumber(invoice.number);
                    setSeries(invoice.series);
                    setKind(invoice.kind);
                    setAmount(Number(invoice.amount));
                    setInvoiceEvidence(invoice.evidence);
                    setIssueDate(invoice.issueDate.slice(0, 10));
                    setAccessKey(invoice.accessKey ?? "");
                    setInvoiceReason(invoice.justification ?? "");
                    setInvoiceLines(invoice.lines);
                    setSchedule(invoice.schedule);
                    document
                      .getElementById("purchase-invoice-number")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  Corrigir conferência
                </button>
              ) : null}
              {invoice.status === "DRAFT" &&
              allowed("purchases", "validateInvoice") ? (
                <button
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Confirmo a conferência do pedido, recebimento ou aceite e documento. Gerar os títulos em aberto?",
                      )
                    )
                      void mutate(
                        "/invoices/" + invoice.id + "/validate",
                        {},
                        "Documento validado e títulos gerados sem duplicidade.",
                      );
                  }}
                >
                  Validar documento e gerar títulos
                </button>
              ) : null}
              {invoice.installments.map((part) => (
                <div
                  key={part.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 text-sm"
                >
                  <p>
                    Parcela {part.number} · {date(part.dueDate)} ·{" "}
                    {money(part.amount)}
                  </p>
                  <p>
                    Pago: {money(part.payable.paidAmount)} ·{" "}
                    <Status value={part.payable.status} />
                  </p>
                  <Link
                    className="text-blue-700 underline"
                    href={
                      "/dashboard/finance/accounts-payable?payableId=" +
                      part.payable.id
                    }
                  >
                    Abrir no Financeiro
                  </Link>
                </div>
              ))}
            </div>
          ))}
          {!order.procurementInvoices.length ? (
            <p className="text-sm text-slate-500">
              Nenhum documento registrado no novo fluxo.
            </p>
          ) : null}
        </div>
      </SectionCard>
      {v2 && order.status !== "CANCELED" && !order.closedAt ? (
        <SectionCard title="Encerramento ou cancelamento">
          <Field label="Motivo do cancelamento">
            <textarea
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="mt-4 flex gap-3">
            {allowed("purchases", "update") && order.status === "RECEIVED" ? (
              <button
                className={secondaryClass}
                disabled={busy}
                onClick={() => void action("CLOSE")}
              >
                Encerrar recebimento do pedido
              </button>
            ) : null}
            {allowed("purchases", "cancel") ? (
              <button
                className={secondaryClass}
                disabled={busy || !reason.trim()}
                onClick={() => void action("CANCEL")}
              >
                Cancelar pedido sem movimentação
              </button>
            ) : null}
          </div>
        </SectionCard>
      ) : null}
      <Attachments
        type="ORDER"
        id={id}
        items={order.attachments}
        onChanged={() => void load()}
        editable={
          allowed("purchases", "receive") ||
          allowed("purchases", "send") ||
          allowed("purchases", "validateInvoice")
        }
      />
      <History items={order.history} />
    </div>
  );
}
