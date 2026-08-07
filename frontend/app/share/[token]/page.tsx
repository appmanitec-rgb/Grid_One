"use client";

import { useParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import {
  approveSharedProposal,
  fetchSharedDocument,
  type DeliveriesApiError,
  type SharedProposalApprovalResponse,
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
  const [signerName, setSignerName] = useState("");
  const [signerCpf, setSignerCpf] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [approval, setApproval] =
    useState<SharedProposalApprovalResponse | null>(null);
  const [approvalError, setApprovalError] = useState("");
  const [approving, setApproving] = useState(false);

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
          if (payload.kind === "proposal") {
            const defaultSigner =
              payload.share.recipientName ||
              payload.client.contactName ||
              payload.client.tradeName ||
              payload.client.companyName ||
              "";
            setSignerName((current) => current || defaultSigner);
          }
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

  async function handleApproveProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !data || data.kind !== "proposal") return;

    setApproving(true);
    setApprovalError("");
    try {
      const response = await approveSharedProposal(token, {
        signerName,
        signerCpf,
        signatureData,
        note: approvalNote,
      });
      setApproval(response);
      setData((current) => {
        if (!current || current.kind !== "proposal") return current;
        return {
          ...current,
          document: {
            ...current.document,
            status: response.proposal.status,
            statusLabel: response.proposal.statusLabel,
            customerDecisionAt: response.proposal.customerDecisionAt,
            customerDecisionSource: response.proposal.customerDecisionSource,
            customerDecisionNote: "Aprovada via link seguro com aceite assinado.",
          },
        };
      });
    } catch (approveError: unknown) {
      setApprovalError(
        approveError instanceof Error
          ? approveError.message
          : "Nao foi possivel aprovar esta proposta.",
      );
    } finally {
      setApproving(false);
    }
  }

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
      {renderSharedDocument(data, {
        signerName,
        signerCpf,
        signatureData,
        approvalNote,
        approval,
        approvalError,
        approving,
        onSignerNameChange: setSignerName,
        onSignerCpfChange: setSignerCpf,
        onSignatureDataChange: setSignatureData,
        onApprovalNoteChange: setApprovalNote,
        onApprove: handleApproveProposal,
      })}
    </div>
  );
}

type ProposalApprovalPanelState = {
  signerName: string;
  signerCpf: string;
  signatureData: string;
  approvalNote: string;
  approval: SharedProposalApprovalResponse | null;
  approvalError: string;
  approving: boolean;
  onSignerNameChange: (value: string) => void;
  onSignerCpfChange: (value: string) => void;
  onSignatureDataChange: (value: string) => void;
  onApprovalNoteChange: (value: string) => void;
  onApprove: (event: FormEvent<HTMLFormElement>) => void;
};

function renderSharedDocument(
  data: SharedDocumentEnvelope,
  approvalPanel?: ProposalApprovalPanelState,
) {
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
        {approvalPanel ? (
          <ProposalApprovalPanel data={data} state={approvalPanel} />
        ) : null}
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

type SharedProposalEnvelope = Extract<SharedDocumentEnvelope, { kind: "proposal" }>;

function ProposalApprovalPanel({
  data,
  state,
}: {
  data: SharedProposalEnvelope;
  state: ProposalApprovalPanelState;
}) {
  const canApprove = data.document.status === "CLIENT_REVIEW";
  const decidedAt =
    state.approval?.decision.decidedAt || data.document.customerDecisionAt || null;

  return (
    <PrintSection title="Aceite da proposta">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        {state.approval ? (
          <StatusBanner tone="emerald">
            {state.approval.message} Hash: {state.approval.decision.signatureHash.slice(0, 16)}
          </StatusBanner>
        ) : decidedAt ? (
          <StatusBanner tone="emerald">
            Proposta ja registrada como {data.document.statusLabel.toLowerCase()} em {formatDateTime(decidedAt)}.
          </StatusBanner>
        ) : canApprove ? (
          <StatusBanner tone="blue">
            Assine abaixo para aprovar esta proposta pelo link seguro. Tambem e possivel responder o e-mail recebido.
          </StatusBanner>
        ) : (
          <StatusBanner tone="amber">
            Esta proposta nao esta disponivel para aprovacao por este link.
          </StatusBanner>
        )}

        {state.approvalError ? (
          <div className="mt-3">
            <StatusBanner tone="rose">{state.approvalError}</StatusBanner>
          </div>
        ) : null}

        {canApprove && !state.approval ? (
          <form onSubmit={state.onApprove} className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-slate-700">
                Nome do aprovador
              </span>
              <input
                value={state.signerName}
                onChange={(event) => state.onSignerNameChange(event.target.value)}
                className={INPUT_CLASS}
                placeholder="Nome completo"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-slate-700">
                CPF do aprovador
              </span>
              <input
                value={state.signerCpf}
                onChange={(event) => state.onSignerCpfChange(event.target.value)}
                className={INPUT_CLASS}
                inputMode="numeric"
                placeholder="000.000.000-00"
                required
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block font-semibold text-slate-700">
                Assinatura eletronica simples
              </span>
              <input
                value={state.signatureData}
                onChange={(event) =>
                  state.onSignatureDataChange(event.target.value)
                }
                className={INPUT_CLASS}
                placeholder="Digite seu nome completo como aceite"
                required
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block font-semibold text-slate-700">
                Observacao
              </span>
              <textarea
                value={state.approvalNote}
                onChange={(event) => state.onApprovalNoteChange(event.target.value)}
                className={`${INPUT_CLASS} min-h-24`}
                placeholder="Opcional"
              />
            </label>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={state.approving}
                className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {state.approving ? "Registrando..." : "Aprovar proposta"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </PrintSection>
  );
}

const INPUT_CLASS =
  "w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

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
