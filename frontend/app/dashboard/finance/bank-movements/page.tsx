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
  TextInput,
} from "../../components/DashboardPageKit";

type MovementType = "CREDIT" | "DEBIT";
type MovementStatus = "POSTED" | "REVERSED";
type MovementOriginType =
  | "ACCOUNTS_RECEIVABLE_PAYMENT"
  | "ACCOUNTS_PAYABLE_PAYMENT"
  | "REVERSAL"
  | "MANUAL_ADJUSTMENT"
  | "OPENING_BALANCE";
type PeriodStatus = "OPEN" | "CLOSED";

type BankAccount = {
  id: string;
  name: string;
  bankName?: string | null;
  currentBalance?: number | null;
  isActive?: boolean | null;
};

type BankMovement = {
  id: string;
  bankAccountId: string;
  type: MovementType;
  amount: number;
  movementDate: string;
  competenceDate?: string | null;
  description: string;
  originType: MovementOriginType;
  originId: string;
  receivableId?: string | null;
  payableId?: string | null;
  status: MovementStatus;
  reconciledAt?: string | null;
  reconciliationReference?: string | null;
  reconciliationNote?: string | null;
  runningBalance: number;
  bankAccount?: { id: string; name: string; bankName?: string | null } | null;
  receivable?: { id: string; description?: string | null } | null;
  payable?: { id: string; description?: string | null } | null;
};

type BankMovementPayload = {
  openingBalance: number;
  finalBalance: number;
  totals: {
    credits: number;
    debits: number;
  };
  entries: BankMovement[];
};

type FinancialPeriodClosing = {
  id: string;
  year: number;
  month: number;
  status: PeriodStatus;
  closedAt?: string | null;
  reopenedAt?: string | null;
  closeReason?: string | null;
  reopenReason?: string | null;
};

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

const ORIGIN_LABEL: Record<MovementOriginType, string> = {
  ACCOUNTS_RECEIVABLE_PAYMENT: "Recebimento",
  ACCOUNTS_PAYABLE_PAYMENT: "Pagamento",
  REVERSAL: "Estorno",
  MANUAL_ADJUSTMENT: "Ajuste manual",
  OPENING_BALANCE: "Saldo inicial",
};

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

