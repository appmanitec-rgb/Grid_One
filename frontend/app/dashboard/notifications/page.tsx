"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearAuthSession,
  decodeJwtPayload,
  getStoredAccessToken,
} from "@/lib/auth-session";
import {
  fetchDashboardNotificationInbox,
  labelDashboardNotificationCategory,
  labelDashboardNotificationPriority,
  type DashboardNotificationApiError,
  type DashboardNotificationCategory,
  type DashboardNotificationInbox,
  type DashboardNotificationItem,
  type DashboardNotificationPriority,
  type DashboardNotificationTone,
} from "@/lib/dashboard-notifications";
import {
  DataPill,
  EmptyState,
  FieldBox,
  PageHero,
  SectionCard,
  SelectInput,
  StatusBanner,
  TextInput,
} from "../components/DashboardPageKit";

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50";

const EMPTY_SUMMARY = {
  total: 0,
  actionRequired: 0,
  highPriority: 0,
  byCategory: {
    approval: 0,
    proposal: 0,
    contract: 0,
    order: 0,
    finance: 0,
    update: 0,
  },
};

const CATEGORY_OPTIONS: Array<{
  value: "ALL" | DashboardNotificationCategory;
  label: string;
}> = [
  { value: "ALL", label: "Todas as categorias" },
  { value: "approval", label: "Aprovacoes" },
  { value: "proposal", label: "Propostas" },
  { value: "contract", label: "Contratos" },
  { value: "order", label: "Ordens" },
  { value: "finance", label: "Financeiro" },
  { value: "update", label: "Atualizacoes" },
];

const PRIORITY_OPTIONS: Array<{
  value: "ALL" | DashboardNotificationPriority;
  label: string;
}> = [
  { value: "ALL", label: "Todas as prioridades" },
  { value: "high", label: "Alta" },
  { value: "medium", label: "Media" },
  { value: "low", label: "Baixa" },
];

const TONE_CARD_STYLES: Record<DashboardNotificationTone, string> = {
  blue: "border-sky-200 bg-[linear-gradient(180deg,rgba(248,251,255,0.96),rgba(240,247,255,0.92))]",
  emerald:
    "border-emerald-200 bg-[linear-gradient(180deg,rgba(247,253,250,0.96),rgba(238,251,244,0.92))]",
  amber:
    "border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,244,0.96),rgba(255,246,233,0.92))]",
  rose: "border-rose-200 bg-[linear-gradient(180deg,rgba(255,248,249,0.96),rgba(255,239,241,0.92))]",
  slate:
    "border-slate-200 bg-[linear-gradient(180deg,rgba(252,253,255,0.96),rgba(245,248,252,0.92))]",
};

