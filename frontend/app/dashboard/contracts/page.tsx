"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  TextInput,
} from "../components/DashboardPageKit";

type ContractStatus = "ACTIVE" | "SUSPENDED" | "CANCELED" | "RENEWAL";
type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";

type Contract = {
  id: string;
  code: string;
  title?: string | null;
  status: ContractStatus;
  startDate: string;
  endDate: string;
  preventiveRecurrence: string;
  recurringAmount: number;
  sourceProposal?: { id: string; code: string; status: string } | null;
  client: { id: string; companyName: string; isDelinquent?: boolean | null };
  equipments: { id: string }[];
  invoices: { id: string; dueDate: string; status: string; amount: number }[];
};

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export default function ContractsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Contract[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [workingAction, setWorkingAction] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ContractStatus>("ALL");

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
    setLoading(true);
    setError("");

    try {
      const res = await apiFetch(apiUrl("/contracts"), { cache: "no-store" });
      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Nao foi possivel carregar contratos."),
        );
      }
      setItems((await res.json()) as Contract[]);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar contratos.",
      );
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();

    return items.filter((item) => {
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      if (!term) return true;

      return (
        item.code.toLowerCase().includes(term) ||
        (item.title || "").toLowerCase().includes(term) ||
        item.client.companyName.toLowerCase().includes(term) ||
        (item.sourceProposal?.code || "").toLowerCase().includes(term)
      );
    });
  }, [items, query, statusFilter]);

  const stats = useMemo(() => {
    const active = items.filter((contract) => contract.status === "ACTIVE").length;
    const suspended = items.filter(
      (contract) => contract.status === "SUSPENDED",
    ).length;
    const renewal = items.filter((contract) => contract.status === "RENEWAL").length;
    const monthly = items.reduce(
      (acc, contract) => acc + Number(contract.recurringAmount || 0),
      0,
    );
    const overdueInvoices = items.reduce(
      (acc, contract) =>
        acc +
        contract.invoices.filter((invoice) => invoice.status === "OVERDUE").length,
      0,
    );
    const proposalBased = items.filter((contract) => contract.sourceProposal).length;
    const expiringSoon = items.filter((contract) => daysUntil(contract.endDate) <= 45).length;

    return {
      active,
      suspended,
      renewal,
      monthly,
      overdueInvoices,
      proposalBased,
      attention: suspended + expiringSoon,
    };
  }, [items]);

  async function runContractAction<T>(
    actionKey: string,
    request: () => Promise<Response>,
    onSuccess: (data: T) => string,
  ) {
    setWorkingAction(actionKey);
    setError("");
    setNotice("");

    try {
      const res = await request();
      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "Falha ao executar acao."));
      }

      const data = (await res.json().catch(() => null)) as T;
      setNotice(onSuccess(data));
      await load();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Erro ao executar acao.",
      );
    } finally {
      setWorkingAction("");
    }
  }

  async function syncDelinquency() {
    await runContractAction<{
      suspendedContracts?: number;
      flaggedClients?: number;
    }>(
      "sync-delinquency",
      () =>
        apiFetch(apiUrl("/contracts/automation/delinquency-sync"), {
          method: "POST",
        }),
      (data) =>
        `Inadimplencia sincronizada: ${data.suspendedContracts || 0} contrato(s) suspenso(s) e ${data.flaggedClients || 0} cliente(s) sinalizado(s).`,
    );
  }

  async function runPreventiveAutomation() {
    await runContractAction<{
      processedContracts?: number;
      totalOrdersCreated?: number;
    }>(
      "preventive-run",
      () =>
        apiFetch(apiUrl("/contracts/automation/preventive-run?daysAhead=45"), {
          method: "POST",
        }),
      (data) =>
        `Automacao preventiva concluida em ${data.processedContracts || 0} contrato(s), com ${data.totalOrdersCreated || 0} O.S. criada(s).`,
    );
  }

  async function runGenerateOrders(contractId: string, code: string) {
    await runContractAction<{ createdCount?: number }>(
      `generate-${contractId}`,
      () =>
        apiFetch(apiUrl(`/contracts/${contractId}/generate-orders?daysAhead=30`), {
          method: "POST",
        }),
      (data) => {
        const createdCount = data.createdCount || 0;
        if (createdCount === 0) {
          return `Nenhuma O.S. preventiva pendente para o contrato ${code} nos proximos 30 dias.`;
        }
        return `${createdCount} O.S. preventiva(s) gerada(s) para o contrato ${code}.`;
      },
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Modulo contratual"
        title="Contratos com leitura de risco, receita e automacao."
        description="Esta carteira agora mostra melhor a ponte entre proposta, faturamento recorrente, preventivas e saude do cliente. Alem do visual, o fluxo recebeu tratamento consistente de sessao, erros e automacoes."
        stats={[
          {
            label: "Contratos ativos",
            value: String(stats.active),
            helper: "Base recorrente atualmente em operacao.",
            tone: "emerald",
          },
          {
            label: "Pedem atencao",
            value: String(stats.attention),
            helper: "Suspensos ou perto da janela de renovacao.",
            tone: "amber",
          },
          {
            label: "Receita recorrente",
            value: formatCurrency(stats.monthly),
            helper: "Soma mensal prevista na carteira.",
            tone: "blue",
          },
          {
            label: "Faturas em atraso",
            value: String(stats.overdueInvoices),
            helper: "Sinais de risco financeiro nos contratos.",
            tone: "rose",
          },
        ]}
        actions={
          <>
            <button
              type="button"
              onClick={() => void syncDelinquency()}
              disabled={Boolean(workingAction)}
              className={SECONDARY_BUTTON}
            >
              Sincronizar inadimplencia
            </button>
            <button
              type="button"
              onClick={() => void runPreventiveAutomation()}
              disabled={Boolean(workingAction)}
              className={SECONDARY_BUTTON}
            >
              Rodar preventivas
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || Boolean(workingAction)}
              className={SECONDARY_BUTTON}
            >
              Atualizar carteira
            </button>
            <Link href="/dashboard/contracts/new" className={PRIMARY_BUTTON}>
              Novo contrato
            </Link>
          </>
        }
        aside={
          <FieldBox className="space-y-4 rounded-[28px] border-white/60 bg-white/80 p-5 shadow-[0_22px_60px_-40px_rgba(15,31,50,0.45)]">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Pulso da carteira
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                A tela agora destaca os contratos originados por proposta e onde a
                operacao pode travar por renovacao, inadimplencia ou preventivas.
              </p>
            </div>
            <MiniPulse
              label="Origem comercial"
              value={`${stats.proposalBased} vinculados a propostas`}
              helper="Ajuda a conferir se o fluxo ganhou-proposta-virou-contrato esta batendo."
              tone="blue"
            />
            <MiniPulse
              label="Renovacao"
              value={`${stats.renewal} contrato(s)`}
              helper="Itens que ja entraram na faixa de renovacao."
              tone="amber"
            />
            <MiniPulse
              label="Suspensoes"
              value={`${stats.suspended} contrato(s)`}
              helper="Bloqueios normalmente puxados por inadimplencia."
              tone="rose"
            />
          </FieldBox>
        }
      />

      {notice ? <StatusBanner tone="emerald">{notice}</StatusBanner> : null}
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}

      <SectionCard
        eyebrow="Carteira operacional"
        title="Contratos em acompanhamento"
        description="Pesquisa, filtra e aciona a automacao diretamente na carteira sem perder o contexto de origem e risco."
        actions={
          <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[640px] xl:flex-row xl:items-center xl:justify-end">
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por contrato, cliente, titulo ou proposta..."
              className="xl:min-w-[320px]"
            />
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "ALL" | ContractStatus)
              }
              className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-900 transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100 xl:w-[220px]"
            >
              <option value="ALL">Todos os status</option>
              <option value="ACTIVE">Ativos</option>
              <option value="SUSPENDED">Suspensos</option>
              <option value="RENEWAL">Em renovacao</option>
              <option value="CANCELED">Cancelados</option>
            </select>
          </div>
        }
      >
        {loading ? (
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-10 text-sm text-slate-500">
            Carregando contratos...
          </div>
        ) : null}

        {!loading && filteredItems.length === 0 ? (
          <EmptyState
            title="Nenhum contrato encontrado"
            description="Ajuste os filtros ou crie um novo contrato para alimentar a carteira."
          />
        ) : null}

        {!loading && filteredItems.length > 0 ? (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <ContractCard
                key={item.id}
                contract={item}
                busy={workingAction === `generate-${item.id}`}
                onGenerateOrders={() => void runGenerateOrders(item.id, item.code)}
              />
            ))}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

