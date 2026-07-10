"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  fetchSharedDocument,
  type DeliveriesApiError,
  type SharedDocumentEnvelope,
} from "@/lib/document-deliveries";
import { EmptyState, StatusBanner } from "../../dashboard/components/DashboardPageKit";
import {
  PrintDocumentShell,
  PrintSection,
  PrintTable,
  ToolbarPill,
  ValueCard,
} from "../../dashboard/documents/DocumentPrintKit";

export default function SharedDocumentPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedDocumentEnvelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      if (!token) return;
      setLoading(true);
      setError("");

      try {
        const payload = await fetchSharedDocument(token);
        if (active) {
          setData(payload);
        }
      } catch (loadError: unknown) {
        const apiError = loadError as DeliveriesApiError;
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : apiError?.status === 404
                ? "Link seguro nao encontrado."
                : "Erro ao abrir este documento.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [token]);

  if (!data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
        <EmptyState
          title={loading ? "Abrindo documento" : "Documento indisponivel"}
          description="Estamos preparando a copia segura deste compartilhamento."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {renderSharedDocument(data)}
    </div>
  );
}

function renderSharedDocument(data: SharedDocumentEnvelope) {
  if (data.kind === "proposal") {
    return (
      <PrintDocumentShell
        company={data.company}
        title={`Proposta ${data.document.code}`}
        subtitle="Copia compartilhada com link seguro."
        code={data.document.code}
        backHref="/"
        backLabel="Voltar"
      >
        <div className="flex flex-wrap gap-2">
          <ToolbarPill>{data.document.statusLabel}</ToolbarPill>
          <ToolbarPill>{formatCurrency(data.document.totalValue)}</ToolbarPill>
          <ToolbarPill>Link seguro</ToolbarPill>
        </div>
        <PrintSection title="Resumo" columns={3}>
          <ValueCard label="Cliente" value={data.client.tradeName || data.client.companyName} />
          <ValueCard label="Validade" value={data.document.validUntil ? formatDate(data.document.validUntil) : "Sem prazo"} />
          <ValueCard label="Revisao" value={String(data.document.revision || 0)} tone="accent" />
        </PrintSection>
        <PrintSection title="Itens">
          <PrintTable headers={["Item", "Qtd.", "Unit.", "Total"]}>
            {data.items.map((item) => (
              <tr key={item.id} className="border-t border-slate-200">
                <td className="px-4 py-3">{item.catalogItem?.name || "Item"}</td>
                <td className="px-4 py-3">{item.quantity}</td>
                <td className="px-4 py-3">{formatCurrency(item.unitPrice)}</td>
                <td className="px-4 py-3 font-semibold">{formatCurrency(item.totalPrice)}</td>
              </tr>
            ))}
          </PrintTable>
        </PrintSection>
      </PrintDocumentShell>
    );
  }

  if (data.kind === "contract") {
    return (
      <PrintDocumentShell
        company={data.company}
        title={`Contrato ${data.document.code}`}
        subtitle="Copia compartilhada com link seguro."
        code={data.document.code}
        backHref="/"
        backLabel="Voltar"
      >
        <div className="flex flex-wrap gap-2">
          <ToolbarPill>{data.document.statusLabel}</ToolbarPill>
          <ToolbarPill>{formatCurrency(data.document.recurringAmount)}</ToolbarPill>
          <ToolbarPill>{`${data.summary.equipments} equipamento(s)`}</ToolbarPill>
        </div>
        <PrintSection title="Resumo" columns={3}>
          <ValueCard label="Cliente" value={data.client.tradeName || data.client.companyName} />
          <ValueCard label="Vigencia" value={`${formatDate(data.document.startDate)} ate ${formatDate(data.document.endDate)}`} />
          <ValueCard label="SLA" value={data.document.responseTimeHours ? `${data.document.responseTimeHours}h` : "-"} tone="accent" />
        </PrintSection>
        <PrintSection title="Escopo">
          <PrintTable headers={["Equipamento", "Serie", "Site", "Cobertura"]}>
            {data.equipments.map((item) => (
              <tr key={item.id} className="border-t border-slate-200">
                <td className="px-4 py-3">{item.generator.name}</td>
                <td className="px-4 py-3">{item.generator.serialNumber || "-"}</td>
                <td className="px-4 py-3">{item.generator.currentSite?.name || "-"}</td>
                <td className="px-4 py-3 font-semibold">
                  {item.coverageAmount != null ? formatCurrency(Number(item.coverageAmount)) : "-"}
                </td>
              </tr>
            ))}
          </PrintTable>
        </PrintSection>
      </PrintDocumentShell>
    );
  }

  return (
    <PrintDocumentShell
      company={data.company}
      title={data.document.title}
      subtitle="Copia compartilhada com link seguro."
      code={String(data.document.id).slice(0, 8).toUpperCase()}
      backHref="/"
      backLabel="Voltar"
    >
      <div className="flex flex-wrap gap-2">
        <ToolbarPill>{data.document.statusLabel}</ToolbarPill>
        <ToolbarPill>{data.document.type}</ToolbarPill>
        <ToolbarPill>{data.document.priority || "NORMAL"}</ToolbarPill>
      </div>
      <PrintSection title="Resumo" columns={3}>
        <ValueCard label="Cliente" value={data.client.tradeName || data.client.companyName} />
        <ValueCard label="Equipamento" value={data.generator.name} />
        <ValueCard label="Abertura" value={formatDateTime(data.document.openedAt)} tone="accent" />
      </PrintSection>
      <PrintSection title="Relatorio" columns={2}>
        <ValueCard label="Descricao" value={data.document.description || "-"} />
        <ValueCard label="Relatorio tecnico" value={data.document.customerReport || "Sem relatorio registrado."} />
      </PrintSection>
      {data.materials.length > 0 ? (
        <PrintSection title="Materiais">
          <PrintTable headers={["Item", "Qtd.", "Reservado em", "Custo"]}>
            {data.materials.map((item) => (
              <tr key={item.id} className="border-t border-slate-200">
                <td className="px-4 py-3">{item.catalogItem?.name || "Material"}</td>
                <td className="px-4 py-3">{item.quantity}</td>
                <td className="px-4 py-3">{item.reservedAt ? formatDateTime(item.reservedAt) : "-"}</td>
                <td className="px-4 py-3 font-semibold">
                  {item.unitCost != null ? formatCurrency(Number(item.unitCost) * item.quantity) : "-"}
                </td>
              </tr>
            ))}
          </PrintTable>
        </PrintSection>
      ) : null}
    </PrintDocumentShell>
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
