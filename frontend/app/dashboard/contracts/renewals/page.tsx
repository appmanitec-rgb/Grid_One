"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";
import { clearAuthSession } from "@/lib/auth-session";
import {
  DataPill,
  EmptyState,
  PageHero,
  SectionCard,
  SelectInput,
  StatusBanner,
  TextInput,
} from "../../components/DashboardPageKit";

type RenewalStatus =
  | "DRAFT"
  | "IN_ANALYSIS"
  | "DOCUMENT_READY"
  | "SENT"
  | "APPROVED"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELED";
type AttentionState = "CURRENT" | "EXPIRING" | "EXPIRED" | "IN_RENEWAL";
type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";

type Renewal = {
  id: string;
  sequence: number;
  status: RenewalStatus;
  proposedStartDate: string;
  proposedEndDate: string;
  proposedRecurringAmount: number;
  proposedPartsCoverage: string;
  createdByUser?: { name: string } | null;
};

type PortfolioItem = {
  id: string;
  code: string;
  title?: string | null;
  status: string;
  endDate: string;
  alertDays: number;
  recurringAmount: number;
  partsCoverage: string;
  daysRemaining: number;
  attentionState: AttentionState;
  client: { id: string; companyName: string; isDelinquent?: boolean };
  equipments: Array<{ id: string; generator: { name: string } }>;
  activeRenewal?: Renewal | null;
  renewals: Renewal[];
};

type Portfolio = {
  summary: {
    active: number;
    expiring: number;
    expired: number;
    inRenewal: number;
    withPartsIncluded: number;
  };
  items: PortfolioItem[];
};

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50";