export default function NotificationsPage() {
  const router = useRouter();
  const [inbox, setInbox] = useState<DashboardNotificationInbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    "ALL" | DashboardNotificationCategory
  >("ALL");
  const [priorityFilter, setPriorityFilter] = useState<
    "ALL" | DashboardNotificationPriority
  >("ALL");

  const viewerRole = useMemo(() => {
    const token = getStoredAccessToken();
    if (!token) return "NORMAL";
    const payload = decodeJwtPayload<{ role?: string }>(token);
    return payload?.role || "NORMAL";
  }, []);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const payload = await fetchDashboardNotificationInbox(48);
      setInbox(payload);
    } catch (loadError: unknown) {
      const apiError = loadError as DashboardNotificationApiError;
      if (apiError?.status === 401) {
        clearAuthSession();
        router.replace("/");
        return;
      }

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar as notificacoes.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  const summary = inbox?.summary || EMPTY_SUMMARY;

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();

    return (inbox?.items || []).filter((item) => {
      if (categoryFilter !== "ALL" && item.category !== categoryFilter) {
        return false;
      }

      if (priorityFilter !== "ALL" && item.priority !== priorityFilter) {
        return false;
      }

      if (!term) {
        return true;
      }

      return (
        item.title.toLowerCase().includes(term) ||
        item.message.toLowerCase().includes(term) ||
        item.actionLabel?.toLowerCase().includes(term) ||
        item.statusLabel?.toLowerCase().includes(term)
      );
    });
  }, [categoryFilter, inbox?.items, priorityFilter, query]);

  const stats = useMemo(
    () => [
      {
        label: "Alertas ativos",
        value: String(summary.total),
        helper: "Fila consolidada do momento.",
        tone: "blue" as const,
      },
      {
        label: "Pedem acao",
        value: String(summary.actionRequired),
        helper: "Itens que merecem retorno.",
        tone: "amber" as const,
      },
      {
        label: "Criticos",
        value: String(summary.highPriority),
        helper: "Prioridade alta.",
        tone: "rose" as const,
      },
      {
        label: "Financeiro",
        value: String(summary.byCategory.finance),
        helper: "Cobranca e exposicao.",
        tone: "emerald" as const,
      },
    ],
    [summary],
  );

  const backAction =
    viewerRole === "CLIENT"
      ? { href: "/dashboard/client-portal", label: "Voltar ao portal" }
      : { href: "/dashboard", label: "Voltar ao painel" };

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Alertas"
        title="Central de notificacoes"
        description="Aprovacoes, operacao, comercial e cobranca em uma fila unica."
        stats={stats}
        actions={
          <>
            <button
              type="button"
              onClick={() => void loadInbox()}
              className={SECONDARY_BUTTON}
            >
              Atualizar fila
            </button>
            <Link href={backAction.href} className={PRIMARY_BUTTON}>
              {backAction.label}
            </Link>
          </>
        }
        aside={
          <FieldBox className="space-y-3 rounded-[28px] border-white/60 bg-white/80 p-5 shadow-[0_22px_60px_-40px_rgba(15,31,50,0.45)]">
            <div className="flex flex-wrap items-center gap-2">
              <DataPill tone={summary.highPriority > 0 ? "rose" : "emerald"}>
                {summary.highPriority > 0
                  ? `${summary.highPriority} critic${summary.highPriority > 1 ? "os" : "o"}`
                  : "Tudo em dia"}
              </DataPill>
              <DataPill tone="slate">{filteredItems.length} visivel(is)</DataPill>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              {viewerRole === "CLIENT"
                ? "Seu feed prioriza propostas, atendimento e cobranca."
                : "Seu feed junta aprovacoes, carteira, execucao e financeiro."}
            </p>
          </FieldBox>
        }
      />

      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}

      {!error && !loading && summary.highPriority > 0 ? (
        <StatusBanner tone="amber">
          {summary.highPriority} item(ns) de alta prioridade merecem resposta imediata.
        </StatusBanner>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.85fr)]">
        <SectionCard
          eyebrow="Fila"
          title="Itens recentes"
          description="Use busca e filtros para chegar no que pede resposta agora."
          actions={
            <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[720px] xl:flex-row xl:items-center xl:justify-end">
              <TextInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por titulo, mensagem ou status..."
                className="xl:min-w-[280px]"
              />
              <SelectInput
                value={categoryFilter}
                onChange={(event) =>
                  setCategoryFilter(
                    event.target.value as "ALL" | DashboardNotificationCategory,
                  )
                }
                className="xl:w-[210px]"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectInput>
              <SelectInput
                value={priorityFilter}
                onChange={(event) =>
                  setPriorityFilter(
                    event.target.value as "ALL" | DashboardNotificationPriority,
                  )
                }
                className="xl:w-[190px]"
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectInput>
            </div>
          }
        >
          {loading ? (
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-10 text-sm text-slate-500">
              Carregando alertas...
            </div>
          ) : filteredItems.length === 0 ? (
            <EmptyState
              title="Nenhum alerta encontrado"
              description="Ajuste os filtros ou aguarde novas movimentacoes."
            />
          ) : (
            <div className="space-y-3">
              {filteredItems.map((item) => (
                <NotificationCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          eyebrow="Radar"
          title="Leitura rapida"
          description="Distribuicao do feed por frente do negocio."
        >
          <div className="space-y-3">
            <RadarLine
              label="Aprovacoes"
              value={summary.byCategory.approval}
              tone="amber"
            />
            <RadarLine
              label="Propostas"
              value={summary.byCategory.proposal}
              tone="blue"
            />
            <RadarLine
              label="Contratos"
              value={summary.byCategory.contract}
              tone="emerald"
            />
            <RadarLine label="Ordens" value={summary.byCategory.order} tone="slate" />
            <RadarLine
              label="Financeiro"
              value={summary.byCategory.finance}
              tone="rose"
            />
            <RadarLine
              label="Atualizacoes"
              value={summary.byCategory.update}
              tone="blue"
            />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function NotificationCard({ item }: { item: DashboardNotificationItem }) {
  return (
    <article
      className={`rounded-[24px] border p-4 shadow-[0_22px_48px_-38px_rgba(15,23,42,0.25)] ${TONE_CARD_STYLES[item.tone]}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <DataPill tone={item.tone}>
              {labelDashboardNotificationCategory(item.category)}
            </DataPill>
            <DataPill tone={priorityToTone(item.priority)}>
              {labelDashboardNotificationPriority(item.priority)}
            </DataPill>
            {item.statusLabel ? (
              <DataPill tone="slate">{item.statusLabel}</DataPill>
            ) : null}
          </div>
          <h3 className="mt-3 text-lg font-bold text-slate-950">{item.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{item.message}</p>
        </div>

        <div className="min-w-[110px] text-right">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Atualizado
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {formatNotificationDate(item.createdAt)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link href={item.href} className={PRIMARY_BUTTON}>
          {item.actionLabel || "Abrir"}
        </Link>
        <span className="text-xs text-slate-500">
          {item.entityType.replaceAll("_", " ")}
        </span>
      </div>
    </article>
  );
}

function RadarLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: DashboardNotificationTone;
}) {
  return (
    <FieldBox className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
          {label}
        </p>
        <p className="mt-1 text-sm text-slate-600">Volume atual da fila.</p>
      </div>
      <DataPill tone={tone}>{value}</DataPill>
    </FieldBox>
  );
}

function priorityToTone(priority: DashboardNotificationPriority): DashboardNotificationTone {
  if (priority === "high") return "rose";
  if (priority === "medium") return "amber";
  return "slate";
}

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
