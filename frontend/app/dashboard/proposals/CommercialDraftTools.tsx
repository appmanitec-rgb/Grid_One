"use client";
import { useEffect, useState } from "react";
import {
  Availability,
  commercialFetch,
  commercialPost,
  CommercialCapabilities,
  EstimateInput,
  Portfolio,
} from "@/lib/commercial-workspace";
import { InlineMessage, SectionCard } from "../components/DashboardPageKit";
import CommercialEstimatePanel from "./CommercialEstimatePanel";
import type { ReviewLine } from "@/lib/proposal-review";
export function AvailabilityList({ items }: { items: Availability[] }) {
  const labels = {
    AVAILABLE: "Saldo disponível",
    PURCHASE_REQUIRED: "Conferir compra",
    UNCONFIRMED: "Saldo não confirmado",
    PLANNING_REQUIRED: "Confirmar com planejamento",
  };
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article
          key={item.key}
          className="rounded-lg border border-slate-200 p-3"
        >
          <div className="flex flex-wrap justify-between gap-2">
            <strong className="text-sm">{item.name}</strong>
            <span
              className={`text-xs font-medium ${item.status === "AVAILABLE" ? "text-emerald-700" : "text-amber-700"}`}
            >
              {labels[item.status]}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Solicitado no conjunto da proposta: {item.requested}
            {item.available !== null
              ? ` · Disponível: ${item.available} · Reservado: ${item.reserved}`
              : ""}
          </p>
          <p className="mt-1 text-xs text-slate-500">{item.note}</p>
        </article>
      ))}
    </div>
  );
}
export default function CommercialDraftTools({
  portfolio,
  revenue,
  lines,
  mode = "availability",
}: {
  portfolio: Portfolio;
  revenue: number;
  lines: ReviewLine[];
  mode?: "availability" | "costs";
}) {
  const [capabilities, setCapabilities] = useState<CommercialCapabilities>();
  const [items, setItems] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    commercialFetch<CommercialCapabilities>("/capabilities", {
      signal: controller.signal,
    })
      .then(setCapabilities)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const input: EstimateInput = {
    portfolio,
    revenue: Math.max(0, revenue),
    items: lines
      .map((line, index) => ({
        key: `line-${index}`,
        catalogItemId: line.catalogItemId || undefined,
        description: line.description || undefined,
        quantity: line.hours ?? line.quantity,
        revenue: Math.max(
          0,
          (line.hours ?? line.quantity) *
            line.unitPrice *
            (1 - (line.discountPercent || 0) / 100),
        ),
      }))
      .filter(
        (line) =>
          Number.isFinite(line.quantity) &&
          line.quantity > 0 &&
          Number.isFinite(line.revenue),
      ),
  };
  const signature = JSON.stringify(input);
  useEffect(() => {
    if (mode !== "availability" || !JSON.parse(signature).items.length) {
      setItems([]);
      return;
    }
    let current = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      commercialPost<Availability[]>("/availability", JSON.parse(signature))
        .then((rows) => {
          if (current) setItems(rows);
        })
        .catch((cause) => {
          if (current) setError(cause.message);
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 350);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [signature, mode, attempt]);
  if (!input.items.length) return null;
  if (
    mode === "costs" &&
    (!Number.isFinite(revenue) ||
      lines.some(
        (line) =>
          !Number.isFinite(line.hours ?? line.quantity) ||
          (line.hours ?? line.quantity) <= 0 ||
          !Number.isFinite(line.unitPrice) ||
          line.unitPrice < 0,
      ))
  )
    return (
      <InlineMessage tone="warning">
        Conclua as quantidades e os preços antes de conferir os custos.
      </InlineMessage>
    );
  if (mode === "costs")
    return capabilities?.management[portfolio]?.costs ? (
      <SectionCard
        title="Conferência interna de custos"
        description="Acesso do administrador responsável por esta carteira."
      >
        <CommercialEstimatePanel input={input} canEdit />
      </SectionCard>
    ) : null;
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Disponibilidade e prazo dos itens
      </summary>
      <div className="mt-4">
        {loading ? (
          <p role="status" className="text-sm text-slate-500">
            Consultando saldos…
          </p>
        ) : error ? (
          <InlineMessage tone="warning">
            {error}{" "}
            <button
              type="button"
              className="underline"
              onClick={() => setAttempt((n) => n + 1)}
            >
              Tentar novamente
            </button>
          </InlineMessage>
        ) : (
          <AvailabilityList items={items} />
        )}
      </div>
    </details>
  );
}
