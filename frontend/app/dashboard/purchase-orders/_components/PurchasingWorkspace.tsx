"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader, InlineMessage } from "../../components/DashboardPageKit";
import { Navigation, request } from "./shared";
import { RequestDetail, RequestList } from "./Requests";
import { NewQuote, QuoteDetail, QuoteList } from "./Quotations";
import { Approvals, Settings } from "./ApprovalsSettings";
import OrderDetail from "./OrderDetail";
type Area =
  | "requests"
  | "request"
  | "quotations"
  | "quote"
  | "approvals"
  | "settings"
  | "order";
export default function PurchasingWorkspace({
  area,
  newDocument = false,
}: {
  area: Area;
  newDocument?: boolean;
}) {
  const params = useParams<{ id: string }>(),
    [status, setStatus] = useState<{
      enabled: boolean;
      configured: boolean;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void request<{ enabled: boolean; configured: boolean }>(
      "/purchasing/status",
      undefined,
      "GET",
      controller.signal,
    )
      .then(setStatus)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  const id = newDocument ? "new" : params?.id;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Compras e Suprimentos"
        description="Da necessidade à entrega: solicitações, cotações, aprovação, pedidos e conferência."
      />
      {status ? <Navigation /> : null}
      {error ? <InlineMessage tone="warning">{error}</InlineMessage> : null}
      {!status && !error ? (
        <p className="text-sm text-slate-500">
          Carregando ambiente de compras...
        </p>
      ) : null}
      {status && !status.enabled ? (
        <InlineMessage tone="warning">
          {status.configured
            ? "A nova experiência está desativada. Os documentos existentes continuam disponíveis para acompanhamento."
            : "A nova experiência aguarda a migração aditiva neste ambiente."}
        </InlineMessage>
      ) : null}
      {status ? (
        area === "requests" ? (
          <RequestList />
        ) : area === "request" && id ? (
          <RequestDetail id={id} enabled={status.enabled} />
        ) : area === "quotations" ? (
          <QuoteList />
        ) : area === "quote" && newDocument ? (
          <NewQuote enabled={status.enabled} />
        ) : area === "quote" && id ? (
          <QuoteDetail id={id} />
        ) : area === "approvals" ? (
          <Approvals />
        ) : area === "settings" ? (
          <Settings
            enabled={status.enabled}
            configured={status.configured}
            onConfigured={(enabled) => setStatus({ ...status, enabled })}
          />
        ) : area === "order" && id ? (
          <OrderDetail id={id} />
        ) : null
      ) : null}
    </div>
  );
}
