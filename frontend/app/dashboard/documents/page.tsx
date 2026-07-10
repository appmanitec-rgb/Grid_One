"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { clearAuthSession } from "@/lib/auth-session";
import {
  fetchDocumentsHub,
  labelDocumentKind,
  labelDocumentState,
  type DashboardDocumentHubItem,
  type DashboardDocumentKind,
  type DashboardDocumentsApiError,
  type DashboardDocumentsHub,
} from "@/lib/dashboard-documents";
import {
  DataPill,
  EmptyState,
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

const KIND_OPTIONS: Array<{ value: "ALL" | DashboardDocumentKind; label: string }> =
  [
    { value: "ALL", label: "Todos os tipos" },
    { value: "proposal", label: "Propostas" },
    { value: "contract", label: "Contratos" },
    { value: "order", label: "Ordens" },
  ];

export default function DocumentsPage() {
  const router = useRouter();
  const [hub, setHub] = useState<DashboardDocumentsHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"ALL" | DashboardDocumentKind>(
    "ALL",
  );

  const loadHub = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const payload = await fetchDocumentsHub();
      setHub(payload);
    } catch (loadError: unknown) {
      const apiError = loadError as DashboardDocumentsApiError;
      if (apiError?.status === 401) {
        clearAuthSession();
        router.replace("/");
        return;
      }

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar a central documental.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadHub();
  }, [loadHub]);

  const allItems = useMemo(
    () =>
      hub
        ? [...hub.sections.proposals, ...hub.sections.contracts, ...hub.sections.orders].sort(
            (left, right) =>
              new Date(right.updatedAt).getTime() -
              new Date(left.updatedAt).getTime(),
          )
        : [],
    [hub],
  );

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();

    return allItems.filter((item) => {
      if (kindFilter !== "ALL" && item.kind !== kindFilter) {
        return false;
      }

      if (!term) {
        return true;
      }

      return (
        item.title.toLowerCase().includes(term) ||
        item.counterpart.toLowerCase().includes(term) ||
        item.statusLabel.toLowerCase().includes(term) ||
        item.code.toLowerCase().includes(term)
      );
    });
  }, [allItems, kindFilter, query]);

  const summary = hub?.summary || {
    total: 0,
    ready: 0,
    attention: 0,
    pending: 0,
    shared: 0,
    byKind: { proposal: 0, contract: 0, order: 0 },
  };

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Documentos"
        title="Central documental"
        description="Versoes prontas para imprimir, salvar em PDF e compartilhar com clareza."
        stats={[
          {
            label: "Total",
            value: String(summary.total),
            helper: "Base documental visivel no seu escopo.",
            tone: "blue",
          },
          {
            label: "Prontos",
            value: String(summary.ready),
            helper: "Itens ja maduros para envio.",
            tone: "emerald",
          },
          {
            label: "Em atencao",
            value: String(summary.attention),
            helper: "Pedem revisao ou alinhamento.",
            tone: "amber",
          },
          {
            label: "Pendentes",
            value: String(summary.pending),
            helper: "Faltam dados para fechar o documento.",
            tone: "rose",
          },
        ]}
        actions={
          <>
            <button type="button" onClick={() => void loadHub()} className={SECONDARY_BUTTON}>
              Atualizar central
            </button>
            <Link href="/dashboard/deliveries" className={SECONDARY_BUTTON}>
              Historico de envios
            </Link>
            <Link href="/dashboard" className={PRIMARY_BUTTON}>
              Voltar ao painel
            </Link>
          </>
        }
      />

      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}

      <SectionCard
        eyebrow="Fila documental"
        title="Buscar e abrir versoes"
        description="Cada card entrega uma copia preparada para impressao e o atalho para o cadastro original."
        actions={
          <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[640px] xl:flex-row xl:items-center xl:justify-end">
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por codigo, cliente ou status..."
              className="xl:min-w-[280px]"
            />
            <SelectInput
              value={kindFilter}
              onChange={(event) =>
                setKindFilter(event.target.value as "ALL" | DashboardDocumentKind)
              }
              className="xl:w-[220px]"
            >
              {KIND_OPTIONS.map((option) => (
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
            Carregando documentos...
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState
            title="Nenhum documento encontrado"
            description="Ajuste a busca ou aguarde novas movimentacoes na operacao."
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredItems.map((item) => (
              <DocumentCard key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function DocumentCard({ item }: { item: DashboardDocumentHubItem }) {
  return (
    <article className="rounded-[24px] border border-slate-200 bg-white/92 p-4 shadow-[0_22px_48px_-38px_rgba(15,23,42,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <DataPill tone="slate">{labelDocumentKind(item.kind)}</DataPill>
            <DataPill tone={stateTone(item.documentState)}>
              {labelDocumentState(item.documentState)}
            </DataPill>
            <DataPill tone="blue">{item.statusLabel}</DataPill>
          </div>
          <h3 className="mt-3 text-lg font-bold text-slate-950">{item.title}</h3>
          <p className="mt-1 text-sm text-slate-600">{item.counterpart}</p>
        </div>
        <p className="text-sm font-semibold text-slate-500">
          {formatDateTime(item.updatedAt)}
        </p>
      </div>

      {item.issues.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {item.issues.map((issue) => (
            <DataPill key={issue} tone={stateTone(item.documentState)}>
              {issue}
            </DataPill>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <Link href={item.href} className={PRIMARY_BUTTON}>
          Abrir copia
        </Link>
        <Link href={item.sourceHref} className={SECONDARY_BUTTON}>
          Abrir cadastro
        </Link>
      </div>
    </article>
  );
}

function stateTone(state: DashboardDocumentHubItem["documentState"]) {
  if (state === "ready") return "emerald" as const;
  if (state === "attention") return "amber" as const;
  return "rose" as const;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