function ContractCard({
  contract,
  busy,
  onGenerateOrders,
}: {
  contract: Contract;
  busy: boolean;
  onGenerateOrders: () => void;
}) {
  const overdueInvoices = contract.invoices.filter(
    (invoice) => invoice.status === "OVERDUE",
  ).length;
  const nextDue = [...contract.invoices]
    .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))[0];
  const expiringSoon = daysUntil(contract.endDate) <= 45;

  return (
    <article className="rounded-[28px] border border-slate-200 bg-white/92 px-5 py-5 shadow-[0_24px_60px_-48px_rgba(15,31,50,0.35)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-bold text-slate-950">{contract.code}</p>
            <DataPill tone={contractStatusTone(contract.status)}>
              {contractStatusLabel(contract.status)}
            </DataPill>
            {contract.sourceProposal ? (
              <DataPill tone="blue">Origem: {contract.sourceProposal.code}</DataPill>
            ) : null}
            {contract.client.isDelinquent ? (
              <DataPill tone="amber">Cliente inadimplente</DataPill>
            ) : null}
            {expiringSoon ? <DataPill tone="rose">Vence em breve</DataPill> : null}
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700">
              {contract.title || "Sem titulo comercial definido"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Cliente: {contract.client.companyName}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Receita recorrente
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-950">
            {formatCurrency(Number(contract.recurringAmount || 0))}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-4">
        <CardInfo
          label="Vigencia"
          value={`${formatDate(contract.startDate)} ate ${formatDate(contract.endDate)}`}
          helper={`Faltam ${Math.max(0, daysUntil(contract.endDate))} dia(s) para o termino.`}
          tone={expiringSoon ? "amber" : "slate"}
        />
        <CardInfo
          label="Escopo"
          value={`${contract.equipments.length} equipamento(s)`}
          helper={recurrenceLabel(contract.preventiveRecurrence)}
          tone="blue"
        />
        <CardInfo
          label="Faturamento"
          value={`${contract.invoices.length} parcela(s)`}
          helper={
            nextDue
              ? `Proximo vencimento em ${formatDate(nextDue.dueDate)}.`
              : "Sem faturas previstas."
          }
          tone="slate"
        />
        <CardInfo
          label="Risco financeiro"
          value={`${overdueInvoices} em atraso`}
          helper="Contagem de faturas vencidas neste contrato."
          tone={overdueInvoices > 0 ? "rose" : "emerald"}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link href={`/dashboard/contracts/${contract.id}`} className={PRIMARY_BUTTON}>
          Abrir contrato
        </Link>
        <button
          type="button"
          onClick={onGenerateOrders}
          disabled={busy}
          className={SECONDARY_BUTTON}
        >
          {busy ? "Gerando O.S..." : "Gerar O.S. (30 dias)"}
        </button>
        {contract.sourceProposal ? (
          <Link
            href={`/dashboard/proposals/${contract.sourceProposal.id}`}
            className="inline-flex text-sm font-semibold text-sky-700 transition hover:text-sky-800 hover:underline"
          >
            Abrir proposta de origem
          </Link>
        ) : null}
        {contract.status === "RENEWAL" || expiringSoon ? (
          <Link
            href={`/dashboard/proposals/new?clientId=${contract.client.id}&renewalContractId=${contract.id}`}
            className="inline-flex text-sm font-semibold text-amber-700 transition hover:text-amber-800 hover:underline"
          >
            Criar proposta de renovacao
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function MiniPulse({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: Tone;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </p>
        <DataPill tone={tone}>{value}</DataPill>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600">{helper}</p>
    </div>
  );
}

function CardInfo({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: Tone;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </p>
        <DataPill tone={tone}>{value}</DataPill>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600">{helper}</p>
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

function formatDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "Sem data";
  return parsed.toLocaleDateString("pt-BR");
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
