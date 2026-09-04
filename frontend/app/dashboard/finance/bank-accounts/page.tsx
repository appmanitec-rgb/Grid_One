"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  TextInput,
} from "../../components/DashboardPageKit";

type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";
type BankAccountType = "CHECKING" | "SAVINGS" | "CASHBOX";
type PaymentMethod = "PIX" | "BOLETO" | "TRANSFER" | "CASH" | "CARD" | "OTHER";

type BankAccount = {
  id: string;
  name: string;
  bankName?: string | null;
  type: BankAccountType;
  agency?: string | null;
  accountNumber?: string | null;
  pixKey?: string | null;
  initialBalance: number;
  currentBalance: number;
  isActive: boolean;
};

type AccountMovement = {
  id: string;
  bankAccountId?: string | null;
  amount: number;
  paidAt: string;
  method: PaymentMethod;
  direction: "in" | "out";
  counterparty: string;
  context: string;
};

type Receivable = {
  id: string;
  description: string;
  client?: { companyName?: string | null } | null;
  contract?: { code?: string | null } | null;
  maintenanceOrder?: { title?: string | null } | null;
  payments: Array<{
    id: string;
    amount: number;
    paidAt: string;
    method: PaymentMethod;
    bankAccountId?: string | null;
  }>;
};

type Payable = {
  id: string;
  description: string;
  supplier?: { companyName?: string | null } | null;
  purchaseOrder?: { code?: string | null } | null;
  payments: Array<{
    id: string;
    amount: number;
    paidAt: string;
    method: PaymentMethod;
    bankAccountId?: string | null;
  }>;
};

type AccountDraft = {
  name: string;
  bankName: string;
  type: BankAccountType;
  agency: string;
  accountNumber: string;
  pixKey: string;
  initialBalance: string;
  isActive: boolean;
};

type AccountSummary = {
  inflowAmount: number;
  outflowAmount: number;
  inflowCount: number;
  outflowCount: number;
  latestMovement: AccountMovement | null;
  recentMovements: AccountMovement[];
};

const ACCOUNT_TYPES: BankAccountType[] = ["CHECKING", "SAVINGS", "CASHBOX"];

const TYPE_LABEL: Record<BankAccountType, string> = {
  CHECKING: "Conta Corrente",
  SAVINGS: "Poupanca",
  CASHBOX: "Caixa",
};

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
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

function parseMoneyInput(value: string) {
  return Number(value.replace(",", ".").trim());
}

function emptyDraft(): AccountDraft {
  return {
    name: "",
    bankName: "",
    type: "CHECKING",
    agency: "",
    accountNumber: "",
    pixKey: "",
    initialBalance: "",
    isActive: true,
  };
}

function draftFromAccount(account: BankAccount): AccountDraft {
  return {
    name: account.name,
    bankName: account.bankName || "",
    type: account.type,
    agency: account.agency || "",
    accountNumber: account.accountNumber || "",
    pixKey: account.pixKey || "",
    initialBalance: "",
    isActive: account.isActive,
  };
}

function movementTone(movement: AccountMovement): Tone {
  return movement.direction === "in" ? "emerald" : "rose";
}

