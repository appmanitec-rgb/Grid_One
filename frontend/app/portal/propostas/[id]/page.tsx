"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  customerPortalGet,
  customerPortalGetBlob,
  customerPortalPost,
  downloadPortalBlob,
  formatPortalCurrency,
  formatPortalDate,
  PortalProposal,
  statusLabel,
} from "@/lib/customer-portal";

type DecisionMode = "APPROVE" | "REJECT" | null;

export default function PortalProposalDetailPage() {
  const params = useParams<{ id: string }>();
  const [proposal, setProposal] = useState<PortalProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [downloadingDocument, setDownloadingDocument] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [decisionMode, setDecisionMode] = useState<DecisionMode>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const payload = await customerPortalGet<PortalProposal>(`/proposals/${params.id}`);
        if (!cancelled) setProposal(payload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar proposta.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (params.id) void load();

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function submitDecision() {
    if (!decisionMode) return;

    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const path =
        decisionMode === "APPROVE"
          ? `/proposals/${params.id}/approve`
          : `/proposals/${params.id}/reject`;
      const payload = await customerPortalPost<{ proposal: PortalProposal; message: string }>(path, { note });
      setProposal(payload.proposal);
      setSuccess(payload.message);
      setDecisionMode(null);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao registrar decisão.");
    } finally {
      setSubmitting(false);
    }
  }

  async function downloadDocument() {
    if (!proposal) return;
    setDownloadingDocument(true);
    setError("");
    try {
      const blob = await customerPortalGetBlob(
        `/proposals/${params.id}/download-docx`,
      );
      downloadPortalBlob(blob, `proposta-${proposal.code}.docx`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao baixar documento.");
    } finally {
      setDownloadingDocument(false);
    }
  }

  async function downloadPdf() {
    if (!proposal) return;
    setDownloadingPdf(true);
    setError("");
    try {
      const blob = await customerPortalGetBlob(
        `/proposals/${params.id}/download-document-pdf`,
      );
      downloadPortalBlob(blob, `proposta-${proposal.code}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao baixar PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  if (loading) return <State text="Carregando proposta..." />;
  if (error && !proposal) return <State text={error} tone="error" />;
  if (!proposal) return <State text="Proposta não encontrada." />;

  const canDecide = proposal.status === "CLIENT_REVIEW";

  return (
    <div className="space-y-5">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <Link href="/portal/propostas" className="text-sm font-bold text-blue-700 hover:text-blue-900">
          Voltar para propostas
        </Link>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-950">Proposta {proposal.code}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {proposal.generator?.name || "Sem equipamento"} - Validade {formatPortalDate(proposal.validUntil)}
            </p>
          </div>
          <div className="text-left lg:text-right">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">
              {statusLabel(proposal.status)}
            </span>
            <strong className="mt-2 block text-2xl text-slate-950">{formatPortalCurrency(proposal.totalValue)}</strong>
            <div className="mt-3 flex flex-wrap justify-start gap-2 lg:justify-end">
              <button
                type="button"
                disabled={downloadingPdf}
                onClick={() => void downloadPdf()}
                className="rounded-md bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-600 disabled:opacity-60"
              >
                {downloadingPdf ? "Gerando PDF..." : "Baixar PDF"}
              </button>
              <button
                type="button"
                disabled={downloadingDocument}
                onClick={() => void downloadDocument()}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {downloadingDocument ? "Gerando DOCX..." : "Baixar DOCX"}
              </button>
            </div>
          </div>
        </div>
      </header>

      {error ? <State text={error} tone="error" /> : null}
      {success ? <State text={success} tone="success" /> : null}

      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-extrabold text-slate-950">Itens</h2>
          <div className="mt-3 overflow-hidden rounded-md border border-slate-100">
            {proposal.items?.length ? (
              proposal.items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0"
                >
                  <div>
                    <p className="font-bold text-slate-900">{item.catalogItem.name}</p>
                    <p className="text-sm text-slate-500">{item.catalogItem.commercialDescription || item.catalogItem.sku || "-"}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-600">
                    {item.quantity} {item.catalogItem.unit || "un"}
                  </span>
                  <strong className="text-right text-sm text-slate-900">{formatPortalCurrency(item.totalPrice)}</strong>
                </div>
              ))
            ) : (
              <p className="p-3 text-sm text-slate-500">Nenhum item detalhado nesta proposta.</p>
            )}
          </div>

          {proposal.scope || proposal.externalNotes ? (
            <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
              {proposal.scope ? <p>{proposal.scope}</p> : null}
              {proposal.externalNotes ? <p className="mt-2">{proposal.externalNotes}</p> : null}
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-extrabold text-slate-950">Condições</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Info label="Pagamento" value={proposal.paymentTerm || "-"} />
              <Info label="Frete" value={proposal.freight || "-"} />
              <Info label="Prazo" value={proposal.deliveryLeadTimeDays ? `${proposal.deliveryLeadTimeDays} dias` : "-"} />
              <Info label="Validade" value={formatPortalDate(proposal.validUntil)} />
            </dl>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-extrabold text-slate-950">Decisão</h2>
            {canDecide ? (
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setDecisionMode("APPROVE")}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500"
                >
                  Aprovar proposta
                </button>
                <button
                  type="button"
                  onClick={() => setDecisionMode("REJECT")}
                  className="rounded-md border border-red-200 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50"
                >
                  Reprovar proposta
                </button>
              </div>
            ) : (
              <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm font-medium text-slate-500">
                Esta proposta já possui uma decisão registrada.
              </p>
            )}
          </section>
        </aside>
      </section>

      {decisionMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-xl font-extrabold text-slate-950">
              {decisionMode === "APPROVE" ? "Confirmar aprovação" : "Confirmar reprovação"}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {decisionMode === "APPROVE"
                ? "A aprovação será registrada em auditoria e enviada ao time comercial."
                : "Informe o motivo ou uma observação para o time comercial."}
            </p>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-4 min-h-28 w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Observação opcional"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDecisionMode(null)}
                disabled={submitting}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void submitDecision()}
                disabled={submitting}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-60"
              >
                {submitting ? "Registrando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
      <dt className="font-bold text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

function State({ text, tone }: { text: string; tone?: "error" | "success" }) {
  const classes =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-slate-200 bg-white text-slate-600";

  return <div className={`rounded-lg border p-4 text-sm font-semibold ${classes}`}>{text}</div>;
}
