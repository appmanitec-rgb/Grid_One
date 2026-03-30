"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";

type AutomationRun = {
  id: string;
  mode: "FULL" | "LIGHT";
  trigger: string;
  status: "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  summary?: Record<string, unknown> | null;
  requestedByUser?: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
};

type AutomationStatusResponse = {
  isRunning: boolean;
  config: {
    enabled: boolean;
    runOnBoot: boolean;
    hourlyEnabled: boolean;
    timezone: string;
    dailyCron: string;
    hourlyCron: string;
    preventiveDaysAhead: number;
  };
  currentRun?: AutomationRun | null;
  lastRun?: AutomationRun | null;
  lastSuccess?: AutomationRun | null;
  lastFailure?: AutomationRun | null;
  totals: {
    total: number;
    running: number;
    success: number;
    failed: number;
    skipped: number;
  };
};

const AUTO_REFRESH_MS = 30_000;

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

function formatDuration(value?: number | null) {
  if (!value && value !== 0) return "-";
  if (value < 1000) return `${value} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes} min ${remainingSeconds}s`;
}

function formatMode(mode: AutomationRun["mode"]) {
  return mode === "FULL" ? "Completa" : "Leve";
}

function formatStatus(status: AutomationRun["status"]) {
  switch (status) {
    case "RUNNING":
      return "Em execucao";
    case "SUCCESS":
      return "Sucesso";
    case "FAILED":
      return "Falhou";
    case "SKIPPED":
      return "Ignorada";
    default:
      return status;
  }
}

function statusClass(status: AutomationRun["status"]) {
  switch (status) {
    case "RUNNING":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "SUCCESS":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "FAILED":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "SKIPPED":
      return "border-amber-200 bg-amber-50 text-amber-800";
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-700";
  }
}

function formatTrigger(trigger: string) {
  const labels: Record<string, string> = {
    startup: "Inicializacao",
    "cron:daily": "Cron diario",
    "cron:hourly": "Cron horario",
    "manual:full": "Manual completa",
    "manual:light": "Manual leve",
  };
  return labels[trigger] || trigger;
}

function summarizeRun(run?: AutomationRun | null) {
  if (!run?.summary || typeof run.summary !== "object") {
    return run?.errorMessage || "-";
  }

  const parts: string[] = [];
  for (const [key, value] of Object.entries(run.summary).slice(0, 4)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = Object.entries(value as Record<string, unknown>)
        .slice(0, 2)
        .map(([nestedKey, nestedValue]) => `${nestedKey}=${String(nestedValue)}`)
        .join(", ");
      parts.push(`${key}: ${nested}`);
      continue;
    }

    parts.push(`${key}: ${String(value)}`);
  }

  return parts.join(" | ") || "-";
}