export default function ContractRenewalsPage() {
  const router = useRouter();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [workingId, setWorkingId] = useState("");
  const [query, setQuery] = useState("");
  const [attention, setAttention] = useState<"ALL" | AttentionState>("ALL");
  const [parts, setParts] = useState<"ALL" | "INCLUDED" | "BILLED_SEPARATELY">("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(apiUrl("/contracts/renewals/portfolio"), {
        cache: "no-store",
      });
      if (response.status === 401) {
        clearAuthSession();
        router.replace("/");
        return;
      }
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Nao foi possivel carregar renovacoes."),
        );
      }
      setPortfolio((await response.json()) as Portfolio);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar renovacoes.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    return (portfolio?.items || []).filter((item) => {
      if (attention !== "ALL" && item.attentionState !== attention) return false;
      if (parts !== "ALL" && item.partsCoverage !== parts) return false;
      if (!term) return true;
      return [item.code, item.title || "", item.client.companyName]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term);
    });
  }, [attention, parts, portfolio, query]);

  async function startRenewal(item: PortfolioItem) {
    setWorkingId(item.id);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(apiUrl(`/contracts/${item.id}/renewals`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Nao foi possivel iniciar a renovacao."),
        );
      }
      const renewal = (await response.json()) as Renewal;
      setNotice(`Renovacao do contrato ${item.code} iniciada.`);
      router.push(`/dashboard/contracts/${item.id}?renewalId=${renewal.id}`);
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Erro ao iniciar renovacao.",
      );
    } finally {
      setWorkingId("");
    }
  }

  const summary = portfolio?.summary || {
    active: 0,
    expiring: 0,
    expired: 0,
    inRenewal: 0,
    withPartsIncluded: 0,
  };

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Gestao contratual"
        title="Renovacoes de contratos"
        description="Controle de vigencia, reajuste, cobertura de pecas e negociacao ate a formalizacao do novo periodo."
        stats={[
          { label: "Em renovacao", value: String(summary.inRenewal), helper: "Processos em andamento.", tone: "blue" },
          { label: "A vencer", value: String(summary.expiring), helper: "Dentro da janela de alerta.", tone: "amber" },
          { label: "Vencidos", value: String(summary.expired), helper: "Sem renovacao aberta.", tone: "rose" },
          { label: "Pecas inclusas", value: String(summary.withPartsIncluded), helper: "Contratos com cobertura integral.", tone: "emerald" },
        ]}
        actions={
          <>
            <button type="button" onClick={() => void load()} className={SECONDARY_BUTTON}>
              Atualizar
            </button>
          </>
        }
      />

      {notice ? <StatusBanner tone="emerald">{notice}</StatusBanner> : null}
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}

      <SectionCard
        eyebrow="Localizar"
        title="Fila de renovacao"
        description={`${items.length} contrato(s) na leitura atual.`}
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_220px_220px]">
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar contrato, cliente ou titulo"
          />
          <SelectInput
            value={attention}
            onChange={(event) => setAttention(event.target.value as typeof attention)}
          >
            <option value="ALL">Todos os prazos</option>
            <option value="EXPIRING">A vencer</option>
            <option value="EXPIRED">Vencidos</option>
            <option value="IN_RENEWAL">Em renovacao</option>
            <option value="CURRENT">Vigentes</option>
          </SelectInput>
          <SelectInput value={parts} onChange={(event) => setParts(event.target.value as typeof parts)}>
            <option value="ALL">Toda cobertura de pecas</option>
            <option value="INCLUDED">Pecas inclusas</option>
            <option value="BILLED_SEPARATELY">Pecas separadas</option>
          </SelectInput>
        </div>
      </SectionCard>

      <SectionCard eyebrow="Carteira" title="Contratos por vigencia">
        {loading ? (
          <EmptyState title="Carregando renovacoes" description="Organizando vigencias e processos em andamento." />
        ) : items.length === 0 ? (
          <EmptyState title="Nenhum contrato encontrado" description="Revise os filtros da carteira." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[1040px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Contrato</th>
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold">Termino</th>
                  <th className="px-4 py-3 font-semibold">Prazo</th>
                  <th className="px-4 py-3 font-semibold">Equipamentos</th>
                  <th className="px-4 py-3 font-semibold">Pecas</th>
                  <th className="px-4 py-3 font-semibold">Mensalidade</th>
                  <th className="px-4 py-3 font-semibold">Renovacao</th>
                  <th className="px-4 py-3 font-semibold">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 align-middle">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{item.code}</p>
                      <p className="mt-1 max-w-[220px] truncate text-xs text-slate-500">{item.title || "Contrato de manutencao"}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{item.client.companyName}</td>
                    <td className="px-4 py-3 text-slate-700">{formatDate(item.endDate)}</td>
                    <td className="px-4 py-3"><DataPill tone={attentionTone(item.attentionState)}>{attentionLabel(item)}</DataPill></td>
                    <td className="px-4 py-3 text-slate-700">{item.equipments.length}</td>
                    <td className="px-4 py-3 text-slate-700">{item.partsCoverage === "INCLUDED" ? "Inclusas" : "Separadas"}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{formatCurrency(item.recurringAmount)}</td>
                    <td className="px-4 py-3">
                      {item.activeRenewal ? (
                        <DataPill tone={renewalTone(item.activeRenewal.status)}>{renewalLabel(item.activeRenewal.status)}</DataPill>
                      ) : (
                        <span className="text-slate-400">Nao iniciada</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.activeRenewal ? (
                        <Link href={`/dashboard/contracts/${item.id}?renewalId=${item.activeRenewal.id}`} className={SECONDARY_BUTTON}>
                          Abrir renovacao
                        </Link>
                      ) : (
                        <button type="button" onClick={() => void startRenewal(item)} disabled={workingId === item.id} className={PRIMARY_BUTTON}>
                          {workingId === item.id ? "Iniciando..." : "Iniciar renovacao"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function attentionTone(state: AttentionState): Tone {
  if (state === "EXPIRED") return "rose";
  if (state === "EXPIRING") return "amber";
  if (state === "IN_RENEWAL") return "blue";
  return "emerald";
}

function attentionLabel(item: PortfolioItem) {
  if (item.attentionState === "IN_RENEWAL") return "Em renovacao";
  if (item.daysRemaining < 0) return `${Math.abs(item.daysRemaining)} dia(s) vencido`;
  return `${item.daysRemaining} dia(s)`;
}

function renewalTone(status: RenewalStatus): Tone {
  if (status === "APPROVED" || status === "COMPLETED") return "emerald";
  if (status === "REJECTED" || status === "CANCELED") return "rose";
  if (status === "SENT" || status === "DOCUMENT_READY") return "blue";
  return "amber";
}

function renewalLabel(status: RenewalStatus) {
  const labels: Record<RenewalStatus, string> = {
    DRAFT: "Rascunho",
    IN_ANALYSIS: "Em analise",
    DOCUMENT_READY: "Documento pronto",
    SENT: "Enviado",
    APPROVED: "Aprovado",
    COMPLETED: "Concluido",
    REJECTED: "Recusado",
    CANCELED: "Cancelado",
  };
  return labels[status];
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}
