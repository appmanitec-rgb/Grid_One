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

type MovementType = "CREDIT" | "DEBIT";
type FileType = "CSV" | "OFX";
type ImportStatus =
  | "IMPORTED"
  | "PARTIALLY_RECONCILED"
  | "RECONCILED"
  | "CANCELLED";
type MatchStatus = "UNMATCHED" | "AUTO_MATCHED" | "MANUAL_MATCHED" | "IGNORED";
type IssueStatus = "OPEN" | "RESOLVED" | "IGNORED";

type BankAccount = {
  id: string;
  name: string;
  bankName?: string | null;
  currentBalance?: number | null;
  isActive?: boolean | null;
};

type BankStatementImport = {
  id: string;
  bankAccountId: string;
  fileName: string;
  fileType: FileType;
  status: ImportStatus;
  periodStart: string;
  periodEnd: string;
  importedAt: string;
  entries?: BankStatementEntry[];
};

type BankStatementEntry = {
  id: string;
  importId: string;
  bankAccountId: string;
  postedDate: string;
  amount: number;
  type: MovementType;
  description: string;
  documentNumber?: string | null;
  bankReference?: string | null;
  externalId?: string | null;
  matchStatus: MatchStatus;
  matchedMovementId?: string | null;
  matchedMovement?: BankMovement | null;
};

type BankMovement = {
  id: string;
  bankAccountId: string;
  type: MovementType;
  amount: number;
  movementDate: string;
  description: string;
  status: "POSTED" | "REVERSED";
  reconciledAt?: string | null;
  reconciliationReference?: string | null;
};

type ReconciliationReport = {
  bankAccount: BankAccount;
  period: { from: string; to: string };
  closing?: { id: string; status: string; closedAt?: string | null } | null;
  totals: {
    openingBalance: number;
    credits: number;
    debits: number;
    finalBalance: number;
    reconciledMovements: number;
    unreconciledMovements: number;
    unmatchedStatementEntries: number;
    openIssues: number;
    resolvedIssues: number;
  };
  issues: Array<{
    id: string;
    type: string;
    status: IssueStatus;
    reason: string;
    createdAt: string;
  }>;
};

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const DANGER_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50";

const MATCH_LABEL: Record<MatchStatus, string> = {
  UNMATCHED: "Pendente",
  AUTO_MATCHED: "Auto",
  MANUAL_MATCHED: "Manual",
  IGNORED: "Ignorado",
};

const STATUS_LABEL: Record<ImportStatus, string> = {
  IMPORTED: "Importado",
  PARTIALLY_RECONCILED: "Parcial",
  RECONCILED: "Conciliado",
  CANCELLED: "Cancelado",
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
  return parsed.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function firstDayOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1));
}

function buildPeriodQuery(bankAccountId: string, from: string, to: string) {
  const query = new URLSearchParams();
  query.set("bankAccountId", bankAccountId);
  query.set("from", `${from}T00:00:00.000Z`);
  query.set("to", `${to}T23:59:59.999Z`);
  return query.toString();
}

function statusTone(status: MatchStatus | ImportStatus | IssueStatus) {
  if (
    status === "RECONCILED" ||
    status === "AUTO_MATCHED" ||
    status === "MANUAL_MATCHED" ||
    status === "RESOLVED"
  ) {
    return "emerald" as const;
  }
  if (status === "IGNORED" || status === "PARTIALLY_RECONCILED") {
    return "amber" as const;
  }
  if (status === "OPEN" || status === "UNMATCHED") {
    return "rose" as const;
  }
  return "slate" as const;
}

