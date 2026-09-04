"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, readApiErrorMessage } from "@/lib/api";

type UtilizationPayload = {
  generatedAt: string;
  periodDays: number;
  onlineWindowMinutes: number;
  summary: {
    onlineUsers: number;
    onlineSessions: number;
    internalOnline: number;
    clientOnline: number;
    registeredInternal: number;
    registeredClients: number;
    actions: number;
    attributedStorageBytes: number;
  };
  server: {
    uptimeSeconds: number;
    cpuCount: number;
    processCpuPercent: number;
    loadAverage: number[];
    processRssBytes: number;
    processHeapUsedBytes: number;
    processHeapTotalBytes: number;
    systemMemoryTotalBytes: number;
    systemMemoryUsedBytes: number;
    systemMemoryPercent: number;
    databaseBytes: number;
    storage: {
      driver: string;
      external: boolean;
      usedBytes: number | null;
      diskTotalBytes: number | null;
      diskFreeBytes: number | null;
    };
  };
  activityTrend: Array<{ day: string; actions: number }>;
  domains: Array<{ domain: string; actions: number }>;
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    department: string | null;
    company: string | null;
    online: boolean;
    sessions: number;
    visibleSessions: number;
    currentPath: string | null;
    lastSeenAt: string | null;
    actions: number;
    files: number;
    storageBytes: number;
    estimatedRamBytes: number;
  }>;
  notes: { online: string; memory: string; storage: string };
};

type Audience = "ALL" | "INTERNAL" | "CLIENT";
type Connection = "ALL" | "ONLINE" | "OFFLINE";

