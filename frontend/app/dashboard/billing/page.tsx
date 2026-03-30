"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";
import { clearAuthSession } from "@/lib/auth-session";
import {
  DataPill,
  EmptyState,
  FieldBox,
  FormField,
  PageHero,
  SectionCard,
  SelectInput,
  StatusBanner,
  TextAreaInput,
  TextInput,
} from "../components/DashboardPageKit";

type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";
type ContractInvoiceStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELED";
type ReceivableStatus = "OPEN" | "PARTIAL" | "OVERDUE" | "PAID" | "CANCELED";
type OrderStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";

type ContractInvoice = {
  id: string;
  competenceDate: string;
  dueDate: string;
  amount: number;
  variableAmount?: number | null;
  paidAt?: string | null;
  status: ContractInvoiceStatus;
  description?: string | null;
  contract?: {
    id: string;
    code?: string;
    client?: {
      id: string;
      companyName?: string | null;
      isDelinquent?: boolean | null;
    } | null;
  } | null;
};

type Receivable = {
  id: string;
  description: string;
  competenceDate: string;
  dueDate: string;
  grossAmount: number;
  discountAmount?: number | null;
  interestAmount?: number | null;
  penaltyAmount?: number | null;
  netAmount: number;
  paidAmount: number;
  status: ReceivableStatus;
  client?: { id: string; companyName?: string | null } | null;
  contract?: { id: string; code?: string | null } | null;
  maintenanceOrder?: { id: string; title?: string | null } | null;
};

type BillingOrder = {
  id: string;
  title: string;
  status: OrderStatus;
  type?: string | null;
  priority?: string | null;
  scheduledTo?: string | null;
  contract?: { id: string; code: string } | null;
  generator?: {
    id?: string;
    name?: string | null;
    client?: { companyName?: string | null } | null;
  } | null;
  technician?: {
    id: string;
    user?: { name?: string | null } | null;
  } | null;
};

