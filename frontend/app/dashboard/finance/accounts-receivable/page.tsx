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
type ReceivableStatus = "OPEN" | "PARTIAL" | "OVERDUE" | "PAID" | "CANCELED";
type PaymentMethod = "PIX" | "BOLETO" | "TRANSFER" | "CASH" | "CARD" | "OTHER";
type ReceivableSource = "CONTRACT" | "ORDER" | "MANUAL";

type BankAccount = {
  id: string;
  name: string;
  bankName?: string | null;
  type?: string | null;
  currentBalance?: number | null;
  isActive?: boolean | null;
};

type ReceivablePayment = {
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
  canceledAt?: string | null;
  cancelReason?: string | null;
  client?: { id: string; companyName?: string | null } | null;
  contract?: { id: string; code?: string | null } | null;
  maintenanceOrder?: { id: string; title?: string | null } | null;
  costCenter?: { id: string; code?: string | null; name?: string | null } | null;
  payments: ReceivablePayment[];
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

const STATUS_META: Record<ReceivableStatus, { label: string; tone: Tone; helper: string }> = {
  OPEN: {
    label: "Em aberto",
    tone: "blue",
    helper: "Titulo sem recebimento registrado.",
  },
  PARTIAL: {
    label: "Parcial",
    tone: "amber",
    helper: "Ja existe baixa parcial e saldo remanescente.",
  },
  OVERDUE: {
    label: "Vencido",
    tone: "rose",
    helper: "Juros e multa ja podem impactar o saldo total.",
  },
  PAID: {
    label: "Quitado",
    tone: "emerald",
    helper: "Recebimento totalmente registrado no financeiro.",
  },
  CANCELED: {
    label: "Cancelado",
    tone: "slate",
    helper: "Titulo baixado sem gerar mais cobranca.",
  },
};

const SOURCE_META: Record<ReceivableSource, { label: string; tone: Tone }> = {
  CONTRACT: { label: "Contrato", tone: "blue" },
  ORDER: { label: "O.S. avulsa", tone: "amber" },
  MANUAL: { label: "Manual", tone: "slate" },
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

function getReceivableSource(item: Receivable): ReceivableSource {
  if (item.contract?.id) return "CONTRACT";
  if (item.maintenanceOrder?.id) return "ORDER";
  return "MANUAL";
}

function getReceivableTotal(item: Receivable) {
  return (
    Number(item.netAmount || 0) +
    Number(item.interestAmount || 0) +
    Number(item.penaltyAmount || 0)
  );
}

function getReceivableOutstanding(item: Receivable) {
  return Math.max(0, getReceivableTotal(item) - Number(item.paidAmount || 0));
}

function getDaysUntilDue(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());

  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function buildPaymentDraft(item?: Receivable): PaymentDraft {
  return {
    amount: item ? getReceivableOutstanding(item).toFixed(2) : "",
    method: "TRANSFER",
    bankAccountId: "",
    paidAt: formatDateTimeLocal(new Date()),
    notes: "",
    cancelReason: "",
  };
}

function describeReceivable(item: Receivable) {
  return [
    item.client?.companyName || "",
    item.description || "",
    item.contract?.code || "",
    item.maintenanceOrder?.title || "",
    item.costCenter?.code || "",
    item.costCenter?.name || "",
    STATUS_META[item.status].label,
    SOURCE_META[getReceivableSource(item)].label,
  ]
    .join(" ")
    .toLowerCase();
}

function syncDrafts(receivables: Receivable[], previous: Record<string, PaymentDraft>) {
  const next: Record<string, PaymentDraft> = {};
  for (const item of receivables) {
    next[item.id] = previous[item.id] || buildPaymentDraft(item);
  }
  return next;
}

function sortReceivables(items: Receivable[]) {
  const priority: Record<ReceivableStatus, number> = {
    OVERDUE: 0,
    PARTIAL: 1,
    OPEN: 2,
    PAID: 3,
    CANCELED: 4,
  };

  return [...items].sort((left, right) => {
    const byStatus = priority[left.status] - priority[right.status];
    if (byStatus !== 0) return byStatus;
    return new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime();
  });
}

export default function AccountsReceivablePage() {
  const router = useRouter();
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PaymentDraft>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReceivableStatus | "ALL" | "ACTIVE">(
    "ACTIVE",
  );
  const [sourceFilter, setSourceFilter] = useState<ReceivableSource | "ALL">("ALL");
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
      const [receivablesRes, bankAccountsRes] = await Promise.all([
        apiFetch(apiUrl("/finance/receivables"), { cache: "no-store" }),
        apiFetch(apiUrl("/finance/bank-accounts"), { cache: "no-store" }),
      ]);

      const failed = [
        {
          response: receivablesRes,
          fallback: "Nao foi possivel carregar a carteira de recebimentos.",
        },
        {
          response: bankAccountsRes,
          fallback: "Nao foi possivel carregar as contas bancarias.",
        },
      ].find((entry) => !entry.response.ok);

      if (failed) {
        if (await handleUnauthorized(failed.response)) return;
        throw new Error(await readApiErrorMessage(failed.response, failed.fallback));
      }

      const [nextReceivables, nextBankAccounts] = (await Promise.all([
        receivablesRes.json(),
        bankAccountsRes.json(),
      ])) as [Receivable[], BankAccount[]];

      setReceivables(nextReceivables);
      setBankAccounts(nextBankAccounts);
      setDrafts((previous) => syncDrafts(nextReceivables, previous));
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar contas a receber.",
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
    const activeTitles = receivables.filter((item) =>
      item.status === "OPEN" || item.status === "PARTIAL" || item.status === "OVERDUE",
    );
    const overdueTitles = receivables.filter((item) => item.status === "OVERDUE");
    const partialTitles = receivables.filter((item) => item.status === "PARTIAL");
    const contractTitles = receivables.filter((item) => getReceivableSource(item) === "CONTRACT");

    return {
      activeCount: activeTitles.length,
      outstandingAmount: activeTitles.reduce(
        (total, item) => total + getReceivableOutstanding(item),
        0,
      ),
      overdueAmount: overdueTitles.reduce(
        (total, item) => total + getReceivableOutstanding(item),
        0,
      ),
      partialCount: partialTitles.length,
      contractCount: contractTitles.length,
    };
  }, [receivables]);

  const sourceMix = useMemo(() => {
    return {
      contract: receivables.filter((item) => getReceivableSource(item) === "CONTRACT").length,
      order: receivables.filter((item) => getReceivableSource(item) === "ORDER").length,
      manual: receivables.filter((item) => getReceivableSource(item) === "MANUAL").length,
    };
  }, [receivables]);

  const dueSoon = useMemo(() => {
    return sortReceivables(
      receivables.filter((item) => {
        if (item.status === "PAID" || item.status === "CANCELED") return false;
        const days = getDaysUntilDue(item.dueDate);
        return days !== null && days <= 7;
      }),
    ).slice(0, 5);
  }, [receivables]);

  const filteredReceivables = useMemo(() => {
    const term = search.trim().toLowerCase();

    return sortReceivables(
      receivables.filter((item) => {
        if (statusFilter === "ACTIVE") {
          if (item.status === "PAID" || item.status === "CANCELED") return false;
        } else if (statusFilter !== "ALL" && item.status !== statusFilter) {
          return false;
        }

        if (sourceFilter !== "ALL" && getReceivableSource(item) !== sourceFilter) {
          return false;
        }

        if (!term) return true;
        return describeReceivable(item).includes(term);
      }),
    );
  }, [receivables, search, sourceFilter, statusFilter]);

  function updateDraft(receivableId: string, patch: Partial<PaymentDraft>) {
    setDrafts((previous) => ({
      ...previous,
      [receivableId]: {
        ...(previous[receivableId] ||
          buildPaymentDraft(receivables.find((item) => item.id === receivableId))),
        ...patch,
      },
    }));
  }

  function toggleComposer(item: Receivable, presetFullAmount = false) {
    setDrafts((previous) => ({
      ...previous,
      [item.id]: {
        ...(previous[item.id] || buildPaymentDraft(item)),
        amount: presetFullAmount
          ? getReceivableOutstanding(item).toFixed(2)
          : previous[item.id]?.amount || getReceivableOutstanding(item).toFixed(2),
        paidAt: previous[item.id]?.paidAt || formatDateTimeLocal(new Date()),
      },
    }));

    setExpandedId((current) => (current === item.id ? null : item.id));
  }

  async function syncContractInvoices() {
    setBusyKey("sync-contracts");
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(apiUrl("/finance/receivables/sync/contract-invoices"), {
        method: "POST",
      });

      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(
            response,
            "Falha ao sincronizar as faturas contratuais com o financeiro.",
          ),
        );
      }

      const payload = (await response.json()) as { synced?: number };
      setSuccessMessage(
        payload.synced && payload.synced > 0
          ? `${payload.synced} titulo(s) contratual(is) foram espelhados para cobranca.`
          : "Sincronizacao concluida. Nenhuma nova fatura contratual precisava virar titulo.",
      );
      await loadData();
    } catch (syncError: unknown) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Falha ao sincronizar as faturas contratuais.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function runOverdueRefresh() {
    setBusyKey("overdue-cron");
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(apiUrl("/finance/receivables/cron/overdue-run"), {
        method: "POST",
      });

      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha ao atualizar os titulos vencidos."),
        );
      }

      const payload = (await response.json()) as { updatedOverdue?: number };
      setSuccessMessage(
        payload.updatedOverdue && payload.updatedOverdue > 0
          ? `${payload.updatedOverdue} titulo(s) passaram a refletir atraso, juros e multa.`
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

  async function submitPayment(item: Receivable) {
    const draft = drafts[item.id] || buildPaymentDraft(item);
    const amount = parseMoneyInput(draft.amount);
    const outstanding = getReceivableOutstanding(item);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Informe um valor valido para registrar o recebimento.");
      return;
    }

    if (amount - outstanding > 0.009) {
      setError("O valor informado nao pode ultrapassar o saldo em aberto do titulo.");
      return;
    }

    setBusyKey(item.id);
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(apiUrl(`/finance/receivables/${item.id}/pay`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          method: draft.method,
          bankAccountId: draft.bankAccountId || undefined,
          paidAt: draft.paidAt ? new Date(draft.paidAt).toISOString() : undefined,
          notes: draft.notes.trim() || undefined,
        }),
      });

      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Falha ao registrar recebimento."));
      }

      setSuccessMessage(
        amount + 0.009 >= outstanding
          ? "Recebimento registrado e titulo quitado."
          : "Recebimento parcial registrado com sucesso.",
      );
      setExpandedId(null);
      await loadData();
    } catch (paymentError: unknown) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Falha ao registrar recebimento.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function cancelReceivable(item: Receivable) {
    const draft = drafts[item.id] || buildPaymentDraft(item);
    const reason = draft.cancelReason.trim();

    if (item.contract?.id) {
      setError("Titulos de contrato devem ser ajustados na origem contratual antes do cancelamento.");
      return;
    }

    if (Number(item.paidAmount || 0) > 0) {
      setError("Titulos com recebimento parcial devem ser tratados no financeiro antes de cancelar.");
      return;
    }

    if (reason.length < 4) {
      setError("Descreva o motivo do cancelamento para manter a trilha financeira consistente.");
      return;
    }

    setBusyKey(`cancel-${item.id}`);
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(apiUrl(`/finance/receivables/${item.id}/cancel`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Falha ao cancelar titulo."));
      }

      setSuccessMessage("Titulo cancelado e retirado da esteira de cobranca.");
      setExpandedId(null);
      await loadData();
    } catch (cancelError: unknown) {
      setError(
        cancelError instanceof Error ? cancelError.message : "Falha ao cancelar titulo.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Financeiro e cobranca"
        title="Contas a receber com fluxo real de contrato, O.S. avulsa e baixa bancaria."
        description="A carteira agora mostra origem do titulo, saldo em aberto, historico de recebimentos e as acoes que realmente fecham o ciclo financeiro sem perder o vinculo com contrato e operacao."
        stats={[
          {
            label: "Titulos ativos",
            value: String(stats.activeCount),
            helper: "Itens em aberto, parcial ou vencidos aguardando tratativa.",
            tone: "blue",
          },
          {
            label: "Saldo em aberto",
            value: formatCurrency(stats.outstandingAmount),
            helper: "Exposicao atual da cobranca considerando juros e multa.",
            tone: "amber",
          },
          {
            label: "Carteira vencida",
            value: formatCurrency(stats.overdueAmount),
            helper: "Montante que ja exige resposta mais rapida da cobranca.",
            tone: "rose",
          },
          {
            label: "Recebimento parcial",
            value: String(stats.partialCount),
            helper: "Titulos que ja tiveram baixa, mas ainda possuem saldo.",
            tone: "emerald",
          },
        ]}
        actions={
          <>
            <button
              type="button"
              onClick={() => void syncContractInvoices()}
              className={PRIMARY_BUTTON}
              disabled={busyKey === "sync-contracts" || loading}
            >
              {busyKey === "sync-contracts" ? "Sincronizando..." : "Espelhar contratos"}
            </button>
            <button
              type="button"
              onClick={() => void runOverdueRefresh()}
              className={SECONDARY_BUTTON}
              disabled={busyKey === "overdue-cron" || loading}
            >
              {busyKey === "overdue-cron" ? "Atualizando..." : "Atualizar vencidos"}
            </button>
            <Link href="/dashboard/billing" className={SECONDARY_BUTTON}>
              Voltar ao faturamento
            </Link>
          </>
        }
        aside={
          <div className="space-y-3">
            <FieldBox>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Radar da carteira
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <div>
                  <p className="text-xs text-slate-500">Origem contratual</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">
                    {stats.contractCount} titulo(s)
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">O.S. avulsas</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">
                    {sourceMix.order} titulo(s)
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Contas manuais</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">
                    {sourceMix.manual} titulo(s)
                  </p>
                </div>
              </div>
            </FieldBox>

            <StatusBanner tone={activeBankAccounts.length > 0 ? "blue" : "amber"}>
              {activeBankAccounts.length > 0
                ? `${activeBankAccounts.length} conta(s) bancarias ativa(s) disponivel(is) para baixa.`
                : "Nenhuma conta bancaria ativa encontrada. O recebimento ainda pode ser registrado sem conta destino, mas vale revisar o cadastro financeiro."}
            </StatusBanner>
          </div>
        }
      />

      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {successMessage ? <StatusBanner tone="emerald">{successMessage}</StatusBanner> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.75fr)_360px]">
        <SectionCard
          eyebrow="Carteira viva"
          title="Recebimentos com leitura operacional"
          description="Filtre por origem, status e cliente para atuar na cobranca certa sem perder o contexto de contrato, ordem de servico e historico financeiro."
        >
          <div className="grid gap-3 md:grid-cols-3">
            <FormField label="Busca">
              <TextInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cliente, contrato, O.S. ou descricao"
              />
            </FormField>

            <FormField label="Status">
              <SelectInput
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as ReceivableStatus | "ALL" | "ACTIVE")
                }
              >
                <option value="ACTIVE">Somente ativos</option>
                <option value="ALL">Todos</option>
                <option value="OPEN">Em aberto</option>
                <option value="PARTIAL">Parcial</option>
                <option value="OVERDUE">Vencido</option>
                <option value="PAID">Quitado</option>
                <option value="CANCELED">Cancelado</option>
              </SelectInput>
            </FormField>

            <FormField label="Origem">
              <SelectInput
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value as ReceivableSource | "ALL")}
              >
                <option value="ALL">Todas</option>
                <option value="CONTRACT">Contrato</option>
                <option value="ORDER">O.S. avulsa</option>
                <option value="MANUAL">Manual</option>
              </SelectInput>
            </FormField>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <DataPill tone="blue">{filteredReceivables.length} titulo(s) na visao atual</DataPill>
            <DataPill tone="amber">{formatCurrency(stats.outstandingAmount)} em aberto</DataPill>
            <DataPill tone="rose">{formatCurrency(stats.overdueAmount)} vencidos</DataPill>
          </div>

          <div className="mt-5 space-y-4">
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`receivable-loading-${index}`}
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
            ) : filteredReceivables.length === 0 ? (
              <EmptyState
                title="Nenhum titulo encontrado nessa visao"
                description="Ajuste os filtros ou sincronize a carteira contratual para repovoar a central."
              />
            ) : (
              filteredReceivables.map((item) => {
                const outstanding = getReceivableOutstanding(item);
                const total = getReceivableTotal(item);
                const draft = drafts[item.id] || buildPaymentDraft(item);
                const source = getReceivableSource(item);
                const statusMeta = STATUS_META[item.status];
                const sourceMeta = SOURCE_META[source];
                const dueInDays = getDaysUntilDue(item.dueDate);
                const canReceive = item.status !== "PAID" && item.status !== "CANCELED";
                const canCancel =
                  !item.contract?.id &&
                  item.status !== "PAID" &&
                  item.status !== "CANCELED" &&
                  Number(item.paidAmount || 0) <= 0;
                const latestPayment = item.payments[0] || null;

                return (
                  <article
                    key={item.id}
                    className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-[0_24px_70px_-52px_rgba(15,31,50,0.45)]"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <DataPill tone={statusMeta.tone}>{statusMeta.label}</DataPill>
                          <DataPill tone={sourceMeta.tone}>{sourceMeta.label}</DataPill>
                          {dueInDays !== null && dueInDays < 0 ? (
                            <DataPill tone="rose">{`${Math.abs(dueInDays)} dia(s) em atraso`}</DataPill>
                          ) : null}
                          {dueInDays !== null && dueInDays >= 0 && dueInDays <= 2 ? (
                            <DataPill tone="amber">
                              {dueInDays === 0 ? "Vence hoje" : `Vence em ${dueInDays} dia(s)`}
                            </DataPill>
                          ) : null}
                        </div>
                        <h2 className="mt-3 text-xl font-bold text-slate-950">
                          {item.client?.companyName || "Cliente nao identificado"}
                        </h2>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>

                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          {item.contract?.id ? (
                            <Link
                              href={`/dashboard/contracts/${item.contract.id}`}
                              className="font-semibold text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline"
                            >
                              Contrato {item.contract.code || item.contract.id.slice(0, 8)}
                            </Link>
                          ) : null}
                          {item.maintenanceOrder?.id ? (
                            <Link
                              href={`/dashboard/orders/${item.maintenanceOrder.id}`}
                              className="font-semibold text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline"
                            >
                              O.S. {item.maintenanceOrder.title || item.maintenanceOrder.id.slice(0, 8)}
                            </Link>
                          ) : null}
                          {item.costCenter?.id ? (
                            <span>
                              Centro de custo {item.costCenter.code || "-"} {item.costCenter.name || ""}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {canReceive ? (
                          <button
                            type="button"
                            onClick={() => toggleComposer(item)}
                            className={PRIMARY_BUTTON}
                            disabled={busyKey === item.id}
                          >
                            {expandedId === item.id ? "Ocultar recebimento" : "Registrar recebimento"}
                          </button>
                        ) : null}
                        {canReceive ? (
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
                          Valor total
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {formatCurrency(total)}
                        </p>
                      </FieldBox>
                      <FieldBox>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          Saldo em aberto
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {formatCurrency(outstanding)}
                        </p>
                      </FieldBox>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_280px]">
                      <FieldBox>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          Fluxo financeiro
                        </p>
                        <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                          <div>
                            <p className="text-xs text-slate-500">Recebido</p>
                            <p className="mt-1 font-semibold text-slate-900">
                              {formatCurrency(Number(item.paidAmount || 0))}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Juros</p>
                            <p className="mt-1 font-semibold text-slate-900">
                              {formatCurrency(Number(item.interestAmount || 0))}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Multa</p>
                            <p className="mt-1 font-semibold text-slate-900">
                              {formatCurrency(Number(item.penaltyAmount || 0))}
                            </p>
                          </div>
                        </div>
                      </FieldBox>

                      <FieldBox>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          Ultima baixa
                        </p>
                        {latestPayment ? (
                          <div className="mt-3 space-y-1 text-sm text-slate-600">
                            <p className="font-semibold text-slate-900">
                              {formatCurrency(latestPayment.amount)} via {METHOD_LABELS[latestPayment.method]}
                            </p>
                            <p>{formatDateTime(latestPayment.paidAt)}</p>
                            <p>{latestPayment.bankAccount?.name || "Sem conta destino vinculada"}</p>
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-slate-500">Nenhum recebimento registrado ainda.</p>
                        )}
                      </FieldBox>
                    </div>

                    {item.payments.length > 0 ? (
                      <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                              Historico recente
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              Ate 3 ultimos recebimentos registrados para este titulo.
                            </p>
                          </div>
                          <DataPill tone="slate">{item.payments.length} baixa(s)</DataPill>
                        </div>

                        <div className="mt-4 grid gap-3">
                          {item.payments.slice(0, 3).map((payment) => (
                            <div
                              key={payment.id}
                              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-semibold text-slate-900">
                                  {formatCurrency(payment.amount)} via {METHOD_LABELS[payment.method]}
                                </p>
                                <p>{formatDateTime(payment.paidAt)}</p>
                              </div>
                              <p className="mt-1">
                                {payment.bankAccount?.name || "Sem conta vinculada"}
                                {payment.bankAccount?.bankName
                                  ? ` / ${payment.bankAccount.bankName}`
                                  : ""}
                              </p>
                              {payment.notes ? <p className="mt-1">{payment.notes}</p> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {item.status === "CANCELED" ? (
                      <StatusBanner tone="slate">
                        Cancelado em {formatDateTime(item.canceledAt)}.
                        {item.cancelReason ? ` Motivo: ${item.cancelReason}.` : ""}
                      </StatusBanner>
                    ) : null}

                    {expandedId === item.id && canReceive ? (
                      <div className="mt-4 rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <FormField label="Valor recebido" hint={`Saldo ${formatCurrency(outstanding)}`}>
                            <TextInput
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={draft.amount}
                              onChange={(event) =>
                                updateDraft(item.id, { amount: event.target.value })
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
                              {Object.entries(METHOD_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </SelectInput>
                          </FormField>

                          <FormField label="Conta destino">
                            <SelectInput
                              value={draft.bankAccountId}
                              onChange={(event) =>
                                updateDraft(item.id, { bankAccountId: event.target.value })
                              }
                            >
                              <option value="">Nao vincular conta</option>
                              {activeBankAccounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.name}
                                  {account.bankName ? ` / ${account.bankName}` : ""}
                                </option>
                              ))}
                            </SelectInput>
                          </FormField>

                          <FormField label="Data da baixa">
                            <TextInput
                              type="datetime-local"
                              value={draft.paidAt}
                              onChange={(event) =>
                                updateDraft(item.id, { paidAt: event.target.value })
                              }
                            />
                          </FormField>
                        </div>

                        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
                          <FormField label="Observacoes">
                            <TextAreaInput
                              value={draft.notes}
                              onChange={(event) =>
                                updateDraft(item.id, { notes: event.target.value })
                              }
                              placeholder="Canal de recebimento, combinados ou referencia da conciliacao."
                            />
                          </FormField>

                          <FieldBox className="flex flex-col justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                                Resultado esperado
                              </p>
                              <p className="mt-2 text-sm text-slate-600">{statusMeta.helper}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void submitPayment(item)}
                                className={PRIMARY_BUTTON}
                                disabled={busyKey === item.id}
                              >
                                {busyKey === item.id ? "Salvando..." : "Confirmar baixa"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateDraft(item.id, {
                                    amount: getReceivableOutstanding(item).toFixed(2),
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
                              ? "Cancelamento liberado apenas para titulos manuais ou de O.S. sem qualquer baixa registrada."
                              : item.contract?.id
                                ? "Titulos originados de contrato devem ser ajustados na fatura contratual para evitar desalinhamento entre faturamento e recebiveis."
                                : Number(item.paidAmount || 0) > 0
                                  ? "Este titulo ja possui recebimento registrado; o cancelamento foi bloqueado na UI para nao quebrar conciliacao."
                                  : "Este titulo nao pode ser cancelado no estado atual."}
                          </StatusBanner>

                          <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                            <FormField label="Motivo do cancelamento">
                              <TextAreaInput
                                value={draft.cancelReason}
                                onChange={(event) =>
                                  updateDraft(item.id, { cancelReason: event.target.value })
                                }
                                placeholder="Descreva a justificativa para trilha de auditoria."
                              />
                            </FormField>

                            <div className="mt-3 flex justify-end">
                              <button
                                type="button"
                                onClick={() => void cancelReceivable(item)}
                                className={DANGER_BUTTON}
                                disabled={!canCancel || busyKey === `cancel-${item.id}`}
                              >
                                {busyKey === `cancel-${item.id}` ? "Cancelando..." : "Cancelar titulo"}
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
            title="Vencimento e cobranca"
            description="Titulos que merecem atuacao imediata para evitar envelhecimento da carteira."
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
                  description="A carteira atual nao possui titulos ativos vencendo nos proximos 7 dias."
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
                        <DataPill tone={SOURCE_META[getReceivableSource(item)].tone}>
                          {SOURCE_META[getReceivableSource(item)].label}
                        </DataPill>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-slate-900">
                        {item.client?.companyName || "Cliente nao identificado"}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-500">
                          {dueInDays !== null && dueInDays < 0
                            ? `${Math.abs(dueInDays)} dia(s) em atraso`
                            : dueInDays === 0
                              ? "Vence hoje"
                              : `Vence em ${dueInDays} dia(s)`}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {formatCurrency(getReceivableOutstanding(item))}
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
            description="A cobranca agora conversa com os modulos que ja foram refatorados, em vez de funcionar isolada."
          >
            <div className="space-y-3">
              <FieldBox>
                <p className="text-sm font-semibold text-slate-900">Contrato -&gt; faturamento -&gt; recebimento</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  A sincronizacao de contratos alimenta a carteira financeira e a quitacao de um titulo contratual
                  continua refletindo a fatura correspondente no backend.
                </p>
              </FieldBox>

              <FieldBox>
                <p className="text-sm font-semibold text-slate-900">O.S. avulsa -&gt; faturamento -&gt; baixa</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Os titulos de ordem continuam rastreaveis por link direto para a O.S., o que facilita cobrar sem
                  perder o contexto da execucao.
                </p>
              </FieldBox>

              <FieldBox>
                <p className="text-sm font-semibold text-slate-900">Seguranca de operacao</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Cancelamento de titulo contratual ou parcialmente recebido foi bloqueado na interface para evitar
                  desalinhamento entre cobranca, conciliacao e origem comercial.
                </p>
              </FieldBox>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Saldo bancario"
            title="Contas para conciliacao"
            description="As contas ativas abaixo podem receber o credito no momento da baixa."
          >
            <div className="space-y-3">
              {activeBankAccounts.length === 0 ? (
                <EmptyState
                  title="Nenhuma conta ativa cadastrada"
                  description="A baixa continua possivel, mas o financeiro perde visibilidade de saldo por conta."
                />
              ) : (
                activeBankAccounts.slice(0, 4).map((account) => (
                  <div
                    key={account.id}
                    className="rounded-[22px] border border-slate-200 bg-slate-50/85 p-4"
                  >
                    <p className="text-sm font-semibold text-slate-900">{account.name}</p>
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