export default function StudioUtilizationPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<UtilizationPayload | null>(null);
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [query, setQuery] = useState("");
  const [audience, setAudience] = useState<Audience>("ALL");
  const [connection, setConnection] = useState<Connection>("ALL");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const response = await apiFetch(`/studio/utilization?days=${days}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Nao foi possivel carregar a utilizacao."),
        );
      }
      setPayload((await response.json()) as UtilizationPayload);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar utilizacao.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const intervalId = window.setInterval(() => void loadData(true), 30_000);
    return () => window.clearInterval(intervalId);
  }, [autoRefresh, loadData]);

  const users = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (payload?.users || []).filter((user) => {
      const isClient = user.role === "CLIENT";
      if (audience === "INTERNAL" && isClient) return false;
      if (audience === "CLIENT" && !isClient) return false;
      if (connection === "ONLINE" && !user.online) return false;
      if (connection === "OFFLINE" && user.online) return false;
      if (!term) return true;
      return [user.name, user.email, user.department, user.company, user.currentPath]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [audience, connection, payload, query]);

  const diskUsed = payload?.server.storage.diskTotalBytes != null && payload.server.storage.diskFreeBytes != null
    ? payload.server.storage.diskTotalBytes - payload.server.storage.diskFreeBytes
    : null;

  return (
    <div className="space-y-5">
      <header className="rounded-lg border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Studio / Observabilidade</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">Utilizacao do sistema</h1>
            <p className="mt-1 text-sm text-slate-600">Conexoes, atividade, arquivos e recursos da infraestrutura em uma leitura operacional.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => router.back()} className="min-h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Voltar</button>
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1" aria-label="Periodo analisado">
              {([7, 14, 30] as const).map((period) => (
                <button key={period} type="button" onClick={() => setDays(period)} className={`min-h-8 rounded-md px-3 text-xs font-bold ${days === period ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-white"}`}>{period} dias</button>
              ))}
            </div>
            <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} className="h-4 w-4 accent-blue-600" />
              Atualizar automaticamente
            </label>
            <button type="button" onClick={() => void loadData()} className="min-h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">Atualizar</button>
          </div>
        </div>
      </header>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}
      {loading && !payload ? <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">Carregando telemetria...</div> : null}

      {payload ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Metric label="Usuarios conectados" value={String(payload.summary.onlineUsers)} detail={`${payload.summary.onlineSessions} sessao(oes)`} accent="blue" />
            <Metric label="Equipe conectada" value={String(payload.summary.internalOnline)} detail={`${payload.summary.registeredInternal} contas ativas`} accent="cyan" />
            <Metric label="Clientes conectados" value={String(payload.summary.clientOnline)} detail={`${payload.summary.registeredClients} contas ativas`} accent="emerald" />
            <Metric label={`Acoes em ${days} dias`} value={payload.summary.actions.toLocaleString("pt-BR")} detail="eventos auditados" accent="amber" />
            <Metric label="Arquivos atribuidos" value={formatBytes(payload.summary.attributedStorageBytes)} detail="por autoria registrada" accent="violet" />
            <Metric label="Banco de dados" value={formatBytes(payload.server.databaseBytes)} detail={`API ativa ha ${formatDuration(payload.server.uptimeSeconds)}`} accent="slate" />
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="font-bold text-slate-950">Infraestrutura</h2><p className="mt-1 text-xs text-slate-500">Leitura real do processo da API e do servidor.</p></div>
                <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Operando</span>
              </div>
              <div className="grid gap-5 md:grid-cols-3">
                <ResourceBar label="Memoria do servidor" value={payload.server.systemMemoryUsedBytes} total={payload.server.systemMemoryTotalBytes} percent={payload.server.systemMemoryPercent} color="bg-blue-500" />
                <ResourceBar label="Disco da VPS" value={diskUsed} total={payload.server.storage.diskTotalBytes} color="bg-emerald-500" />
                <ResourceBar label="Heap da API" value={payload.server.processHeapUsedBytes} total={payload.server.processHeapTotalBytes} color="bg-amber-500" />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
                <SmallStat label="CPU da API" value={`${payload.server.processCpuPercent}%`} />
                <SmallStat label="Nucleos" value={String(payload.server.cpuCount)} />
                <SmallStat label="RSS da API" value={formatBytes(payload.server.processRssBytes)} />
                <SmallStat label="Arquivos locais" value={formatBytes(payload.server.storage.usedBytes)} />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-bold text-slate-950">Acoes por area</h2>
              <p className="mt-1 text-xs text-slate-500">Principais dominios no periodo selecionado.</p>
              <DomainChart items={payload.domains} />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="font-bold text-slate-950">Ritmo de utilizacao</h2><p className="mt-1 text-xs text-slate-500">Quantidade diaria de acoes registradas.</p></div>
              <span className="text-xs font-semibold text-slate-500">Atualizado em {formatDateTime(payload.generatedAt)}</span>
            </div>
            <ActivityChart items={payload.activityTrend} />
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
                <label className="flex-1 text-[11px] font-bold uppercase text-slate-500">Pesquisar usuario<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, e-mail, empresa, setor ou pagina..." className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium normal-case outline-none focus:border-blue-500" /></label>
                <label className="text-[11px] font-bold uppercase text-slate-500">Publico<select value={audience} onChange={(event) => setAudience(event.target.value as Audience)} className="mt-1.5 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium normal-case xl:w-44"><option value="ALL">Todos</option><option value="INTERNAL">Equipe interna</option><option value="CLIENT">Clientes</option></select></label>
                <label className="text-[11px] font-bold uppercase text-slate-500">Conexao<select value={connection} onChange={(event) => setConnection(event.target.value as Connection)} className="mt-1.5 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium normal-case xl:w-40"><option value="ALL">Todas</option><option value="ONLINE">Conectados</option><option value="OFFLINE">Sem conexao</option></select></label>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1040px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Conexao</th><th className="px-4 py-3">Pagina atual</th><th className="px-4 py-3 text-right">Acoes</th><th className="px-4 py-3 text-right">Arquivos</th><th className="px-4 py-3 text-right">Armazenamento</th><th className="px-4 py-3 text-right">RAM estimada</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => <tr key={user.id} className="hover:bg-slate-50/70"><td className="px-4 py-3"><p className="font-semibold text-slate-900">{user.name}</p><p className="text-xs text-slate-500">{user.company || user.department || user.email}</p></td><td className="px-4 py-3"><ConnectionStatus online={user.online} sessions={user.sessions} lastSeenAt={user.lastSeenAt} /></td><td className="max-w-[280px] truncate px-4 py-3 font-mono text-xs text-slate-600" title={user.currentPath || ""}>{user.currentPath || "-"}</td><td className="px-4 py-3 text-right font-semibold">{user.actions.toLocaleString("pt-BR")}</td><td className="px-4 py-3 text-right">{user.files}</td><td className="px-4 py-3 text-right">{formatBytes(user.storageBytes)}</td><td className="px-4 py-3 text-right">{user.online ? formatBytes(user.estimatedRamBytes) : "-"}</td></tr>)}
                  {!users.length ? <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">Nenhum usuario encontrado com estes filtros.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-3 text-xs text-slate-600 md:grid-cols-3">
            {[payload.notes.online, payload.notes.memory, payload.notes.storage].map((note) => <p key={note} className="rounded-lg border border-slate-200 bg-slate-50 p-3 leading-5">{note}</p>)}
          </section>
        </>
      ) : null}
    </div>
  );
}