type OrderBillingDraft = {
  amount: string;
  dueDate: string;
  description: string;
};

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export default function BillingPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<ContractInvoice[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [orders, setOrders] = useState<BillingOrder[]>([]);
  const [orderDrafts, setOrderDrafts] = useState<Record<string, OrderBillingDraft>>({});

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<
    ContractInvoiceStatus | "ALL" | "MISSING_SYNC"
  >("ALL");

  const handleUnauthorized = useCallback(
    async (res: Response) => {
      if (res.status !== 401) return false;
      clearAuthSession();
      router.replace("/");
      return true;
    },
    [router],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [invoiceRes, receivableRes, ordersRes] = await Promise.all([
        apiFetch(apiUrl("/contracts/invoices/all"), { cache: "no-store" }),
        apiFetch(apiUrl("/finance/receivables"), { cache: "no-store" }),
        apiFetch(apiUrl("/maintenance-orders"), { cache: "no-store" }),
      ]);

      const failed = [
        { response: invoiceRes, fallback: "Nao foi possivel carregar as faturas de contrato." },
        { response: receivableRes, fallback: "Nao foi possivel carregar os recebiveis." },
        { response: ordersRes, fallback: "Nao foi possivel carregar as ordens para faturamento avulso." },
      ].find((entry) => !entry.response.ok);

      if (failed) {
        if (await handleUnauthorized(failed.response)) return;
        throw new Error(await readApiErrorMessage(failed.response, failed.fallback));
      }

      const [nextInvoices, nextReceivables, nextOrders] = (await Promise.all([
        invoiceRes.json(),
        receivableRes.json(),
        ordersRes.json(),
      ])) as [ContractInvoice[], Receivable[], BillingOrder[]];

      setInvoices(nextInvoices);
      setReceivables(nextReceivables);
      setOrders(nextOrders);
      setOrderDrafts((prev) => buildOrderDrafts(nextOrders, prev));
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar faturamento.",
      );
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const receivableByInvoiceKey = useMemo(() => {
    const map = new Map<string, Receivable>();
    for (const receivable of receivables) {
      if (!receivable.contract?.id) continue;
      const key = buildInvoiceKey(receivable.contract.id, receivable.competenceDate);
      if (!map.has(key)) map.set(key, receivable);
    }
    return map;
  }, [receivables]);

  const receivableByOrderId = useMemo(() => {
    const map = new Map<string, Receivable>();
    for (const receivable of receivables) {
      if (!receivable.maintenanceOrder?.id) continue;
      map.set(receivable.maintenanceOrder.id, receivable);
    }
    return map;
  }, [receivables]);

  const invoiceRows = useMemo(
    () =>
      invoices.map((invoice) => ({
        invoice,
        linkedReceivable:
          invoice.contract?.id
            ? receivableByInvoiceKey.get(
                buildInvoiceKey(invoice.contract.id, invoice.competenceDate),
              ) || null
            : null,
      })),
    [invoices, receivableByInvoiceKey],
  );

  const filteredInvoiceRows = useMemo(() => {
    const term = query.trim().toLowerCase();

    return invoiceRows.filter(({ invoice, linkedReceivable }) => {
      if (invoiceStatusFilter === "MISSING_SYNC" && linkedReceivable) return false;
      if (
        invoiceStatusFilter !== "ALL" &&
        invoiceStatusFilter !== "MISSING_SYNC" &&
        invoice.status !== invoiceStatusFilter
      ) {
        return false;
      }

      if (!term) return true;

      const source = [
        invoice.contract?.code || "",
        invoice.contract?.client?.companyName || "",
        invoice.description || "",
        invoice.status,
        linkedReceivable?.description || "",
      ]
        .join(" ")
        .toLowerCase();

      return source.includes(term);
    });
  }, [invoiceRows, invoiceStatusFilter, query]);

  const standaloneOrdersReady = useMemo(
    () =>
      orders
        .filter((order) => order.status === "COMPLETED")
        .filter((order) => !order.contract)
        .filter((order) => !receivableByOrderId.has(order.id)),
    [orders, receivableByOrderId],
  );

  const receivableHighlights = useMemo(() => {
    const list = [...receivables].sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );
    const term = query.trim().toLowerCase();

    if (!term) return list.slice(0, 8);

    return list
      .filter((item) => {
        const source = [
          item.client?.companyName || "",
          item.contract?.code || "",
          item.maintenanceOrder?.title || "",
          item.description,
          item.status,
        ]
          .join(" ")
          .toLowerCase();
        return source.includes(term);
      })
      .slice(0, 8);
  }, [query, receivables]);

  const stats = useMemo(() => {
    const mirrorGap = invoiceRows.filter((row) => !row.linkedReceivable).length;
    const overdueExposure = receivables
      .filter((item) => item.status === "OVERDUE")
      .reduce((acc, item) => acc + receivableOutstanding(item), 0);
    const openExposure = receivables
      .filter((item) =>
        item.status === "OPEN" ||
        item.status === "PARTIAL" ||
        item.status === "OVERDUE",
      )
      .reduce((acc, item) => acc + receivableOutstanding(item), 0);

    return {
      invoices: invoices.length,
      mirrorGap,
      openExposure,
      overdueExposure,
      standaloneReady: standaloneOrdersReady.length,
    };
  }, [invoiceRows, invoices.length, receivables, standaloneOrdersReady.length]);

  function setDraft(orderId: string, patch: Partial<OrderBillingDraft>) {
    setOrderDrafts((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] || buildOrderDraft()),
        ...patch,
      },
    }));
  }

  async function syncContractReceivables() {
    setSyncing(true);
    setError("");
    setSuccessMessage("");

    try {
      const res = await apiFetch(apiUrl("/finance/receivables/sync/contract-invoices"), {
        method: "POST",
      });
      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Falha ao sincronizar recebiveis de contrato."),
        );
      }

      const payload = (await res.json()) as { synced?: number };
      setSuccessMessage(
        payload.synced && payload.synced > 0
          ? `${payload.synced} recebivel(is) de contrato criado(s) no financeiro.`
          : "Sincronizacao concluida. Nao havia novas faturas para espelhar.",
      );
      await loadData();
    } catch (syncError: unknown) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Falha ao sincronizar recebiveis de contrato.",
      );
    } finally {
      setSyncing(false);
    }
  }

  async function payReceivable(receivable: Receivable) {
    const outstanding = receivableOutstanding(receivable);
    if (outstanding <= 0) return;

    setBusyId(receivable.id);
    setError("");
    setSuccessMessage("");

    try {
      const res = await apiFetch(apiUrl(`/finance/receivables/${receivable.id}/pay`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: outstanding,
          method: "TRANSFER",
          notes: "Baixa registrada pela central de faturamento.",
        }),
      });

      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "Falha ao registrar recebimento."));
      }

      setSuccessMessage("Recebimento registrado e espelhado na carteira contratual.");
      await loadData();
    } catch (paymentError: unknown) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Falha ao registrar recebimento.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function createOrderReceivable(order: BillingOrder) {
    const draft = orderDrafts[order.id] || buildOrderDraft(order);
    const amount = Number(draft.amount);

    if (!amount || amount <= 0 || !draft.dueDate) {
      setError("Informe valor e vencimento para faturar a O.S. avulsa.");
      return;
    }

    setBusyId(order.id);
    setError("");
    setSuccessMessage("");

    try {
      const res = await apiFetch(apiUrl(`/finance/receivables/sync/orders/${order.id}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          dueDate: new Date(draft.dueDate).toISOString(),
          description: draft.description.trim() || undefined,
        }),
      });

      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "Falha ao gerar titulo da O.S."));
      }

      setSuccessMessage(`Titulo financeiro criado para a O.S. ${order.title}.`);
      await loadData();
    } catch (createError: unknown) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Falha ao gerar titulo da O.S.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Faturamento e recebimento"
        title="Carteira de contratos, O.S. avulsas e espelho financeiro no mesmo painel."
        description="A central agora mostra onde a fatura de contrato ainda nao virou recebivel, quais O.S. avulsas ja podem faturar e como o recebimento fecha o ciclo financeiro sem perder o vinculo operacional."
        stats={[
          {
            label: "Faturas listadas",
            value: String(stats.invoices),
            helper: "Carteira contratual atualmente refletida na cobranca.",
            tone: "blue",
          },
          {
            label: "Sem espelho financeiro",
            value: String(stats.mirrorGap),
            helper: "Faturas de contrato que ainda nao viraram recebiveis.",
            tone: "amber",
          },
          {
            label: "Exposicao em aberto",
            value: formatCurrency(stats.openExposure),
            helper: "Saldo ainda pendente na carteira financeira.",
            tone: "rose",
          },
          {
            label: "O.S. prontas para faturar",
            value: String(stats.standaloneReady),
            helper: "Ordens avulsas concluidas sem titulo gerado.",
            tone: "emerald",
          },
        ]}
        actions={
          <>
            <button type="button" onClick={() => void loadData()} className={SECONDARY_BUTTON}>
              Atualizar carteira
            </button>
            <button
              type="button"
              onClick={() => void syncContractReceivables()}
              disabled={syncing}
              className={PRIMARY_BUTTON}
            >
              {syncing ? "Sincronizando..." : "Sincronizar contratos"}
            </button>
          </>
        }
        aside={
          <FieldBox className="space-y-4 rounded-[28px] border-white/60 bg-white/82 p-5 shadow-[0_22px_60px_-40px_rgba(15,31,50,0.45)]">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Verificacao de fluxo
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Corrigimos a divergencia mais critica: agora a baixa no financeiro pode
                refletir na fatura do contrato, e a quitacao da fatura contratual tambem
                baixa o recebivel correspondente.
              </p>
            </div>
            <BillingPulse
              label="Atraso financeiro"
              value={formatCurrency(stats.overdueExposure)}
              helper="Titulos vencidos que ainda pressionam caixa e cobranca."
              tone="rose"
            />
            <BillingPulse
              label="Gap operacional"
              value={`${stats.standaloneReady} O.S.`}
              helper="Ordens avulsas concluidas que ainda pedem geracao de titulo."
              tone="amber"
            />
          </FieldBox>
        }
      />

      {successMessage ? <StatusBanner tone="emerald">{successMessage}</StatusBanner> : null}
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}

      <SectionCard
        eyebrow="Carteira contratual"
        title="Faturas de contrato e espelho no financeiro"
        description="Acompanhe a parcela contratual, veja se ela ja existe no contas a receber e registre a baixa pelo fluxo certo."
        actions={
          <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[700px] xl:flex-row xl:items-center xl:justify-end">
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por contrato, cliente ou descricao..."
              className="xl:min-w-[320px]"
            />
            <SelectInput
              value={invoiceStatusFilter}
              onChange={(event) =>
                setInvoiceStatusFilter(
                  event.target.value as ContractInvoiceStatus | "ALL" | "MISSING_SYNC",
                )
              }
              className="xl:w-[240px]"
            >
              <option value="ALL">Todas as faturas</option>
              <option value="MISSING_SYNC">Sem espelho financeiro</option>
              <option value="PENDING">Pendentes</option>
              <option value="OVERDUE">Atrasadas</option>
              <option value="PAID">Pagas</option>
              <option value="CANCELED">Canceladas</option>
            </SelectInput>
          </div>
        }
      >
        {loading ? (
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-10 text-sm text-slate-500">
            Carregando carteira contratual...
          </div>
        ) : null}

        {!loading && filteredInvoiceRows.length === 0 ? (
          <EmptyState
            title="Nenhuma fatura encontrada"
            description="Ajuste os filtros ou sincronize a carteira para refletir novas parcelas."
          />
        ) : null}

        {!loading && filteredInvoiceRows.length > 0 ? (
          <div className="space-y-4">
            {filteredInvoiceRows.map(({ invoice, linkedReceivable }) => (
              <InvoiceBillingCard
                key={invoice.id}
                invoice={invoice}
                linkedReceivable={linkedReceivable}
                busy={busyId === (linkedReceivable?.id || invoice.id)}
                onSync={syncContractReceivables}
                onPayReceivable={payReceivable}
              />
            ))}
          </div>
        ) : null}
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <SectionCard
          eyebrow="Avulso"
          title="Ordens prontas para gerar titulo"
          description="Quando a O.S. avulsa termina, o faturamento pode nascer aqui com vencimento e descricao financeira."
        >
          {loading ? (
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-10 text-sm text-slate-500">
              Carregando O.S. avulsas...
            </div>
          ) : null}

          {!loading && standaloneOrdersReady.length === 0 ? (
            <EmptyState
              title="Nenhuma O.S. avulsa aguardando titulo"
              description="As ordens concluidas sem contrato ja foram refletidas no financeiro, ou ainda nao ha encerramentos para faturar."
            />
          ) : null}

          {!loading && standaloneOrdersReady.length > 0 ? (
            <div className="space-y-4">
              {standaloneOrdersReady.map((order) => (
                <StandaloneOrderCard
                  key={order.id}
                  order={order}
                  draft={orderDrafts[order.id] || buildOrderDraft(order)}
                  busy={busyId === order.id}
                  onDraftChange={setDraft}
                  onCreateReceivable={createOrderReceivable}
                />
              ))}
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          eyebrow="Financeiro"
          title="Recebiveis em destaque"
          description="Leitura rapida da carteira financeira para validar baixa, atraso e origem do titulo."
          actions={
            <Link href="/dashboard/finance/accounts-receivable" className={SECONDARY_BUTTON}>
              Abrir contas a receber
            </Link>
          }
        >
          {loading ? (
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-10 text-sm text-slate-500">
              Carregando recebiveis...
            </div>
          ) : null}

          {!loading && receivableHighlights.length === 0 ? (
            <EmptyState
              title="Nenhum recebivel encontrado"
              description="Sincronize contratos ou gere titulos avulsos para alimentar o financeiro."
            />
          ) : null}

          {!loading && receivableHighlights.length > 0 ? (
            <div className="space-y-3">
              {receivableHighlights.map((item) => (
                <ReceivableCard
                  key={item.id}
                  receivable={item}
                  busy={busyId === item.id}
                  onPay={payReceivable}
                />
              ))}
            </div>
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}

function InvoiceBillingCard({
  invoice,
  linkedReceivable,
  busy,
  onSync,
  onPayReceivable,
}: {
  invoice: ContractInvoice;
  linkedReceivable: Receivable | null;
  busy: boolean;
  onSync: () => Promise<void>;
  onPayReceivable: (receivable: Receivable) => Promise<void>;
}) {
  const grossValue = Number(invoice.amount || 0) + Number(invoice.variableAmount || 0);

  return (
    <article className="rounded-[28px] border border-slate-200 bg-white/92 px-5 py-5 shadow-[0_24px_60px_-48px_rgba(15,31,50,0.35)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-bold text-slate-950">
              {invoice.contract?.code || "Contrato sem codigo"}
            </p>
            <DataPill tone={invoiceStatusTone(invoice.status)}>
              {invoiceStatusLabel(invoice.status)}
            </DataPill>
            {linkedReceivable ? (
              <DataPill tone={receivableStatusTone(linkedReceivable.status)}>
                Financeiro: {receivableStatusLabel(linkedReceivable.status)}
              </DataPill>
            ) : (
              <DataPill tone="amber">Sem espelho financeiro</DataPill>
            )}
            {invoice.contract?.client?.isDelinquent ? (
              <DataPill tone="rose">Cliente inadimplente</DataPill>
            ) : null}
          </div>
          <p className="max-w-4xl text-sm leading-6 text-slate-600">
            {invoice.contract?.client?.companyName || "Cliente nao identificado"} • Competencia{" "}
            {formatDate(invoice.competenceDate)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {invoice.contract?.id ? (
            <Link href={`/dashboard/contracts/${invoice.contract.id}`} className={SECONDARY_BUTTON}>
              Abrir contrato
            </Link>
          ) : null}
          {linkedReceivable ? (
            <button
              type="button"
              disabled={busy || receivableOutstanding(linkedReceivable) <= 0}
              onClick={() => void onPayReceivable(linkedReceivable)}
              className={PRIMARY_BUTTON}
            >
              {busy ? "Baixando..." : "Quitar no financeiro"}
            </button>
          ) : (
            <button type="button" onClick={() => void onSync()} disabled={busy} className={PRIMARY_BUTTON}>
              Gerar espelho
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-4">
        <BillingInfo
          label="Vencimento"
          value={formatDate(invoice.dueDate)}
          helper="Prazo financeiro da parcela contratual."
          tone={invoice.status === "OVERDUE" ? "rose" : "slate"}
        />
        <BillingInfo
          label="Valor da fatura"
          value={formatCurrency(grossValue)}
          helper="Mensalidade e componente variavel da parcela."
          tone="blue"
        />
        <BillingInfo
          label="Espelho financeiro"
          value={linkedReceivable ? formatCurrency(receivableOutstanding(linkedReceivable)) : "Pendente"}
          helper={
            linkedReceivable
              ? linkedReceivable.description
              : "A parcela ainda nao foi sincronizada para contas a receber."
          }
          tone={linkedReceivable ? receivableStatusTone(linkedReceivable.status) : "amber"}
        />
        <BillingInfo
          label="Baixa"
          value={invoice.paidAt ? formatDate(invoice.paidAt) : "Em aberto"}
          helper={
            linkedReceivable
              ? `Pago ${formatCurrency(Number(linkedReceivable.paidAmount || 0))}`
              : "Sem baixa registrada no financeiro."
          }
          tone={invoice.status === "PAID" ? "emerald" : "slate"}
        />
      </div>
    </article>
  );
}

function StandaloneOrderCard({
  order,
  draft,
  busy,
  onDraftChange,
  onCreateReceivable,
}: {
  order: BillingOrder;
  draft: OrderBillingDraft;
  busy: boolean;
  onDraftChange: (orderId: string, patch: Partial<OrderBillingDraft>) => void;
  onCreateReceivable: (order: BillingOrder) => Promise<void>;
}) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white/92 px-5 py-5 shadow-[0_24px_60px_-48px_rgba(15,31,50,0.35)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-bold text-slate-950">{order.title}</p>
            <DataPill tone="emerald">Concluida</DataPill>
            <DataPill tone={priorityTone(order.priority)}>{priorityLabel(order.priority)}</DataPill>
            {order.type ? <DataPill tone="slate">{orderTypeLabel(order.type)}</DataPill> : null}
          </div>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            {order.generator?.client?.companyName || "Cliente nao identificado"} •{" "}
            {order.generator?.name || "Equipamento nao identificado"} •{" "}
            {order.technician?.user?.name || "Sem tecnico vinculado"}
          </p>
        </div>

        <Link href={`/dashboard/orders/${order.id}`} className={SECONDARY_BUTTON}>
          Abrir O.S.
        </Link>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <FormField label="Valor do titulo">
          <TextInput
            value={draft.amount}
            onChange={(event) => onDraftChange(order.id, { amount: event.target.value })}
            inputMode="decimal"
            placeholder="0,00"
          />
        </FormField>
        <FormField label="Vencimento">
          <TextInput
            value={draft.dueDate}
            onChange={(event) => onDraftChange(order.id, { dueDate: event.target.value })}
            type="date"
          />
        </FormField>
        <FormField label="Descricao financeira">
          <TextAreaInput
            value={draft.description}
            onChange={(event) =>
              onDraftChange(order.id, { description: event.target.value })
            }
            className="min-h-[96px]"
            placeholder="Descricao para o contas a receber"
          />
        </FormField>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void onCreateReceivable(order)}
          disabled={busy}
          className={PRIMARY_BUTTON}
        >
          {busy ? "Gerando..." : "Gerar titulo"}
        </button>
      </div>
    </article>
  );
}

function ReceivableCard({
  receivable,
  busy,
  onPay,
}: {
  receivable: Receivable;
  busy: boolean;
  onPay: (receivable: Receivable) => Promise<void>;
}) {
  return (
    <article className="rounded-[24px] border border-slate-200 bg-white/90 px-4 py-4 shadow-[0_20px_50px_-42px_rgba(15,31,50,0.35)]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-slate-950">
              {receivable.client?.companyName || "Cliente nao identificado"}
            </p>
            <DataPill tone={receivableStatusTone(receivable.status)}>
              {receivableStatusLabel(receivable.status)}
            </DataPill>
            {receivable.contract?.code ? <DataPill tone="blue">{receivable.contract.code}</DataPill> : null}
            {receivable.maintenanceOrder?.title ? <DataPill tone="amber">O.S. avulsa</DataPill> : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{receivable.description}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          {receivable.contract?.id ? (
            <Link href={`/dashboard/contracts/${receivable.contract.id}`} className={SECONDARY_BUTTON}>
              Contrato
            </Link>
          ) : receivable.maintenanceOrder?.id ? (
            <Link href={`/dashboard/orders/${receivable.maintenanceOrder.id}`} className={SECONDARY_BUTTON}>
              O.S.
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void onPay(receivable)}
            disabled={busy || receivableOutstanding(receivable) <= 0}
            className={PRIMARY_BUTTON}
          >
            {busy ? "Baixando..." : "Quitar saldo"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <BillingInfo
          label="Vencimento"
          value={formatDate(receivable.dueDate)}
          helper={`Competencia ${formatDate(receivable.competenceDate)}`}
          tone={receivable.status === "OVERDUE" ? "rose" : "slate"}
        />
        <BillingInfo
          label="Valor liquido"
          value={formatCurrency(Number(receivable.netAmount || 0))}
          helper={`Pago ${formatCurrency(Number(receivable.paidAmount || 0))}`}
          tone="blue"
        />
        <BillingInfo
          label="Saldo"
          value={formatCurrency(receivableOutstanding(receivable))}
          helper="Liquido + juros + multa - pagamentos."
          tone={receivableOutstanding(receivable) > 0 ? "amber" : "emerald"}
        />
      </div>
    </article>
  );
}

function BillingPulse({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: Tone;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </p>
        <DataPill tone={tone}>{value}</DataPill>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{helper}</p>
    </div>
  );
}

function BillingInfo({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: Tone;
}) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-slate-50/85 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </p>
        <DataPill tone={tone}>{value}</DataPill>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600">{helper}</p>
    </div>
  );
}

function buildOrderDrafts(
  orders: BillingOrder[],
  current: Record<string, OrderBillingDraft>,
) {
  const next = { ...current };
  for (const order of orders) {
    if (!next[order.id]) {
      next[order.id] = buildOrderDraft(order);
    }
  }
  return next;
}

function buildOrderDraft(order?: BillingOrder): OrderBillingDraft {
  return {
    amount: "",
    dueDate: defaultDueDate(),
    description: order ? `Faturamento do servico avulso da O.S. ${order.title}` : "",
  };
}

function defaultDueDate() {
  const value = new Date();
  value.setDate(value.getDate() + 7);
  return value.toISOString().slice(0, 10);
}

function buildInvoiceKey(contractId: string, competenceDate: string) {
  return `${contractId}|${competenceDate.slice(0, 10)}`;
}

function receivableOutstanding(item: Receivable) {
  return Math.max(
    0,
    Number(item.netAmount || 0) +
      Number(item.interestAmount || 0) +
      Number(item.penaltyAmount || 0) -
      Number(item.paidAmount || 0),
  );
}

function invoiceStatusTone(status: ContractInvoiceStatus): Tone {
  if (status === "PAID") return "emerald";
  if (status === "OVERDUE") return "rose";
  if (status === "CANCELED") return "slate";
  return "amber";
}

function invoiceStatusLabel(status: ContractInvoiceStatus) {
  const labels: Record<ContractInvoiceStatus, string> = {
    PENDING: "Pendente",
    PAID: "Paga",
    OVERDUE: "Atrasada",
    CANCELED: "Cancelada",
  };
  return labels[status];
}

function receivableStatusTone(status: ReceivableStatus): Tone {
  if (status === "PAID") return "emerald";
  if (status === "OVERDUE") return "rose";
  if (status === "PARTIAL") return "amber";
  if (status === "CANCELED") return "slate";
  return "blue";
}

function receivableStatusLabel(status: ReceivableStatus) {
  const labels: Record<ReceivableStatus, string> = {
    OPEN: "Aberto",
    PARTIAL: "Parcial",
    OVERDUE: "Atrasado",
    PAID: "Pago",
    CANCELED: "Cancelado",
  };
  return labels[status];
}

function priorityTone(priority?: string | null): Tone {
  if (priority === "URGENT") return "rose";
  if (priority === "HIGH") return "amber";
  if (priority === "LOW") return "slate";
  return "blue";
}

function priorityLabel(priority?: string | null) {
  const labels: Record<string, string> = {
    URGENT: "Urgente",
    HIGH: "Alta",
    NORMAL: "Normal",
    LOW: "Baixa",
  };
  return labels[priority || "NORMAL"] || priority || "Normal";
}

function orderTypeLabel(type: string) {
  const labels: Record<string, string> = {
    PREVENTIVE: "Preventiva",
    CORRECTIVE: "Corretiva",
    INSTALLATION: "Instalacao",
    DEMOBILIZATION: "Desmobilizacao",
    REFUELING: "Abastecimento",
  };
  return labels[type] || type;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(parsed);
}
