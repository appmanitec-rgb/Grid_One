"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import type { DashboardOverview } from "@/lib/dashboard-overview";
import DepartmentDashboard from "../../_components/DepartmentDashboard";
import { InlineMessage, PageHeader } from "../../components/DashboardPageKit";
const queues = new Set([
  "separation",
  "purchases",
  "stock",
  "product-validity",
  "epis",
]);
const indicators = new Set([
  "purchases",
  "separation",
  "late-purchases",
  "low-stock",
  "products-expiry",
  "epis",
]);
export default function WarehouseOperationsPage() {
  const [data, setData] = useState<DashboardOverview | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void apiFetch("/dashboard/overview", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw Error(
            await readApiErrorMessage(
              response,
              "Não foi possível carregar as filas do almoxarifado.",
            ),
          );
        return response.json() as Promise<DashboardOverview>;
      })
      .then((value) => {
        if (controller.signal.aborted) return;
        setData({
          ...value,
          title: "Central do almoxarifado",
          department: "Almoxarifado",
          description:
            "Organize o recebimento, a separação de materiais, o estoque e os vencimentos.",
          metrics: value.metrics.filter((m) => indicators.has(m.id)),
          sections: value.sections.filter((s) => queues.has(s.id)),
          shortcuts: value.shortcuts.filter((s) =>
            ["purchases", "inventory", "catalog", "hrTools"].includes(s.id),
          ),
        });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Falha ao carregar.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  if (data)
    return (
      <>
        {error ? <InlineMessage tone="warning">{error}</InlineMessage> : null}
        <DepartmentDashboard
          data={data}
          loading={loading}
          onRefresh={refresh}
        />
      </>
    );
  return (
    <div className="dashboard-page space-y-5">
      <PageHeader
        eyebrow="Almoxarifado"
        title="Recebimento e separação"
        description="Filas operacionais das áreas autorizadas ao seu usuário."
      />
      <InlineMessage tone={error ? "warning" : undefined}>
        {error || "Carregando filas..."}
        {error ? (
          <button
            type="button"
            className="ml-2 font-semibold underline"
            onClick={refresh}
          >
            Tentar novamente
          </button>
        ) : null}
      </InlineMessage>
      <Link
        href="/dashboard/inventory"
        className="inline-flex rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-blue-700"
      >
        Abrir estoque e reposição
      </Link>
    </div>
  );
}
