"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { clearAuthSession } from "@/lib/auth-session";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";
import {
  downloadDashboardDocumentBlob,
  fetchContractDocument,
  fetchContractDocumentDocx,
  type ContractDocumentGenerationOptions,
  type ContractDocumentPayload,
  type DashboardDocumentsApiError,
} from "@/lib/dashboard-documents";
import {
  EmptyState,
  FormField,
  SectionCard,
  StatusBanner,
  TextAreaInput,
  TextInput,
} from "../../../components/DashboardPageKit";
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
  const searchParams = useSearchParams();
  const renewalId = searchParams.get("renewalId");
  const [data, setData] = useState<ContractDocumentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [documentBusy, setDocumentBusy] = useState(false);
  const [generationOptions, setGenerationOptions] =
    useState<ContractDocumentGenerationOptions | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");

    try {
      const payload = await fetchContractDocument(id);
      if (!renewalId) {
        setData(payload);
        setGenerationOptions(payload.generationDefaults);
        return;
      }

      const response = await apiFetch(
        apiUrl(`/contracts/${id}/renewals/${renewalId}`),
        { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(
            response,
            "Nao foi possivel carregar os dados da renovacao.",
          ),
        );
      }
      const renewal = (await response.json()) as {
        sequence: number;
        proposedStartDate: string;
        proposedEndDate: string;
        proposedRecurringAmount: number;
        proposedPartsCoverage: "INCLUDED" | "BILLED_SEPARATELY";
        partsNotes?: string | null;
        customerNotes?: string | null;
      };
      setData({
        ...payload,
        document: {
          ...payload.document,
          title: `Termo de renovacao - ${payload.document.code}`,
          startDate: renewal.proposedStartDate,
          endDate: renewal.proposedEndDate,
          recurringAmount: renewal.proposedRecurringAmount,
          partsCoverage: renewal.proposedPartsCoverage,
        },
      });
      setGenerationOptions({
        ...payload.generationDefaults,
        documentTitle: `Termo de renovacao contratual ${payload.document.code}`,
        startDate: renewal.proposedStartDate,
        endDate: renewal.proposedEndDate,
        recurringAmount: renewal.proposedRecurringAmount,
        partsCoverage: renewal.proposedPartsCoverage,
        renewalNotes:
          renewal.customerNotes ||
          `Renovacao ${renewal.sequence} para o novo periodo de vigencia.`,
        additionalClauses: [renewal.partsNotes, renewal.customerNotes]
          .filter(Boolean)
          .join("\n\n"),
      });
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
  }, [id, renewalId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDownloadDocument() {
    if (!id || !data || !generationOptions) return;
    setDocumentBusy(true);
    setError("");

    try {
      const blob = await fetchContractDocumentDocx(id, generationOptions);
      downloadDashboardDocumentBlob(
        blob,
        renewalId
          ? `renovacao-${data.document.code}.docx`
          : `contrato-${data.document.code}.docx`,
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
          : "Erro ao baixar documento do contrato.",
      );
    } finally {
      setDocumentBusy(false);
    }
  }

  function updateGenerationOption<K extends keyof ContractDocumentGenerationOptions>(
    key: K,
    value: ContractDocumentGenerationOptions[K],
  ) {
    setGenerationOptions((current) =>
      current ? { ...current, [key]: value } : current,
    );
  }

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
      {data.viewerRole !== "CLIENT" && generationOptions ? (
        <SectionCard
          eyebrow="Emissão contratual"
          title="Configurar documento"
          description="Revise somente as condições desta emissão. Os dados do cliente, equipamentos, valores, vigência e SLA vêm do contrato cadastrado."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FormField label="Forma de pagamento">
              <TextInput
                value={generationOptions.paymentMethod}
                onChange={(event) =>
                  updateGenerationOption("paymentMethod", event.target.value)
                }
              />
            </FormField>
            <FormField label="Período da cobrança">
              <TextInput
                value={generationOptions.billingPeriod}
                onChange={(event) =>
                  updateGenerationOption("billingPeriod", event.target.value)
                }
              />
            </FormField>
            <FormField label="Regra de emissão">
              <TextInput
                value={generationOptions.billingIssueRule}
                onChange={(event) =>
                  updateGenerationOption("billingIssueRule", event.target.value)
                }
              />
            </FormField>
            <FormField label="Janela de manutenção">
              <TextInput
                value={generationOptions.maintenanceWindow}
                onChange={(event) =>
                  updateGenerationOption("maintenanceWindow", event.target.value)
                }
              />
            </FormField>
            <FormField label="Canal de chamados" className="md:col-span-2">
              <TextInput
                value={generationOptions.emergencyChannel}
                onChange={(event) =>
                  updateGenerationOption("emergencyChannel", event.target.value)
                }
              />
            </FormField>
            <FormField label="Renovação" className="md:col-span-2">
              <TextInput
                value={generationOptions.renewalNotes}
                onChange={(event) =>
                  updateGenerationOption("renewalNotes", event.target.value)
                }
              />
            </FormField>
            <FormField label="Foro">
              <TextInput
                value={generationOptions.legalVenue}
                onChange={(event) =>
                  updateGenerationOption("legalVenue", event.target.value)
                }
              />
            </FormField>
            <FormField label="Local de assinatura">
              <TextInput
                value={generationOptions.signaturePlace}
                onChange={(event) =>
                  updateGenerationOption("signaturePlace", event.target.value)
                }
              />
            </FormField>
            <FormField label="Representante MANITEC">
              <TextInput
                value={generationOptions.companySigner}
                onChange={(event) =>
                  updateGenerationOption("companySigner", event.target.value)
                }
              />
            </FormField>
            <FormField label="Representante do cliente">
              <TextInput
                value={generationOptions.clientSigner}
                onChange={(event) =>
                  updateGenerationOption("clientSigner", event.target.value)
                }
              />
            </FormField>
          </div>

          <details className="mt-5 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">
              Cláusulas e condições detalhadas
            </summary>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <FormField label="Detalhes do pagamento">
                <TextAreaInput
                  value={generationOptions.paymentDetails}
                  onChange={(event) =>
                    updateGenerationOption("paymentDetails", event.target.value)
                  }
                />
              </FormField>
              <FormField label="Regra de rescisão">
                <TextAreaInput
                  value={generationOptions.cancellationRule}
                  onChange={(event) =>
                    updateGenerationOption("cancellationRule", event.target.value)
                  }
                />
              </FormField>
              <FormField label="Chamados fora do escopo">
                <TextAreaInput
                  value={generationOptions.extraCallPolicy}
                  onChange={(event) =>
                    updateGenerationOption("extraCallPolicy", event.target.value)
                  }
                />
              </FormField>
              <FormField label="Exclusões">
                <TextAreaInput
                  value={generationOptions.exclusions}
                  onChange={(event) =>
                    updateGenerationOption("exclusions", event.target.value)
                  }
                />
              </FormField>
              <FormField label="Obrigações da MANITEC">
                <TextAreaInput
                  value={generationOptions.contractorObligations}
                  onChange={(event) =>
                    updateGenerationOption(
                      "contractorObligations",
                      event.target.value,
                    )
                  }
                />
              </FormField>
              <FormField label="Obrigações do cliente">
                <TextAreaInput
                  value={generationOptions.clientObligations}
                  onChange={(event) =>
                    updateGenerationOption("clientObligations", event.target.value)
                  }
                />
              </FormField>
              <FormField label="Condições adicionais" className="md:col-span-2">
                <TextAreaInput
                  value={generationOptions.additionalClauses}
                  onChange={(event) =>
                    updateGenerationOption("additionalClauses", event.target.value)
                  }
                />
              </FormField>
            </div>
          </details>

          <label className="mt-4 flex items-center gap-3 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={generationOptions.includePreventiveChecklist}
              onChange={(event) =>
                updateGenerationOption(
                  "includePreventiveChecklist",
                  event.target.checked,
                )
              }
              className="h-4 w-4 rounded border-slate-300"
            />
            Incluir roteiro de manutenção preventiva como Anexo I
          </label>
        </SectionCard>
      ) : null}

      <PrintDocumentShell
        company={data.company}
        title={`Contrato ${data.document.code}`}
        subtitle="Versao consolidada para vigencia, SLA, escopo e faturamento recorrente."
        code={data.document.code}
        sourceHref={data.sourceHref}
        sourceLabel={
          data.viewerRole === "CLIENT" ? "Voltar ao portal" : "Abrir contrato"
        }
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
          <ValueCard
            label="Documento institucional"
            value={formatLatestDocument(data.latestDocument)}
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

function formatLatestDocument(
  latestDocument: ContractDocumentPayload["latestDocument"],
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
