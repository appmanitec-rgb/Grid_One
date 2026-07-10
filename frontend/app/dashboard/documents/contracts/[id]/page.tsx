"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { clearAuthSession } from "@/lib/auth-session";
import {
  fetchContractDocument,
  type ContractDocumentPayload,
  type DashboardDocumentsApiError,
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

export default function ContractDocumentPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ContractDocumentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");

    try {
      const payload = await fetchContractDocument(id);
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
          : "Erro ao carregar o documento do contrato.",
      );
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return (
      <div className="space-y-4">
        {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
        <EmptyState
          title={loading ? "Montando documento" : "Documento indisponivel"}
          description="Estamos reunindo o contexto contratual e financeiro."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PrintDocumentShell
        company={data.company}
        title={`Contrato ${data.document.code}`}
        subtitle="Versao consolidada para vigencia, SLA, escopo e faturamento recorrente."
        code={data.document.code}
        sourceHref={data.sourceHref}
        sourceLabel={
          data.viewerRole === "CLIENT" ? "Voltar ao portal" : "Abrir contrato"
        }
      >
        <div className="flex flex-wrap gap-2">
          <ToolbarPill>{data.document.statusLabel}</ToolbarPill>
          <ToolbarPill>{formatCurrency(data.document.recurringAmount)}</ToolbarPill>
          <ToolbarPill>{`${data.summary.equipments} equipamento(s)`}</ToolbarPill>
        </div>

        <PrintSection title="Resumo" columns={3}>
          <ValueCard
            label="Cliente"
            value={data.client.tradeName || data.client.companyName}
          />
          <ValueCard
            label="Vigencia"
            value={`${formatDate(data.document.startDate)} ate ${formatDate(
              data.document.endDate,
            )}`}
          />
          <ValueCard
            label="Emissao"
            value={formatDateTime(data.document.issuedAt)}
            tone="accent"
          />
        </PrintSection>

        <PrintSection title="Regras do contrato" columns={3}>
          <ValueCard
            label="Recorrencia preventiva"
            value={data.document.preventiveRecurrence}
          />
          <ValueCard
            label="SLA de resposta"
            value={
              data.document.responseTimeHours
                ? `${data.document.responseTimeHours}h`
                : "-"
            }
          />
          <ValueCard
            label="Visitas corretivas"
            value={data.document.correctiveVisitAllowance ?? "-"}
          />
          <ValueCard
            label="Cobertura de pecas"
            value={data.document.partsCoverage}
          />
          <ValueCard label="Vencimento" value={`Dia ${data.document.dueDay}`} />
          <ValueCard label="Indice" value={data.document.adjustmentIndex} />
        </PrintSection>

        <PrintSection title="Escopo coberto">
          <PrintTable headers={["Equipamento", "Serie", "Site", "Cobertura"]}>
            {data.equipments.map((item) => (
              <tr key={item.id} className="border-t border-slate-200">
                <td className="px-4 py-3 text-slate-800">{item.generator.name}</td>
                <td className="px-4 py-3 text-slate-600">
                  {item.generator.serialNumber || "-"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {item.generator.currentSite?.name || "-"}
                </td>
                <td className="px-4 py-3 font-semibold text-slate-900">
                  {item.coverageAmount != null
                    ? formatCurrency(Number(item.coverageAmount))
                    : "-"}
                </td>
              </tr>
            ))}
          </PrintTable>
        </PrintSection>

        <PrintSection title="Faturas">
          <PrintTable
            headers={["Competencia", "Vencimento", "Valor", "Status", "Pago em"]}
          >
            {data.invoices.map((invoice) => (
              <tr key={invoice.id} className="border-t border-slate-200">
                <td className="px-4 py-3 text-slate-800">
                  {formatDate(invoice.competenceDate)}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {formatDate(invoice.dueDate)}
                </td>
                <td className="px-4 py-3 font-semibold text-slate-900">
                  {formatCurrency(invoice.amount)}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {invoice.statusLabel}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {invoice.paidAt ? formatDate(invoice.paidAt) : "-"}
                </td>
              </tr>
            ))}
          </PrintTable>
        </PrintSection>

        <PrintSection title="Observacoes" columns={2}>
          <ValueCard
            label="Observacoes contratuais"
            value={data.document.notes || "-"}
          />
          <ValueCard
            label="Relacoes"
            value={
              [
                data.sourceProposal?.code
                  ? `Proposta origem: ${data.sourceProposal.code}`
                  : null,
                data.createdByUser?.name
                  ? `Criado por: ${data.createdByUser.name}`
                  : null,
                data.client.isDelinquent
                  ? "Cliente marcado como inadimplente"
                  : null,
              ]
                .filter(Boolean)
                .join(" | ") || "-"
            }
          />
        </PrintSection>
      </PrintDocumentShell>

      {data.viewerRole !== "CLIENT" ? (
        <DocumentSharePanel
          documentType="CONTRACT"
          documentId={data.document.id}
          documentLabel={`Contrato ${data.document.code}`}
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
