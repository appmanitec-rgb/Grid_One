"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getAccessFromToken } from "@/lib/access";
import { apiFetch, readApiErrorMessage } from "@/lib/api";

type AuditLog = {
  id: string;
  domain: string;
  entityType: string;
  entityId: string;
  action: string;
  reason?: string | null;
  createdAt: string;
  actorUser?: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
};

const DOMAINS = [
  "ALL",
  "USERS",
  "MAINTENANCE_ORDERS",
  "PROPOSALS",
  "CONTRACTS",
  "INVENTORY",
  "PURCHASE_ORDERS",
  "FINANCE",
  "PEOPLE",
  "OPPORTUNITIES",
  "TICKETS",
  "SERVICE_REPORTS",
];

export default function StudioHistoryPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [access, setAccess] = useState(() => getAccessFromToken());

  useEffect(() => {
    setAccess(getAccessFromToken());
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (domain !== "ALL") params.set("domain", domain);
      const response = await apiFetch(`/studio/history?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Nao foi possivel carregar o historico."),
        );
      }
      const payload = await response.json();
      setLogs(Array.isArray(payload) ? payload : []);
    } catch (loadError: unknown) {
      setLogs([]);
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar historico.");
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const filteredLogs = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return logs;
    return logs.filter((log) =>
      [
        log.domain,
        log.entityType,
        log.entityId,
        log.action,
        log.reason,
        log.actorUser?.name,
        log.actorUser?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [logs, query]);

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/dashboard/developer/data");
  }

  if (!access.studio.auditView && !access.audit.read) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Voltar
        </button>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-900">
          Seu perfil nao possui permissao para visualizar o historico do Manitec Studio.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_24px_54px_-42px_rgba(15,23,42,0.28)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Manitec Studio
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">
              Historico
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Eventos auditados pelo sistema. Edicoes feitas pelo Studio devem ficar rastreaveis por usuario, registro e origem nas proximas etapas.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_240px_auto] lg:items-end">
          <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Buscar evento
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Acao, usuario, entidade ou ID..."
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium normal-case text-slate-800 outline-none focus:border-blue-500"
            />
          </label>
          <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Dominio
            <select
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium normal-case text-slate-800"
            >
              {DOMAINS.map((item) => (
                <option key={item} value={item}>
                  {item === "ALL" ? "Todos" : item}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void loadLogs()}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Atualizar
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-sm text-slate-500">
                <th className="p-4 font-semibold">Data</th>
                <th className="p-4 font-semibold">Usuario</th>
                <th className="p-4 font-semibold">Dominio</th>
                <th className="p-4 font-semibold">Entidade</th>
                <th className="p-4 font-semibold">Acao</th>
                <th className="p-4 font-semibold">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Carregando historico...
                  </td>
                </tr>
              ) : null}
              {!loading && filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap p-4 text-sm text-slate-700">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="p-4 text-sm text-slate-700">
                    <p className="font-semibold">{log.actorUser?.name || "Sistema"}</p>
                    <p className="text-xs text-slate-500">{log.actorUser?.email || "-"}</p>
                  </td>
                  <td className="p-4 text-sm font-semibold text-slate-700">{log.domain}</td>
                  <td className="p-4 text-sm text-slate-700">
                    <p className="font-semibold">{log.entityType}</p>
                    <p className="max-w-[220px] truncate text-xs text-slate-500">{log.entityId}</p>
                  </td>
                  <td className="p-4 text-sm font-semibold text-slate-800">{log.action}</td>
                  <td className="max-w-md p-4 text-sm text-slate-600">{log.reason || "-"}</td>
                </tr>
              ))}
              {!loading && filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Nenhum evento encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
