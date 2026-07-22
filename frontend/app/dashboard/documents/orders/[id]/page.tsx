"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { clearAuthSession } from "@/lib/auth-session";
import {
  downloadDashboardDocumentBlob,
  fetchOrderDocument,
  fetchOrderDocumentDocx,
  type DashboardDocumentsApiError,
  type OrderDocumentPayload,
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

export default function OrderDocumentPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<OrderDocumentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [documentBusy, setDocumentBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");

    try {
      const payload = await fetchOrderDocument(id);
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
          : "Erro ao carregar o documento da O.S.",
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
      const blob = await fetchOrderDocumentDocx(id);
      downloadDashboardDocumentBlob(
        blob,
        `ordem-servico-${data.document.id.slice(0, 8).toUpperCase()}.docx`,
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
          : "Erro ao baixar documento da O.S.",
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
          description="Estamos reunindo relatorio, materiais e assinatura desta O.S."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PrintDocumentShell
        company={data.company}
        title={data.document.title}
        subtitle="Versao tecnica pronta para impressao, aprovacao e envio ao cliente."
        code={data.document.id.slice(0, 8).toUpperCase()}
        sourceHref={data.sourceHref}
        sourceLabel={data.viewerRole === "CLIENT" ? "Voltar ao portal" : "Abrir O.S."}
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
          <ToolbarPill>{data.document.priority || "NORMAL"}</ToolbarPill>
        </div>

        <PrintSection title="Resumo" columns={3}>
          <ValueCard
            label="Cliente"
            value={data.client.tradeName || data.client.companyName}
          />
          <ValueCard
            label="Equipamento"
            value={`${data.generator.name}${
              data.generator.serialNumber ? ` / ${data.generator.serialNumber}` : ""
            }`}
          />
          <ValueCard
            label="Abertura"
            value={formatDateTime(data.document.openedAt)}
            tone="accent"
          />
        </PrintSection>

        <PrintSection title="Execucao" columns={3}>
          <ValueCard
            label="Tecnico"
            value={data.technician?.user?.name || "Nao alocado"}
          />
          <ValueCard
            label="Contrato"
            value={data.contract?.code || "O.S. avulsa"}
          />
          <ValueCard
            label="Site"
            value={data.site?.name || data.generator.currentSite?.name || "-"}
          />
          <ValueCard
            label="Agendada para"
            value={
              data.document.scheduledTo
                ? formatDateTime(data.document.scheduledTo)
                : "-"
            }
          />
          <ValueCard
            label="Iniciada em"
            value={
              data.document.startedAt ? formatDateTime(data.document.startedAt) : "-"
            }
          />
          <ValueCard
            label="Concluida em"
            value={
              data.document.finishedAt
                ? formatDateTime(data.document.finishedAt)
                : "-"
            }
          />
        </PrintSection>

        <PrintSection title="Descricao" columns={1}>
          <ValueCard label="Escopo" value={data.document.description || "-"} />
        </PrintSection>

        <PrintSection title="Relatorio de visita" columns={2}>
          <ValueCard
            label="Relatorio"
            value={data.document.customerReport || "Relatorio ainda nao enviado."}
          />
          <ValueCard
            label="Assinatura do cliente"
            value={
              data.document.customerSignatureUrl ? (
                <Link
                  href={data.document.customerSignatureUrl}
                  target="_blank"
                  className="font-semibold text-sky-700 hover:underline"
                >
                  Abrir comprovante
                </Link>
              ) : (
                "Assinatura ainda nao anexada."
              )
            }
          />
        </PrintSection>

        {data.checklist.length > 0 ? (
          <PrintSection title="Checklist" columns={2}>
            {data.checklist.map((entry) => (
              <ValueCard key={entry.label} label={entry.label} value={entry.value} />
            ))}
          </PrintSection>
        ) : null}

        <PrintSection title="Materiais">
          <PrintTable headers={["Item", "SKU", "Qtd.", "Reservado em", "Custo"]}>
            {data.materials.map((item) => (
              <tr key={item.id} className="border-t border-slate-200">
                <td className="px-4 py-3 text-slate-800">
                  {item.catalogItem?.name || "Material"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {item.catalogItem?.sku || "-"}
                </td>
                <td className="px-4 py-3 text-slate-600">{item.quantity}</td>
                <td className="px-4 py-3 text-slate-600">
                  {item.reservedAt ? formatDateTime(item.reservedAt) : "-"}
                </td>
                <td className="px-4 py-3 font-semibold text-slate-900">
                  {item.unitCost != null
                    ? formatCurrency(Number(item.unitCost) * item.quantity)
                    : "-"}
                </td>
              </tr>
            ))}
          </PrintTable>
        </PrintSection>

        <PrintSection title="Documento institucional" columns={1}>
          <ValueCard
            label="Ultimo documento"
            value={formatLatestDocument(data.latestDocument)}
          />
        </PrintSection>
      </PrintDocumentShell>

      {data.viewerRole !== "CLIENT" ? (
        <DocumentSharePanel
          documentType="ORDER"
          documentId={data.document.id}
          documentLabel={data.document.title}
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
  latestDocument: OrderDocumentPayload["latestDocument"],
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
