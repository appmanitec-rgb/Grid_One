"use client";
import ModalDialog from "../../../components/ModalDialog";
import { formatCalendarDate, formatDocument } from "@/lib/formatters";
import PdfPreview from "../../../components/PdfPreview";

import { useParams, useRouter } from "next/navigation";
import { commercialLabel } from "@/lib/commercial-labels";
import { useCallback, useEffect, useRef, useState } from "react";
import { clearAuthSession } from "@/lib/auth-session";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";
import {
  downloadDashboardDocumentBlob,
  fetchProposalDocument,
  fetchProposalDocumentDocx,
  fetchProposalDocumentInstitutionalPdf,
  fetchProposalApprovedWordPdfCopy,
  type DashboardDocumentsApiError,
  type ProposalDocumentPayload,
} from "@/lib/dashboard-documents";
import { EmptyState, StatusBanner } from "../../../components/DashboardPageKit";
import {
  PrintDocumentShell,
  PrintSection,
  PrintTable,
  ToolbarPill,
  ValueCard,
} from "../../DocumentPrintKit";
import DocumentSharePanel from "../../DocumentSharePanel";

export default function ProposalDocumentPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ProposalDocumentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [documentBusy, setDocumentBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const pdfTrigger = useRef<HTMLButtonElement>(null);
  const [pdfPreview, setPdfPreview] = useState<{
    url: string;
    blob: Blob;
  } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");

    try {
      const payload = await fetchProposalDocument(id);
      setData(payload);
    } catch (loadError: unknown) {
      const apiError = loadError as DashboardDocumentsApiError;
      if (apiError?.status === 401) {
        clearAuthSession();
        router.replace("/");
        return;
      }

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar o documento da proposta.",
      );
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (pdfPreview) URL.revokeObjectURL(pdfPreview.url);
    };
  }, [pdfPreview]);

  async function handleDownloadDocument() {
    if (!id || !data) return;
    setDocumentBusy(true);
    setError("");

    try {
      const blob = await fetchProposalDocumentDocx(id);
      downloadDashboardDocumentBlob(
        blob,
        `proposta-${data.document.code.replace(/[^a-zA-Z0-9._-]/g, "-")}.docx`,
      );
    } catch (downloadError: unknown) {
      const apiError = downloadError as DashboardDocumentsApiError;
      if (apiError?.status === 401) {
        clearAuthSession();
        router.replace("/");
        return;
      }
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Erro ao baixar documento da proposta.",
      );
    } finally {
      setDocumentBusy(false);
    }
  }

  async function handleDownloadOriginal() {
    if (!id || !data?.document.externalDocumentFileName) return;
    setDocumentBusy(true);
    setError("");

    try {
      const response = await apiFetch(
        apiUrl("/proposals/" + id + "/external-document"),
        {
          cache: "no-store",
        },
      );
      if (response.status === 401) {
        clearAuthSession();
        router.replace("/");
        return;
      }
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(
            response,
            "Erro ao baixar o arquivo original.",
          ),
        );
      }
      const fileName = data.document.externalDocumentFileName.replace(
        /[^a-zA-Z0-9._-]/g,
        "-",
      );
      downloadDashboardDocumentBlob(await response.blob(), fileName);
    } catch (downloadError: unknown) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Erro ao baixar o arquivo original.",
      );
    } finally {
      setDocumentBusy(false);
    }
  }
  async function handlePreviewPdf() {
    if (!id) return;
    setPdfBusy(true);
    setError("");

    try {
      const blob = data?.hasApprovedSnapshot
        ? await fetchProposalApprovedWordPdfCopy(id)
        : await fetchProposalDocumentInstitutionalPdf(id);
      setPdfPreview({ url: URL.createObjectURL(blob), blob });
    } catch (previewError: unknown) {
      const apiError = previewError as DashboardDocumentsApiError;
      if (apiError?.status === 401) {
        clearAuthSession();
        router.replace("/");
        return;
      }
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Erro ao visualizar o PDF da proposta.",
      );
    } finally {
      setPdfBusy(false);
    }
  }

  async function handleDownloadPdf() {
    if (!id || !data) return;
    setPdfBusy(true);
    setError("");

    try {
      const blob =
        pdfPreview?.blob ||
        (data.hasApprovedSnapshot
          ? await fetchProposalApprovedWordPdfCopy(id)
          : await fetchProposalDocumentInstitutionalPdf(id));
      downloadDashboardDocumentBlob(
        blob,
        `proposta-${data.document.code.replace(/[^a-zA-Z0-9._-]/g, "-")}${data.hasApprovedSnapshot ? "-copia-word" : ""}.pdf`,
      );
    } catch (downloadError: unknown) {
      const apiError = downloadError as DashboardDocumentsApiError;
      if (apiError?.status === 401) {
        clearAuthSession();
        router.replace("/");
        return;
      }
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Erro ao baixar PDF institucional da proposta.",
      );
    } finally {
      setPdfBusy(false);
    }
  }

  async function handleDownloadOriginalPdf() {
    if (!id || !data) return;
    setPdfBusy(true);
    setError("");
    try {
      downloadDashboardDocumentBlob(
        await fetchProposalDocumentInstitutionalPdf(id),
        `proposta-${data.document.code.replace(/[^a-zA-Z0-9._-]/g, "-")}-original-aprovado.pdf`,
      );
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Não foi possível baixar o PDF aprovado original.",
      );
    } finally {
      setPdfBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="space-y-4">
        {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
        <EmptyState
          title={loading ? "Montando documento" : "Documento indisponivel"}
          description="Estamos reunindo o material comercial desta proposta."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {data.viewerRole !== "CLIENT" && !data.company.cnpj ? (
        <StatusBanner tone="amber">
          Os dados gerais da emitente estão incompletos nesta versão. Confira o
          cadastro da empresa antes de usar a proposta com o cliente.
        </StatusBanner>
      ) : null}
      {data.hasApprovedSnapshot ? (
        <StatusBanner tone="blue">
          A visualização e o PDF do Word usam o documento Word aprovado. O PDF
          aprovado original permanece disponível, sem alterações.
        </StatusBanner>
      ) : null}
      {data.document.origin === "EXTERNAL" &&
      !data.document.externalDocumentFileName ? (
        <StatusBanner tone="amber">
          O arquivo original ainda não está disponível nesta proposta.
        </StatusBanner>
      ) : null}
      {pdfPreview ? (
        <ModalDialog
          title={"PDF da proposta " + data.document.code}
          returnFocusRef={pdfTrigger}
          onClose={() => setPdfPreview(null)}
          actions={
            <button
              type="button"
              className="app-button app-button-secondary"
              onClick={() => void handleDownloadPdf()}
            >
              Baixar PDF
            </button>
          }
        >
          <PdfPreview url={pdfPreview.url} />
        </ModalDialog>
      ) : null}
      <PrintDocumentShell
        company={data.company}
        title={`Proposta ${data.document.code}`}
        subtitle={
          data.document.origin === "EXTERNAL"
            ? "Arquivo recebido do cliente. Baixe o original ou compartilhe um link seguro."
            : "Resumo de consulta. Visualize o PDF institucional, baixe arquivos ou compartilhe com o cliente."
        }
        code={data.document.code}
        sourceHref={data.sourceHref}
        sourceLabel="Abrir proposta"
        showPrintAction={false}
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            {data.document.origin === "EXTERNAL" ? (
              data.document.externalDocumentFileName ? (
                <button
                  type="button"
                  disabled={documentBusy}
                  onClick={() => void handleDownloadOriginal()}
                  className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {documentBusy
                    ? "Baixando arquivo..."
                    : "Baixar arquivo original"}
                </button>
              ) : null
            ) : (
              <>
                <button
                  type="button"
                  disabled={pdfBusy}
                  onClick={() => void handlePreviewPdf()}
                  ref={pdfTrigger}
                  className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pdfBusy
                    ? "Abrindo PDF..."
                    : data.hasApprovedSnapshot
                      ? "Visualizar PDF do Word"
                      : "Visualizar PDF"}
                </button>
                <button
                  type="button"
                  disabled={pdfBusy}
                  onClick={() => void handleDownloadPdf()}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-900 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {data.hasApprovedSnapshot
                    ? "Baixar PDF do Word"
                    : "Baixar PDF"}
                </button>
                <button
                  type="button"
                  disabled={documentBusy}
                  onClick={() => void handleDownloadDocument()}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {documentBusy ? "Gerando DOCX..." : "Baixar DOCX"}
                </button>
                {data.hasApprovedSnapshot ? (
                  <button
                    type="button"
                    disabled={pdfBusy}
                    onClick={() => void handleDownloadOriginalPdf()}
                    className="app-button app-button-secondary"
                  >
                    PDF aprovado original
                  </button>
                ) : null}
              </>
            )}
            {data.viewerRole !== "CLIENT" ? (
              <a
                href="#compartilhar-documento"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Compartilhar com cliente
              </a>
            ) : null}
          </div>
        }
      >
        <div className="flex flex-wrap gap-2">
          <ToolbarPill>{data.document.statusLabel}</ToolbarPill>
          <ToolbarPill>{commercialLabel(data.document.type)}</ToolbarPill>
          <ToolbarPill>{formatCurrency(data.document.totalValue)}</ToolbarPill>
        </div>

        <PrintSection title="Resumo" columns={3}>
          <ValueCard
            label="Cliente"
            value={data.client.tradeName || data.client.companyName}
          />
          <ValueCard
            label="Validade"
            value={
              data.document.validUntil
                ? formatCalendarDate(data.document.validUntil)
                : "Sem prazo"
            }
          />
          <ValueCard
            label="Emitida em"
            value={formatDateTime(data.document.issuedAt)}
            tone="accent"
          />
        </PrintSection>

        <PrintSection title="Contexto comercial" columns={2}>
          <ValueCard
            label="Contato"
            value={
              data.client.contactName ||
              data.client.email ||
              data.client.phone ||
              "-"
            }
          />
          <ValueCard
            label="Endereço"
            value={
              [data.client.address, data.client.city, data.client.state]
                .filter(Boolean)
                .join(" - ") || "-"
            }
          />
          <ValueCard
            label="Equipamento"
            value={
              data.generator
                ? `${data.generator.name}${
                    data.generator.serialNumber
                      ? ` / ${data.generator.serialNumber}`
                      : ""
                  }`
                : "Nao vinculado"
            }
          />
          <ValueCard
            label="Responsável comercial"
            value={data.seller?.name || "Nao informado"}
          />
        </PrintSection>

        <PrintSection title="Condições comerciais" columns={3}>
          <ValueCard label="Frete" value={data.document.freight || "-"} />
          <ValueCard
            label="Pagamento"
            value={
              data.document.paymentSummary ||
              commercialLabel(data.document.paymentTerm, "—")
            }
          />
          <ValueCard
            label="Prazo"
            value={
              data.document.deliveryLeadTimeDays
                ? `${data.document.deliveryLeadTimeDays} dia(s)`
                : "-"
            }
          />
          <ValueCard
            label="Entrada"
            value={
              data.document.hasDownPayment
                ? formatCurrency(Number(data.document.downPaymentAmount || 0))
                : "Nao"
            }
          />
          <ValueCard
            label="Parcelamento"
            value={
              data.document.installmentCount
                ? `${data.document.installmentCount}x a cada ${
                    data.document.installmentIntervalDays || 30
                  } dia(s)`
                : "A combinar"
            }
          />
          <ValueCard
            label="Primeiro vencimento"
            value={
              data.document.firstDueDate
                ? formatCalendarDate(data.document.firstDueDate)
                : "-"
            }
          />
        </PrintSection>

        {data.document.scope ? (
          <PrintSection title="Escopo técnico dos serviços">
            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-800">
              {data.document.scope}
            </p>
          </PrintSection>
        ) : null}

        <PrintSection title="Itens">
          <PrintTable headers={["Item", "SKU", "Qtd.", "Unit.", "Total"]}>
            {data.items.map((item) => (
              <tr key={item.id} className="border-t border-slate-200">
                <td className="px-4 py-3 text-slate-800">
                  {item.catalogItem?.name || "Item"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {item.catalogItem?.sku || "-"}
                </td>
                <td className="px-4 py-3 text-slate-600">{item.quantity}</td>
                <td className="px-4 py-3 text-slate-600">
                  {formatCurrency(item.unitPrice)}
                </td>
                <td className="px-4 py-3 font-semibold text-slate-900">
                  {formatCurrency(item.totalPrice)}
                </td>
              </tr>
            ))}
          </PrintTable>
        </PrintSection>

        {!!data.document.paymentSelections?.length && (
          <PrintSection title="Dados de pagamento" columns={2}>
            {data.document.paymentSelections.map((payment, index) => (
              <article
                key={`${payment.purpose}-${index}`}
                className="rounded-xl border border-slate-200 p-4"
              >
                <h3 className="mb-3 text-base font-semibold text-slate-900">
                  {payment.purpose === "PARTS"
                    ? "Peças e materiais"
                    : payment.purpose === "SERVICES"
                      ? "Serviços"
                      : "Recebimento"}
                </h3>
                <dl className="space-y-2 text-sm">
                  {[
                    ["Empresa", payment.issuerCompanyName],
                    ["Favorecido", payment.beneficiary],
                    [
                      "CPF / CNPJ",
                      payment.beneficiaryDocument
                        ? formatDocument(payment.beneficiaryDocument)
                        : undefined,
                    ],
                    [
                      "Forma",
                      payment.method
                        ? commercialLabel(payment.method)
                        : undefined,
                    ],
                    ["Banco", payment.bankName],
                    ["Agência", payment.agency],
                    ["Conta", payment.accountNumber],
                    ["Chave Pix", payment.pixKey],
                    ["Instruções", payment.boletoInstructions],
                  ]
                    .filter(([, value]) => value)
                    .map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-slate-500">{label}</dt>
                        <dd className="break-words text-slate-900">{value}</dd>
                      </div>
                    ))}
                </dl>
              </article>
            ))}
          </PrintSection>
        )}

        <PrintSection title="Observações" columns={2}>
          {!data.document.paymentSelections?.length &&
          data.document.paymentDetails ? (
            <ValueCard
              label="Instruções de pagamento"
              value={data.document.paymentDetails}
            />
          ) : null}
          {data.document.externalNotes ? (
            <ValueCard
              label="Observações comerciais"
              value={data.document.externalNotes}
            />
          ) : null}
          <ValueCard
            label="Relacoes"
            value={
              [
                data.salesOpportunity?.title
                  ? `Oportunidade: ${data.salesOpportunity.title}`
                  : null,
                data.document.generatedContract?.code
                  ? `Contrato gerado: ${data.document.generatedContract.code}`
                  : null,
                data.related.parentProposal?.code
                  ? `Origem: ${data.related.parentProposal.code}`
                  : null,
              ]
                .filter(Boolean)
                .join(" | ") || "-"
            }
          />
          <ValueCard
            label="Documento institucional"
            value={formatLatestDocument(
              data.latestDocument,
              data.hasApprovedSnapshot,
              data.document.revision,
            )}
          />
        </PrintSection>
      </PrintDocumentShell>

      {data.viewerRole !== "CLIENT" ? (
        <DocumentSharePanel
          documentType="PROPOSAL"
          documentId={data.document.id}
          documentLabel={`Proposta ${data.document.code}`}
          defaultRecipientName={
            data.client.contactName ||
            data.client.tradeName ||
            data.client.companyName
          }
          defaultRecipientEmail={data.client.email || ""}
          defaultRecipientPhone={data.client.phone || ""}
        />
      ) : null}
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function formatLatestDocument(
  latestDocument: ProposalDocumentPayload["latestDocument"],
  approved = false,
  revision = 0,
) {
  if (approved)
    return `Versão aprovada · revisão ${revision} · DOCX e PDF disponíveis.`;
  if (!latestDocument) return "Nenhum documento institucional gerado.";
  return [
    latestDocument.fileName || "Documento institucional",
    latestDocument.templateVersion
      ? `v: ${latestDocument.templateVersion}`
      : null,
    latestDocument.createdAt
      ? `gerado em ${formatDateTime(latestDocument.createdAt)}`
      : null,
  ]
    .filter(Boolean)
    .join(" | ");
}