export default function BankAccountsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
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
      const [accountsRes, receivablesRes, payablesRes] = await Promise.all([
        apiFetch(apiUrl("/finance/bank-accounts"), { cache: "no-store" }),
        apiFetch(apiUrl("/finance/receivables"), { cache: "no-store" }),
        apiFetch(apiUrl("/finance/payables"), { cache: "no-store" }),
      ]);

      const failed = [
        { response: accountsRes, fallback: "Nao foi possivel carregar as contas bancarias." },
        { response: receivablesRes, fallback: "Nao foi possivel carregar os recebiveis." },
        { response: payablesRes, fallback: "Nao foi possivel carregar os pagaveis." },
      ].find((entry) => !entry.response.ok);

      if (failed) {
        if (await handleUnauthorized(failed.response)) return;
        throw new Error(await readApiErrorMessage(failed.response, failed.fallback));
      }

      const [nextAccounts, nextReceivables, nextPayables] = (await Promise.all([
        accountsRes.json(),
        receivablesRes.json(),
        payablesRes.json(),
      ])) as [BankAccount[], Receivable[], Payable[]];

      setAccounts(nextAccounts);
      setReceivables(nextReceivables);
      setPayables(nextPayables);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar contas bancarias.",
      );
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const movements = useMemo(() => {
    const inflows: AccountMovement[] = receivables.flatMap((receivable) =>
      receivable.payments
        .filter((payment) => payment.bankAccountId)
        .map((payment) => ({
          id: payment.id,
          bankAccountId: payment.bankAccountId,
          amount: Number(payment.amount || 0),
          paidAt: payment.paidAt,
          method: payment.method,
          direction: "in" as const,
          counterparty:
            receivable.client?.companyName || receivable.contract?.code || "Recebimento",
          context:
            receivable.description ||
            receivable.maintenanceOrder?.title ||
            receivable.contract?.code ||
            "Titulo financeiro",
        })),
    );

    const outflows: AccountMovement[] = payables.flatMap((payable) =>
      payable.payments
        .filter((payment) => payment.bankAccountId)
        .map((payment) => ({
          id: payment.id,
          bankAccountId: payment.bankAccountId,
          amount: Number(payment.amount || 0),
          paidAt: payment.paidAt,
          method: payment.method,
          direction: "out" as const,
          counterparty:
            payable.supplier?.companyName || payable.purchaseOrder?.code || "Pagamento",
          context: payable.description || payable.purchaseOrder?.code || "Titulo financeiro",
        })),
    );

    return [...inflows, ...outflows].sort(
      (left, right) => new Date(right.paidAt).getTime() - new Date(left.paidAt).getTime(),
    );
  }, [payables, receivables]);

  const accountSummaries = useMemo(() => {
    const map = new Map<string, AccountSummary>();

    for (const movement of movements) {
      if (!movement.bankAccountId) continue;

      const current = map.get(movement.bankAccountId) || {
        inflowAmount: 0,
        outflowAmount: 0,
        inflowCount: 0,
        outflowCount: 0,
        latestMovement: null,
        recentMovements: [],
      };

      if (movement.direction === "in") {
        current.inflowAmount += movement.amount;
        current.inflowCount += 1;
      } else {
        current.outflowAmount += movement.amount;
        current.outflowCount += 1;
      }

      if (!current.latestMovement) {
        current.latestMovement = movement;
      }

      if (current.recentMovements.length < 3) {
        current.recentMovements.push(movement);
      }

      map.set(movement.bankAccountId, current);
    }

    return map;
  }, [movements]);

  const stats = useMemo(() => {
    const activeAccounts = accounts.filter((item) => item.isActive);
    const negativeAccounts = activeAccounts.filter((item) => Number(item.currentBalance || 0) < 0);
    const cashboxes = activeAccounts.filter((item) => item.type === "CASHBOX");

    return {
      activeCount: activeAccounts.length,
      consolidatedBalance: activeAccounts.reduce(
        (total, item) => total + Number(item.currentBalance || 0),
        0,
      ),
      inflowTracked: activeAccounts.reduce(
        (total, item) => total + (accountSummaries.get(item.id)?.inflowAmount || 0),
        0,
      ),
      outflowTracked: activeAccounts.reduce(
        (total, item) => total + (accountSummaries.get(item.id)?.outflowAmount || 0),
        0,
      ),
      inactiveCount: accounts.filter((item) => !item.isActive).length,
      negativeCount: negativeAccounts.length,
      cashboxCount: cashboxes.length,
    };
  }, [accountSummaries, accounts]);

  const spotlightAccount = useMemo(() => {
    return [...accounts]
      .filter((item) => item.isActive)
      .sort(
        (left, right) => Number(right.currentBalance || 0) - Number(left.currentBalance || 0),
      )[0] || null;
  }, [accounts]);

  const recentMovements = useMemo(() => movements.slice(0, 6), [movements]);

  function resetForm() {
    setDraft(emptyDraft());
    setEditingId(null);
  }

  function startEditing(account: BankAccount) {
    setDraft(draftFromAccount(account));
    setEditingId(account.id);
    setError("");
    setSuccessMessage("");
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError("Informe o nome da conta.");
      return;
    }

    const initialBalance =
      draft.initialBalance.trim().length > 0 ? parseMoneyInput(draft.initialBalance) : 0;
    if (!Number.isFinite(initialBalance)) {
      setError("Informe um saldo inicial valido.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(apiUrl("/finance/bank-accounts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          bankName: draft.bankName.trim() || undefined,
          type: draft.type,
          agency: draft.agency.trim() || undefined,
          accountNumber: draft.accountNumber.trim() || undefined,
          pixKey: draft.pixKey.trim() || undefined,
          initialBalance,
        }),
      });

      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Falha ao criar conta bancaria."));
      }

      resetForm();
      setSuccessMessage("Conta bancaria criada com sucesso.");
      await loadData();
    } catch (createError: unknown) {
      setError(
        createError instanceof Error ? createError.message : "Falha ao criar conta bancaria.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    if (!draft.name.trim()) {
      setError("Informe o nome da conta.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(apiUrl(`/finance/bank-accounts/${editingId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          bankName: draft.bankName.trim() || undefined,
          type: draft.type,
          agency: draft.agency.trim() || undefined,
          accountNumber: draft.accountNumber.trim() || undefined,
          pixKey: draft.pixKey.trim() || undefined,
          isActive: draft.isActive,
        }),
      });

      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Falha ao atualizar conta bancaria."));
      }

      resetForm();
      setSuccessMessage("Conta bancaria atualizada com sucesso.");
      await loadData();
    } catch (updateError: unknown) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Falha ao atualizar conta bancaria.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleAccountStatus(account: BankAccount) {
    setBusyAccountId(account.id);
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(apiUrl(`/finance/bank-accounts/${account.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !account.isActive }),
      });

      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Falha ao atualizar status da conta."));
      }

      if (editingId === account.id) {
        resetForm();
      }

      setSuccessMessage(
        account.isActive
          ? "Conta inativada. Ela deixa de aparecer nas novas baixas, mas mantem o historico."
          : "Conta reativada para novas operacoes.",
      );
      await loadData();
    } catch (statusError: unknown) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Falha ao atualizar status da conta.",
      );
    } finally {
      setBusyAccountId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Tesouraria e conciliacao"
        title="Contas bancarias e caixas com saldo, uso real e governanca operacional."
        description="A central agora mostra quais contas sustentam o caixa, quanto cada uma recebeu e pagou e quais devem sair da operacao nova sem perder o historico financeiro."
        stats={[
          {
            label: "Contas ativas",
            value: String(stats.activeCount),
            helper: "Disponiveis para novas baixas e conciliacoes.",
            tone: "blue",
          },
          {
            label: "Saldo consolidado",
            value: formatCurrency(stats.consolidatedBalance),
            helper: "Soma das contas ativas hoje.",
            tone: stats.consolidatedBalance < 0 ? "rose" : "emerald",
          },
          {
            label: "Entradas rastreadas",
            value: formatCurrency(stats.inflowTracked),
            helper: "Volume recebido com conta destino informada.",
            tone: "emerald",
          },
          {
            label: "Saidas rastreadas",
            value: formatCurrency(stats.outflowTracked),
            helper: "Volume pago com conta de saida vinculada.",
            tone: "amber",
          },
        ]}
        aside={
          <div className="space-y-3">
            <FieldBox>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Radar de tesouraria
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <div>
                  <p className="text-xs text-slate-500">Contas inativas</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">{stats.inactiveCount}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Caixas operacionais</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">{stats.cashboxCount}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Saldos negativos</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">{stats.negativeCount}</p>
                </div>
              </div>
            </FieldBox>

            <StatusBanner tone={spotlightAccount ? "blue" : "slate"}>
              {spotlightAccount
                ? `${spotlightAccount.name} e a conta com maior saldo ativo hoje, em ${formatCurrency(Number(spotlightAccount.currentBalance || 0))}.`
                : "Nenhuma conta ativa encontrada para compor o radar de tesouraria."}
            </StatusBanner>
          </div>
        }
      />

      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {successMessage ? <StatusBanner tone="emerald">{successMessage}</StatusBanner> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_380px]">
        <SectionCard
          eyebrow="Mapa das contas"
          title="Saldos, uso e historico por conta"
          description="Veja quais contas realmente participam do fluxo e quais ja podem sair da operacao sem sumir da trilha financeira."
        >
          <div className="space-y-4">
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`bank-loading-${index}`}
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
            ) : accounts.length === 0 ? (
              <EmptyState
                title="Nenhuma conta cadastrada"
                description="Cadastre a primeira conta para amarrar recebimentos, pagamentos e caixa."
              />
            ) : (
              accounts.map((account) => {
                const summary = accountSummaries.get(account.id) || {
                  inflowAmount: 0,
                  outflowAmount: 0,
                  inflowCount: 0,
                  outflowCount: 0,
                  latestMovement: null,
                  recentMovements: [],
                };

                return (
                  <article
                    key={account.id}
                    className="rounded-[28px] border border-slate-200 bg-white/92 p-5 shadow-[0_24px_70px_-52px_rgba(15,31,50,0.45)]"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <DataPill tone={account.isActive ? "emerald" : "slate"}>
                            {account.isActive ? "Ativa" : "Inativa"}
                          </DataPill>
                          <DataPill tone={account.type === "CASHBOX" ? "amber" : "blue"}>
                            {TYPE_LABEL[account.type]}
                          </DataPill>
                          {Number(account.currentBalance || 0) < 0 ? (
                            <DataPill tone="rose">Saldo negativo</DataPill>
                          ) : null}
                        </div>

                        <h2 className="mt-3 text-xl font-bold text-slate-950">{account.name}</h2>
                        <p className="mt-1 text-sm text-slate-600">
                          {account.bankName || "Banco nao informado"}
                          {account.agency || account.accountNumber
                            ? ` / ${account.agency || "-"} / ${account.accountNumber || "-"}`
                            : ""}
                        </p>
                        {account.pixKey ? (
                          <p className="mt-2 text-xs text-slate-500">PIX: {account.pixKey}</p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEditing(account)}
                          className={SECONDARY_BUTTON}
                          disabled={saving || busyAccountId === account.id}
                        >
                          Editar conta
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleAccountStatus(account)}
                          className={SECONDARY_BUTTON}
                          disabled={busyAccountId === account.id}
                        >
                          {busyAccountId === account.id
                            ? "Atualizando..."
                            : account.isActive
                              ? "Inativar"
                              : "Reativar"}
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-4">
                      <FieldBox>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          Saldo inicial
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {formatCurrency(Number(account.initialBalance || 0))}
                        </p>
                      </FieldBox>
                      <FieldBox>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          Saldo atual
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {formatCurrency(Number(account.currentBalance || 0))}
                        </p>
                      </FieldBox>
                      <FieldBox>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          Entradas
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {formatCurrency(summary.inflowAmount)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{summary.inflowCount} baixa(s)</p>
                      </FieldBox>
                      <FieldBox>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          Saidas
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {formatCurrency(summary.outflowAmount)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{summary.outflowCount} pagamento(s)</p>
                      </FieldBox>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_280px]">
                      <FieldBox>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          Uso operacional
                        </p>
                        <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                          <div>
                            <p className="text-xs text-slate-500">Fluxo liquido</p>
                            <p className="mt-1 font-semibold text-slate-900">
                              {formatCurrency(summary.inflowAmount - summary.outflowAmount)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Recebiveis vinculados</p>
                            <p className="mt-1 font-semibold text-slate-900">{summary.inflowCount}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Pagaveis vinculados</p>
                            <p className="mt-1 font-semibold text-slate-900">{summary.outflowCount}</p>
                          </div>
                        </div>
                      </FieldBox>

                      <FieldBox>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          Ultimo movimento
                        </p>
                        {summary.latestMovement ? (
                          <div className="mt-3 space-y-1 text-sm text-slate-600">
                            <p className="font-semibold text-slate-900">
                              {formatCurrency(summary.latestMovement.amount)} via {summary.latestMovement.method}
                            </p>
                            <p>{summary.latestMovement.counterparty}</p>
                            <p>{formatDateTime(summary.latestMovement.paidAt)}</p>
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-slate-500">
                            Nenhum recebimento ou pagamento com esta conta foi rastreado ainda.
                          </p>
                        )}
                      </FieldBox>
                    </div>

                    {summary.recentMovements.length > 0 ? (
                      <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                              Historico recente
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              Ate 3 movimentos rastreados para a conta.
                            </p>
                          </div>
                          <DataPill tone="slate">
                            {summary.inflowCount + summary.outflowCount} movimento(s)
                          </DataPill>
                        </div>

                        <div className="mt-4 grid gap-3">
                          {summary.recentMovements.map((movement) => (
                            <div
                              key={movement.id}
                              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <DataPill tone={movementTone(movement)}>
                                    {movement.direction === "in" ? "Entrada" : "Saida"}
                                  </DataPill>
                                  <p className="font-semibold text-slate-900">
                                    {formatCurrency(movement.amount)}
                                  </p>
                                </div>
                                <p>{formatDateTime(movement.paidAt)}</p>
                              </div>
                              <p className="mt-1">{movement.counterparty}</p>
                              <p className="mt-1 text-xs text-slate-500">{movement.context}</p>
                            </div>
                          ))}
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
            eyebrow={editingId ? "Editar conta" : "Nova conta"}
            title={editingId ? "Governanca da conta selecionada" : "Cadastrar nova conta"}
            description={
              editingId
                ? "Atualize dados cadastrais ou tire a conta da operacao nova sem perder o historico."
                : "Crie a conta que vai receber baixas, suportar pagamentos ou representar caixa operacional."
            }
          >
            <form
              onSubmit={(event) =>
                editingId ? void handleUpdate(event) : void handleCreate(event)
              }
              className="space-y-3"
            >
              <FormField label="Nome da conta">
                <TextInput
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Ex.: Banco Principal Operacao"
                />
              </FormField>

              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Banco">
                  <TextInput
                    value={draft.bankName}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, bankName: event.target.value }))
                    }
                    placeholder="Banco"
                  />
                </FormField>
                <FormField label="Tipo">
                  <SelectInput
                    value={draft.type}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        type: event.target.value as BankAccountType,
                      }))
                    }
                  >
                    {ACCOUNT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {TYPE_LABEL[type]}
                      </option>
                    ))}
                  </SelectInput>
                </FormField>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Agencia">
                  <TextInput
                    value={draft.agency}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, agency: event.target.value }))
                    }
                    placeholder="Agencia"
                  />
                </FormField>
                <FormField label="Conta">
                  <TextInput
                    value={draft.accountNumber}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, accountNumber: event.target.value }))
                    }
                    placeholder="Numero da conta"
                  />
                </FormField>
              </div>

              <FormField label="Chave PIX">
                <TextInput
                  value={draft.pixKey}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, pixKey: event.target.value }))
                  }
                  placeholder="Chave PIX"
                />
              </FormField>

              {!editingId ? (
                <FormField label="Saldo inicial">
                  <TextInput
                    type="number"
                    step="0.01"
                    value={draft.initialBalance}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        initialBalance: event.target.value,
                      }))
                    }
                    placeholder="0,00"
                  />
                </FormField>
              ) : (
                <FormField label="Status operacional">
                  <SelectInput
                    value={draft.isActive ? "ACTIVE" : "INACTIVE"}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        isActive: event.target.value === "ACTIVE",
                      }))
                    }
                  >
                    <option value="ACTIVE">Ativa</option>
                    <option value="INACTIVE">Inativa</option>
                  </SelectInput>
                </FormField>
              )}

              <div className="flex flex-wrap gap-2">
                <button type="submit" className={PRIMARY_BUTTON} disabled={saving}>
                  {saving
                    ? editingId
                      ? "Salvando..."
                      : "Cadastrando..."
                    : editingId
                      ? "Salvar alteracoes"
                      : "Cadastrar conta"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className={SECONDARY_BUTTON}
                  disabled={saving}
                >
                  {editingId ? "Cancelar edicao" : "Limpar formulario"}
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard
            eyebrow="Ultimos movimentos"
            title="Pulso da tesouraria"
            description="Resumo das movimentacoes mais recentes com conta vinculada."
          >
            <div className="space-y-3">
              {loading ? (
                <div className="animate-pulse rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
                  <div className="h-5 w-24 rounded-full bg-slate-200" />
                  <div className="mt-3 h-24 rounded-2xl bg-slate-200" />
                </div>
              ) : recentMovements.length === 0 ? (
                <EmptyState
                  title="Sem movimentacoes rastreadas"
                  description="Recebimentos e pagamentos ainda nao registraram contas bancarias vinculadas."
                />
              ) : (
                recentMovements.map((movement) => (
                  <div
                    key={`recent-${movement.id}`}
                    className="rounded-[22px] border border-slate-200 bg-slate-50/85 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <DataPill tone={movementTone(movement)}>
                        {movement.direction === "in" ? "Entrada" : "Saida"}
                      </DataPill>
                      <DataPill tone="slate">{movement.method}</DataPill>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-900">
                      {movement.counterparty}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{movement.context}</p>
                    <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-500">{formatDateTime(movement.paidAt)}</span>
                      <span className="font-semibold text-slate-900">
                        {formatCurrency(movement.amount)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Conexao de fluxo"
            title="Esteira validada"
            description="Como a governanca de contas conversa com o restante do financeiro."
          >
            <div className="space-y-3">
              <FieldBox>
                <p className="text-sm font-semibold text-slate-900">Conta ativa na operacao nova</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Recebiveis e pagaveis usam apenas contas ativas na interface, reduzindo erro operacional.
                </p>
              </FieldBox>

              <FieldBox>
                <p className="text-sm font-semibold text-slate-900">Conta inativa com historico preservado</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Inativar remove a conta da operacao nova, mas mantem intacta a trilha de entradas e saidas ja feitas.
                </p>
              </FieldBox>

              <FieldBox>
                <p className="text-sm font-semibold text-slate-900">Caixa refletido no modulo certo</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Os saldos aqui continuam sendo a base da leitura executiva do fluxo de caixa e da conciliacao dos modulos financeiros.
                </p>
              </FieldBox>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
