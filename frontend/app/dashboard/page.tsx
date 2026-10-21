"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import type { DashboardOverview } from "@/lib/dashboard-overview";
import { InlineMessage, PageHeader } from "./components/DashboardPageKit";
import GeneralDashboard from "./_components/GeneralDashboard";
import DepartmentDashboard from "./_components/DepartmentDashboard";
export default function DashboardPage() {
  const [data, setData] = useState<DashboardOverview | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
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
              "N\u00e3o foi poss\u00edvel carregar o painel da sua \u00e1rea.",
            ),
          );
        return response.json() as Promise<DashboardOverview>;
      })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(e instanceof Error ? e.message : "Falha ao carregar.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (!event.key || /token|session/i.test(event.key)) {
        setData(null);
        refresh();
      }
    };
    window.addEventListener("storage", changed);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", changed);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  if (!data)
    return (
      <div className="dashboard-page space-y-5">
        <PageHeader
          title="Meu painel"
          description="Indicadores da sua \u00e1rea e das telas liberadas para o seu usu\u00e1rio."
        />
        {error ? (
          <InlineMessage tone="warning">
            {error}{" "}
            <button className="ml-2 font-semibold underline" onClick={refresh}>
              Tentar novamente
            </button>
          </InlineMessage>
        ) : (
          <p role="status" className="text-sm text-slate-500">
            Carregando painel da sua \u00e1rea...
          </p>
        )}
      </div>
    );
  const general =
    ["EXECUTIVE", "COMMERCIAL"].includes(data.audience) &&
    data.canViewCommercial;
  return (
    <>
      {general ? (
        <GeneralDashboard commercial={data.audience === "COMMERCIAL"} />
      ) : null}
      <DepartmentDashboard
        data={data}
        onRefresh={refresh}
        loading={loading}
        compact={general}
      />
    </>
  );
}
