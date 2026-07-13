"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CHECKLIST_RESULT_LABELS,
  EVIDENCE_TYPE_LABELS,
  ServiceReport,
  downloadBlob,
  formatServiceReportDate,
  openHtmlInNewWindow,
  portalServiceReportsGetBlob,
  portalServiceReportsGet,
  portalServiceReportsGetText,
} from "@/lib/service-reports";

export default function PortalServiceReportDetailPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<ServiceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const payload = await portalServiceReportsGet<ServiceReport>(
          `/${params.id}`,
        );
        if (!cancelled) setReport(payload);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Falha ao carregar laudo.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (loading) return <State text="Carregando laudo..." />;
  if (error) return <State text={error} tone="error" />;
  if (!report) return <State text="Laudo nao encontrado." />;

  async function runAction(key: string, action: () => Promise<void>) {
    setBusyKey(key);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na acao solicitada.");
    } finally {
      setBusyKey("");
    }
  }

  async function openPrintPreview() {
    await runAction("print", async () => {
      const html = await portalServiceReportsGetText(`/${params.id}/print`);
      openHtmlInNewWindow(html);
    });
  }

  async function downloadEvidence(evidenceId: string, fileName?: string | null) {
    await runAction(`download-${evidenceId}`, async () => {
      const blob = await portalServiceReportsGetBlob(
        `/${params.id}/evidence/${evidenceId}/download`,
      );
      downloadBlob(blob, fileName || `evidencia-${evidenceId}`);
    });
  }

  async function downloadPdf() {
    await runAction("download-pdf", async () => {
      const blob = await portalServiceReportsGetBlob(`/${params.id}/download-pdf`);
      downloadBlob(blob, `${report?.code || "laudo-tecnico"}.pdf`);
    });
  }

  return (
    <div className="space-y-5">
      <Link href="/portal/laudos" className="text-sm font-bold text-blue-700 hover:text-blue-900">
        Voltar para laudos
      </Link>

      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
            {report.code}
          </span>
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
            Liberado em {formatServiceReportDate(report.releasedToCustomerAt)}
          </span>
        </div>
        <h1 className="mt-3 text-2xl font-extrabold text-slate-950">
          {report.title}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {report.generator?.name || "Equipamento"} -{" "}
          {report.maintenanceOrder?.title || "Ordem de servico"}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            disabled={busyKey === "print"}
            onClick={() => void openPrintPreview()}
          >
            {busyKey === "print" ? "Abrindo..." : "Visualizar laudo"}
          </button>
          {report.validationUrl ? (
            <a
              href={report.validationUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"
            >
              Validar autenticidade
            </a>
          ) : null}
          {report.generatedDocument?.hasStoredFile ? (
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              disabled={busyKey === "download-pdf"}
              onClick={() => void downloadPdf()}
            >
              {busyKey === "download-pdf" ? "Baixando..." : "Baixar PDF"}
            </button>
          ) : (
            <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">
              PDF ainda nao gerado
            </span>
          )}
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <Info label="Equipamento" value={report.generator?.name} />
        <Info label="Numero de serie" value={report.generator?.serialNumber} />
        <Info label="Tecnico" value={report.technician?.user?.name} />
        <Info label="Versao" value={String(report.versionNumber || 1)} />
        <Info label="Hash" value={report.documentHash?.slice(0, 18)} />
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
        <h2 className="text-lg font-extrabold text-slate-950">Checklist</h2>
        {report.checklistItems.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Sem checklist liberado.</p>
        ) : (
          <div className="mt-4 grid gap-2">
            {report.checklistItems.map((item) => (
              <article
                key={item.id || item.label}
                className="grid gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 md:grid-cols-[1fr_160px]"
              >
                <div>
                  <p className="font-semibold text-slate-900">{item.label}</p>
                  {item.notes ? (
                    <p className="mt-1 text-sm text-slate-600">{item.notes}</p>
                  ) : null}
                </div>
                <span className="text-sm font-bold text-slate-700">
                  {CHECKLIST_RESULT_LABELS[item.result]}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-extrabold text-slate-950">Evidencias</h2>
        {report.evidences.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Sem evidencias liberadas.</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {report.evidences.map((evidence) => (
              <article
                key={evidence.id}
                className="rounded-md border border-slate-100 bg-slate-50 px-3 py-3"
              >
                <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                  {EVIDENCE_TYPE_LABELS[evidence.type]}
                </span>
                <h3 className="mt-3 font-bold text-slate-950">{evidence.title}</h3>
                {evidence.description ? (
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {evidence.description}
                  </p>
                ) : null}
                {evidence.fileUrl ? (
                  <a
                    href={evidence.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex text-sm font-bold text-blue-700 hover:text-blue-900"
                  >
                    Abrir evidencia
                  </a>
                ) : null}
                {evidence.hasStoredFile ? (
                  <button
                    type="button"
                    disabled={busyKey === `download-${evidence.id}`}
                    onClick={() => void downloadEvidence(evidence.id, evidence.fileName)}
                    className="mt-3 inline-flex text-sm font-bold text-blue-700 hover:text-blue-900"
                  >
                    {busyKey === `download-${evidence.id}` ? "Baixando..." : "Baixar evidencia"}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-extrabold text-slate-950">Assinatura</h2>
        {report.signedAt ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Info label="Responsavel" value={report.signedByName} />
            <Info label="Documento" value={report.signedByDocument} />
            <Info label="Assinado em" value={formatServiceReportDate(report.signedAt)} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Assinatura nao registrada.</p>
        )}
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-extrabold text-slate-950">{title}</h2>
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
      <p className="mt-2 text-sm font-extrabold text-slate-950">{value || "-"}</p>
    </div>
  );
}

function State({ text, tone }: { text: string; tone?: "error" }) {
  return (
    <div
      className={`rounded-lg border p-4 text-sm font-semibold ${
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      {text}
    </div>
  );
}
