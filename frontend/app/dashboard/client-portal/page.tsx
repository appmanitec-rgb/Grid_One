"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { clearAuthSession } from "@/lib/auth-session";
import {
  DataPill,
  EmptyState,
  PageHero,
  SectionCard,
  StatusBanner,
} from "../components/DashboardPageKit";

type PortalProposal = {
  id: string;
  code: string;
  status: string;
  totalValue: number;
  validUntil?: string | null;
  generator?: { id: string; name?: string | null; serialNumber?: string | null } | null;
  generatedContract?: { id: string; code: string; status: string } | null;
};

type PortalContract = {
  id: string;
  code: string;
  title?: string | null;
  status: string;
  startDate: string;
  endDate: string;
  recurringAmount: number;
  responseTimeHours?: number | null;
  includesFuelManagement?: boolean | null;
  equipments: Array<{
    id: string;
    generator: { id: string; name?: string | null; serialNumber?: string | null };
  }>;
  invoices: Array<{
    id: string;
    dueDate: string;
    amount: number;
    status: string;
  }>;
};

type PortalOrder = {
  id: string;
  title: string;
  status: string;
  priority: string;
  scheduledTo?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  generator?: { id: string; name?: string | null; serialNumber?: string | null } | null;
  technician?: {
    id: string;
    user?: { id: string; name: string; skillLevel?: string | null } | null;
  } | null;
  contract?: { id: string; code: string; status: string } | null;
};

type PortalReceivable = {
  id: string;
  description: string;
  dueDate: string;
  netAmount: number;
  paidAmount: number;
  status: string;
  contract?: { id: string; code: string; status: string } | null;
  maintenanceOrder?: { id: string; title: string; status: string } | null;
};

type PortalData = {
  profile: { id: string; name: string };
  client: {
    id: string;
    companyName: string;
    tradeName?: string | null;
    city?: string | null;
    state?: string | null;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    isDelinquent?: boolean;
    paymentTermDefault?: string | null;
  };
  stats: {
    activeProposals: number;
    awaitingClientDecision: number;
    activeContracts: number;
    openOrders: number;
    overdueReceivables: number;
    receivableExposure: number;
  };
  proposals: PortalProposal[];
  contracts: PortalContract[];
  orders: PortalOrder[];
  receivables: PortalReceivable[];
};

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50";

