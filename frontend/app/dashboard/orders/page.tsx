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

type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";
type OrderStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";

type OrderListItem = {
  id: string;
  title: string;
  description?: string | null;
  type?: string | null;
  priority?: string | null;
  status?: OrderStatus | null;
  scheduledTo?: string | null;
  customerReport?: string | null;
  contract?: { id: string; code: string; status: string } | null;
  site?: { id: string; name?: string | null } | null;
  technician?: {
    id: string;
    user?: { name?: string | null; skillLevel?: string | null } | null;
  } | null;
  materials?: Array<{
    id: string;
    quantity: number;
    catalogItem?: { name?: string | null } | null;
  }>;
  generator?: {
    id?: string;
    name?: string | null;
    currentSite?: { id?: string; name?: string | null } | null;
    client?: { companyName?: string | null } | null;
  } | null;
};

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | OrderStatus>("ALL");

  const handleUnauthorized = useCallback(
    async (res: Response) => {
      if (res.status !== 401) return false;
      clearAuthSession();
      router.replace("/");
      return true;
    },
    [router],
  );

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await apiFetch(apiUrl("/maintenance-orders"), { cache: "no-store" });
      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Nao foi possivel carregar as ordens."),
        );
      }
      setOrders((await res.json()) as OrderListItem[]);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar ordens.",
      );
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const filteredOrders = useMemo(() => {
    const term = query.trim().toLowerCase();

    return orders.filter((order) => {
      if (statusFilter !== "ALL" && order.status !== statusFilter) return false;
      if (!term) return true;

      return (
        order.title.toLowerCase().includes(term) ||
        (order.description || "").toLowerCase().includes(term) ||
        (order.generator?.name || "").toLowerCase().includes(term) ||
        (order.generator?.client?.companyName || "").toLowerCase().includes(term) ||
        (order.contract?.code || "").toLowerCase().includes(term)
      );
    });
  }, [orders, query, statusFilter]);

  const stats = useMemo(() => {
    const open = orders.filter((order) => order.status === "OPEN").length;
    const inProgress = orders.filter(
      (order) => order.status === "IN_PROGRESS",
    ).length;
    const unattended = orders.filter((order) => !order.technician?.id).length;
    const linkedToContract = orders.filter((order) => order.contract).length;
    const urgent = orders.filter(
      (order) => order.priority === "URGENT" || order.priority === "HIGH",
    ).length;

    return {
      total: orders.length,
      open,
      inProgress,
      unattended,
      linkedToContract,
      urgent,
    };
  }, [orders]);

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Execucao em campo"
        title="Ordens de servico com visao de fila, origem e gargalos."
        description="A oficina agora organiza melhor prioridade, alocacao, origem contratual e prontidao operacional. Tambem passamos a tratar sessao e erro com a mesma consistencia dos outros modulos."
        stats={[
          {
            label: "Ordens abertas",
            value: String(stats.open),
            helper: "Itens ainda aguardando tracao operacional.",
            tone: "amber",
          },
          {
            label: "Em andamento",
            value: String(stats.inProgress),
            helper: "Atendimentos ativos no campo.",
            tone: "blue",
          },
          {
            label: "Sem tecnico",
            value: String(stats.unattended),
            helper: "Itens que ainda pedem alocacao.",
            tone: "rose",
          },
          {
            label: "Vindas de contrato",
            value: String(stats.linkedToContract),
            helper: "Ordens geradas a partir da carteira contratual.",
            tone: "emerald",
          },
        ]}
        actions={
          <>
            <button type="button" onClick={() => void loadOrders()} className={SECONDARY_BUTTON}>
              Atualizar fila
            </button>
            <Link href="/dashboard/dispatch" className={PRIMARY_BUTTON}>
              Nova O.S. avulsa
            </Link>
          </>
        }
        aside={
          <FieldBox className="space-y-4 rounded-[28px] border-white/60 bg-white/80 p-5 shadow-[0_22px_60px_-40px_rgba(15,31,50,0.45)]">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Verificacao de fluxo
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Agora fica mais claro quais O.S. nasceram de contrato, quais ainda estao
                sem tecnico e onde a fila precisa de resposta rapida.
              </p>
            </div>
            <QueuePulse
              label="Prioridade critica"
              value={`${stats.urgent} ordem(ns)`}
              helper="Urgentes ou altas que pedem resposta mais rapida."
              tone="rose"
            />
            <QueuePulse
              label="Cobertura contratual"
              value={`${stats.linkedToContract} vinculadas`}
              helper="Ajuda a validar a ponte contrato -> O.S. preventiva."
              tone="blue"
            />
          </FieldBox>
        }
      />

      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}

      <SectionCard
        eyebrow="Fila operacional"
        title="Ordens em acompanhamento"
        description="Pesquisa, filtra e navega pelo backlog sem depender de uma tabela pesada e pouco legivel."
        actions={
          <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[640px] xl:flex-row xl:items-center xl:justify-end">
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por titulo, cliente, equipamento ou contrato..."
              className="xl:min-w-[320px]"
            />
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "ALL" | OrderStatus)
              }
              className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-900 transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100 xl:w-[220px]"
            >
              <option value="ALL">Todos os status</option>
              <option value="OPEN">Abertas</option>
              <option value="IN_PROGRESS">Em andamento</option>
              <option value="COMPLETED">Concluidas</option>
              <option value="CANCELED">Canceladas</option>
            </select>
          </div>
        }
      >
        {loading ? (
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-10 text-sm text-slate-500">
            Carregando ordens...
          </div>
        ) : null}

        {!loading && filteredOrders.length === 0 ? (
          <EmptyState
            title="Nenhuma O.S. encontrada"
            description="Ajuste os filtros ou crie uma nova ordem na central de despacho."
          />
        ) : null}

        {!loading && filteredOrders.length > 0 ? (
          <div className="space-y-3">
            {filteredOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

function OrderCard({ order }: { order: OrderListItem }) {
  const needsAttention =
    !order.technician?.id ||
    order.status === "OPEN" ||
    order.priority === "URGENT" ||
    order.priority === "HIGH";
  const siteName = order.site?.name || order.generator?.currentSite?.name || "-";

  return (
    <article className="rounded-[28px] border border-slate-200 bg-white/92 px-5 py-5 shadow-[0_24px_60px_-48px_rgba(15,31,50,0.35)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-bold text-slate-950">{order.title}</p>
            <DataPill tone={orderStatusTone(order.status)}>{orderStatusLabel(order.status)}</DataPill>
            <DataPill tone={priorityTone(order.priority)}>{priorityLabel(order.priority)}</DataPill>
            {order.contract ? <DataPill tone="blue">{order.contract.code}</DataPill> : null}
            {needsAttention ? <DataPill tone="amber">Pede atencao</DataPill> : null}
          </div>

          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            {order.description || "Sem descricao operacional registrada."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/dashboard/orders/${order.id}`} className={PRIMARY_BUTTON}>
            Abrir O.S.
          </Link>
          {order.contract ? (
            <Link
              href={`/dashboard/contracts/${order.contract.id}`}
              className="inline-flex text-sm font-semibold text-sky-700 transition hover:text-sky-800 hover:underline"
            >
              Abrir contrato
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-4">
        <OrderInfo
          label="Cliente"
          value={order.generator?.client?.companyName || "-"}
          helper="Conta atendida pela ordem."
          tone="slate"
        />
        <OrderInfo
          label="Equipamento"
          value={order.generator?.name || "-"}
          helper={`Site: ${siteName}`}
          tone="blue"
        />
        <OrderInfo
          label="Tecnico"
          value={order.technician?.user?.name || "Aguardando alocacao"}
          helper={
            order.technician?.user?.skillLevel
              ? `Senioridade: ${skillLabel(order.technician.user.skillLevel)}`
              : "Despacho ainda nao concluido."
          }
          tone={order.technician?.id ? "emerald" : "amber"}
        />
        <OrderInfo
          label="Execucao"
          value={order.scheduledTo ? formatDateTime(order.scheduledTo) : "Sem agenda"}
          helper={
            order.materials && order.materials.length > 0
              ? `${order.materials.length} material(is) reservado(s).`
              : "Sem material reservado."
          }
          tone={order.scheduledTo ? "emerald" : "rose"}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {order.type ? <DataPill tone="slate">{orderTypeLabel(order.type)}</DataPill> : null}
        {order.customerReport ? <DataPill tone="emerald">Relatorio registrado</DataPill> : null}
        {!order.customerReport && order.status === "IN_PROGRESS" ? (
          <DataPill tone="amber">Relatorio pendente</DataPill>
        ) : null}
      </div>
    </article>
  );
}

function QueuePulse({
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

function OrderInfo({
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

function orderStatusTone(status?: string | null): Tone {
  if (status === "IN_PROGRESS") return "blue";
  if (status === "COMPLETED") return "emerald";
  if (status === "CANCELED") return "rose";
  return "amber";
}

function orderStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    OPEN: "Aberta",
    IN_PROGRESS: "Em andamento",
    COMPLETED: "Concluida",
    CANCELED: "Cancelada",
  };
  return labels[status || "OPEN"] || status || "Aberta";
}

function priorityTone(priority?: string | null): Tone {
  if (priority === "URGENT") return "rose";
  if (priority === "HIGH") return "amber";
  if (priority === "LOW") return "slate";
  return "blue";
}

function priorityLabel(priority?: string | null) {
  const labels: Record<string, string> = {
    URGENT: "Urgente",
    HIGH: "Alta",
    NORMAL: "Normal",
    LOW: "Baixa",
  };
  return labels[priority || "NORMAL"] || priority || "Normal";
}

function orderTypeLabel(type: string) {
  const labels: Record<string, string> = {
    PREVENTIVE: "Preventiva",
    CORRECTIVE: "Corretiva",
    INSTALLATION: "Instalacao",
    DEMOBILIZATION: "Desmobilizacao",
    REFUELING: "Abastecimento",
  };
  return labels[type] || type;
}

function skillLabel(level?: string | null) {
  const labels: Record<string, string> = {
    TRAINEE: "Trainee",
    JUNIOR: "Junior",
    PLENO: "Pleno",
    SENIOR: "Senior",
    MASTER: "Master",
  };
  return labels[level || ""] || level || "-";
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sem agenda";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}
