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
} from "../../components/DashboardPageKit";

type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";
type PayableStatus = "OPEN" | "PAID" | "OVERDUE" | "CANCELED";
type PayableCategory =
  | "TAXES"
  | "PAYROLL"
  | "SUPPLIERS"
  | "FLEET"
  | "UTILITIES"
  | "RENT"
  | "OTHER";
type PaymentMethod = "PIX" | "BOLETO" | "TRANSFER" | "CASH" | "CARD" | "OTHER";
type PayableSource = "PURCHASE_ORDER" | "MANUAL";

type BankAccount = {
  id: string;
  name: string;
  bankName?: string | null;
  type?: string | null;
  currentBalance?: number | null;
  isActive?: boolean | null;
};

type PayablePayment = {
  id: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  notes?: string | null;
  bankAccount?: {
    id: string;
    name: string;
    bankName?: string | null;
  } | null;
};

type Payable = {
  id: string;
  description: string;
  issueDate: string;
  competenceDate?: string | null;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: PayableStatus;
  category: PayableCategory;
  barcode?: string | null;
  pixCopyPaste?: string | null;
  proofUrl?: string | null;
  canceledAt?: string | null;
  cancelReason?: string | null;
  supplier?: { id: string; companyName?: string | null } | null;
  purchaseOrder?: { id: string; code?: string | null } | null;
  costCenter?: {
    id: string;
    code?: string | null;
    name?: string | null;
  } | null;
  payments: PayablePayment[];
};

type PaymentDraft = {
  amount: string;
  method: PaymentMethod;
  bankAccountId: string;
  paidAt: string;
  notes: string;
  cancelReason: string;
};

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const DANGER_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50";

const STATUS_META: Record<
  PayableStatus,
  { label: string; tone: Tone; helper: string }
> = {
  OPEN: {
    label: "Em aberto",
    tone: "blue",
    helper: "Despesa aguardando pagamento dentro da janela prevista.",
  },
  OVERDUE: {
    label: "Vencido",
    tone: "rose",
    helper: "Titulo vencido ainda impactando o caixa projetado.",
  },
  PAID: {
    label: "Quitado",
    tone: "emerald",
    helper: "Saida registrada e saldo bancario ja ajustado.",
  },
  CANCELED: {
    label: "Cancelado",
    tone: "slate",
    helper: "Titulo retirado da carteira sem nova saida.",
  },
};

const SOURCE_META: Record<PayableSource, { label: string; tone: Tone }> = {
  PURCHASE_ORDER: { label: "Pedido de compra", tone: "amber" },
  MANUAL: { label: "Lancamento manual", tone: "slate" },
};