export default function ClientPortalPage() {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadPortal() {
      setLoading(true);
      setError("");

      try {
        const response = await apiFetch("/users/me/client-portal", {
          cache: "no-store",
        });

        if (response.status === 401) {
          clearAuthSession();
          window.location.href = "/";
          return;
        }

        if (!response.ok) {
          throw new Error(
            await readApiErrorMessage(
              response,
              "Nao foi possivel carregar o portal do cliente.",
            ),
          );
        }

        const payload = (await response.json()) as PortalData;
        if (active) {
          setData(payload);
        }
      } catch (loadError: unknown) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Erro ao carregar o portal do cliente.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadPortal();

    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(
    () => [
      {
        label: "Propostas ativas",
        value: String(data?.stats.activeProposals || 0),
        helper: "Carteira comercial ainda em curso.",
        tone: "blue" as const,
      },
      {
        label: "Aguardando decisao",
        value: String(data?.stats.awaitingClientDecision || 0),
        helper: "Itens prontos para sua aprovacao ou retorno.",
        tone: "amber" as const,
      },
      {
        label: "Contratos ativos",
        value: String(data?.stats.activeContracts || 0),
        helper: "Cobertura contratual vigente.",
        tone: "emerald" as const,
      },
      {
        label: "Em aberto",
        value: formatCurrency(data?.stats.receivableExposure || 0),
        helper: "Exposicao financeira atual do cliente.",
        tone: "slate" as const,
      },
    ],
    [data],
  );

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Portal do cliente"
        title={`Bem-vindo, ${data?.profile.name || "cliente"}`}
        description={
          data?.client
            ? `${data.client.tradeName || data.client.companyName} em uma leitura unica de propostas, contratos, atendimento e cobranca.`
            : "Uma visao consolidada do relacionamento comercial e operacional."
        }
        stats={stats}
        actions={
          <>
            <Link href="/dashboard/proposals" className={PRIMARY_BUTTON}>
              Ver propostas
            </Link>
            <Link href="/dashboard/documents" className={SECONDARY_BUTTON}>
              Ver documentos
            </Link>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={() => window.location.reload()}
            >
              Atualizar portal
            </button>
          </>
        }
      />

      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}

      {loading ? (
        <SectionCard
          eyebrow="Carregando"
          title="Montando seu portal"
          description="Estamos buscando propostas, contratos, atendimentos e cobranca."
        >
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-10 text-sm text-slate-500">
            Aguarde alguns instantes...
          </div>
        </SectionCard>
      ) : null}

      {!loading && data ? (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
            <SectionCard
              eyebrow="Conta"
              title={data.client.tradeName || data.client.companyName}
              description="Dados principais do relacionamento e da operacao do seu contrato."
            >
              <div className="grid gap-3 md:grid-cols-2">
                <InfoCard label="Contato" value={data.client.contactName || "Nao informado"} />
                <InfoCard label="Telefone" value={data.client.phone || "Nao informado"} />
                <InfoCard label="Email" value={data.client.email || "Nao informado"} />
                <InfoCard
                  label="Cidade base"
                  value={
                    data.client.city && data.client.state
                      ? `${data.client.city} - ${data.client.state}`
                      : "Nao informada"
                  }
                />
              </div>
            </SectionCard>

            <SectionCard
              eyebrow="Relacionamento"
              title="Pulso atual"
              description="Leitura rapida do que merece atencao imediata."
            >
              <div className="space-y-3">
                <PulseLine
                  label="Ordens em andamento"
                  value={String(data.stats.openOrders)}
                  tone={data.stats.openOrders > 0 ? "blue" : "slate"}
                />
                <PulseLine
                  label="Titulos vencidos"
                  value={String(data.stats.overdueReceivables)}
                  tone={data.stats.overdueReceivables > 0 ? "rose" : "emerald"}
                />
                <PulseLine
                  label="Condicao comercial"
                  value={data.client.paymentTermDefault || "A combinar"}
                  tone="slate"
                />
                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <DataPill tone={data.client.isDelinquent ? "rose" : "emerald"}>
                      {data.client.isDelinquent ? "Atencao financeira" : "Conta regular"}
                    </DataPill>
                    <DataPill tone="slate">Cliente ID {data.client.id.slice(0, 8)}</DataPill>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    Quando uma proposta estiver pronta para decisao, ela aparece abaixo com acesso
                    direto para revisar e responder.
                  </p>
                </div>
              </div>
            </SectionCard>
          </div>

          <SectionCard
            eyebrow="Comercial"
            title="Propostas recentes"
            description="Acompanhe o funil e entre nas propostas prontas para sua decisao."
            actions={<DataPill tone="slate">{data.proposals.length} item(ns)</DataPill>}
          >
            {data.proposals.length === 0 ? (
              <EmptyState
                title="Sem propostas no momento"
                description="Quando houver novas propostas ou revisoes, elas aparecerao aqui."
              />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {data.proposals.map((proposal) => (
                  <article
                    key={proposal.id}
                    className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          Proposta {proposal.code}
                        </p>
                        <h3 className="mt-2 text-lg font-bold text-slate-950">
                          {formatCurrency(Number(proposal.totalValue || 0))}
                        </h3>
                      </div>
                      <DataPill tone={proposal.status === "CLIENT_REVIEW" ? "amber" : "slate"}>
                        {statusLabel(proposal.status)}
                      </DataPill>
                    </div>
                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      <p>
                        Equipamento:{" "}
                        <strong className="font-semibold text-slate-800">
                          {proposal.generator?.name || proposal.generator?.serialNumber || "-"}
                        </strong>
                      </p>
                      <p>
                        Validade:{" "}
                        <strong className="font-semibold text-slate-800">
                          {proposal.validUntil ? formatDate(proposal.validUntil) : "Sem prazo"}
                        </strong>
                      </p>
                      <p>
                        Contrato gerado:{" "}
                        <strong className="font-semibold text-slate-800">
                          {proposal.generatedContract?.code || "Ainda nao"}
                        </strong>
                      </p>
                    </div>
                    <div className="mt-4">
                      <Link href={`/dashboard/proposals/${proposal.id}`} className={SECONDARY_BUTTON}>
                        Abrir proposta
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </SectionCard>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard
              eyebrow="Contratos"
              title="Cobertura ativa"
              description="Resumo contratual com equipamentos vinculados e proximos vencimentos."
            >
              {data.contracts.length === 0 ? (
                <EmptyState
                  title="Nenhum contrato ativo"
                  description="Quando houver contratos vinculados a este cliente, eles aparecerao aqui."
                />
              ) : (
                <div className="space-y-3">
                  {data.contracts.map((contract) => (
                    <article
                      key={contract.id}
                      className="rounded-[24px] border border-slate-200 bg-slate-50/75 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                            {contract.code}
                          </p>
                          <h3 className="mt-2 text-lg font-bold text-slate-950">
                            {contract.title || "Contrato de servico"}
                          </h3>
                        </div>
                        <DataPill tone={contract.status === "ACTIVE" ? "emerald" : "amber"}>
                          {contract.status === "ACTIVE" ? "Ativo" : contract.status}
                        </DataPill>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <InfoCard
                          label="Vigencia"
                          value={`${formatDate(contract.startDate)} ate ${formatDate(contract.endDate)}`}
                        />
                        <InfoCard
                          label="Mensalidade"
                          value={formatCurrency(Number(contract.recurringAmount || 0))}
                        />
                        <InfoCard
                          label="SLA"
                          value={
                            contract.responseTimeHours
                              ? `${contract.responseTimeHours}h de resposta`
                              : "Nao informado"
                          }
                        />
                        <InfoCard
                          label="Equipamentos"
                          value={String(contract.equipments.length)}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              eyebrow="Atendimento"
              title="Ordens recentes"
              description="Execucao tecnica ligada ao seu contrato e aos seus equipamentos."
            >
              {data.orders.length === 0 ? (
                <EmptyState
                  title="Sem ordens recentes"
                  description="Quando houver atendimentos em aberto ou concluidos, eles aparecerao aqui."
                />
              ) : (
                <div className="space-y-3">
                  {data.orders.map((order) => (
                    <article
                      key={order.id}
                      className="rounded-[24px] border border-slate-200 bg-slate-50/75 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                            Ordem de servico
                          </p>
                          <h3 className="mt-2 text-lg font-bold text-slate-950">
                            {order.title}
                          </h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <DataPill tone={order.status === "COMPLETED" ? "emerald" : "blue"}>
                            {orderStatusLabel(order.status)}
                          </DataPill>
                          <DataPill tone="slate">{order.priority}</DataPill>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <InfoCard
                          label="Equipamento"
                          value={order.generator?.name || order.generator?.serialNumber || "-"}
                        />
                        <InfoCard
                          label="Tecnico"
                          value={order.technician?.user?.name || "A definir"}
                        />
                        <InfoCard
                          label="Agenda"
                          value={order.scheduledTo ? formatDate(order.scheduledTo) : "Sem agenda"}
                        />
                        <InfoCard
                          label="Contrato"
                          value={order.contract?.code || "Avulso"}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard
            eyebrow="Cobranca"
            title="Titulos em aberto"
            description="Visao financeira consolidada de contratos e ordens cobradas."
            actions={
              <DataPill tone={data.stats.overdueReceivables > 0 ? "rose" : "emerald"}>
                {data.stats.overdueReceivables > 0
                  ? `${data.stats.overdueReceivables} vencido(s)`
                  : "Sem atrasos"}
              </DataPill>
            }
          >
            {data.receivables.length === 0 ? (
              <EmptyState
                title="Nenhum titulo aberto"
                description="Quando houver cobranca em andamento, ela aparecera aqui."
              />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {data.receivables.map((receivable) => {
                  const outstanding = Math.max(
                    0,
                    Number(receivable.netAmount || 0) - Number(receivable.paidAmount || 0),
                  );
                  return (
                    <article
                      key={receivable.id}
                      className="rounded-[24px] border border-slate-200 bg-slate-50/75 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                            {receivable.contract?.code || receivable.maintenanceOrder?.title || "Titulo"}
                          </p>
                          <h3 className="mt-2 text-lg font-bold text-slate-950">
                            {receivable.description}
                          </h3>
                        </div>
                        <DataPill tone={receivable.status === "OVERDUE" ? "rose" : "slate"}>
                          {receivableStatusLabel(receivable.status)}
                        </DataPill>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <InfoCard label="Vencimento" value={formatDate(receivable.dueDate)} />
                        <InfoCard label="Saldo" value={formatCurrency(outstanding)} />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white/88 px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function PulseLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "emerald" | "rose" | "slate";
}) {
  const toneClass: Record<typeof tone, string> = {
    blue: "border-sky-200 bg-sky-50 text-sky-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    slate: "border-slate-200 bg-slate-50 text-slate-800",
  };

  return (
    <div className={`flex items-center justify-between rounded-[22px] border px-4 py-3 ${toneClass[tone]}`}>
      <span className="text-sm font-medium">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    DRAFT: "Rascunho",
    BOARD_REVIEW: "Diretoria",
    REVISION_REQUIRED: "Em revisao",
    CLIENT_REVIEW: "Aguardando cliente",
    DISCOUNT_REVIEW: "Desconto",
    WON: "Ganha",
    LOST: "Perdida",
  };

  return map[status] || status;
}

function orderStatusLabel(status: string) {
  const map: Record<string, string> = {
    OPEN: "Aberta",
    IN_PROGRESS: "Em andamento",
    COMPLETED: "Concluida",
    CANCELED: "Cancelada",
  };

  return map[status] || status;
}

function receivableStatusLabel(status: string) {
  const map: Record<string, string> = {
    OPEN: "Em aberto",
    PAID: "Pago",
    OVERDUE: "Vencido",
    CANCELED: "Cancelado",
  };

  return map[status] || status;
}
