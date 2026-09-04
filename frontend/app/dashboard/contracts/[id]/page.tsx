"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";
import { clearAuthSession } from "@/lib/auth-session";
import {
  DataPill,
  EmptyState,
  FieldBox,
  PageHero,
  SectionCard,
  StatusBanner,
} from "../../components/DashboardPageKit";
import {
  OperationalBreadcrumb,
  PermissionAwareLink,
  RelatedEntityGrid,
} from "../../components/OperationalLinks";
import ContractRenewalPanel, {
  type ContractRenewal,
} from "../components/ContractRenewalPanel";

type ContractStatus = "ACTIVE" | "SUSPENDED" | "CANCELED" | "RENEWAL";
type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";

type Contract = {
  id: string;
  code: string;
  title?: string | null;
  status: ContractStatus;
  startDate: string;
  endDate: string;
  alertDays: number;
  preventiveRecurrence: string;
  responseTimeHours?: number | null;
  correctiveVisitAllowance?: number | null;
  partsCoverage: string;
  recurringAmount: number;
  dueDay: number;
  adjustmentIndex: string;
  adjustmentBaseMonth?: number | null;
  notes?: string | null;
  sourceProposal?: { id: string; code: string; status: string } | null;
  client: { id: string; companyName: string; isDelinquent?: boolean | null };
  createdByUser?: { id: string; name: string; email: string } | null;
  equipments: Array<{
    id: string;
    coverageAmount?: number | null;
    generator: {
      id: string;
      name: string;
      serialNumber?: string | null;
      hasMaintenanceContract: boolean;
    };
  }>;
  invoices: Array<{
    id: string;
    dueDate: string;
    competenceDate: string;
    amount: number;
    status: string;
    paidAt?: string | null;
  }>;
  schedules: Array<{
    id: string;
    scheduledDate: string;
    status: string;
    generatedOrderId?: string | null;
    generator: { id?: string; name: string; serialNumber?: string | null };
  }>;
  renewals: ContractRenewal[];
};

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export default function ContractDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [contract, setContract] = useState<Contract | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [workingKey, setWorkingKey] = useState("");

  const handleUnauthorized = useCallback(
    async (res: Response) => {
      if (res.status !== 401) return false;
      clearAuthSession();
      router.replace("/");
      return true;
    },
    [router],
  );

  const load = useCallback(async () => {
    if (!id) return;

    try {
      const res = await apiFetch(apiUrl(`/contracts/${id}`), {
        cache: "no-store",
      });
      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Nao foi possivel carregar contrato."),
        );
      }
      setContract((await res.json()) as Contract);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar contrato.",
      );
    }
  }, [handleUnauthorized, id]);

  useEffect(() => {
    if (!id) return;
    void load();
  }, [id, load]);

  const expiresSoon = useMemo(() => {
    if (!contract) return false;
    return daysUntil(contract.endDate) <= contract.alertDays;
  }, [contract]);

  const overdueInvoices = useMemo(
    () =>
      contract?.invoices.filter((invoice) => invoice.status === "OVERDUE") ||
      [],
    [contract],
  );

  const generatedOrdersCount = useMemo(
    () =>
      contract?.schedules.filter((schedule) =>
        Boolean(schedule.generatedOrderId),
      ).length || 0,
    [contract],
  );

  const coveredAmount = useMemo(
    () =>
      (contract?.equipments || []).reduce(
        (sum, item) => sum + Number(item.coverageAmount || 0),
        0,
      ),
    [contract],
  );

  async function runAction<T>(
    key: string,
    request: () => Promise<Response>,
    onSuccess: (data: T) => string,
  ) {
    setWorkingKey(key);
    setError("");
    setNotice("");

    try {
      const res = await request();
      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "Falha na operacao."));
      }

      const data = (await res.json().catch(() => null)) as T;
      setNotice(onSuccess(data));
      await load();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Erro ao executar operacao.",
      );
    } finally {
      setWorkingKey("");
    }
  }

  async function runContractAction(
    path: string,
    key: string,
    successMessage: string,
  ) {
    await runAction<Record<string, never>>(
      key,
      () =>
        apiFetch(apiUrl(`/contracts/${id}/${path}`), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body:
            path === "suspend"
              ? JSON.stringify({ note: "Suspensao manual" })
              : undefined,
        }),
      () => successMessage,
    );
  }

  async function generateOrders() {
    await runAction<{ createdCount?: number }>(
      "generate-orders",
      () =>
        apiFetch(apiUrl(`/contracts/${id}/generate-orders?daysAhead=30`), {
          method: "POST",
        }),
      (data) => {
        const createdCount = data.createdCount || 0;
        if (createdCount === 0) {
          return "Nenhuma O.S. preventiva pendente para os proximos 30 dias.";
        }
        return `${createdCount} O.S. preventiva(s) gerada(s) para este contrato.`;
      },
    );
  }

  if (!contract) {
    return (
      <div className="space-y-4">
        {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
        <EmptyState
          title="Carregando contrato"
          description="Estamos reunindo o contexto operacional, financeiro e preventivo deste contrato."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OperationalBreadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Contratos", href: "/dashboard/contracts" },
          { label: `Contrato ${contract.code}` },
        ]}
      />

      <PageHero
        eyebrow="Contrato de servico"
        title={`Contrato ${contract.code}`}
        description={`Cliente ${contract.client.companyName}. Esta leitura une origem comercial, faturamento recorrente, cobertura tecnica e cronograma preventivo em uma visao unica.`}
        stats={[
          {
            label: "Status",
            value: contractStatusLabel(contract.status),
            helper: "Estado atual do contrato.",
            tone: contractStatusTone(contract.status),
          },
          {
            label: "Receita recorrente",
            value: formatCurrency(Number(contract.recurringAmount || 0)),
            helper: "Valor mensal previsto na operacao.",
            tone: "emerald",
          },
          {
            label: "Faturas em atraso",
            value: String(overdueInvoices.length),
            helper: "Contagem de vencimentos pendentes.",
            tone: overdueInvoices.length > 0 ? "rose" : "slate",
          },
          {
            label: "O.S. geradas",
            value: String(generatedOrdersCount),
            helper: "Preventivas que ja viraram ordem de servico.",
            tone: "blue",
          },
        ]}
        actions={
          <>
            <button
              type="button"
              onClick={() => void generateOrders()}
              disabled={Boolean(workingKey)}
              className={SECONDARY_BUTTON}
            >
              Gerar O.S. (30 dias)
            </button>
            {contract.status !== "ACTIVE" ? (
              <button
                type="button"
                onClick={() =>
                  void runContractAction(
                    "activate",
                    "activate",
                    "Contrato ativado com sucesso.",
                  )
                }
                disabled={Boolean(workingKey)}
                className={PRIMARY_BUTTON}
              >
                Ativar contrato
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  void runContractAction(
                    "suspend",
                    "suspend",
                    "Contrato suspenso com sucesso.",
                  )
                }
                disabled={Boolean(workingKey)}
                className={PRIMARY_BUTTON}
              >
                Suspender contrato
              </button>
            )}
          </>
        }
        aside={
          <FieldBox className="space-y-4 rounded-[28px] border-white/60 bg-white/80 p-5 shadow-[0_22px_60px_-40px_rgba(15,31,50,0.45)]">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Pulso do contrato
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <DataPill tone={contractStatusTone(contract.status)}>
                  {contractStatusLabel(contract.status)}
                </DataPill>
                {contract.client.isDelinquent ? (
                  <DataPill tone="amber">Cliente inadimplente</DataPill>
                ) : null}
                {expiresSoon ? (
                  <DataPill tone="rose">Renovacao em atencao</DataPill>
                ) : null}
              </div>
            </div>
            <MiniInfo
              label="Vigencia"
              value={`${formatDate(contract.startDate)} ate ${formatDate(contract.endDate)}`}
              helper={`Janela restante: ${Math.max(0, daysUntil(contract.endDate))} dia(s).`}
            />
            <MiniInfo
              label="Escopo tecnico"
              value={`${contract.equipments.length} equipamento(s)`}
              helper={recurrenceLabel(contract.preventiveRecurrence)}
            />
            <MiniInfo
              label="Criado por"
              value={contract.createdByUser?.name || "Sistema"}
              helper="Origem administrativa do contrato."
            />
          </FieldBox>
        }
      />

      {notice ? <StatusBanner tone="emerald">{notice}</StatusBanner> : null}
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {expiresSoon ? (
        <StatusBanner tone="amber">
          Contrato proximo do vencimento. O ideal e iniciar a renovacao antes do
          prazo de alerta.
        </StatusBanner>
      ) : null}
      {contract.client.isDelinquent ? (
        <StatusBanner tone="amber">
          O cliente esta marcado como inadimplente. Isso pode impactar status,
          cobertura e automacoes preventivas.
        </StatusBanner>
      ) : null}

      <ContractRenewalPanel
        contractId={contract.id}
        contractCode={contract.code}
        renewals={contract.renewals || []}
        onChanged={load}
      />

      <SectionCard
        eyebrow="Navegacao cruzada"
        title="Relacionamentos do contrato"
        description="Atalhos para cliente, proposta de origem, equipamentos cobertos, preventivas geradas e financeiro como referencia."
      >
        <RelatedEntityGrid
          items={[
            {
              label: contract.client.companyName,
              description: "Cliente contratante.",
              href: `/dashboard/clients/${contract.client.id}`,
              badge: "Cliente",
              tone: "blue" as const,
              permission: "clients.view",
            },
            ...(contract.sourceProposal
              ? [{
                  label: contract.sourceProposal.code,
                  description: `Proposta ${contract.sourceProposal.status}.`,
                  href: `/dashboard/proposals/${contract.sourceProposal.id}`,
                  badge: "Proposta",
                  tone: "amber" as const,
                  permission: "proposals.view",
                }]
              : []),
            {
              label: `Documento ${contract.code}`,
              description: "Versao documental pronta para impressao e compartilhamento.",
              href: `/dashboard/documents/contracts/${contract.id}`,
              badge: "Documento",
              tone: "slate" as const,
              permission: "contracts.view",
            },
            ...contract.equipments.slice(0, 4).map((item) => ({
              label: item.generator.name,
              description: `Serie ${item.generator.serialNumber || "-"} - cobertura ${item.coverageAmount != null ? formatCurrency(Number(item.coverageAmount)) : "nao definida"}.`,
              href: `/dashboard/equipments/${item.generator.id}`,
              badge: "Equipamento",
              tone: "slate" as const,
              permission: "equipments.view",
            })),
            ...contract.schedules
              .filter((schedule) => schedule.generatedOrderId)
              .slice(0, 3)
              .map((schedule) => ({
                label: `Preventiva ${formatDate(schedule.scheduledDate)}`,
                description: schedule.generator.name,
                href: `/dashboard/orders/${schedule.generatedOrderId}`,
                badge: "O.S.",
                tone: "emerald" as const,
                permission: "orders.view",
              })),
            {
              label: "Contas a receber",
              description: "Referencia financeira do contrato, sem refatorar o modulo financeiro.",
              href: "/dashboard/finance/accounts-receivable",
              badge: "Financeiro",
              tone: "rose" as const,
              permission: "finance.view",
            },
          ]}
        />
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
        <div className="space-y-6">
          <SectionCard
            eyebrow="Escopo coberto"
            title="Equipamentos e cobertura financeira"
            description="Ativos atendidos por este contrato e a cobertura configurada para cada um."
          >
            {contract.equipments.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {contract.equipments.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[24px] border border-slate-200 bg-slate-50/85 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {item.generator.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Serie: {item.generator.serialNumber || "-"}
                        </p>
                      </div>
                      <DataPill
                        tone={
                          item.generator.hasMaintenanceContract
                            ? "emerald"
                            : "amber"
                        }
                      >
                        {item.generator.hasMaintenanceContract
                          ? "Flag ativa"
                          : "Flag pendente"}
                      </DataPill>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">
                      Cobertura individual:{" "}
                      {item.coverageAmount != null
                        ? formatCurrency(Number(item.coverageAmount))
                        : "Nao definida"}
                    </p>
                    <PermissionAwareLink
                      href={`/dashboard/equipments/${item.generator.id}`}
                      permission="equipments.view"
                      className="mt-3 inline-flex text-sm font-semibold text-sky-700 transition hover:text-sky-800 hover:underline"
                      fallbackClassName="mt-3 inline-flex text-sm font-semibold text-slate-500"
                    >
                      Abrir equipamento
                    </PermissionAwareLink>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Sem equipamentos vinculados"
                description="Este contrato ainda nao possui ativos cobertos."
              />
            )}
          </SectionCard>

          <SectionCard
            eyebrow="Financeiro recorrente"
            title="Faturas e adimplencia"
            description="Agora o detalhe permite tratar o fluxo financeiro direto desta tela, incluindo baixa manual de faturas pendentes."
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="px-3 py-3 font-semibold">Competencia</th>
                    <th className="px-3 py-3 font-semibold">Vencimento</th>
                    <th className="px-3 py-3 font-semibold">Valor</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {contract.invoices.map((invoice) => {
                    const canOpenReceivable =
                      invoice.status === "PENDING" ||
                      invoice.status === "OVERDUE";

                    return (
                      <tr
                        key={invoice.id}
                        className="border-b border-slate-100"
                      >
                        <td className="px-3 py-3 text-slate-700">
                          {formatMonth(invoice.competenceDate)}
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {formatDate(invoice.dueDate)}
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-900">
                          {formatCurrency(Number(invoice.amount || 0))}
                        </td>
                        <td className="px-3 py-3">
                          <DataPill tone={invoiceStatusTone(invoice.status)}>
                            {invoiceStatusLabel(invoice.status)}
                          </DataPill>
                        </td>
                        <td className="px-3 py-3">
                          {canOpenReceivable ? (
                            <PermissionAwareLink
                              href="/dashboard/finance/accounts-receivable"
                              permission="finance.view"
                              className={SECONDARY_BUTTON}
                            >
                              Abrir baixa
                            </PermissionAwareLink>
                          ) : (
                            <span className="text-xs text-slate-500">
                              {invoice.paidAt
                                ? `Pago em ${formatDate(invoice.paidAt)}`
                                : "Sem acao"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {contract.invoices.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    title="Sem faturamento projetado"
                    description="As parcelas recorrentes aparecerao aqui apos a sincronizacao do contrato."
                  />
                </div>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Preventivas"
            title="Cronograma e ordens geradas"
            description="A trilha preventiva agora mostra melhor o que ainda esta pendente e o que ja virou ordem de servico."
            actions={
              <button
                type="button"
                onClick={() => void generateOrders()}
                disabled={Boolean(workingKey)}
                className={SECONDARY_BUTTON}
              >
                Gerar proximas O.S.
              </button>
            }
          >
            {contract.schedules.length > 0 ? (
              <div className="space-y-3">
                {contract.schedules.map((schedule) => (
                  <div
                    key={schedule.id}
                    className="rounded-[24px] border border-slate-200 bg-slate-50/85 px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {schedule.generator.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDate(schedule.scheduledDate)} · Serie{" "}
                          {schedule.generator.serialNumber || "-"}
                        </p>
                      </div>
                      <DataPill tone={scheduleStatusTone(schedule.status)}>
                        {scheduleStatusLabel(schedule.status)}
                      </DataPill>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {schedule.generatedOrderId ? (
                        <PermissionAwareLink
                          href={`/dashboard/orders/${schedule.generatedOrderId}`}
                          permission="orders.view"
                          className="inline-flex text-sm font-semibold text-sky-700 transition hover:text-sky-800 hover:underline"
                          fallbackClassName="inline-flex text-sm font-semibold text-slate-500"
                        >
                          Abrir O.S. vinculada
                        </PermissionAwareLink>
                      ) : (
                        <span className="text-sm text-slate-500">
                          Ainda sem O.S. gerada para esta preventiva.
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Sem cronograma preventivo"
                description="As proximas visitas preventivas aparecerao aqui apos a sincronizacao automatica."
              />
            )}
          </SectionCard>

          {contract.notes ? (
            <SectionCard
              eyebrow="Observacoes"
              title="Notas internas do contrato"
              description="Contexto adicional relevante para atendimento, financeiro ou renovacao."
            >
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/85 px-4 py-4">
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {contract.notes}
                </p>
              </div>
            </SectionCard>
          ) : null}
        </div>

        <div className="space-y-6">
          <SectionCard
            eyebrow="Resumo executivo"
            title="Leitura do contrato"
            description="Pontos centrais para governanca, renovacao e operacao."
          >
            <div className="grid gap-3">
              <Info label="Cliente" value={contract.client.companyName} />
              <Info
                label="Vigencia"
                value={`${formatDate(contract.startDate)} ate ${formatDate(contract.endDate)}`}
                tone={expiresSoon ? "amber" : "slate"}
              />
              <Info
                label="Recorrencia"
                value={recurrenceLabel(contract.preventiveRecurrence)}
                tone="blue"
              />
              <Info
                label="Cobertura total"
                value={formatCurrency(coveredAmount)}
                tone="emerald"
              />
              <Info
                label="Dia de vencimento"
                value={`Dia ${contract.dueDay}`}
              />
              <Info
                label="Indice de reajuste"
                value={contract.adjustmentIndex}
              />
              <Info
                label="Cobertura de pecas"
                value={partsCoverageLabel(contract.partsCoverage)}
              />
              <Info
                label="SLA resposta"
                value={
                  contract.responseTimeHours != null
                    ? `${contract.responseTimeHours}h`
                    : "Nao definido"
                }
              />
              <Info
                label="Franquia corretiva"
                value={
                  contract.correctiveVisitAllowance != null
                    ? String(contract.correctiveVisitAllowance)
                    : "Nao definida"
                }
              />
              <Info
                label="Alerta de vencimento"
                value={`${contract.alertDays} dias`}
                tone="amber"
              />
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Relacionamentos"
            title="Pontes do fluxo"
            description="Aqui fica visivel se o contrato fecha corretamente o ciclo que veio da proposta."
          >
            <div className="space-y-3">
              <Info
                label="Origem comercial"
                value={contract.sourceProposal?.code || "Contrato manual"}
                tone={contract.sourceProposal ? "blue" : "slate"}
              />
              {contract.sourceProposal ? (
                <PermissionAwareLink
                  href={`/dashboard/proposals/${contract.sourceProposal.id}`}
                  permission="proposals.view"
                  className="inline-flex text-sm font-semibold text-sky-700 transition hover:text-sky-800 hover:underline"
                  fallbackClassName="inline-flex text-sm font-semibold text-slate-500"
                >
                  Abrir proposta de origem
                </PermissionAwareLink>
              ) : null}
              <Info
                label="Cliente inadimplente"
                value={contract.client.isDelinquent ? "Sim" : "Nao"}
                tone={contract.client.isDelinquent ? "amber" : "emerald"}
              />
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function MiniInfo({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-600">{helper}</p>
    </div>
  );
}

function Info({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50/85 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </p>
        <DataPill tone={tone}>{value}</DataPill>
      </div>
      <p className="mt-3 break-words text-sm font-medium text-slate-800">
        {value}
      </p>
    </div>
  );
}

function contractStatusTone(status: ContractStatus): Tone {
  if (status === "ACTIVE") return "emerald";
  if (status === "SUSPENDED") return "amber";
  if (status === "RENEWAL") return "blue";
  return "rose";
}

function contractStatusLabel(status: ContractStatus) {
  const labels: Record<ContractStatus, string> = {
    ACTIVE: "Ativo",
    SUSPENDED: "Suspenso",
    CANCELED: "Cancelado",
    RENEWAL: "Renovacao",
  };
  return labels[status];
}

function invoiceStatusTone(status: string): Tone {
  if (status === "PAID") return "emerald";
  if (status === "OVERDUE") return "rose";
  return "amber";
}

function invoiceStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PAID: "Pago",
    OVERDUE: "Em atraso",
    PENDING: "Pendente",
  };
  return labels[status] || status;
}

function scheduleStatusTone(status: string): Tone {
  if (status === "ORDER_CREATED") return "emerald";
  if (status === "OVERDUE") return "rose";
  return "blue";
}

function scheduleStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: "Pendente",
    ORDER_CREATED: "O.S. criada",
    OVERDUE: "Em atraso",
  };
  return labels[status] || status;
}

function recurrenceLabel(value: string) {
  const labels: Record<string, string> = {
    MONTHLY: "Mensal",
    BIMONTHLY: "Bimestral",
    QUARTERLY: "Trimestral",
    SEMIANNUAL: "Semestral",
    ANNUAL: "Anual",
  };
  return labels[value] || value;
}

function partsCoverageLabel(value: string) {
  return value === "INCLUDED"
    ? "Inclusa na mensalidade"
    : "Faturada separadamente";
}

function formatDate(date?: string | null) {
  if (!date) return "Sem data";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "Sem data";
  return parsed.toLocaleDateString("pt-BR");
}

function formatMonth(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "Sem data";
  return parsed.toLocaleDateString("pt-BR", {
    month: "2-digit",
    year: "numeric",
  });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

function daysUntil(date: string) {
  const parsed = new Date(date).getTime();
  if (Number.isNaN(parsed)) return 0;
  return Math.ceil((parsed - Date.now()) / (1000 * 60 * 60 * 24));
}
