"use client";
import { WorkspaceState } from "@/app/dashboard/components/WorkspaceState";

import { PageHeader } from "@/app/dashboard/components/DashboardPageKit";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  REPORT_STATUS_LABELS,
  ServiceReport,
  formatServiceReportDate,
  portalServiceReportsGet,
} from "@/lib/service-reports";

export default function PortalServiceReportsPage() {
  const [reports, setReports] = useState<ServiceReport[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const payload = await portalServiceReportsGet<ServiceReport[]>();
        if (!cancelled) setReports(payload);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Falha ao carregar laudos.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredReports = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return reports;
    return reports.filter((report) =>
      [
        report.code,
        report.title,
        report.generator?.name,
        report.generator?.serialNumber,
        report.maintenanceOrder?.title,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, reports]);

  return (
    <div className="dashboard-page space-y-5">
      <PageHeader eyebrow="Central do cliente" title={<>Laudos</>} description={<>Relatórios técnicos liberados pela MANITEC para consulta do cliente.</>} />

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          placeholder="Buscar por equipamento, OS ou código"
        />
      </section>

      {loading ? <State text="Carregando laudos..." /> : null}
      {error ? <State text={error} tone="error" /> : null}
      {!loading && !error && filteredReports.length === 0 ? (
        <State text="Nenhum laudo liberado para o portal." />
      ) : null}

      <section className="grid gap-3">
        {filteredReports.map((report) => (
          <Link
            key={report.id}
            href={`/portal/laudos/${report.id}`}
            className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 md:grid-cols-[1fr_auto]"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                  {report.code}
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                  {REPORT_STATUS_LABELS[report.status]}
                </span>
              </div>
              <h2 className="mt-3 font-extrabold text-slate-950">{report.title}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {report.generator?.name || "Equipamento"} -{" "}
                {report.maintenanceOrder?.title || "OS"}
              </p>
            </div>
            <div className="text-sm font-semibold text-slate-600 md:text-right">
              {formatServiceReportDate(report.releasedToCustomerAt)}
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}

function State({ text, tone }: { text: string; tone?: "error" | "success" }) {
  return <WorkspaceState title={text} tone={tone || (/^Carregando/i.test(text) ? "loading" : "empty")} />;
}
