"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";
import {
  DataPill,
  EmptyState,
  FormField,
  SectionCard,
  SelectInput,
  StatusBanner,
  TextAreaInput,
  TextInput,
} from "../../components/DashboardPageKit";

export type ContractRenewal = {
  id: string;
  sequence: number;
  status: RenewalStatus;
  currentStartDate: string;
  currentEndDate: string;
  currentRecurringAmount: number;
  currentPartsCoverage: PartsCoverage;
  proposedStartDate: string;
  proposedEndDate: string;
  proposedRecurringAmount: number;
  proposedPartsCoverage: PartsCoverage;
  adjustmentPercent?: number | null;
  partsNotes?: string | null;
  customerNotes?: string | null;
  internalNotes?: string | null;
  completedAt?: string | null;
  createdAt: string;
  createdByUser?: { name: string; email: string } | null;
};

type RenewalStatus =
  | "DRAFT"
  | "IN_ANALYSIS"
  | "DOCUMENT_READY"
  | "SENT"
  | "APPROVED"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELED";
type PartsCoverage = "INCLUDED" | "BILLED_SEPARATELY";

type FormState = {
  proposedStartDate: string;
  proposedEndDate: string;
  proposedRecurringAmount: string;
  proposedPartsCoverage: PartsCoverage;
  adjustmentPercent: string;
  partsNotes: string;
  customerNotes: string;
  internalNotes: string;
};

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const DANGER_BUTTON =
  "inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50";

