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
type FileType = "CSV" | "OFX" | "CNAB";
type ImportStatus =
  | "IMPORTED"
  | "PARTIALLY_RECONCILED"
  | "RECONCILED"
  | "CANCELLED";
type MatchStatus = "UNMATCHED" | "AUTO_MATCHED" | "MANUAL_MATCHED" | "IGNORED";
type IssueStatus = "OPEN" | "RESOLVED" | "IGNORED";
type ClosingStatus = "OPEN" | "CLOSED" | "REOPENED";

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
  profileId?: string | null;
  profile?: BankImportProfile | null;
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
  normalizedDescription?: string | null;
  normalizedDocumentNumber?: string | null;
  bankReference?: string | null;
  normalizedReference?: string | null;
  externalId?: string | null;
  matchStatus: MatchStatus;
  confidenceScore?: number | null;
  matchReason?: string | null;
  suggestedMovementId?: string | null;
  suggestionScore?: number | null;
  suggestionReason?: string | null;
  matchedMovementId?: string | null;
  matchedMovement?: BankMovement | null;
};

type BankImportProfile = {
  id: string;
  name: string;
  bankCode?: string | null;
  fileType: FileType;
  active: boolean;
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

type MatchCandidate = {
  movement: BankMovement;
  score: number;
  reason: string;
  canAutoMatch: boolean;
};

type ReconciliationReport = {
  bankAccount: BankAccount;
  period: { from: string; to: string };
  closing?: {
    id?: string;
    status: ClosingStatus;
    closedAt?: string | null;
    difference?: number;
    unreconciledMovementsCount?: number;
    unreconciledEntriesCount?: number;
    openIssuesCount?: number;
  } | null;
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
  balanceAudit?: {
    currentBalance: number;
    ledgerCalculatedBalance: number;
    difference: number;
    unreconciledMovements: number;
    reversedMovements: number;
    status: "OK" | "DIVERGENT";
  };
  issues: Array<{
    id: string;
    type: string;
    status: IssueStatus;
    reason: string;
    createdAt: string;
  }>;
};

type BankReconciliationClosing = {
  id: string;
  bankAccountId: string;
  year: number;
  month: number;
  status: ClosingStatus;
  difference: number;
  unreconciledMovementsCount: number;
  unreconciledEntriesCount: number;
  openIssuesCount: number;
  closedAt?: string | null;
  reopenedAt?: string | null;
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
  const [bankImportProfiles, setBankImportProfiles] = useState<
    BankImportProfile[]
  >([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [statementImports, setStatementImports] = useState<
    BankStatementImport[]
  >([]);
  const [bankClosings, setBankClosings] = useState<BankReconciliationClosing[]>(
    [],
  );
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
  const [suggestionsByEntry, setSuggestionsByEntry] = useState<
    Record<string, MatchCandidate[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const selectedImport = useMemo(
    () => statementImports.find((item) => item.id === selectedImportId) || null,
    [selectedImportId, statementImports],
  );

  const compatibleProfiles = useMemo(
    () =>
      bankImportProfiles.filter(
        (profile) => profile.active && profile.fileType === draft.fileType,
      ),
    [bankImportProfiles, draft.fileType],
  );

  const currentClosing = useMemo(() => {
    if (!report?.closing?.id) return null;
    return (
      bankClosings.find((closing) => closing.id === report.closing?.id) || null
    );
  }, [bankClosings, report?.closing?.id]);

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
    const [response, profilesResponse] = await Promise.all([
      apiFetch(apiUrl("/finance/bank-accounts"), {
        cache: "no-store",
      }),
      apiFetch(apiUrl("/finance/bank-import-profiles"), {
        cache: "no-store",
      }),
    ]);
    await readOrThrow(response, "Nao foi possivel carregar contas bancarias.");
    await readOrThrow(
      profilesResponse,
      "Nao foi possivel carregar perfis bancarios.",
    );
    const [accounts, profiles] = (await Promise.all([
      response.json(),
      profilesResponse.json(),
    ])) as [BankAccount[], BankImportProfile[]];
    setBankAccounts(accounts);
    setBankImportProfiles(profiles);
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
      const [importsRes, reportRes, movementsRes, closingsRes] =
        await Promise.all([
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
        apiFetch(
          apiUrl(
            `/finance/bank-reconciliation-closings?bankAccountId=${selectedBankAccountId}`,
          ),
          { cache: "no-store" },
        ),
      ]);

      await readOrThrow(importsRes, "Nao foi possivel carregar extratos.");
      await readOrThrow(reportRes, "Nao foi possivel carregar conciliacao.");
      await readOrThrow(movementsRes, "Nao foi possivel carregar movimentos.");
      await readOrThrow(
        closingsRes,
        "Nao foi possivel carregar fechamentos bancarios.",
      );

      const [nextImports, nextReport, movementPayload, nextClosings] =
        (await Promise.all([
        importsRes.json(),
        reportRes.json(),
        movementsRes.json(),
        closingsRes.json(),
      ])) as [
        BankStatementImport[],
        ReconciliationReport,
        { entries: BankMovement[] },
        BankReconciliationClosing[],
      ];

      setStatementImports(nextImports);
      setReport(nextReport);
      setMovements(movementPayload.entries || []);
      setBankClosings(nextClosings);
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
    setSuggestionsByEntry({});
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

  useEffect(() => {
    if (
      selectedProfileId &&
      !compatibleProfiles.some((profile) => profile.id === selectedProfileId)
    ) {
      setSelectedProfileId("");
    }
  }, [compatibleProfiles, selectedProfileId]);

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
          body: JSON.stringify({
            ...draft,
            profileId: selectedProfileId || undefined,
          }),
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
          body: JSON.stringify({
            dateWindowDays: 2,
            profileId: selectedImport?.profileId || selectedProfileId || undefined,
          }),
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

  async function loadSuggestions(entry: BankStatementEntry) {
    setBusyId(`suggestions-${entry.id}`);
    setError("");

    try {
      const response = await apiFetch(
        apiUrl(`/finance/bank-statement-entries/${entry.id}/suggestions`),
        { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha ao buscar sugestoes."),
        );
      }
      const payload = (await response.json()) as {
        candidates: MatchCandidate[];
      };
      setSuggestionsByEntry((current) => ({
        ...current,
        [entry.id]: payload.candidates,
      }));
      if (!payload.candidates.length) {
        setSuccessMessage("Nenhuma sugestao encontrada para este lancamento.");
      }
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Falha ao buscar sugestoes.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function manualMatch(
    entry: BankStatementEntry,
    movementIdOverride?: string | null,
  ) {
    const movementId = movementIdOverride || matchMovementByEntry[entry.id];
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

  async function closeCurrentBankReconciliation() {
    if (!selectedBankAccountId) return;
    const periodDate = new Date(`${filters.from}T00:00:00.000Z`);
    const reason = window.prompt("Motivo do fechamento bancario", "");
    if (!reason) return;
    const hasPending =
      (report?.totals.unmatchedStatementEntries || 0) > 0 ||
      (report?.totals.unreconciledMovements || 0) > 0 ||
      (report?.totals.openIssues || 0) > 0 ||
      Math.abs(report?.balanceAudit?.difference || 0) > 0.009;
    const allowOpenIssues = hasPending
      ? window.confirm(
          "Existem pendencias ou divergencia de saldo. Deseja fechar com ressalva registrada?",
        )
      : false;
    if (hasPending && !allowOpenIssues) return;

    setBusyId("close-bank-reconciliation");
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(
        apiUrl(
          `/finance/bank-accounts/${selectedBankAccountId}/reconciliation-closings/close`,
        ),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            year: periodDate.getUTCFullYear(),
            month: periodDate.getUTCMonth() + 1,
            reason,
            allowOpenIssues,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha ao fechar conciliacao."),
        );
      }
      setSuccessMessage("Fechamento bancario registrado.");
      await refreshAll();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Falha ao fechar conciliacao.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function reopenCurrentBankReconciliation() {
    const closingId = report?.closing?.id || currentClosing?.id;
    if (!closingId) return;
    const reason = window.prompt("Motivo para reabrir o fechamento", "");
    if (!reason) return;

    setBusyId("reopen-bank-reconciliation");
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(
        apiUrl(`/finance/bank-reconciliation-closings/${closingId}/reopen`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Falha ao reabrir conciliacao."),
        );
      }
      setSuccessMessage("Fechamento bancario reaberto.");
      await refreshAll();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Falha ao reabrir conciliacao.",
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
      {report?.balanceAudit ? (
        <StatusBanner
          tone={report.balanceAudit.status === "OK" ? "emerald" : "rose"}
        >
          Auditoria de saldo: conta{" "}
          {formatCurrency(report.balanceAudit.currentBalance)} | ledger{" "}
          {formatCurrency(report.balanceAudit.ledgerCalculatedBalance)} |
          diferenca {formatCurrency(report.balanceAudit.difference)}.
        </StatusBanner>
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
                        : event.target.value === "CNAB"
                          ? "extrato.rem"
                          : "extrato.csv",
                  }))
                }
              >
                <option value="CSV">CSV</option>
                <option value="OFX">OFX básico</option>
                <option value="CNAB">CNAB inicial</option>
              </SelectInput>
            </FormField>
            <FormField label="Perfil bancario">
              <SelectInput
                value={selectedProfileId}
                onChange={(event) => setSelectedProfileId(event.target.value)}
              >
                <option value="">Autodetectar colunas</option>
                {compatibleProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                    {profile.bankCode ? ` - ${profile.bankCode}` : ""}
                  </option>
                ))}
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
                      {statement.profile ? (
                        <p className="mt-1 text-xs text-slate-500">
                          Perfil: {statement.profile.name}
                        </p>
                      ) : null}
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
                      {entry.normalizedDescription ? (
                        <p className="mt-1 text-xs text-slate-400">
                          Normalizado: {entry.normalizedDescription}
                        </p>
                      ) : null}
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
                      {entry.confidenceScore ? (
                        <p className="mt-2 text-xs text-slate-500">
                          Score {Math.round(entry.confidenceScore * 100)}%
                        </p>
                      ) : null}
                      {entry.matchReason ? (
                        <p className="mt-1 max-w-44 text-xs leading-5 text-slate-500">
                          {entry.matchReason}
                        </p>
                      ) : null}
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
                        <div className="space-y-2">
                          {entry.suggestedMovementId ? (
                            <FieldBox>
                              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                                Sugestao
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-950">
                                {Math.round((entry.suggestionScore || 0) * 100)}
                                % - {entry.suggestionReason}
                              </p>
                            </FieldBox>
                          ) : null}
                          {(suggestionsByEntry[entry.id] || []).map(
                            (candidate) => (
                              <FieldBox key={candidate.movement.id}>
                                <p className="text-sm font-semibold text-slate-950">
                                  {candidate.movement.description}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {formatDate(candidate.movement.movementDate)}{" "}
                                  - {formatCurrency(candidate.movement.amount)}{" "}
                                  - {Math.round(candidate.score * 100)}%
                                </p>
                                <p className="mt-1 text-xs leading-5 text-slate-500">
                                  {candidate.reason}
                                </p>
                              </FieldBox>
                            ),
                          )}
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
                        </div>
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
                            {entry.suggestedMovementId ? (
                              <button
                                type="button"
                                className={SECONDARY_BUTTON}
                                disabled={busyId === entry.id}
                                onClick={() =>
                                  void manualMatch(
                                    entry,
                                    entry.suggestedMovementId,
                                  )
                                }
                              >
                                Aceitar sugestao
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={SECONDARY_BUTTON}
                              disabled={busyId === `suggestions-${entry.id}`}
                              onClick={() => void loadSuggestions(entry)}
                            >
                              Sugestoes
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
          actions={
            report?.closing?.status === "CLOSED" ? (
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={busyId === "reopen-bank-reconciliation"}
                onClick={() => void reopenCurrentBankReconciliation()}
              >
                Reabrir mes
              </button>
            ) : (
              <button
                type="button"
                className={PRIMARY_BUTTON}
                disabled={
                  !selectedBankAccountId ||
                  busyId === "close-bank-reconciliation"
                }
                onClick={() => void closeCurrentBankReconciliation()}
              >
                Fechar mes
              </button>
            )
          }
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
                {report.closing?.status === "CLOSED" ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDate(report.closing.closedAt)} | dif.{" "}
                    {formatCurrency(report.closing.difference || 0)}
                  </p>
                ) : null}
              </FieldBox>
              {currentClosing ? (
                <FieldBox>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                    Ressalvas do fechamento
                  </p>
                  <p className="mt-2 text-xl font-bold text-slate-950">
                    {currentClosing.unreconciledEntriesCount +
                      currentClosing.unreconciledMovementsCount +
                      currentClosing.openIssuesCount}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    entradas {currentClosing.unreconciledEntriesCount} |
                    movimentos {currentClosing.unreconciledMovementsCount} |
                    divergencias {currentClosing.openIssuesCount}
                  </p>
                </FieldBox>
              ) : null}
              {report.balanceAudit ? (
                <>
                  <FieldBox>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                      Saldo da conta
                    </p>
                    <p className="mt-2 text-xl font-bold text-slate-950">
                      {formatCurrency(report.balanceAudit.currentBalance)}
                    </p>
                  </FieldBox>
                  <FieldBox>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                      Diferenca ledger
                    </p>
                    <p
                      className={`mt-2 text-xl font-bold ${
                        report.balanceAudit.status === "OK"
                          ? "text-emerald-700"
                          : "text-rose-700"
                      }`}
                    >
                      {formatCurrency(report.balanceAudit.difference)}
                    </p>
                  </FieldBox>
                </>
              ) : null}
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
