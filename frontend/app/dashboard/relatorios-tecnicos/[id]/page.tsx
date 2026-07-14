"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { getAccessFromToken } from "@/lib/access";
import {
  CHECKLIST_RESULT_LABELS,
  ChecklistResult,
  EVIDENCE_TYPE_LABELS,
  EvidenceType,
  REPORT_STATUS_LABELS,
  ServiceReport,
  ServiceReportChecklistItem,
  ServiceReportShareLink,
  downloadBlob,
  formatServiceReportDate,
  openHtmlInNewWindow,
  reportStatusTone,
  serviceReportsGetBlob,
  serviceReportsGet,
  serviceReportsGetText,
  serviceReportsPatch,
  serviceReportsPost,
  serviceReportsPostForm,
} from "@/lib/service-reports";
import {
  DataPill,
  FormField,
  PageHero,
  SectionCard,
  StatusBanner,
  TextAreaInput,
  TextInput,
} from "../../components/DashboardPageKit";

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const DANGER_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50";

const CHECKLIST_RESULTS = Object.keys(CHECKLIST_RESULT_LABELS) as ChecklistResult[];
const EVIDENCE_TYPES = Object.keys(EVIDENCE_TYPE_LABELS) as EvidenceType[];

const EMPTY_EVIDENCE = {
  type: "PHOTO" as EvidenceType,
  title: "",
  description: "",
  fileUrl: "",
  fileName: "",
  mimeType: "",
  customerVisible: false,
};

const EMPTY_SIGNATURE = {
  signedByName: "",
  signedByDocument: "",
  signatureData: "",
};