export default function BankReconciliationPage() {
  const router = useRouter();
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState("");
  const [statementImports, setStatementImports] = useState<
    BankStatementImport[]
  >([]);
  const [selectedImportId, setSelectedImportId] = useState("");
  const [entries, setEntries] = useState<BankStatementEntry[]>([]);
  const [movements, setMovements] = useState<BankMovement[]>([]);
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [filters, setFilters] = useState({
    from: toDateInput(firstDayOfMonth()),
    to: toDateInput(new Date()),
  });
  const [draft, setDraft] = useState({
    fileName: "extrato.csv",
    fileType: "CSV" as FileType,
    content: "data;descricao;valor;referencia\n",
  });
  const [matchMovementByEntry, setMatchMovementByEntry] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const selectedImport = useMemo(
    () => statementImports.find((item) => item.id === selectedImportId) || null,
    [selectedImportId, statementImports],
  );

  const unreconciledMovements = useMemo(
    () =>
      movements.filter(
        (movement) => movement.status === "POSTED" && !movement.reconciledAt,
      ),
    [movements],
  );

  const handleUnauthorized = useCallback(
    async (response: Response) => {
      if (response.status !== 401) return false;
      clearAuthSession();
      router.replace("/");
      return true;
    },
    [router],
  );

  const readOrThrow = useCallback(
    async (response: Response, fallback: string) => {
      if (response.ok) return;
      if (await handleUnauthorized(response)) return;
      throw new Error(await readApiErrorMessage(response, fallback));
    },
    [handleUnauthorized],
  );

  const loadAccounts = useCallback(async () => {
    const response = await apiFetch(apiUrl("/finance/bank-accounts"), {
      cache: "no-store",
    });
    await readOrThrow(response, "Nao foi possivel carregar contas bancarias.");
    const accounts = (await response.json()) as BankAccount[];
    setBankAccounts(accounts);
    setSelectedBankAccountId((current) => current || accounts[0]?.id || "");
  }, [readOrThrow]);

  const loadReconciliationData = useCallback(async () => {
    if (!selectedBankAccountId) return;
    setLoading(true);
    setError("");

    try {
      const periodQuery = buildPeriodQuery(
        selectedBankAccountId,
        filters.from,
        filters.to,
      );
      const [importsRes, reportRes, movementsRes] = await Promise.all([
        apiFetch(
          apiUrl(`/finance/bank-accounts/${selectedBankAccountId}/statements`),
          { cache: "no-store" },
        ),
        apiFetch(apiUrl(`/finance/reconciliation/report?${periodQuery}`), {
          cache: "no-store",
        }),
        apiFetch(apiUrl(`/finance/bank-movements?${periodQuery}`), {
          cache: "no-store",
        }),
      ]);

      await readOrThrow(importsRes, "Nao foi possivel carregar extratos.");
      await readOrThrow(reportRes, "Nao foi possivel carregar conciliacao.");
      await readOrThrow(movementsRes, "Nao foi possivel carregar movimentos.");

      const [nextImports, nextReport, movementPayload] = (await Promise.all([
        importsRes.json(),
        reportRes.json(),
        movementsRes.json(),
      ])) as [
        BankStatementImport[],
        ReconciliationReport,
        { entries: BankMovement[] },
      ];

      setStatementImports(nextImports);
      setReport(nextReport);
      setMovements(movementPayload.entries || []);
      setSelectedImportId((current) => {
        if (current && nextImports.some((item) => item.id === current)) {
          return current;
        }
        return nextImports[0]?.id || "";
      });
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar conciliacao bancaria.",
      );
    } finally {
      setLoading(false);
    }
  }, [filters.from, filters.to, readOrThrow, selectedBankAccountId]);

  const loadEntries = useCallback(async () => {
    if (!selectedImportId) {
      setEntries([]);
      return;
    }
    const response = await apiFetch(
      apiUrl(`/finance/bank-statements/${selectedImportId}/entries`),
      { cache: "no-store" },
    );
    await readOrThrow(response, "Nao foi possivel carregar lancamentos.");
    setEntries((await response.json()) as BankStatementEntry[]);
  }, [readOrThrow, selectedImportId]);

  useEffect(() => {
    void loadAccounts().catch((loadError: unknown) => {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar contas bancarias.",
      );
      setLoading(false);
    });
  }, [loadAccounts]);

  useEffect(() => {
    void loadReconciliationData();
  }, [loadReconciliationData]);

  useEffect(() => {
    void loadEntries().catch((loadError: unknown) => {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar lancamentos do extrato.",
      );
    });
  }, [loadEntries]);

  async function refreshAll() {
    await loadReconciliationData();
    await loadEntries();
  }

  async function importStatement() {
    if (!selectedBankAccountId) return;
    setBusyId("import");
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(
        apiUrl(
          `/finance/bank-accounts/${selectedBankAccountId}/statements/import`,
        ),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha ao importar extrato."),
        );
      }
      const imported = (await response.json()) as BankStatementImport;
      setSelectedImportId(imported.id);
      setSuccessMessage("Extrato importado com trilha de auditoria.");
      await refreshAll();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Falha ao importar extrato.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function autoMatchStatement() {
    if (!selectedImportId) return;
    setBusyId("auto-match");
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(
        apiUrl(`/finance/bank-statements/${selectedImportId}/auto-match`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dateWindowDays: 2 }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha no matching automatico."),
        );
      }
      const result = (await response.json()) as {
        autoMatched: number;
        ambiguous: number;
        unmatched: number;
      };
      setSuccessMessage(
        `Matching: ${result.autoMatched} automatico, ${result.ambiguous} ambiguo, ${result.unmatched} pendente.`,
      );
      await refreshAll();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Falha no matching automatico.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function manualMatch(entry: BankStatementEntry) {
    const movementId = matchMovementByEntry[entry.id];
    if (!movementId) {
      setError("Selecione um movimento para conciliar manualmente.");
      return;
    }
    setBusyId(entry.id);
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(
        apiUrl(`/finance/bank-statement-entries/${entry.id}/match`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ movementId }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha ao conciliar lancamento."),
        );
      }
      setSuccessMessage("Lancamento conciliado manualmente.");
      await refreshAll();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Falha ao conciliar lancamento.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function unmatch(entry: BankStatementEntry) {
    const reason = window.prompt("Motivo para desfazer a conciliacao", "");
    if (!reason) return;
    setBusyId(entry.id);
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(
        apiUrl(`/finance/bank-statement-entries/${entry.id}/unmatch`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha ao desfazer conciliacao."),
        );
      }
      setSuccessMessage("Conciliacao desfeita com divergencia registrada.");
      await refreshAll();
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

  async function ignoreEntry(entry: BankStatementEntry) {
    const reason = window.prompt("Motivo para ignorar este lancamento", "");
    if (!reason) return;
    setBusyId(entry.id);
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(
        apiUrl(`/finance/bank-statement-entries/${entry.id}/ignore`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha ao ignorar lancamento."),
        );
      }
      setSuccessMessage("Lancamento ignorado com justificativa.");
      await refreshAll();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Falha ao ignorar lancamento.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function createAdjustment(entry: BankStatementEntry) {
    const reason = window.prompt("Motivo do ajuste controlado", "");
    if (!reason) return;
    setBusyId(entry.id);
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(
        apiUrl(`/finance/bank-statement-entries/${entry.id}/adjustment`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: entry.amount,
            type: entry.type,
            description: `Ajuste controlado: ${entry.description}`,
            postedDate: entry.postedDate,
            reason,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha ao criar ajuste."),
        );
      }
      setSuccessMessage("Ajuste controlado criado e conciliado.");
      await refreshAll();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Falha ao criar ajuste.",
      );
    } finally {
      setBusyId(null);
    }
  }

  const stats = report
    ? [
        {
          label: "Saldo inicial",
          value: formatCurrency(report.totals.openingBalance),
          tone: "slate" as const,
        },
        {
          label: "Conciliados",
          value: String(report.totals.reconciledMovements),
          tone: "emerald" as const,
        },
        {
          label: "Pendencias",
          value: String(
            report.totals.unmatchedStatementEntries + report.totals.openIssues,
          ),
          tone:
            report.totals.unmatchedStatementEntries + report.totals.openIssues >
            0
              ? ("rose" as const)
              : ("emerald" as const),
        },
        {
          label: "Saldo final",
          value: formatCurrency(report.totals.finalBalance),
          tone:
            report.totals.finalBalance >= 0
              ? ("blue" as const)
              : ("rose" as const),
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Financeiro"
        title="Conciliação bancária"
        description="Importação de extrato, matching com ledger, divergências rastreáveis e relatório do período."
        stats={stats}
        actions={
          <>
            <Link
              href="/dashboard/finance/bank-movements"
              className={SECONDARY_BUTTON}
            >
              Extrato financeiro
            </Link>
            <Link
              href="/dashboard/finance/bank-accounts"
              className={SECONDARY_BUTTON}
            >
              Contas e caixas
            </Link>
          </>
        }
      />

      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {successMessage ? (
        <StatusBanner tone="emerald">{successMessage}</StatusBanner>
      ) : null}

      <SectionCard
        title="Conta e período"
        description="O relatório cruza movimentos do ledger, lançamentos importados e divergências abertas."
      >
        <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_auto]">
          <FormField label="Conta">
            <SelectInput
              value={selectedBankAccountId}
              onChange={(event) => setSelectedBankAccountId(event.target.value)}
            >
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
          <div className="flex items-end">
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={loading || !selectedBankAccountId}
              onClick={() => void refreshAll()}
            >
              Atualizar
            </button>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <SectionCard
          title="Importar extrato"
          description="CSV e OFX basico entram com checksum para evitar reprocessamento do mesmo arquivo."
          actions={
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={busyId === "import" || !selectedBankAccountId}
              onClick={() => void importStatement()}
            >
              Importar
            </button>
          }
        >
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Arquivo">
              <TextInput
                value={draft.fileName}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    fileName: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="Formato">
              <SelectInput
                value={draft.fileType}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    fileType: event.target.value as FileType,
                    fileName:
                      event.target.value === "OFX"
                        ? "extrato.ofx"
                        : "extrato.csv",
                  }))
                }
              >
                <option value="CSV">CSV</option>
                <option value="OFX">OFX básico</option>
              </SelectInput>
            </FormField>
          </div>
          <div className="mt-3">
            <FormField label="Conteúdo">
              <TextAreaInput
                rows={9}
                value={draft.content}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    content: event.target.value,
                  }))
                }
              />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard
          title="Extratos importados"
          description="Cada importação mantém status próprio e entradas vinculadas."
          actions={
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={!selectedImportId || busyId === "auto-match"}
              onClick={() => void autoMatchStatement()}
            >
              Auto matching
            </button>
          }
        >
          {loading ? (
            <EmptyState
              title="Carregando extratos"
              description="Buscando importações bancárias."
            />
          ) : statementImports.length === 0 ? (
            <EmptyState
              title="Nenhum extrato importado"
              description="Importe o primeiro arquivo da conta selecionada."
            />
          ) : (
            <div className="space-y-3">
              {statementImports.map((statement) => (
                <button
                  key={statement.id}
                  type="button"
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    selectedImportId === statement.id
                      ? "border-slate-900 bg-slate-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                  onClick={() => setSelectedImportId(statement.id)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {statement.fileName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(statement.periodStart)} a{" "}
                        {formatDate(statement.periodEnd)}
                      </p>
                    </div>
                    <DataPill tone={statusTone(statement.status)}>
                      {STATUS_LABEL[statement.status]}
                    </DataPill>
                  </div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Lançamentos do extrato"
        description="O matching automático só concilia quando encontra um movimento único, com mesmo valor, tipo e janela de data."
      >
        {!selectedImport ? (
          <EmptyState
            title="Selecione um extrato"
            description="As entradas importadas aparecem aqui."
          />
        ) : entries.length === 0 ? (
          <EmptyState
            title="Sem lançamentos"
            description="O extrato selecionado ainda não retornou entradas."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-3 py-3">Data</th>
                  <th className="px-3 py-3">Descrição</th>
                  <th className="px-3 py-3 text-right">Valor</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Movimento interno</th>
                  <th className="px-3 py-3">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => (
                  <tr key={entry.id} className="align-top">
                    <td className="px-3 py-3 text-slate-600">
                      {formatDate(entry.postedDate)}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-950">
                        {entry.description}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {entry.bankReference ||
                          entry.externalId ||
                          "Sem referencia"}
                      </p>
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-semibold ${
                        entry.type === "CREDIT"
                          ? "text-emerald-700"
                          : "text-rose-700"
                      }`}
                    >
                      {entry.type === "CREDIT" ? "+" : "-"}
                      {formatCurrency(entry.amount)}
                    </td>
                    <td className="px-3 py-3">
                      <DataPill tone={statusTone(entry.matchStatus)}>
                        {MATCH_LABEL[entry.matchStatus]}
                      </DataPill>
                    </td>
                    <td className="px-3 py-3 min-w-64">
                      {entry.matchedMovementId ? (
                        <FieldBox>
                          <p className="font-semibold text-slate-950">
                            {entry.matchedMovement?.description ||
                              entry.matchedMovementId}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatCurrency(
                              entry.matchedMovement?.amount || entry.amount,
                            )}
                          </p>
                        </FieldBox>
                      ) : (
                        <SelectInput
                          value={matchMovementByEntry[entry.id] || ""}
                          onChange={(event) =>
                            setMatchMovementByEntry((current) => ({
                              ...current,
                              [entry.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Selecionar movimento</option>
                          {unreconciledMovements
                            .filter(
                              (movement) =>
                                movement.type === entry.type &&
                                Number(movement.amount) ===
                                  Number(entry.amount),
                            )
                            .map((movement) => (
                              <option key={movement.id} value={movement.id}>
                                {formatDate(movement.movementDate)} -{" "}
                                {movement.description}
                              </option>
                            ))}
                        </SelectInput>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        {!entry.matchedMovementId &&
                        entry.matchStatus !== "IGNORED" ? (
                          <>
                            <button
                              type="button"
                              className={SECONDARY_BUTTON}
                              disabled={busyId === entry.id}
                              onClick={() => void manualMatch(entry)}
                            >
                              Conciliar
                            </button>
                            <button
                              type="button"
                              className={SECONDARY_BUTTON}
                              disabled={busyId === entry.id}
                              onClick={() => void createAdjustment(entry)}
                            >
                              Ajuste
                            </button>
                            <button
                              type="button"
                              className={DANGER_BUTTON}
                              disabled={busyId === entry.id}
                              onClick={() => void ignoreEntry(entry)}
                            >
                              Ignorar
                            </button>
                          </>
                        ) : null}
                        {entry.matchedMovementId ? (
                          <button
                            type="button"
                            className={DANGER_BUTTON}
                            disabled={busyId === entry.id}
                            onClick={() => void unmatch(entry)}
                          >
                            Desfazer
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard
          title="Resumo do período"
          description="Leitura consolidada do ledger e das pendências de conciliação."
        >
          {report ? (
            <div className="grid gap-3 md:grid-cols-2">
              <FieldBox>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  Entradas
                </p>
                <p className="mt-2 text-xl font-bold text-emerald-700">
                  {formatCurrency(report.totals.credits)}
                </p>
              </FieldBox>
              <FieldBox>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  Saídas
                </p>
                <p className="mt-2 text-xl font-bold text-rose-700">
                  {formatCurrency(report.totals.debits)}
                </p>
              </FieldBox>
              <FieldBox>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  Movimentos pendentes
                </p>
                <p className="mt-2 text-xl font-bold text-slate-950">
                  {report.totals.unreconciledMovements}
                </p>
              </FieldBox>
              <FieldBox>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  Fechamento
                </p>
                <p className="mt-2 text-xl font-bold text-slate-950">
                  {report.closing?.status === "CLOSED" ? "Fechado" : "Aberto"}
                </p>
              </FieldBox>
            </div>
          ) : (
            <EmptyState
              title="Relatório indisponível"
              description="Selecione uma conta para carregar a leitura do período."
            />
          )}
        </SectionCard>

        <SectionCard
          title="Divergências"
          description="Pendências abertas, resolvidas ou ignoradas durante a conciliação."
        >
          {!report?.issues.length ? (
            <EmptyState
              title="Nenhuma divergência registrada"
              description="As divergências geradas pelo matching aparecem aqui."
            />
          ) : (
            <div className="space-y-3">
              {report.issues.slice(0, 8).map((issue) => (
                <div
                  key={issue.id}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {issue.type}
                      </p>
                      <p className="mt-1 text-sm leading-5 text-slate-600">
                        {issue.reason}
                      </p>
                    </div>
                    <DataPill tone={statusTone(issue.status)}>
                      {issue.status === "OPEN"
                        ? "Aberta"
                        : issue.status === "RESOLVED"
                          ? "Resolvida"
                          : "Ignorada"}
                    </DataPill>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
