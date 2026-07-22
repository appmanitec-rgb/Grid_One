"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { clearAuthSession } from "@/lib/auth-session";
import {
  downloadDashboardDocumentBlob,
  fetchProposalDocument,
  fetchProposalDocumentDocx,
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

  async function handleDownloadDocument() {
    if (!id || !data) return;
    setDocumentBusy(true);
    setError("");

    try {
      const blob = await fetchProposalDocumentDocx(id);
      downloadDashboardDocumentBlob(blob, `proposta-${data.document.code}.docx`);
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
      <PrintDocumentShell
        company={data.company}
        title={`Proposta ${data.document.code}`}
        subtitle="Versao pronta para compartilhar condicoes comerciais, escopo e itens."
        code={data.document.code}
        sourceHref={data.sourceHref}
        sourceLabel="Abrir proposta"
        showPrintAction={false}
        actions={
          <button
            type="button"
            disabled={documentBusy}
            onClick={() => void handleDownloadDocument()}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-900 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {documentBusy
              ? "Gerando documento..."
              : data.latestDocument
                ? "Baixar documento"
                : "Gerar documento"}
          </button>
        }
      >
        <div className="flex flex-wrap gap-2">
          <ToolbarPill>{data.document.statusLabel}</ToolbarPill>
          <ToolbarPill>{data.document.type}</ToolbarPill>
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
                ? formatDate(data.document.validUntil)
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
              data.client.contactName || data.client.email || data.client.phone || "-"
            }
          />
          <ValueCard
            label="Endereco"
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
            label="Responsavel comercial"
            value={data.seller?.name || "Nao informado"}
          />
        </PrintSection>

        <PrintSection title="Condicoes comerciais" columns={3}>
          <ValueCard label="Frete" value={data.document.freight || "-"} />
          <ValueCard label="Pagamento" value={data.document.paymentTerm || "-"} />
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
                ? formatDate(data.document.firstDueDate)
                : "-"
            }
          />
        </PrintSection>

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

        <PrintSection title="Observacoes" columns={2}>
          <ValueCard
            label="Detalhes comerciais"
            value={data.document.paymentDetails || data.document.externalNotes || "-"}
          />
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
            value={formatLatestDocument(data.latestDocument)}
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
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
) {
  if (!latestDocument) return "Nenhum documento institucional gerado.";
  return [
    latestDocument.templateKey,
    latestDocument.templateVersion ? `v: ${latestDocument.templateVersion}` : null,
    latestDocument.createdAt ? `gerado em ${formatDateTime(latestDocument.createdAt)}` : null,
    latestDocument.checksumSha256
      ? `hash ${latestDocument.checksumSha256.slice(0, 16)}`
      : null,
  ]
    .filter(Boolean)
    .join(" | ");
}