export default function ServiceReportDetailPage() {
  const params = useParams<{ id: string }>();
  const reportId = params.id;
  const access = useMemo(() => getAccessFromToken(), []);
  const [report, setReport] = useState<ServiceReport | null>(null);
  const [form, setForm] = useState({
    title: "",
    diagnosis: "",
    performedServices: "",
    recommendations: "",
    observations: "",
    safetyNotes: "",
    customerNotes: "",
  });
  const [checklist, setChecklist] = useState<ServiceReportChecklistItem[]>([]);
  const [evidenceForm, setEvidenceForm] = useState(EMPTY_EVIDENCE);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [signatureForm, setSignatureForm] = useState(EMPTY_SIGNATURE);
  const [shareLinks, setShareLinks] = useState<ServiceReportShareLink[]>([]);
  const [shareAllowPdfDownload, setShareAllowPdfDownload] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await serviceReportsGet<ServiceReport>(`/${reportId}`);
      const links = access.serviceReports.manageShareLinks
        ? await serviceReportsGet<ServiceReportShareLink[]>(
            `/${reportId}/share-links`,
          )
        : [];
      setReport(payload);
      setShareLinks(links);
      setForm({
        title: payload.title || "",
        diagnosis: payload.diagnosis || "",
        performedServices: payload.performedServices || "",
        recommendations: payload.recommendations || "",
        observations: payload.observations || "",
        safetyNotes: payload.safetyNotes || "",
        customerNotes: payload.customerNotes || "",
      });
      setChecklist(payload.checklistItems || []);
      setSignatureForm({
        signedByName: payload.signedByName || "",
        signedByDocument: payload.signedByDocument || "",
        signatureData: payload.signatureData || "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar laudo.");
    } finally {
      setLoading(false);
    }
  }, [access.serviceReports.manageShareLinks, reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  const editable = report
    ? report.status === "DRAFT" || report.status === "IN_REVIEW"
    : false;
  const canEdit = editable && access.serviceReports.update;
  const canAddEvidence = editable && access.serviceReports.addEvidence;
  const canSign =
    report?.status !== "CANCELED" &&
    report?.status !== "RELEASED_TO_CUSTOMER" &&
    access.serviceReports.sign;
  const canApprove =
    report &&
    !["APPROVED", "RELEASED_TO_CUSTOMER", "CANCELED"].includes(report.status) &&
    access.serviceReports.approve;
  const canRelease = report?.status === "APPROVED" && access.serviceReports.releaseToCustomer;
  const canCancel = report?.status !== "CANCELED" && access.serviceReports.cancel;
  const canGenerateDocument =
    report &&
    ["APPROVED", "RELEASED_TO_CUSTOMER"].includes(report.status) &&
    access.serviceReports.generateDocument;
  const reportHasGeneratedPdf = Boolean(
    report?.generatedDocument?.hasStoredFile ||
      report?.generatedDocument?.fileStorageKey,
  );
  const canReviseReleased =
    report?.status === "RELEASED_TO_CUSTOMER" && access.serviceReports.update;
  const canManageShareLinks =
    report?.status === "RELEASED_TO_CUSTOMER" &&
    access.serviceReports.manageShareLinks;

  async function saveReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction("save", async () => {
      const updated = await serviceReportsPatch<ServiceReport>(`/${reportId}`, {
        ...form,
        recommendations: form.recommendations.trim() || undefined,
        observations: form.observations.trim() || undefined,
        safetyNotes: form.safetyNotes.trim() || undefined,
        customerNotes: form.customerNotes.trim() || undefined,
      });
      setReport(updated);
      setSuccess("Laudo atualizado.");
    });
  }

  async function saveChecklist() {
    await runAction("checklist", async () => {
      const updated = await serviceReportsPost<ServiceReport>(
        `/${reportId}/checklist`,
        { items: checklist },
      );
      setReport(updated);
      setChecklist(updated.checklistItems || []);
      setSuccess("Checklist salvo.");
    });
  }

  async function addEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!evidenceForm.title.trim()) {
      setError("Informe o título da evidência.");
      return;
    }
    await runAction("evidence", async () => {
      const updated = evidenceFile
        ? await uploadEvidenceFile()
        : await serviceReportsPost<ServiceReport>(`/${reportId}/evidence`, {
            ...evidenceForm,
            description: evidenceForm.description.trim() || undefined,
            fileUrl: evidenceForm.fileUrl.trim() || undefined,
            fileName: evidenceForm.fileName.trim() || undefined,
            mimeType: evidenceForm.mimeType.trim() || undefined,
          });
      setReport(updated);
      setEvidenceForm(EMPTY_EVIDENCE);
      setEvidenceFile(null);
      setSuccess("Evidencia registrada.");
    });
  }

  async function uploadEvidenceFile() {
    if (!evidenceFile) throw new Error("Selecione o arquivo da evidência.");
    const formData = new FormData();
    formData.set("file", evidenceFile);
    formData.set("type", evidenceForm.type);
    formData.set("title", evidenceForm.title);
    if (evidenceForm.description.trim()) {
      formData.set("description", evidenceForm.description.trim());
    }
    formData.set("customerVisible", String(evidenceForm.customerVisible));
    return serviceReportsPostForm<ServiceReport>(
      `/${reportId}/evidence/upload`,
      formData,
    );
  }

  async function signReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signatureForm.signedByName.trim()) {
      setError("Informe o responsavel pela assinatura.");
      return;
    }
    await runAction("sign", async () => {
      const updated = await serviceReportsPost<ServiceReport>(
        `/${reportId}/sign`,
        {
          signedByName: signatureForm.signedByName,
          signedByDocument: signatureForm.signedByDocument.trim() || undefined,
          signatureData: signatureForm.signatureData.trim() || undefined,
        },
      );
      setReport(updated);
      setSuccess("Assinatura registrada.");
    });
  }

  async function transition(path: string, label: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    await runAction(path, async () => {
      const updated = await serviceReportsPost<ServiceReport>(`/${reportId}/${path}`, {});
      setReport(updated);
      setChecklist(updated.checklistItems || []);
      setSuccess(label);
    });
  }

  async function cancelReport() {
    if (!window.confirm("Cancelar este laudo e remover visibilidade no portal?")) return;
    await runAction("cancel", async () => {
      const updated = await serviceReportsPost<ServiceReport>(`/${reportId}/cancel`, {
        reason: "Cancelado pela tela de laudos.",
      });
      setReport(updated);
      setSuccess("Laudo cancelado.");
    });
  }

  async function generateDocument() {
    await runAction("generate-document", async () => {
      const payload = await serviceReportsPost<{ report: ServiceReport }>(
        `/${reportId}/generate-document`,
        {},
      );
      setReport(payload.report);
      setSuccess("Documento gerado e vinculado ao laudo.");
    });
  }

  async function generatePdf() {
    await runAction("generate-pdf", async () => {
      const payload = await serviceReportsPost<{ report: ServiceReport }>(
        `/${reportId}/generate-pdf`,
        {},
      );
      setReport(payload.report);
      setSuccess("PDF final gerado e armazenado.");
    });
  }

  async function downloadPdf() {
    await runAction("download-pdf", async () => {
      const blob = await serviceReportsGetBlob(`/${reportId}/download-pdf`);
      downloadBlob(blob, `${report?.code || "laudo-tecnico"}.pdf`);
    });
  }

  async function reviseReleasedReport() {
    const reason = window.prompt("Informe o motivo da revisão do laudo liberado:");
    if (!reason?.trim()) return;
    await runAction("revise", async () => {
      const updated = await serviceReportsPost<ServiceReport>(
        `/${reportId}/revise`,
        {
          ...form,
          changeReason: reason.trim(),
          recommendations: form.recommendations.trim() || undefined,
          observations: form.observations.trim() || undefined,
          safetyNotes: form.safetyNotes.trim() || undefined,
          customerNotes: form.customerNotes.trim() || undefined,
        },
      );
      setReport(updated);
      setSuccess("Revisão versionada criada. Gere um novo PDF para a versão atual.");
    });
  }

  async function openPrintPreview() {
    await runAction("print", async () => {
      const html = await serviceReportsGetText(`/${reportId}/print`);
      openHtmlInNewWindow(html);
      setSuccess("Preview imprimível aberto.");
    });
  }

  async function downloadEvidence(evidenceId: string, fileName?: string | null) {
    await runAction(`download-${evidenceId}`, async () => {
      const blob = await serviceReportsGetBlob(
        `/${reportId}/evidence/${evidenceId}/download`,
      );
      downloadBlob(blob, fileName || `evidencia-${evidenceId}`);
    });
  }

  async function createShareLink() {
    await runAction("share-link", async () => {
      const created = await serviceReportsPost<ServiceReportShareLink>(
        `/${reportId}/share-links`,
        {
          allowPdfDownload:
            shareAllowPdfDownload && reportHasGeneratedPdf,
        },
      );
      setShareLinks((current) => [created, ...current]);
      setSuccess("Link público criado.");
    });
  }

  async function revokeShareLink(linkId: string) {
    if (!window.confirm("Revogar este link público?")) return;
    await runAction(`revoke-${linkId}`, async () => {
      const updated = await serviceReportsPost<ServiceReportShareLink>(
        `/${reportId}/share-links/${linkId}/revoke`,
        { reason: "Revogado pela tela de laudos." },
      );
      setShareLinks((current) =>
        current.map((link) => (link.id === linkId ? updated : link)),
      );
      setSuccess("Link público revogado.");
    });
  }

  async function runAction(key: string, action: () => Promise<void>) {
    setBusyKey(key);
    setError("");
    setSuccess("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na ação solicitada.");
    } finally {
      setBusyKey("");
    }
  }

  function updateChecklistItem(
    index: number,
    patch: Partial<ServiceReportChecklistItem>,
  ) {
    setChecklist((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  function addChecklistItem() {
    setChecklist((current) => [
      ...current,
      {
        label: "",
        result: "PENDING",
        required: false,
        notes: "",
        sortOrder: current.length,
      },
    ]);
  }

  function removeChecklistItem(index: number) {
    setChecklist((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  if (loading) return <State text="Carregando laudo..." />;
  if (error && !report) return <State text={error} tone="error" />;
  if (!report) return <State text="Laudo não encontrado." />;

  return (
    <div className="space-y-6">
      <PageHero
        compact
        eyebrow="Laudo técnico"
        title={`${report.code} - ${report.title}`}
        description={`${report.client?.tradeName || report.client?.companyName || "Cliente"} / ${report.generator?.name || "Equipamento"} / ${report.maintenanceOrder?.title || "OS"}`}
        actions={
          <>
            <Link href="/dashboard/relatorios-tecnicos" className={SECONDARY_BUTTON}>
              Voltar
            </Link>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={busyKey === "print"}
              onClick={() => void openPrintPreview()}
            >
              {busyKey === "print" ? "Abrindo..." : "Visualizar impressão"}
            </button>
            {canGenerateDocument ? (
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={busyKey === "generate-document"}
                onClick={() => void generateDocument()}
              >
                {busyKey === "generate-document" ? "Gerando..." : "Gerar documento"}
              </button>
            ) : null}
            {canGenerateDocument ? (
              <button
                type="button"
                className={PRIMARY_BUTTON}
                disabled={busyKey === "generate-pdf"}
                onClick={() => void generatePdf()}
              >
                {busyKey === "generate-pdf" ? "Gerando..." : "Gerar PDF"}
              </button>
            ) : null}
            {reportHasGeneratedPdf ? (
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={busyKey === "download-pdf"}
                onClick={() => void downloadPdf()}
              >
                {busyKey === "download-pdf" ? "Baixando..." : "Baixar PDF"}
              </button>
            ) : null}
            {canReviseReleased ? (
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={busyKey === "revise"}
                onClick={() => void reviseReleasedReport()}
              >
                Revisar versão
              </button>
            ) : null}
            {canApprove ? (
              <button
                type="button"
                className={PRIMARY_BUTTON}
                disabled={busyKey === "approve"}
                onClick={() =>
                  void transition(
                    "approve",
                    "Laudo aprovado.",
                    "Aprovar este laudo para geração/liberação?",
                  )
                }
              >
                {busyKey === "approve" ? "Aprovando..." : "Aprovar"}
              </button>
            ) : null}
            {canRelease ? (
              <button
                type="button"
                className={PRIMARY_BUTTON}
                disabled={busyKey === "release-to-customer"}
                onClick={() =>
                  void transition(
                    "release-to-customer",
                    "Laudo liberado ao cliente.",
                    "Liberar este laudo no Portal do Cliente?",
                  )
                }
              >
                {busyKey === "release-to-customer" ? "Liberando..." : "Liberar portal"}
              </button>
            ) : null}
            {canCancel ? (
              <button
                type="button"
                className={DANGER_BUTTON}
                disabled={busyKey === "cancel"}
                onClick={() => void cancelReport()}
              >
                Cancelar
              </button>
            ) : null}
          </>
        }
        stats={[
          {
            label: "Status",
            value: REPORT_STATUS_LABELS[report.status],
            tone: reportStatusTone(report.status),
          },
          {
            label: "Checklist",
            value: String(report.checklistItems.length),
            tone: "blue",
          },
          {
            label: "Evidências",
            value: String(report.evidences.length),
            tone: "slate",
          },
          {
            label: "Portal",
            value: report.customerVisible ? "Liberado" : "Interno",
            tone: report.customerVisible ? "emerald" : "amber",
          },
          {
            label: "Versão",
            value: String(report.versionNumber || 1),
            tone: "blue",
          },
        ]}
      />

      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {success ? <StatusBanner tone="emerald">{success}</StatusBanner> : null}

      <SectionCard
        title="Documento e compartilhamento"
        description="Documento imprimível, hash de autenticidade e links públicos expiráveis."
        actions={
          canManageShareLinks ? (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={shareAllowPdfDownload}
                  disabled={!reportHasGeneratedPdf}
                  onChange={(event) => setShareAllowPdfDownload(event.target.checked)}
                />
                Permitir PDF no link
              </label>
              {!reportHasGeneratedPdf ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                  Gere o PDF antes de liberar download público
                </span>
              ) : null}
              <button
                type="button"
                className={PRIMARY_BUTTON}
                disabled={busyKey === "share-link"}
                onClick={() => void createShareLink()}
              >
                {busyKey === "share-link" ? "Criando..." : "Criar link público"}
              </button>
            </div>
          ) : null
        }
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Info
            label="PDF"
            value={reportHasGeneratedPdf ? "Gerado" : "Pendente"}
          />
          <Info label="Hash" value={report.documentHash?.slice(0, 24)} />
          <Info label="Validação" value={report.validationUrl ? "Disponível" : "Pendente"} />
        </div>
        {report.validationUrl ? (
          <a
            href={report.validationUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex text-sm font-bold text-blue-700 hover:text-blue-900"
          >
            Abrir validação pública
          </a>
        ) : null}
        <div className="mt-4 grid gap-3">
          {shareLinks.length === 0 ? (
            <EmptyState text="Nenhum link público criado para este laudo." />
          ) : (
            shareLinks.map((link) => (
              <div
                key={link.id}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 lg:grid-cols-[1fr_auto_auto]"
              >
                <div>
                  <p className="text-sm font-bold text-slate-950">
                    Expira em {formatServiceReportDate(link.expiresAt)}
                  </p>
                  <p className="text-xs font-semibold text-slate-500">
                    {link.revokedAt
                      ? `Revogado em ${formatServiceReportDate(link.revokedAt)}`
                      : `${link.accessCount} acesso(s) / PDF ${link.allowPdfDownload ? "liberado" : "bloqueado"}`}
                  </p>
                  {link.shareUrl ? (
                    <p className="mt-1 break-all text-xs text-slate-500">{link.shareUrl}</p>
                  ) : null}
                </div>
                {link.shareUrl ? (
                  <a
                    href={link.shareUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={SECONDARY_BUTTON}
                  >
                    Abrir
                  </a>
                ) : null}
                {!link.revokedAt ? (
                  <button
                    type="button"
                    className={DANGER_BUTTON}
                    disabled={busyKey === `revoke-${link.id}`}
                    onClick={() => void revokeShareLink(link.id)}
                  >
                    Revogar
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Dados técnicos"
        description={
          editable
            ? "Campos internos e externos do laudo antes da aprovação."
            : "Laudos aprovados, liberados ou cancelados ficam bloqueados para edição direta."
        }
      >
        <form onSubmit={saveReport} className="grid gap-4 lg:grid-cols-2">
          <FormField label="Título">
            <TextInput
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              disabled={!canEdit}
            />
          </FormField>
          <Info label="Atualizado em" value={formatServiceReportDate(report.updatedAt)} />
          <FormField label="Diagnostico" className="lg:col-span-2">
            <TextAreaInput
              value={form.diagnosis}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  diagnosis: event.target.value,
                }))
              }
              rows={4}
              disabled={!canEdit}
            />
          </FormField>
          <FormField label="Servico realizado" className="lg:col-span-2">
            <TextAreaInput
              value={form.performedServices}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  performedServices: event.target.value,
                }))
              }
              rows={4}
              disabled={!canEdit}
            />
          </FormField>
          <FormField label="Recomendacoes">
            <TextAreaInput
              value={form.recommendations}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  recommendations: event.target.value,
                }))
              }
              rows={3}
              disabled={!canEdit}
            />
          </FormField>
          <FormField label="Observacoes ao cliente">
            <TextAreaInput
              value={form.customerNotes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  customerNotes: event.target.value,
                }))
              }
              rows={3}
              disabled={!canEdit}
            />
          </FormField>
          <FormField label="Observacoes internas">
            <TextAreaInput
              value={form.observations}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  observations: event.target.value,
                }))
              }
              rows={3}
              disabled={!canEdit}
            />
          </FormField>
          <FormField label="Notas de segurança internas">
            <TextAreaInput
              value={form.safetyNotes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  safetyNotes: event.target.value,
                }))
              }
              rows={3}
              disabled={!canEdit}
            />
          </FormField>
          {canEdit ? (
            <div className="lg:col-span-2">
              <button type="submit" className={PRIMARY_BUTTON} disabled={busyKey === "save"}>
                {busyKey === "save" ? "Salvando..." : "Salvar dados técnicos"}
              </button>
            </div>
          ) : null}
        </form>
      </SectionCard>

      <SectionCard
        title="Checklist"
        description="Itens obrigatórios pendentes bloqueiam aprovação; itens não conformes exigem observação."
        actions={
          canEdit ? (
            <>
              <button type="button" className={SECONDARY_BUTTON} onClick={addChecklistItem}>
                Adicionar item
              </button>
              <button
                type="button"
                className={PRIMARY_BUTTON}
                disabled={busyKey === "checklist"}
                onClick={() => void saveChecklist()}
              >
                {busyKey === "checklist" ? "Salvando..." : "Salvar checklist"}
              </button>
            </>
          ) : null
        }
      >
        {checklist.length === 0 ? <EmptyState text="Nenhum item de checklist." /> : null}
        <div className="grid gap-3">
          {checklist.map((item, index) => (
            <div
              key={`${item.id || "new"}-${index}`}
              className="grid gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 lg:grid-cols-[1fr_160px_140px_1fr_auto]"
            >
              <TextInput
                value={item.label}
                onChange={(event) =>
                  updateChecklistItem(index, { label: event.target.value })
                }
                disabled={!canEdit}
                placeholder="Item verificado"
              />
              <select
                value={item.result}
                onChange={(event) =>
                  updateChecklistItem(index, {
                    result: event.target.value as ChecklistResult,
                  })
                }
                disabled={!canEdit}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none"
              >
                {CHECKLIST_RESULTS.map((result) => (
                  <option key={result} value={result}>
                    {CHECKLIST_RESULT_LABELS[result]}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={item.required}
                  onChange={(event) =>
                    updateChecklistItem(index, { required: event.target.checked })
                  }
                  disabled={!canEdit}
                />
                Obrigatorio
              </label>
              <TextInput
                value={item.notes || ""}
                onChange={(event) =>
                  updateChecklistItem(index, { notes: event.target.value })
                }
                disabled={!canEdit}
                placeholder="Observação"
              />
              {canEdit ? (
                <button
                  type="button"
                  className={DANGER_BUTTON}
                  onClick={() => removeChecklistItem(index)}
                >
                  Remover
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Evidências"
        description="Somente evidências marcadas como visíveis aparecem no Portal do Cliente após liberação do laudo."
      >
        {canAddEvidence ? (
          <form onSubmit={addEvidence} className="mb-5 grid gap-4 lg:grid-cols-2">
            <FormField label="Tipo">
              <select
                value={evidenceForm.type}
                onChange={(event) =>
                  setEvidenceForm((current) => ({
                    ...current,
                    type: event.target.value as EvidenceType,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none"
              >
                {EVIDENCE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {EVIDENCE_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Título">
              <TextInput
                value={evidenceForm.title}
                onChange={(event) =>
                  setEvidenceForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="Arquivo">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) =>
                  setEvidenceFile(event.target.files?.[0] ?? null)
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none"
              />
            </FormField>
            <FormField label="URL externa opcional">
              <TextInput
                value={evidenceForm.fileUrl}
                onChange={(event) =>
                  setEvidenceForm((current) => ({
                    ...current,
                    fileUrl: event.target.value,
                  }))
                }
                placeholder="https://..."
              />
            </FormField>
            <FormField label="Nome do arquivo">
              <TextInput
                value={evidenceForm.fileName}
                onChange={(event) =>
                  setEvidenceForm((current) => ({
                    ...current,
                    fileName: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="Descrição" className="lg:col-span-2">
              <TextAreaInput
                value={evidenceForm.description}
                onChange={(event) =>
                  setEvidenceForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={3}
              />
            </FormField>
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={evidenceForm.customerVisible}
                onChange={(event) =>
                  setEvidenceForm((current) => ({
                    ...current,
                    customerVisible: event.target.checked,
                  }))
                }
              />
              Visível ao cliente após liberação
            </label>
            <div>
              <button
                type="submit"
                className={PRIMARY_BUTTON}
                disabled={busyKey === "evidence"}
              >
                {busyKey === "evidence" ? "Registrando..." : "Adicionar evidência"}
              </button>
            </div>
          </form>
        ) : null}

        {report.evidences.length === 0 ? <EmptyState text="Nenhuma evidência registrada." /> : null}
        <div className="grid gap-3 md:grid-cols-2">
          {report.evidences.map((evidence) => (
            <article
              key={evidence.id}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <DataPill tone={evidence.customerVisible ? "emerald" : "slate"}>
                  {evidence.customerVisible ? "Cliente" : "Interna"}
                </DataPill>
                <DataPill tone="blue">{EVIDENCE_TYPE_LABELS[evidence.type]}</DataPill>
              </div>
              <h3 className="mt-3 text-sm font-bold text-slate-950">
                {evidence.title}
              </h3>
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
                  Abrir evidência
                </a>
              ) : null}
              {evidence.storageKey ? (
                <button
                  type="button"
                  className="mt-3 inline-flex text-sm font-bold text-blue-700 hover:text-blue-900"
                  disabled={busyKey === `download-${evidence.id}`}
                  onClick={() => void downloadEvidence(evidence.id, evidence.fileName)}
                >
                  {busyKey === `download-${evidence.id}` ? "Baixando..." : "Baixar arquivo"}
                </button>
              ) : null}
              {evidence.checksumSha256 ? (
                <p className="mt-2 break-all text-xs text-slate-500">
                  SHA-256 {evidence.checksumSha256.slice(0, 24)}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Assinatura"
        description="Assinatura simples coletada em campo, sem certificado digital avancado neste ciclo."
      >
        <form onSubmit={signReport} className="grid gap-4 lg:grid-cols-2">
          <FormField label="Responsavel">
            <TextInput
              value={signatureForm.signedByName}
              onChange={(event) =>
                setSignatureForm((current) => ({
                  ...current,
                  signedByName: event.target.value,
                }))
              }
              disabled={!canSign}
            />
          </FormField>
          <FormField label="Documento">
            <TextInput
              value={signatureForm.signedByDocument}
              onChange={(event) =>
                setSignatureForm((current) => ({
                  ...current,
                  signedByDocument: event.target.value,
                }))
              }
              disabled={!canSign}
            />
          </FormField>
          <FormField label="Assinatura ou referencia" className="lg:col-span-2">
            <TextAreaInput
              value={signatureForm.signatureData}
              onChange={(event) =>
                setSignatureForm((current) => ({
                  ...current,
                  signatureData: event.target.value,
                }))
              }
              rows={3}
              disabled={!canSign}
            />
          </FormField>
          <Info label="Assinado em" value={formatServiceReportDate(report.signedAt)} />
          {canSign ? (
            <div className="flex items-end">
              <button type="submit" className={PRIMARY_BUTTON} disabled={busyKey === "sign"}>
                {busyKey === "sign" ? "Registrando..." : "Registrar assinatura"}
              </button>
            </div>
          ) : null}
        </form>
      </SectionCard>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value || "-"}</p>
    </div>
  );
}

function State({ text, tone }: { text: string; tone?: "error" }) {
  return (
    <div
      className={`rounded-2xl border p-5 text-sm font-semibold ${
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      {text}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm font-semibold text-slate-600">
      {text}
    </div>
  );
}