function toMonthInput(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function monthParts(value: string) {
  const [year, month] = value.split("-").map(Number);
  return { year, month };
}

function buildQuery(filters: {
  bankAccountId: string;
  from: string;
  to: string;
  type: string;
  originType: string;
}) {
  const query = new URLSearchParams();
  if (filters.bankAccountId) query.set("bankAccountId", filters.bankAccountId);
  if (filters.from) query.set("from", `${filters.from}T00:00:00.000Z`);
  if (filters.to) query.set("to", `${filters.to}T23:59:59.999Z`);
  if (filters.type) query.set("type", filters.type);
  if (filters.originType) query.set("originType", filters.originType);
  const suffix = query.toString();
  return suffix ? `?${suffix}` : "";
}

function originHref(movement: BankMovement) {
  if (movement.receivableId) return "/dashboard/finance/accounts-receivable";
  if (movement.payableId) return "/dashboard/finance/accounts-payable";
  return null;
}

export default function BankMovementsPage() {
  const router = useRouter();
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [payload, setPayload] = useState<BankMovementPayload>({
    openingBalance: 0,
    finalBalance: 0,
    totals: { credits: 0, debits: 0 },
    entries: [],
  });
  const [periods, setPeriods] = useState<FinancialPeriodClosing[]>([]);
  const [filters, setFilters] = useState({
    bankAccountId: "",
    from: "",
    to: "",
    type: "",
    originType: "",
  });
  const [periodMonth, setPeriodMonth] = useState(toMonthInput());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
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
      const [accountsRes, movementsRes, periodsRes] = await Promise.all([
        apiFetch(apiUrl("/finance/bank-accounts"), { cache: "no-store" }),
        apiFetch(apiUrl(`/finance/bank-movements${buildQuery(filters)}`), {
          cache: "no-store",
        }),
        apiFetch(apiUrl("/finance/period-closings"), { cache: "no-store" }),
      ]);

      const failed = [
        {
          response: accountsRes,
          fallback: "Nao foi possivel carregar contas bancarias.",
        },
        {
          response: movementsRes,
          fallback: "Nao foi possivel carregar o extrato financeiro.",
        },
        {
          response: periodsRes,
          fallback: "Nao foi possivel carregar fechamentos mensais.",
        },
      ].find((entry) => !entry.response.ok);

      if (failed) {
        if (await handleUnauthorized(failed.response)) return;
        throw new Error(
          await readApiErrorMessage(failed.response, failed.fallback),
        );
      }

      const [nextAccounts, nextPayload, nextPeriods] = (await Promise.all([
        accountsRes.json(),
        movementsRes.json(),
        periodsRes.json(),
      ])) as [BankAccount[], BankMovementPayload, FinancialPeriodClosing[]];

      setBankAccounts(nextAccounts);
      setPayload(nextPayload);
      setPeriods(nextPeriods);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar extrato financeiro.",
      );
    } finally {
      setLoading(false);
    }
  }, [filters, handleUnauthorized]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const currentPeriod = useMemo(() => {
    const { year, month } = monthParts(periodMonth);
    return periods.find((item) => item.year === year && item.month === month);
  }, [periodMonth, periods]);

  async function reconcileMovement(movement: BankMovement) {
    const reference = window.prompt("Referencia da conciliacao", "");
    if (reference === null) return;
    setBusyId(movement.id);
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(
        apiUrl(`/finance/bank-movements/${movement.id}/reconcile`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reconciliationReference: reference }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha ao conciliar movimento."),
        );
      }
      setSuccessMessage("Movimento conciliado.");
      await loadData();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Falha ao conciliar movimento.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function unreconcileMovement(movement: BankMovement) {
    const reason = window.prompt("Motivo para desfazer conciliacao", "");
    if (!reason) return;
    setBusyId(movement.id);
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(
        apiUrl(`/finance/bank-movements/${movement.id}/unreconcile`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha ao desfazer conciliacao."),
        );
      }
      setSuccessMessage("Conciliacao desfeita.");
      await loadData();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Falha ao desfazer conciliacao.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function closePeriod() {
    const reason = window.prompt("Motivo do fechamento mensal", "");
    if (!reason) return;
    const { year, month } = monthParts(periodMonth);
    setBusyId("period");
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(
        apiUrl("/finance/period-closings/close"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ year, month, reason }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha ao fechar periodo."),
        );
      }
      setSuccessMessage("Periodo financeiro fechado.");
      await loadData();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Falha ao fechar periodo.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function reopenPeriod(period: FinancialPeriodClosing) {
    const reason = window.prompt("Motivo para reabrir periodo", "");
    if (!reason) return;
    setBusyId("period");
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(
        apiUrl(`/finance/period-closings/${period.id}/reopen`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha ao reabrir periodo."),
        );
      }
      setSuccessMessage("Periodo financeiro reaberto.");
      await loadData();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Falha ao reabrir periodo.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Financeiro"
        title="Extrato financeiro"
        description="Ledger operacional com movimentos imutaveis, saldo corrente, conciliacao e fechamento mensal basico."
        stats={[
          {
            label: "Saldo inicial",
            value: formatCurrency(payload.openingBalance),
            tone: "slate",
          },
          {
            label: "Entradas",
            value: formatCurrency(payload.totals.credits),
            tone: "emerald",
          },
          {
            label: "Saidas",
            value: formatCurrency(payload.totals.debits),
            tone: "rose",
          },
          {
            label: "Saldo final",
            value: formatCurrency(payload.finalBalance),
            tone: payload.finalBalance >= 0 ? "blue" : "rose",
          },
        ]}
        actions={
          <>
            <Link
              href="/dashboard/finance/bank-accounts"
              className={SECONDARY_BUTTON}
            >
              Contas e caixas
            </Link>
            <Link
              href="/dashboard/finance/cash-flow"
              className={SECONDARY_BUTTON}
            >
              Fluxo de caixa
            </Link>
            <Link
              href="/dashboard/finance/reconciliation"
              className={SECONDARY_BUTTON}
            >
              Conciliação bancária
            </Link>
          </>
        }
      />

      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {successMessage ? (
        <StatusBanner tone="emerald">{successMessage}</StatusBanner>
      ) : null}

      <SectionCard
        title="Filtros"
        description="Consulte movimentos por conta, periodo, tipo e origem."
      >
        <div className="grid gap-3 md:grid-cols-5">
          <FormField label="Conta">
            <SelectInput
              value={filters.bankAccountId}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  bankAccountId: event.target.value,
                }))
              }
            >
              <option value="">Todas ativas</option>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </SelectInput>
          </FormField>
          <FormField label="De">
            <TextInput
              type="date"
              value={filters.from}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  from: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField label="Ate">
            <TextInput
              type="date"
              value={filters.to}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  to: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField label="Tipo">
            <SelectInput
              value={filters.type}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  type: event.target.value,
                }))
              }
            >
              <option value="">Todos</option>
              <option value="CREDIT">Entrada</option>
              <option value="DEBIT">Saida</option>
            </SelectInput>
          </FormField>
          <FormField label="Origem">
            <SelectInput
              value={filters.originType}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  originType: event.target.value,
                }))
              }
            >
              <option value="">Todas</option>
              {Object.entries(ORIGIN_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectInput>
          </FormField>
        </div>
      </SectionCard>

      <SectionCard
        title="Fechamento mensal"
        description="Periodo fechado bloqueia novas baixas, pagamentos e estornos dentro do mes."
        actions={
          <button
            type="button"
            className={PRIMARY_BUTTON}
            disabled={busyId === "period"}
            onClick={() =>
              currentPeriod?.status === "CLOSED"
                ? void reopenPeriod(currentPeriod)
                : void closePeriod()
            }
          >
            {currentPeriod?.status === "CLOSED"
              ? "Reabrir periodo"
              : "Fechar periodo"}
          </button>
        }
      >
        <div className="grid gap-3 md:grid-cols-[16rem_1fr]">
          <FormField label="Periodo">
            <TextInput
              type="month"
              value={periodMonth}
              onChange={(event) => setPeriodMonth(event.target.value)}
            />
          </FormField>
          <FieldBox>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Status
            </p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {currentPeriod?.status === "CLOSED"
                ? "Fechado"
                : "Aberto ou sem fechamento"}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {currentPeriod?.status === "CLOSED"
                ? `Fechado em ${formatDateTime(currentPeriod.closedAt)}`
                : "Lancamentos operacionais ainda permitidos."}
            </p>
          </FieldBox>
        </div>
      </SectionCard>

      <SectionCard title="Movimentos" description="Lancamentos do ledger">
        {loading ? (
          <EmptyState
            title="Carregando extrato"
            description="Buscando movimentos financeiros."
          />
        ) : payload.entries.length === 0 ? (
          <EmptyState
            title="Nenhum movimento encontrado"
            description="Ajuste os filtros ou registre uma baixa/pagamento."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-3 py-3">Data</th>
                  <th className="px-3 py-3">Descricao</th>
                  <th className="px-3 py-3">Origem</th>
                  <th className="px-3 py-3 text-right">Entrada</th>
                  <th className="px-3 py-3 text-right">Saida</th>
                  <th className="px-3 py-3 text-right">Saldo</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payload.entries.map((movement) => {
                  const href = originHref(movement);
                  return (
                    <tr key={movement.id} className="align-top">
                      <td className="px-3 py-3 text-slate-600">
                        {formatDateTime(movement.movementDate)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-950">
                          {movement.description}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {movement.bankAccount?.name || "Conta nao informada"}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {href ? (
                          <Link
                            href={href}
                            className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4"
                          >
                            {ORIGIN_LABEL[movement.originType]}
                          </Link>
                        ) : (
                          ORIGIN_LABEL[movement.originType]
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-emerald-700">
                        {movement.type === "CREDIT"
                          ? formatCurrency(movement.amount)
                          : "-"}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-rose-700">
                        {movement.type === "DEBIT"
                          ? formatCurrency(movement.amount)
                          : "-"}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900">
                        {formatCurrency(movement.runningBalance)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <DataPill
                            tone={
                              movement.status === "REVERSED" ? "amber" : "blue"
                            }
                          >
                            {movement.status === "REVERSED"
                              ? "Estornado"
                              : "Postado"}
                          </DataPill>
                          {movement.reconciledAt ? (
                            <DataPill tone="emerald">Conciliado</DataPill>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {movement.reconciledAt ? (
                          <button
                            type="button"
                            className={SECONDARY_BUTTON}
                            disabled={busyId === movement.id}
                            onClick={() => void unreconcileMovement(movement)}
                          >
                            Desfazer
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={SECONDARY_BUTTON}
                            disabled={busyId === movement.id}
                            onClick={() => void reconcileMovement(movement)}
                          >
                            Conciliar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