export default function ContractRenewalPanel({
  contractId,
  contractCode,
  renewals,
  onChanged,
}: {
  contractId: string;
  contractCode: string;
  renewals: ContractRenewal[];
  onChanged: () => Promise<void> | void;
}) {
  const params = useSearchParams();
  const requestedId = params.get("renewalId");
  const activeRenewal = useMemo(
    () =>
      renewals.find((item) => item.id === requestedId) ||
      renewals.find((item) => isOpen(item.status)) ||
      null,
    [renewals, requestedId],
  );
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setForm(activeRenewal ? renewalForm(activeRenewal) : null);
  }, [activeRenewal]);

  async function startRenewal() {
    await run("start", async () => {
      const response = await apiFetch(apiUrl(`/contracts/${contractId}/renewals`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await ensureOk(response, "Nao foi possivel iniciar a renovacao.");
      return `Renovacao do contrato ${contractCode} iniciada.`;
    });
  }

  async function saveRenewal() {
    if (!activeRenewal || !form) return;
    await run("save", async () => {
      const response = await apiFetch(
        apiUrl(`/contracts/${contractId}/renewals/${activeRenewal.id}`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposedStartDate: form.proposedStartDate,
            proposedEndDate: form.proposedEndDate,
            proposedRecurringAmount: Number(form.proposedRecurringAmount || 0),
            proposedPartsCoverage: form.proposedPartsCoverage,
            adjustmentPercent: Number(form.adjustmentPercent || 0),
            partsNotes: form.partsNotes || undefined,
            customerNotes: form.customerNotes || undefined,
            internalNotes: form.internalNotes || undefined,
          }),
        },
      );
      await ensureOk(response, "Nao foi possivel salvar a renovacao.");
      return "Condicoes da renovacao salvas.";
    });
  }

  async function moveRenewal(status: RenewalStatus) {
    if (!activeRenewal) return;
    if (status === "COMPLETED") {
      const confirmed = window.confirm(
        "Concluir a renovacao aplicara a nova vigencia, valor e cobertura ao contrato. Deseja continuar?",
      );
      if (!confirmed) return;
    }
    await run(`status-${status}`, async () => {
      const response = await apiFetch(
        apiUrl(`/contracts/${contractId}/renewals/${activeRenewal.id}/status`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      await ensureOk(response, "Nao foi possivel alterar a etapa da renovacao.");
      return status === "COMPLETED"
        ? "Renovacao concluida e novas condicoes aplicadas ao contrato."
        : `Renovacao movida para ${statusLabel(status).toLocaleLowerCase("pt-BR")}.`;
    });
  }

  async function run(key: string, action: () => Promise<string>) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      setNotice(await action());
      await onChanged();
    } catch (actionError: unknown) {
      setError(actionError instanceof Error ? actionError.message : "Erro na renovacao.");
    } finally {
      setBusy("");
    }
  }

  return (
    <SectionCard
      eyebrow="Renovacao contratual"
      title="Vigencia, reajuste e cobertura"
      description="O processo preserva as condicoes anteriores e aplica a nova configuracao somente na conclusao."
      actions={
        <Link href="/dashboard/contracts/renewals" className={SECONDARY_BUTTON}>
          Carteira de renovacoes
        </Link>
      }
    >
      {notice ? <StatusBanner tone="emerald">{notice}</StatusBanner> : null}
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}

      {!activeRenewal ? (
        <div className="mt-4">
          <EmptyState
            title="Nenhuma renovacao em andamento"
            description="Inicie o processo para registrar a proposta de vigencia, reajuste, pecas e observacoes sem alterar o contrato atual."
          />
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => void startRenewal()} disabled={Boolean(busy)} className={PRIMARY_BUTTON}>
              {busy === "start" ? "Iniciando..." : "Iniciar renovacao"}
            </button>
          </div>
        </div>
      ) : form ? (
        <div className="mt-4 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Renovacao {activeRenewal.sequence}</p>
              <p className="mt-1 text-xs text-slate-500">Aberta por {activeRenewal.createdByUser?.name || "Sistema"} em {formatDate(activeRenewal.createdAt)}</p>
            </div>
            <DataPill tone={statusTone(activeRenewal.status)}>{statusLabel(activeRenewal.status)}</DataPill>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FormField label="Inicio proposto" hint="Obrigatorio">
              <TextInput type="date" value={form.proposedStartDate} onChange={(event) => update("proposedStartDate", event.target.value)} disabled={!isOpen(activeRenewal.status)} />
            </FormField>
            <FormField label="Termino proposto" hint="Obrigatorio">
              <TextInput type="date" value={form.proposedEndDate} onChange={(event) => update("proposedEndDate", event.target.value)} disabled={!isOpen(activeRenewal.status)} />
            </FormField>
            <FormField label="Mensalidade proposta (R$)" hint="Obrigatorio">
              <TextInput type="number" step="0.01" min="0" value={form.proposedRecurringAmount} onChange={(event) => update("proposedRecurringAmount", event.target.value)} disabled={!isOpen(activeRenewal.status)} />
            </FormField>
            <FormField label="Reajuste (%)">
              <TextInput type="number" step="0.01" value={form.adjustmentPercent} onChange={(event) => update("adjustmentPercent", event.target.value)} disabled={!isOpen(activeRenewal.status)} />
            </FormField>
            <FormField label="Cobertura de pecas" className="md:col-span-2">
              <SelectInput value={form.proposedPartsCoverage} onChange={(event) => update("proposedPartsCoverage", event.target.value as PartsCoverage)} disabled={!isOpen(activeRenewal.status)}>
                <option value="INCLUDED">Pecas inclusas na mensalidade</option>
                <option value="BILLED_SEPARATELY">Pecas faturadas separadamente</option>
              </SelectInput>
            </FormField>
            <FormField label="Detalhamento de pecas" className="md:col-span-2">
              <TextAreaInput value={form.partsNotes} onChange={(event) => update("partsNotes", event.target.value)} placeholder="Pecas inclusas, limites, consumiveis e exclusoes." disabled={!isOpen(activeRenewal.status)} />
            </FormField>
            <FormField label="Observacoes para o cliente" className="md:col-span-2">
              <TextAreaInput value={form.customerNotes} onChange={(event) => update("customerNotes", event.target.value)} placeholder="Texto que pode acompanhar o documento de renovacao." disabled={!isOpen(activeRenewal.status)} />
            </FormField>
            <FormField label="Observacoes internas" className="md:col-span-2">
              <TextAreaInput value={form.internalNotes} onChange={(event) => update("internalNotes", event.target.value)} placeholder="Negociacao, responsaveis, pendencias e proximos passos." disabled={!isOpen(activeRenewal.status)} />
            </FormField>
          </div>

          {isOpen(activeRenewal.status) ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void saveRenewal()} disabled={Boolean(busy)} className={SECONDARY_BUTTON}>
                  {busy === "save" ? "Salvando..." : "Salvar condicoes"}
                </button>
                <Link href={`/dashboard/documents/contracts/${contractId}?renewalId=${activeRenewal.id}`} className={SECONDARY_BUTTON}>
                  Preparar documento
                </Link>
              </div>
              <div className="flex flex-wrap gap-2">
                {nextActions(activeRenewal.status).map((action) => (
                  <button key={action.status} type="button" onClick={() => void moveRenewal(action.status)} disabled={Boolean(busy)} className={action.danger ? DANGER_BUTTON : PRIMARY_BUTTON}>
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {renewals.length > 1 || (renewals.length === 1 && !activeRenewal) ? (
        <div className="mt-6 border-t border-slate-200 pt-5">
          <p className="text-sm font-semibold text-slate-900">Historico de renovacoes</p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-3">Ciclo</th><th className="px-4 py-3">Vigencia proposta</th><th className="px-4 py-3">Valor</th><th className="px-4 py-3">Pecas</th><th className="px-4 py-3">Status</th></tr></thead>
              <tbody>{renewals.filter((item) => item.id !== activeRenewal?.id).map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="px-4 py-3">Renovacao {item.sequence}</td><td className="px-4 py-3">{formatDate(item.proposedStartDate)} a {formatDate(item.proposedEndDate)}</td><td className="px-4 py-3">{formatCurrency(item.proposedRecurringAmount)}</td><td className="px-4 py-3">{item.proposedPartsCoverage === "INCLUDED" ? "Inclusas" : "Separadas"}</td><td className="px-4 py-3"><DataPill tone={statusTone(item.status)}>{statusLabel(item.status)}</DataPill></td></tr>)}</tbody>
            </table>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }
}

async function ensureOk(response: Response, fallback: string) {
  if (!response.ok) throw new Error(await readApiErrorMessage(response, fallback));
}

function renewalForm(item: ContractRenewal): FormState {
  return {
    proposedStartDate: item.proposedStartDate.slice(0, 10),
    proposedEndDate: item.proposedEndDate.slice(0, 10),
    proposedRecurringAmount: String(item.proposedRecurringAmount ?? 0),
    proposedPartsCoverage: item.proposedPartsCoverage,
    adjustmentPercent: String(item.adjustmentPercent ?? 0),
    partsNotes: item.partsNotes || "",
    customerNotes: item.customerNotes || "",
    internalNotes: item.internalNotes || "",
  };
}

function isOpen(status: RenewalStatus) {
  return !["COMPLETED", "REJECTED", "CANCELED"].includes(status);
}

function nextActions(status: RenewalStatus) {
  const actions: Partial<Record<RenewalStatus, Array<{ status: RenewalStatus; label: string; danger?: boolean }>>> = {
    DRAFT: [{ status: "IN_ANALYSIS", label: "Enviar para analise" }, { status: "CANCELED", label: "Cancelar", danger: true }],
    IN_ANALYSIS: [{ status: "DOCUMENT_READY", label: "Documento pronto" }, { status: "CANCELED", label: "Cancelar", danger: true }],
    DOCUMENT_READY: [{ status: "SENT", label: "Registrar envio" }, { status: "CANCELED", label: "Cancelar", danger: true }],
    SENT: [{ status: "APPROVED", label: "Registrar aprovacao" }, { status: "REJECTED", label: "Registrar recusa", danger: true }],
    APPROVED: [{ status: "COMPLETED", label: "Concluir e aplicar" }],
  };
  return actions[status] || [];
}

function statusLabel(status: RenewalStatus) {
  return ({ DRAFT: "Rascunho", IN_ANALYSIS: "Em analise", DOCUMENT_READY: "Documento pronto", SENT: "Enviado", APPROVED: "Aprovado", COMPLETED: "Concluido", REJECTED: "Recusado", CANCELED: "Cancelado" } as Record<RenewalStatus, string>)[status];
}

function statusTone(status: RenewalStatus): "blue" | "emerald" | "amber" | "rose" | "slate" {
  if (["APPROVED", "COMPLETED"].includes(status)) return "emerald";
  if (["REJECTED", "CANCELED"].includes(status)) return "rose";
  if (["DOCUMENT_READY", "SENT"].includes(status)) return "blue";
  return "amber";
}

function formatDate(value: string) { return new Date(value).toLocaleDateString("pt-BR"); }
function formatCurrency(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0); }