const accentClasses = { blue: "border-t-blue-500", cyan: "border-t-cyan-500", emerald: "border-t-emerald-500", amber: "border-t-amber-500", violet: "border-t-violet-500", slate: "border-t-slate-500" };

function Metric({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: keyof typeof accentClasses }) {
  return <div className={`min-w-0 rounded-lg border border-slate-200 border-t-4 bg-white p-4 shadow-sm ${accentClasses[accent]}`}><p className="truncate text-[10px] font-bold uppercase text-slate-500">{label}</p><p className="mt-2 truncate text-2xl font-bold text-slate-950" title={value}>{value}</p><p className="mt-1 truncate text-xs text-slate-500">{detail}</p></div>;
}

function SmallStat({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] font-bold uppercase text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-900">{value}</p></div>; }

function ResourceBar({ label, value, total, percent, color }: { label: string; value: number | null; total: number | null; percent?: number; color: string }) {
  const calculated = percent ?? (value != null && total ? (value / total) * 100 : 0);
  return <div><div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-700">{label}</span><span className="text-xs font-semibold text-slate-500">{value == null || total == null ? "Indisponivel" : `${formatBytes(value)} / ${formatBytes(total)}`}</span></div><div className="h-2 overflow-hidden rounded bg-slate-100"><div className={`h-full rounded ${color}`} style={{ width: `${Math.min(100, Math.max(0, calculated))}%` }} /></div><p className="mt-1 text-right text-[10px] font-semibold text-slate-500">{value == null || total == null ? "-" : `${calculated.toFixed(1)}%`}</p></div>;
}

function ActivityChart({ items }: { items: Array<{ day: string; actions: number }> }) {
  const max = Math.max(1, ...items.map((item) => item.actions));
  return <div className="flex h-48 items-end gap-1 overflow-x-auto border-b border-slate-200 px-1 pt-4">{items.map((item, index) => <div key={item.day} className="group flex h-full min-w-5 flex-1 items-end justify-center" title={`${formatShortDate(item.day)}: ${item.actions} acoes`}><div className="relative w-full max-w-8 rounded-t bg-blue-500 transition hover:bg-blue-700" style={{ height: `${Math.max(3, (item.actions / max) * 100)}%` }}><span className="absolute -top-5 left-1/2 hidden -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-slate-700 group-hover:block">{item.actions}</span></div>{index % Math.max(1, Math.ceil(items.length / 8)) === 0 ? <span className="absolute mt-5 text-[9px] text-slate-400">{formatShortDate(item.day)}</span> : null}</div>)}</div>;
}

function DomainChart({ items }: { items: Array<{ domain: string; actions: number }> }) {
  const max = Math.max(1, ...items.map((item) => item.actions));
  return <div className="mt-5 space-y-3">{items.length ? items.map((item) => <div key={item.domain}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate font-semibold text-slate-700">{domainLabel(item.domain)}</span><span className="font-bold text-slate-900">{item.actions}</span></div><div className="h-1.5 overflow-hidden rounded bg-slate-100"><div className="h-full rounded bg-cyan-500" style={{ width: `${(item.actions / max) * 100}%` }} /></div></div>) : <p className="py-8 text-center text-sm text-slate-500">Ainda nao ha acoes no periodo.</p>}</div>;
}

function ConnectionStatus({ online, sessions, lastSeenAt }: { online: boolean; sessions: number; lastSeenAt: string | null }) { return <div><span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold ${online ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}><span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-slate-400"}`} />{online ? "Conectado" : "Sem conexao"}</span><p className="mt-1 text-[10px] text-slate-500">{online ? `${sessions} sessao(oes)` : lastSeenAt ? formatDateTime(lastSeenAt) : "Sem atividade recente"}</p></div>; }

function formatBytes(value: number | null | undefined) { if (value == null) return "Indisponivel"; if (value < 1024) return `${value} B`; const units = ["KB", "MB", "GB", "TB"]; let size = value / 1024; let index = 0; while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; } return `${size.toLocaleString("pt-BR", { maximumFractionDigits: size >= 10 ? 1 : 2 })} ${units[index]}`; }
function formatDuration(seconds: number) { const days = Math.floor(seconds / 86400); const hours = Math.floor((seconds % 86400) / 3600); return days ? `${days}d ${hours}h` : `${hours}h`; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function formatShortDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
function domainLabel(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()); }