const CATEGORY_LABELS: Record<PayableCategory, string> = {
  TAXES: "Tributos",
  PAYROLL: "Folha",
  SUPPLIERS: "Fornecedores",
  FLEET: "Frota",
  UTILITIES: "Utilidades",
  RENT: "Aluguel",
  OTHER: "Outros",
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  PIX: "PIX",
  BOLETO: "Boleto",
  TRANSFER: "Transferencia",
  CASH: "Dinheiro",
  CARD: "Cartao",
  OTHER: "Outro",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("pt-BR");
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTimeLocal(value?: Date | string | null) {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  const pad = (entry: number) => String(entry).padStart(2, "0");

  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(
    parsed.getHours(),
  )}:${pad(parsed.getMinutes())}`;
}

function parseMoneyInput(value: string) {
  return Number(value.replace(",", ".").trim());
}

function getPayableSource(item: Payable): PayableSource {
  return item.purchaseOrder?.id ? "PURCHASE_ORDER" : "MANUAL";
}

function getPayableOutstanding(item: Payable) {
  return Math.max(0, Number(item.amount || 0) - Number(item.paidAmount || 0));
}

function getDaysUntilDue(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate(),
  );

  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function buildPaymentDraft(item?: Payable): PaymentDraft {
  return {
    amount: item ? getPayableOutstanding(item).toFixed(2) : "",
    method: "TRANSFER",
    bankAccountId: "",
    paidAt: formatDateTimeLocal(new Date()),
    notes: "",
    cancelReason: "",
  };
}

function describePayable(item: Payable) {
  return [
    item.supplier?.companyName || "",
    item.description || "",
    item.purchaseOrder?.code || "",
    item.costCenter?.code || "",
    item.costCenter?.name || "",
    CATEGORY_LABELS[item.category] || item.category,
    STATUS_META[item.status].label,
    SOURCE_META[getPayableSource(item)].label,
  ]
    .join(" ")
    .toLowerCase();
}

function sortPayables(items: Payable[]) {
  const priority: Record<PayableStatus, number> = {
    OVERDUE: 0,
    OPEN: 1,
    PAID: 2,
    CANCELED: 3,
  };

  return [...items].sort((left, right) => {
    const byStatus = priority[left.status] - priority[right.status];
    if (byStatus !== 0) return byStatus;
    return new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime();
  });
}

function syncDrafts(
  payables: Payable[],
  previous: Record<string, PaymentDraft>,
) {
  const next: Record<string, PaymentDraft> = {};
  for (const item of payables) {
    next[item.id] = previous[item.id] || buildPaymentDraft(item);
  }
  return next;
}

export default function AccountsPayablePage() {
  const router = useRouter();
  const [payables, setPayables] = useState<Payable[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PaymentDraft>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    PayableStatus | "ALL" | "ACTIVE"
  >("ACTIVE");
  const [sourceFilter, setSourceFilter] = useState<PayableSource | "ALL">(
    "ALL",
  );
  const [categoryFilter, setCategoryFilter] = useState<PayableCategory | "ALL">(
    "ALL",
  );
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleUnauthorized = useCallback(
    async (response: Response) => {
      if (response.status !== 401) return false;
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
      const [payablesRes, bankAccountsRes] = await Promise.all([
        apiFetch(apiUrl("/finance/payables"), { cache: "no-store" }),
        apiFetch(apiUrl("/finance/bank-accounts"), { cache: "no-store" }),
      ]);

      const failed = [
        {
          response: payablesRes,
          fallback: "Nao foi possivel carregar a carteira de contas a pagar.",
        },
        {
          response: bankAccountsRes,
          fallback: "Nao foi possivel carregar as contas bancarias.",
        },
      ].find((entry) => !entry.response.ok);

      if (failed) {
        if (await handleUnauthorized(failed.response)) return;
        throw new Error(
          await readApiErrorMessage(failed.response, failed.fallback),
        );
      }

      const [nextPayables, nextBankAccounts] = (await Promise.all([
        payablesRes.json(),
        bankAccountsRes.json(),
      ])) as [Payable[], BankAccount[]];

      setPayables(nextPayables);
      setBankAccounts(nextBankAccounts);
      setDrafts((previous) => syncDrafts(nextPayables, previous));
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar contas a pagar.",
      );
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeBankAccounts = useMemo(
    () => bankAccounts.filter((item) => item.isActive !== false),
    [bankAccounts],
  );

  const stats = useMemo(() => {
    const activeTitles = payables.filter(
      (item) => item.status === "OPEN" || item.status === "OVERDUE",
    );
    const overdueTitles = payables.filter((item) => item.status === "OVERDUE");
    const partialTitles = payables.filter(
      (item) =>
        Number(item.paidAmount || 0) > 0 &&
        item.status !== "PAID" &&
        item.status !== "CANCELED",
    );
    const linkedOrders = payables.filter(
      (item) => getPayableSource(item) === "PURCHASE_ORDER",
    );

    return {
      activeCount: activeTitles.length,
      outstandingAmount: activeTitles.reduce(
        (total, item) => total + getPayableOutstanding(item),
        0,
      ),
      overdueAmount: overdueTitles.reduce(
        (total, item) => total + getPayableOutstanding(item),
        0,
      ),
      partialCount: partialTitles.length,
      linkedOrders: linkedOrders.length,
    };
  }, [payables]);

  const sourceMix = useMemo(() => {
    return {
      purchaseOrders: payables.filter(
        (item) => getPayableSource(item) === "PURCHASE_ORDER",
      ).length,
      manual: payables.filter((item) => getPayableSource(item) === "MANUAL")
        .length,
    };
  }, [payables]);

  const dueSoon = useMemo(() => {
    return sortPayables(
      payables.filter((item) => {
        if (item.status === "PAID" || item.status === "CANCELED") return false;
        const days = getDaysUntilDue(item.dueDate);
        return days !== null && days <= 7;
      }),
    ).slice(0, 5);
  }, [payables]);

  const filteredPayables = useMemo(() => {
    const term = search.trim().toLowerCase();

    return sortPayables(
      payables.filter((item) => {
        if (statusFilter === "ACTIVE") {
          if (item.status === "PAID" || item.status === "CANCELED")
            return false;
        } else if (statusFilter !== "ALL" && item.status !== statusFilter) {
          return false;
        }

        if (sourceFilter !== "ALL" && getPayableSource(item) !== sourceFilter) {
          return false;
        }

        if (categoryFilter !== "ALL" && item.category !== categoryFilter) {
          return false;
        }

        if (!term) return true;
        return describePayable(item).includes(term);
      }),
    );
  }, [categoryFilter, payables, search, sourceFilter, statusFilter]);

  function updateDraft(payableId: string, patch: Partial<PaymentDraft>) {
    setDrafts((previous) => ({
      ...previous,
      [payableId]: {
        ...(previous[payableId] ||
          buildPaymentDraft(payables.find((item) => item.id === payableId))),
        ...patch,
      },
    }));
  }

  function toggleComposer(item: Payable, presetFullAmount = false) {
    setDrafts((previous) => ({
      ...previous,
      [item.id]: {
        ...(previous[item.id] || buildPaymentDraft(item)),
        amount: presetFullAmount
          ? getPayableOutstanding(item).toFixed(2)
          : previous[item.id]?.amount || getPayableOutstanding(item).toFixed(2),
        paidAt: previous[item.id]?.paidAt || formatDateTimeLocal(new Date()),
      },
    }));

    setExpandedId((current) => (current === item.id ? null : item.id));
  }

  async function runOverdueRefresh() {
    setBusyKey("overdue-cron");
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(
        apiUrl("/finance/payables/cron/overdue-run"),
        {
          method: "POST",
        },
      );

      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(
            response,
            "Falha ao atualizar os titulos vencidos.",
          ),
        );
      }

      const payload = (await response.json()) as { updatedOverdue?: number };
      setSuccessMessage(
        payload.updatedOverdue && payload.updatedOverdue > 0
          ? `${payload.updatedOverdue} despesa(s) passaram a refletir atraso na carteira.`
          : "Atualizacao concluida. Nenhum titulo aberto exigia marcacao como vencido.",
      );
      await loadData();
    } catch (refreshError: unknown) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Falha ao atualizar a carteira vencida.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function submitPayment(item: Payable) {
    const draft = drafts[item.id] || buildPaymentDraft(item);
    const amount = parseMoneyInput(draft.amount);
    const outstanding = getPayableOutstanding(item);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Informe um valor valido para registrar o pagamento.");
      return;
    }

    if (amount - outstanding > 0.009) {
      setError("O valor informado nao pode ultrapassar o saldo do titulo.");
      return;
    }

    if (!draft.bankAccountId) {
      setError(
        "Selecione uma conta bancaria/caixa ativa para registrar o pagamento.",
      );
      return;
    }

    setBusyKey(item.id);
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(
        apiUrl(`/finance/payables/${item.id}/pay`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount,
            method: draft.method,
            bankAccountId: draft.bankAccountId,
            paidAt: draft.paidAt
              ? new Date(draft.paidAt).toISOString()
              : undefined,
            notes: draft.notes.trim() || undefined,
          }),
        },
      );

      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha ao registrar pagamento."),
        );
      }

      setSuccessMessage(
        amount + 0.009 >= outstanding
          ? "Pagamento registrado e despesa quitada."
          : "Pagamento parcial registrado com sucesso.",
      );
      setExpandedId(null);
      await loadData();
    } catch (paymentError: unknown) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Falha ao registrar pagamento.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function cancelPayable(item: Payable) {
    const draft = drafts[item.id] || buildPaymentDraft(item);
    const reason = draft.cancelReason.trim();

    if (item.purchaseOrder?.id) {
      setError(
        "Titulos de pedido de compra devem ser tratados no proprio fluxo de suprimentos.",
      );
      return;
    }

    if (Number(item.paidAmount || 0) > 0 || item.status === "PAID") {
      setError("Titulos com pagamento registrado nao podem ser cancelados.");
      return;
    }

    if (reason.length < 4) {
      setError(
        "Descreva o motivo do cancelamento para manter a trilha financeira consistente.",
      );
      return;
    }

    setBusyKey(`cancel-${item.id}`);
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(
        apiUrl(`/finance/payables/${item.id}/cancel`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );

      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha ao cancelar titulo."),
        );
      }

      setSuccessMessage(
        "Titulo cancelado e retirado da esteira de pagamentos.",
      );
      setExpandedId(null);
      await loadData();
    } catch (cancelError: unknown) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "Falha ao cancelar titulo.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Saidas financeiras"
        title="Contas a pagar com origem visivel, banco de saida e vinculo real com suprimentos."
        description="A carteira agora organiza despesas por prioridade, mostra se a conta nasceu de pedido de compra, exibe historico de pagamentos e registra a saida direto na conta bancaria correta."
        stats={[
          {
            label: "Titulos ativos",
            value: String(stats.activeCount),
            helper: "Despesas abertas ou vencidas ainda pressionando o caixa.",
            tone: "blue",
          },
          {
            label: "Saida prevista",
            value: formatCurrency(stats.outstandingAmount),
            helper: "Montante restante da carteira atual.",
            tone: "amber",
          },
          {
            label: "Carteira vencida",
            value: formatCurrency(stats.overdueAmount),
            helper: "Despesas com vencimento ultrapassado.",
            tone: "rose",
          },
          {
            label: "Pagamento parcial",
            value: String(stats.partialCount),
            helper: "Titulos ainda ativos, mas com baixa parcial registrada.",
            tone: "emerald",
          },
        ]}
        actions={
          <>
            <button
              type="button"
              onClick={() => void runOverdueRefresh()}
              className={PRIMARY_BUTTON}
              disabled={busyKey === "overdue-cron" || loading}
            >
              {busyKey === "overdue-cron"
                ? "Atualizando..."
                : "Atualizar vencidos"}
            </button>
          </>
        }
        aside={
          <div className="space-y-3">
            <FieldBox>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Radar de origem
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div>
                  <p className="text-xs text-slate-500">Ligadas a P.O.</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">
                    {sourceMix.purchaseOrders} titulo(s)
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Lancamentos manuais</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">
                    {sourceMix.manual} titulo(s)
                  </p>
                </div>
              </div>
            </FieldBox>

            <StatusBanner
              tone={activeBankAccounts.length > 0 ? "blue" : "amber"}
            >
              {activeBankAccounts.length > 0
                ? `${activeBankAccounts.length} conta(s) bancarias ativa(s) prontas para registrar a saida do pagamento.`
                : "Nenhuma conta bancaria ativa encontrada. Cadastre ou reative uma conta/caixa antes de registrar pagamentos."}
            </StatusBanner>
          </div>
        }
      />

      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {successMessage ? (
        <StatusBanner tone="emerald">{successMessage}</StatusBanner>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.75fr)_360px]">
        <SectionCard
          eyebrow="Carteira operacional"
          title="Pagamentos com contexto de fornecedor, P.O. e conta de saida"
          description="Aja na despesa certa sem perder o vinculo com suprimentos, centro de custo e trilha de pagamento."
        >
          <div className="grid gap-3 md:grid-cols-4">
            <FormField label="Busca">
              <TextInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Fornecedor, pedido ou descricao"
              />
            </FormField>

            <FormField label="Status">
              <SelectInput
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as PayableStatus | "ALL" | "ACTIVE",
                  )
                }
              >
                <option value="ACTIVE">Somente ativos</option>
                <option value="ALL">Todos</option>
                <option value="OPEN">Em aberto</option>
                <option value="OVERDUE">Vencido</option>
                <option value="PAID">Quitado</option>
                <option value="CANCELED">Cancelado</option>
              </SelectInput>
            </FormField>

            <FormField label="Origem">
              <SelectInput
                value={sourceFilter}
                onChange={(event) =>
                  setSourceFilter(event.target.value as PayableSource | "ALL")
                }
              >
                <option value="ALL">Todas</option>
                <option value="PURCHASE_ORDER">Pedido de compra</option>
                <option value="MANUAL">Manual</option>
              </SelectInput>
            </FormField>

            <FormField label="Categoria">
              <SelectInput
                value={categoryFilter}
                onChange={(event) =>
                  setCategoryFilter(
                    event.target.value as PayableCategory | "ALL",
                  )
                }
              >
                <option value="ALL">Todas</option>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectInput>
            </FormField>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <DataPill tone="blue">
              {filteredPayables.length} titulo(s) na visao atual
            </DataPill>
            <DataPill tone="amber">
              {formatCurrency(stats.outstandingAmount)} em aberto
            </DataPill>
            <DataPill tone="rose">
              {formatCurrency(stats.overdueAmount)} vencidos
            </DataPill>
          </div>

          <div className="mt-5 space-y-4">
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`payable-loading-${index}`}
                  className="animate-pulse rounded-[26px] border border-slate-200 bg-slate-50/80 p-5"
                >
                  <div className="h-5 w-40 rounded-full bg-slate-200" />
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <div className="h-16 rounded-2xl bg-slate-200" />
                    <div className="h-16 rounded-2xl bg-slate-200" />
                    <div className="h-16 rounded-2xl bg-slate-200" />
                    <div className="h-16 rounded-2xl bg-slate-200" />
                  </div>
                </div>
              ))
            ) : filteredPayables.length === 0 ? (
              <EmptyState
                title="Nenhuma despesa encontrada nessa visao"
                description="Ajuste os filtros ou valide os pedidos aprovados para repovoar a carteira."
              />
            ) : (
              filteredPayables.map((item) => {
                const outstanding = getPayableOutstanding(item);
                const draft = drafts[item.id] || buildPaymentDraft(item);
                const statusMeta = STATUS_META[item.status];
                const sourceMeta = SOURCE_META[getPayableSource(item)];
                const dueInDays = getDaysUntilDue(item.dueDate);
                const latestPayment = item.payments[0] || null;
                const hasPartialPayment =
                  Number(item.paidAmount || 0) > 0 &&
                  item.status !== "PAID" &&
                  item.status !== "CANCELED";
                const canPay =
                  item.status !== "PAID" && item.status !== "CANCELED";
                const canCancel =
                  !item.purchaseOrder?.id &&
                  item.status !== "PAID" &&
                  item.status !== "CANCELED" &&
                  Number(item.paidAmount || 0) <= 0;

                return (
                  <article
                    key={item.id}
                    className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-[0_24px_70px_-52px_rgba(15,31,50,0.45)]"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <DataPill tone={statusMeta.tone}>
                            {statusMeta.label}
                          </DataPill>
                          <DataPill tone={sourceMeta.tone}>
                            {sourceMeta.label}
                          </DataPill>
                          <DataPill tone="slate">
                            {CATEGORY_LABELS[item.category] || item.category}
                          </DataPill>
                          {hasPartialPayment ? (
                            <DataPill tone="amber">Pagamento parcial</DataPill>
                          ) : null}
                          {dueInDays !== null && dueInDays < 0 ? (
                            <DataPill tone="rose">{`${Math.abs(dueInDays)} dia(s) em atraso`}</DataPill>
                          ) : null}
                          {dueInDays !== null &&
                          dueInDays >= 0 &&
                          dueInDays <= 2 ? (
                            <DataPill tone="amber">
                              {dueInDays === 0
                                ? "Vence hoje"
                                : `Vence em ${dueInDays} dia(s)`}
                            </DataPill>
                          ) : null}
                        </div>

                        <h2 className="mt-3 text-xl font-bold text-slate-950">
                          {item.supplier?.companyName ||
                            "Fornecedor nao identificado"}
                        </h2>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {item.description}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          {item.purchaseOrder?.id ? (
                            <Link
                              href="/dashboard/purchase-orders"
                              className="font-semibold text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline"
                            >
                              Pedido{" "}
                              {item.purchaseOrder.code ||
                                item.purchaseOrder.id.slice(0, 8)}
                            </Link>
                          ) : null}
                          {item.costCenter?.id ? (
                            <span>
                              Centro de custo {item.costCenter.code || "-"}{" "}
                              {item.costCenter.name || ""}
                            </span>
                          ) : null}
                          {item.proofUrl ? (
                            <a
                              href={item.proofUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline"
                            >
                              Ver comprovante
                            </a>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {canPay ? (
                          <button
                            type="button"
                            onClick={() => toggleComposer(item)}
                            className={PRIMARY_BUTTON}
                            disabled={busyKey === item.id}
                          >
                            {expandedId === item.id
                              ? "Ocultar pagamento"
                              : "Registrar pagamento"}
                          </button>
                        ) : null}
                        {canPay ? (
                          <button
                            type="button"
                            onClick={() => toggleComposer(item, true)}
                            className={SECONDARY_BUTTON}
                            disabled={busyKey === item.id}
                          >
                            Preencher saldo total
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-4">
                      <FieldBox>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          Emissao
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {formatDate(item.issueDate)}
                        </p>
                      </FieldBox>
                      <FieldBox>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          Competencia
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {formatDate(item.competenceDate)}
                        </p>
                      </FieldBox>
                      <FieldBox>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          Vencimento
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {formatDate(item.dueDate)}
                        </p>
                      </FieldBox>
                      <FieldBox>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          Saldo
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {formatCurrency(outstanding)}
                        </p>
                      </FieldBox>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_280px]">
                      <FieldBox>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          Dados financeiros
                        </p>
                        <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                          <div>
                            <p className="text-xs text-slate-500">
                              Valor total
                            </p>
                            <p className="mt-1 font-semibold text-slate-900">
                              {formatCurrency(Number(item.amount || 0))}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Pago</p>
                            <p className="mt-1 font-semibold text-slate-900">
                              {formatCurrency(Number(item.paidAmount || 0))}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">
                              Forma sugerida
                            </p>
                            <p className="mt-1 font-semibold text-slate-900">
                              {item.pixCopyPaste
                                ? "PIX"
                                : item.barcode
                                  ? "Boleto"
                                  : "Livre"}
                            </p>
                          </div>
                        </div>
                      </FieldBox>

                      <FieldBox>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          Ultimo pagamento
                        </p>
                        {latestPayment ? (
                          <div className="mt-3 space-y-1 text-sm text-slate-600">
                            <p className="font-semibold text-slate-900">
                              {formatCurrency(latestPayment.amount)} via{" "}
                              {METHOD_LABELS[latestPayment.method]}
                            </p>
                            <p>{formatDateTime(latestPayment.paidAt)}</p>
                            <p>
                              {latestPayment.bankAccount?.name ||
                                "Sem conta de saida vinculada"}
                            </p>
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-slate-500">
                            Nenhum pagamento registrado ainda.
                          </p>
                        )}
                      </FieldBox>
                    </div>

                    {(item.pixCopyPaste || item.barcode) && (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {item.pixCopyPaste ? (
                          <FieldBox>
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                              Chave ou copia e cola PIX
                            </p>
                            <p className="mt-2 break-all text-sm text-slate-700">
                              {item.pixCopyPaste}
                            </p>
                          </FieldBox>
                        ) : null}
                        {item.barcode ? (
                          <FieldBox>
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                              Codigo de barras
                            </p>
                            <p className="mt-2 break-all text-sm text-slate-700">
                              {item.barcode}
                            </p>
                          </FieldBox>
                        ) : null}
                      </div>
                    )}

                    {item.payments.length > 0 ? (
                      <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                              Historico recente
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              Ate 3 ultimas saidas registradas para este titulo.
                            </p>
                          </div>
                          <DataPill tone="slate">
                            {item.payments.length} pagamento(s)
                          </DataPill>
                        </div>

                        <div className="mt-4 grid gap-3">
                          {item.payments.slice(0, 3).map((payment) => (
                            <div
                              key={payment.id}
                              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-semibold text-slate-900">
                                  {formatCurrency(payment.amount)} via{" "}
                                  {METHOD_LABELS[payment.method]}
                                </p>
                                <p>{formatDateTime(payment.paidAt)}</p>
                              </div>
                              <p className="mt-1">
                                {payment.bankAccount?.name ||
                                  "Sem conta vinculada"}
                                {payment.bankAccount?.bankName
                                  ? ` / ${payment.bankAccount.bankName}`
                                  : ""}
                              </p>
                              {payment.notes ? (
                                <p className="mt-1">{payment.notes}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {item.status === "CANCELED" ? (
                      <StatusBanner tone="slate">
                        Cancelado em {formatDateTime(item.canceledAt)}.
                        {item.cancelReason
                          ? ` Motivo: ${item.cancelReason}.`
                          : ""}
                      </StatusBanner>
                    ) : null}

                    {expandedId === item.id && canPay ? (
                      <div className="mt-4 rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <FormField
                            label="Valor pago"
                            hint={`Saldo ${formatCurrency(outstanding)}`}
                          >
                            <TextInput
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={draft.amount}
                              onChange={(event) =>
                                updateDraft(item.id, {
                                  amount: event.target.value,
                                })
                              }
                            />
                          </FormField>

                          <FormField label="Metodo">
                            <SelectInput
                              value={draft.method}
                              onChange={(event) =>
                                updateDraft(item.id, {
                                  method: event.target.value as PaymentMethod,
                                })
                              }
                            >
                              {Object.entries(METHOD_LABELS).map(
                                ([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ),
                              )}
                            </SelectInput>
                          </FormField>

                          <FormField label="Conta de saida">
                            <SelectInput
                              value={draft.bankAccountId}
                              onChange={(event) =>
                                updateDraft(item.id, {
                                  bankAccountId: event.target.value,
                                })
                              }
                            >
                              <option value="">
                                Selecione uma conta/caixa
                              </option>
                              {activeBankAccounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.name}
                                  {account.bankName
                                    ? ` / ${account.bankName}`
                                    : ""}
                                </option>
                              ))}
                            </SelectInput>
                          </FormField>

                          <FormField label="Data do pagamento">
                            <TextInput
                              type="datetime-local"
                              value={draft.paidAt}
                              onChange={(event) =>
                                updateDraft(item.id, {
                                  paidAt: event.target.value,
                                })
                              }
                            />
                          </FormField>
                        </div>

                        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
                          <FormField label="Observacoes">
                            <TextAreaInput
                              value={draft.notes}
                              onChange={(event) =>
                                updateDraft(item.id, {
                                  notes: event.target.value,
                                })
                              }
                              placeholder="Referencia do pagamento, banco, lote ou observacao de conciliacao."
                            />
                          </FormField>

                          <FieldBox className="flex flex-col justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                                Resultado esperado
                              </p>
                              <p className="mt-2 text-sm text-slate-600">
                                {statusMeta.helper}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void submitPayment(item)}
                                className={PRIMARY_BUTTON}
                                disabled={
                                  busyKey === item.id ||
                                  activeBankAccounts.length === 0
                                }
                              >
                                {busyKey === item.id
                                  ? "Salvando..."
                                  : "Confirmar pagamento"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateDraft(item.id, {
                                    amount:
                                      getPayableOutstanding(item).toFixed(2),
                                  })
                                }
                                className={SECONDARY_BUTTON}
                                disabled={busyKey === item.id}
                              >
                                Usar saldo total
                              </button>
                            </div>
                          </FieldBox>
                        </div>

                        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
                          <StatusBanner tone={canCancel ? "amber" : "slate"}>
                            {canCancel
                              ? "Cancelamento liberado apenas para lancamentos manuais sem qualquer pagamento registrado."
                              : item.purchaseOrder?.id
                                ? "Titulos originados de pedido de compra devem ser ajustados no fluxo de suprimentos para nao quebrar a reconciliacao com a P.O."
                                : Number(item.paidAmount || 0) > 0
                                  ? "Este titulo ja possui pagamento registrado; o cancelamento foi bloqueado para evitar distorcoes no caixa."
                                  : "Este titulo nao pode ser cancelado no estado atual."}
                          </StatusBanner>

                          <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                            <FormField label="Motivo do cancelamento">
                              <TextAreaInput
                                value={draft.cancelReason}
                                onChange={(event) =>
                                  updateDraft(item.id, {
                                    cancelReason: event.target.value,
                                  })
                                }
                                placeholder="Descreva a justificativa para auditoria financeira."
                              />
                            </FormField>

                            <div className="mt-3 flex justify-end">
                              <button
                                type="button"
                                onClick={() => void cancelPayable(item)}
                                className={DANGER_BUTTON}
                                disabled={
                                  !canCancel || busyKey === `cancel-${item.id}`
                                }
                              >
                                {busyKey === `cancel-${item.id}`
                                  ? "Cancelando..."
                                  : "Cancelar titulo"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard
            eyebrow="Prioridades"
            title="Vencimentos imediatos"
            description="Titulos que merecem atuacao rapida para nao pressionar ainda mais o caixa."
          >
            <div className="space-y-3">
              {loading ? (
                <div className="animate-pulse rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                  <div className="h-5 w-32 rounded-full bg-slate-200" />
                  <div className="mt-3 h-20 rounded-2xl bg-slate-200" />
                </div>
              ) : dueSoon.length === 0 ? (
                <EmptyState
                  title="Nenhum vencimento urgente"
                  description="A carteira atual nao possui despesas ativas vencendo nos proximos 7 dias."
                />
              ) : (
                dueSoon.map((item) => {
                  const dueInDays = getDaysUntilDue(item.dueDate);
                  return (
                    <div
                      key={`due-soon-${item.id}`}
                      className="rounded-[24px] border border-slate-200 bg-slate-50/85 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <DataPill tone={STATUS_META[item.status].tone}>
                          {STATUS_META[item.status].label}
                        </DataPill>
                        <DataPill
                          tone={SOURCE_META[getPayableSource(item)].tone}
                        >
                          {SOURCE_META[getPayableSource(item)].label}
                        </DataPill>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-slate-900">
                        {item.supplier?.companyName ||
                          "Fornecedor nao identificado"}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {item.description}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-500">
                          {dueInDays !== null && dueInDays < 0
                            ? `${Math.abs(dueInDays)} dia(s) em atraso`
                            : dueInDays === 0
                              ? "Vence hoje"
                              : `Vence em ${dueInDays} dia(s)`}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {formatCurrency(getPayableOutstanding(item))}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Conexao de fluxo"
            title="Esteira validada"
            description="Pagamentos, suprimentos e caixa agora conversam melhor entre si."
          >
            <div className="space-y-3">
              <FieldBox>
                <p className="text-sm font-semibold text-slate-900">
                  Pedido de compra / contas a pagar
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Titulos vindos de P.O. agora ficam evidentes na carteira, em
                  vez de parecerem apenas mais uma linha solta do financeiro.
                </p>
              </FieldBox>

              <FieldBox>
                <p className="text-sm font-semibold text-slate-900">
                  Pagamento / conta bancaria
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  O registro de pagamento expone metodo, conta de saida e
                  historico, refletindo melhor o impacto no caixa projetado.
                </p>
              </FieldBox>

              <FieldBox>
                <p className="text-sm font-semibold text-slate-900">
                  Protecoes de consistencia
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Cancelamento de titulo com pagamento ou vinculado a pedido de
                  compra e sobrepagamento passaram a ser bloqueados para evitar
                  estados financeiros quebrados.
                </p>
              </FieldBox>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Contas de saida"
            title="Contas para pagamento"
            description="As contas ativas abaixo podem receber a baixa no momento da saida."
          >
            <div className="space-y-3">
              {activeBankAccounts.length === 0 ? (
                <EmptyState
                  title="Nenhuma conta ativa cadastrada"
                  description="O pagamento continua possivel, mas a visibilidade do caixa por conta fica comprometida."
                />
              ) : (
                activeBankAccounts.slice(0, 4).map((account) => (
                  <div
                    key={account.id}
                    className="rounded-[22px] border border-slate-200 bg-slate-50/85 p-4"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {account.name}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {account.bankName || "Banco nao informado"}
                      {account.type ? ` / ${account.type}` : ""}
                    </p>
                    <p className="mt-3 text-lg font-bold text-slate-950">
                      {formatCurrency(Number(account.currentBalance || 0))}
                    </p>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