export default function AutomationPage() {
  const [status, setStatus] = useState<AutomationStatusResponse | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [triggeringMode, setTriggeringMode] = useState<"full" | "light" | null>(
    null,
  );

  async function loadData(silent = false) {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [statusRes, runsRes] = await Promise.all([
        apiFetch(apiUrl("/automation/status"), { cache: "no-store" }),
        apiFetch(apiUrl("/automation/runs?take=25"), { cache: "no-store" }),
      ]);

      if (!statusRes.ok) {
        throw new Error(
          await readApiErrorMessage(
            statusRes,
            "Nao foi possivel carregar o status das automacoes.",
          ),
        );
      }

      if (!runsRes.ok) {
        throw new Error(
          await readApiErrorMessage(
            runsRes,
            "Nao foi possivel carregar o historico das automacoes.",
          ),
        );
      }

      setStatus((await statusRes.json()) as AutomationStatusResponse);
      setRuns((await runsRes.json()) as AutomationRun[]);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Nao foi possivel carregar a central de automacoes.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadData();

    const intervalId = window.setInterval(() => {
      void loadData(true);
    }, AUTO_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  async function triggerRun(mode: "full" | "light") {
    setTriggeringMode(mode);
    setError("");
    setNotice("");

    try {
      const res = await apiFetch(apiUrl(`/automation/run/${mode}`), {
        method: "POST",
      });
      const body = (await res.json().catch(() => null)) as
        | {
            status?: string;
            reason?: string;
            errorMessage?: string;
            durationMs?: number;
          }
        | null;

      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Nao foi possivel disparar a automacao."),
        );
      }

      if (body?.status === "SKIPPED") {
        setNotice("Execucao ignorada porque ja existe uma automacao em andamento.");
      } else if (body?.status === "FAILED") {
        setError(body.errorMessage || "A automacao terminou com falha.");
      } else {
        const label = mode === "full" ? "completa" : "leve";
        setNotice(
          `Automacao ${label} concluida${
            body?.durationMs ? ` em ${formatDuration(body.durationMs)}` : ""
          }.`,
        );
      }

      await loadData(true);
    } catch (triggerError: unknown) {
      setError(
        triggerError instanceof Error
          ? triggerError.message
          : "Nao foi possivel disparar a automacao.",
      );
    } finally {
      setTriggeringMode(null);
    }
  }

  return (
    <div className="space-y-6 p-6 md:p-8">
      <section className="rounded-[30px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_34%),radial-gradient(circle_at_85%_18%,_rgba(14,116,144,0.16),_transparent_32%),linear-gradient(135deg,#f8fafc_0%,#eef8f7_55%,#ffffff_100%)] p-6 shadow-[0_24px_70px_-45px_rgba(15,23,42,0.45)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
              Fase 2
            </span>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
              Central de Automacoes
            </h1>
            <p className="mt-2 text-sm text-slate-600 md:text-base">
              Historico, saude e disparo manual das rotinas que sustentam contratos, faturamento e inadimplencia.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Status atual"
              value={status?.isRunning ? "Em execucao" : "Disponivel"}
              hint={refreshing ? "Atualizando..." : `Sync a cada ${AUTO_REFRESH_MS / 1000}s`}
            />
            <MetricCard
              label="Execucoes"
              value={String(status?.totals.total ?? 0)}
              hint="Historico total"
            />
            <MetricCard
              label="Sucessos"
              value={String(status?.totals.success ?? 0)}
              hint="Rotinas concluidas"
            />
            <MetricCard
              label="Falhas"
              value={String(status?.totals.failed ?? 0)}
              hint="Exigem revisao"
            />
          </div>
        </div>
      </section>

      {notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_380px]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">Disparo manual</h2>
              <p className="mt-1 text-sm text-slate-500">
                Execute as rotinas sob demanda e acompanhe o retorno sem depender do log do servidor.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadData(true)}
              disabled={loading || refreshing}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {refreshing ? "Atualizando..." : "Atualizar agora"}
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <ActionCard
              title="Automacao completa"
              description="Sincroniza inadimplencia, preventiva, recebiveis e vencimentos do financeiro."
              disabled={loading || status?.isRunning || triggeringMode !== null}
              busy={triggeringMode === "full"}
              onClick={() => void triggerRun("full")}
            />
            <ActionCard
              title="Automacao leve"
              description="Roda a versao horaria, focada em inadimplencia e sincronizacao de recebiveis."
              disabled={loading || status?.isRunning || triggeringMode !== null}
              busy={triggeringMode === "light"}
              onClick={() => void triggerRun("light")}
            />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ConfigPill label="Timezone" value={status?.config.timezone || "-"} />
            <ConfigPill label="Cron diario" value={status?.config.dailyCron || "-"} />
            <ConfigPill label="Cron horario" value={status?.config.hourlyCron || "-"} />
            <ConfigPill
              label="Preventiva"
              value={`${status?.config.preventiveDaysAhead ?? 0} dias`}
            />
          </div>
        </section>

        <section className="space-y-4">
          <RunHighlight
            title="Execucao atual"
            run={status?.currentRun || null}
            emptyMessage="Nenhuma automacao em execucao neste momento."
          />
          <RunHighlight
            title="Ultimo sucesso"
            run={status?.lastSuccess || null}
            emptyMessage="Nenhuma execucao concluida com sucesso ainda."
          />
          <RunHighlight
            title="Ultima falha"
            run={status?.lastFailure || null}
            emptyMessage="Nenhuma falha registrada no historico."
          />
        </section>
      </div>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">Historico recente</h2>
            <p className="mt-1 text-sm text-slate-500">
              Ultimas 25 execucoes com modo, gatilho, responsavel e resumo do que aconteceu.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {runs.length} registros exibidos
          </span>
        </div>

        {loading ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Carregando central de automacoes...
          </div>
        ) : runs.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Nenhuma execucao registrada ainda.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-3 py-3">Modo</th>
                  <th className="px-3 py-3">Gatilho</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Inicio</th>
                  <th className="px-3 py-3">Duracao</th>
                  <th className="px-3 py-3">Responsavel</th>
                  <th className="px-3 py-3">Resumo</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-slate-100 align-top">
                    <td className="px-3 py-3 font-semibold text-slate-900">
                      {formatMode(run.mode)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {formatTrigger(run.trigger)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(run.status)}`}
                      >
                        {formatStatus(run.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      <p>{formatDateTime(run.startedAt)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        fim: {formatDateTime(run.finishedAt)}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {formatDuration(run.durationMs)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {run.requestedByUser ? (
                        <>
                          <p className="font-semibold text-slate-900">
                            {run.requestedByUser.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {run.requestedByUser.role}
                          </p>
                        </>
                      ) : (
                        <span className="text-slate-500">Sistema</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      <p className="max-w-[420px] whitespace-pre-wrap text-xs leading-5 text-slate-600">
                        {summarizeRun(run)}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white/85 px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function ActionCard({
  title,
  description,
  disabled,
  busy,
  onClick,
}: {
  title: string;
  description: string;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_100%)] p-4">
      <p className="text-base font-black text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="mt-4 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Executando..." : "Executar agora"}
      </button>
    </div>
  );
}

function ConfigPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function RunHighlight({
  title,
  run,
  emptyMessage,
}: {
  title: string;
  run: AutomationRun | null;
  emptyMessage: string;
}) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-black text-slate-950">{title}</p>
      {!run ? (
        <p className="mt-2 text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(run.status)}`}
            >
              {formatStatus(run.status)}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {formatMode(run.mode)}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {formatTrigger(run.trigger)}
            </span>
          </div>
          <p className="text-sm text-slate-700">
            Inicio: <span className="font-semibold text-slate-900">{formatDateTime(run.startedAt)}</span>
          </p>
          <p className="text-sm text-slate-700">
            Duracao: <span className="font-semibold text-slate-900">{formatDuration(run.durationMs)}</span>
          </p>
          <p className="text-xs leading-5 text-slate-600">{summarizeRun(run)}</p>
        </div>
      )}
    </section>
  );
}
