"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CHECKLIST_RESULT_LABELS,
  EVIDENCE_TYPE_LABELS,
  ServiceReport,
  publicServiceReportGet,
} from "@/lib/service-reports";

type PublicSharePayload = {
  report: ServiceReport;
  validation?: {
    valid: boolean;
    documentHash?: string | null;
  } | null;
};

export default function PublicServiceReportSharePage() {
  const params = useParams<{ token: string }>();
  const [payload, setPayload] = useState<PublicSharePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await publicServiceReportGet<PublicSharePayload>(
          `/share/${params.token}`,
        );
        if (active) setPayload(result);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Link indisponivel.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [params.token]);

  if (!payload) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <section className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <State text={loading ? "Abrindo laudo..." : error || "Laudo indisponivel."} tone={error ? "error" : undefined} />
        </section>
      </main>
    );
  }

  const report = payload.report;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <article className="mx-auto max-w-5xl space-y-4">
        <header className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
              {report.code}
            </span>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
              Link seguro
            </span>
          </div>
          <h1 className="mt-3 text-2xl font-extrabold">{report.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {report.client?.tradeName || report.client?.companyName || "Cliente"} /{" "}
            {report.generator?.name || "Equipamento"}
          </p>
          {report.validationUrl ? (
            <a
              href={report.validationUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"
            >
              Validar autenticidade
            </a>
          ) : null}
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <Info label="Equipamento" value={report.generator?.name} />
          <Info label="Serie" value={report.generator?.serialNumber} />
          <Info label="Tecnico" value={report.technician?.user?.name} />
          <Info label="Versao" value={String(report.versionNumber || 1)} />
        </section>

        <Section title="Diagnostico">{report.diagnosis}</Section>
        <Section title="Servico realizado">{report.performedServices}</Section>
        {report.recommendations ? (
          <Section title="Recomendacoes">{report.recommendations}</Section>
        ) : null}
        {report.customerNotes ? (
          <Section title="Observacoes ao cliente">{report.customerNotes}</Section>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-extrabold">Checklist</h2>
          <div className="mt-4 grid gap-2">
            {report.checklistItems.length === 0 ? (
              <p className="text-sm text-slate-500">Sem checklist liberado.</p>
            ) : (
              report.checklistItems.map((item) => (
                <div
                  key={item.id || item.label}
                  className="grid gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 md:grid-cols-[1fr_160px]"
                >
                  <p className="font-semibold">{item.label}</p>
                  <span className="text-sm font-bold">
                    {CHECKLIST_RESULT_LABELS[item.result]}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-extrabold">Evidencias visiveis</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {report.evidences.length === 0 ? (
              <p className="text-sm text-slate-500">Sem evidencias liberadas.</p>
            ) : (
              report.evidences.map((evidence) => (
                <div
                  key={evidence.id}
                  className="rounded-md border border-slate-100 bg-slate-50 px-3 py-3"
                >
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                    {EVIDENCE_TYPE_LABELS[evidence.type]}
                  </span>
                  <h3 className="mt-3 font-bold">{evidence.title}</h3>
                  {evidence.description ? (
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {evidence.description}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-extrabold">{title}</h2>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
        {children}
      </p>
    </section>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-extrabold">{value || "-"}</p>
    </div>
  );
}

function State({ text, tone }: { text: string; tone?: "error" }) {
  return (
    <p
      className={`rounded-lg border p-4 text-sm font-semibold ${
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-slate-200 bg-slate-50 text-slate-600"
      }`}
    >
      {text}
    </p>
  );
}
