"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { clearAuthSession } from "@/lib/auth-session";
import { decodeToken } from "@/lib/access";
import {
  fetchDeliveryHistory,
  labelDeliveryChannel,
  labelDeliveryDocumentType,
  labelDeliveryStatus,
  retryDocumentDelivery,
  type DeliveriesApiError,
  type DeliveryChannel,
  type DocumentDeliveryHistory,
} from "@/lib/document-deliveries";
import {
  DataPill,
  EmptyState,
  PageHero,
  SectionCard,
  SelectInput,
  StatusBanner,
  TextInput,
} from "../components/DashboardPageKit";

const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50";

export default function DeliveriesPage() {
  const router = useRouter();
  const [history, setHistory] = useState<DocumentDeliveryHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [retryingId, setRetryingId] = useState("");
  const [channelFilter, setChannelFilter] = useState<"ALL" | DeliveryChannel>(
    "ALL",
  );
  const viewerRole = useMemo(() => decodeToken()?.role || "NORMAL", []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const payload = await fetchDeliveryHistory();
      setHistory(payload);
    } catch (loadError: unknown) {
      const apiError = loadError as DeliveriesApiError;
      if (apiError?.status === 401) {
        clearAuthSession();
        router.replace("/");
        return;
      }

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar o historico de envios.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function handleRetry(deliveryId: string) {
    setRetryingId(deliveryId);
    setError("");
    setNotice("");

    try {
      const payload = await retryDocumentDelivery(deliveryId);
      setNotice(
        payload.note ||
          (payload.manualActionRequired
            ? "Reenvio preparado com novo link seguro."
            : "Reenvio disparado com sucesso."),
      );
      await loadHistory();
    } catch (retryError: unknown) {
      const apiError = retryError as DeliveriesApiError;
      if (apiError?.status === 401) {
        clearAuthSession();
        router.replace("/");
        return;
      }

      setError(
        retryError instanceof Error
          ? retryError.message
          : "Nao foi possivel reenviar o documento.",
      );
    } finally {
      setRetryingId("");
    }
  }

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    const items = history?.items || [];

    return items.filter((item) => {
      if (channelFilter !== "ALL" && item.channel !== channelFilter) {
        return false;
      }

      if (!term) {
        return true;
      }

      return [
        item.documentCode,
        item.documentTitle,
        item.counterpartName,
        item.recipientTarget,
        labelDeliveryStatus(item.status),
        labelDeliveryChannel(item.channel),
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
  }, [channelFilter, history?.items, query]);

  const summary = history?.summary || {
    total: 0,
    sent: 0,
    delivered: 0,
    failed: 0,
    pending: 0,
  };

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Envios"
        title="Historico de compartilhamentos"
        description="Tudo o que ja saiu por e-mail, WhatsApp, webhook e link seguro."
        stats={[
          {
            label: "Total",
            value: String(summary.total),
            helper: "Envios registrados.",
            tone: "blue",
          },
          {
            label: "Enviados",
            value: String(summary.sent),
            helper: "Disparados pelo provider.",
            tone: "emerald",
          },
          {
            label: "Abertos",
            value: String(summary.delivered),
            helper: "Link acessado pelo destinatario.",
            tone: "amber",
          },
          {
            label: "Falhas",
            value: String(summary.failed),
            helper: "Pontos que pedem revisao.",
            tone: "rose",
          },
        ]}
        actions={
          <>
            <Link href="/dashboard/documents" className={SECONDARY_BUTTON}>
              Voltar para documentos
            </Link>
            <button
              type="button"
              onClick={() => void loadHistory()}
              className={SECONDARY_BUTTON}
            >
              Atualizar historico
            </button>
          </>
        }
      />

      {notice ? <StatusBanner tone="emerald">{notice}</StatusBanner> : null}
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}

      <SectionCard
        eyebrow="Rastreamento"
        title="Fila de envios"
        description="Cada item mostra documento, canal, provider e abertura do link."
        actions={
          <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[540px] xl:flex-row">
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por documento, cliente, destino ou status..."
              className="xl:min-w-[320px]"
            />
            <SelectInput
              value={channelFilter}
              onChange={(event) =>
                setChannelFilter(event.target.value as "ALL" | DeliveryChannel)
              }
              className="xl:w-[190px]"
            >
              <option value="ALL">Todos os canais</option>
              <option value="EMAIL">E-mail</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="WEBHOOK">Webhook</option>
            </SelectInput>
          </div>
        }
      >
        {loading ? (
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-10 text-sm text-slate-500">
            Carregando historico...
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState
            title="Nenhum envio encontrado"
            description="Assim que um documento for compartilhado, ele aparecera aqui."
          />
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <article
                key={item.id}
                className="rounded-[24px] border border-slate-200 bg-white/92 p-4 shadow-[0_22px_48px_-38px_rgba(15,23,42,0.24)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <DataPill tone="slate">
                        {labelDeliveryDocumentType(item.documentType)}
                      </DataPill>
                      <DataPill tone={statusTone(item.status)}>
                        {labelDeliveryStatus(item.status)}
                      </DataPill>
                      <DataPill tone="blue">
                        {labelDeliveryChannel(item.channel)}
                      </DataPill>
                    </div>
                    <h3 className="mt-3 text-lg font-bold text-slate-950">
                      {item.documentTitle || item.documentCode || "Documento"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {item.counterpartName || "Sem contraparte"} -{" "}
                      {item.recipientTarget}
                    </p>
                  </div>

                  <div className="text-right text-sm text-slate-500">
                    <p>{formatDateTime(item.createdAt)}</p>
                    {item.share ? (
                      <p className="mt-1">{item.share.openedCount} abertura(s)</p>
                    ) : null}
                    {canRetryDelivery(item.status, viewerRole) ? (
                      <button
                        type="button"
                        onClick={() => void handleRetry(item.id)}
                        disabled={retryingId === item.id}
                        className="mt-3 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {retryingId === item.id ? "Reenviando..." : "Tentar de novo"}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Info label="Provider" value={item.provider || "-"} />
                  <Info
                    label="Expira em"
                    value={
                      item.share?.expiresAt
                        ? formatDateTime(item.share.expiresAt)
                        : "-"
                    }
                  />
                  <Info
                    label="Ultima abertura"
                    value={
                      item.share?.lastOpenedAt
                        ? formatDateTime(item.share.lastOpenedAt)
                        : "-"
                    }
                  />
                </div>

                {item.errorMessage ? (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                    {item.errorMessage}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm text-slate-800">{value}</p>
    </div>
  );
}

function statusTone(status: string) {
  if (status === "DELIVERED") return "emerald" as const;
  if (status === "SENT") return "blue" as const;
  if (status === "FAILED") return "rose" as const;
  return "amber" as const;
}

function canRetryDelivery(status: string, viewerRole: string) {
  if (viewerRole === "CLIENT") return false;
  return status === "FAILED" || status === "PENDING" || status === "CANCELED";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
