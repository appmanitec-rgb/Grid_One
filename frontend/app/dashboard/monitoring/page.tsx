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
  SelectInput,
  StatusBanner,
  TextInput,
} from "../components/DashboardPageKit";

type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";
type MonitoringSeverity = "ok" | "warning" | "critical";
type OrderStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";

type MonitoringOrder = {
  id: string;
  title: string;
  status: OrderStatus;
  type?: string | null;
  priority?: string | null;
  openedAt: string;
  scheduledTo?: string | null;
  auvoId?: string | null;
  auvoLink?: string | null;
  technician?: {
    id: string;
    name: string;
    skillLevel?: string | null;
  } | null;
  contract?: {
    id: string;
    code: string;
    status: string;
  } | null;
};

type MonitoringGenerator = {
  id: string;
  name: string;
  serialNumber?: string | null;
  criticality?: string | null;
  operationalStatus?: string | null;
  lifecycleStatus?: string | null;
  client?: { id: string; companyName?: string | null } | null;
  currentSite?: {
    id: string;
    name?: string | null;
    city?: string | null;
    state?: string | null;
  } | null;
};

type MonitoringEvent = {
  id: string;
  alarmType: string;
  fuelLevelPercent?: number | null;
  batteryVoltage?: number | null;
  coolantTemperature?: number | null;
  oilPressure?: number | null;
  gridOnline?: boolean | null;
  receivedAt: string;
  severity: MonitoringSeverity;
  generator: MonitoringGenerator;
  activeOrderCount: number;
  activeOrders: MonitoringOrder[];
  automationOpen: boolean;
};

type GeneratorSnapshot = {
  generator: MonitoringGenerator;
  severity: MonitoringSeverity;
  activeOrderCount: number;
  activeOrders: MonitoringOrder[];
  automationOpen: boolean;
  lastEvent: Omit<MonitoringEvent, "generator" | "activeOrderCount" | "activeOrders" | "automationOpen" | "severity"> & {
    receivedAt: string;
  };
};

type MonitoringOverview = {
  stats: {
    monitoredGenerators: number;
    activeAlerts: number;
    lowFuelGenerators: number;
    gridFailures: number;
    automationOpenOrders: number;
    linkedActiveOrders: number;
  };
  recentEvents: MonitoringEvent[];
  generatorSnapshots: GeneratorSnapshot[];
};

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

const EMPTY_OVERVIEW: MonitoringOverview = {
  stats: {
    monitoredGenerators: 0,
    activeAlerts: 0,
    lowFuelGenerators: 0,
    gridFailures: 0,
    automationOpenOrders: 0,
    linkedActiveOrders: 0,
  },
  recentEvents: [],
  generatorSnapshots: [],
};

export default function MonitoringPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<MonitoringOverview>(EMPTY_OVERVIEW);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<
    "ALL" | MonitoringSeverity | "AUTOMATION"
  >("ALL");

  const handleUnauthorized = useCallback(
    async (res: Response) => {
      if (res.status !== 401) return false;
      clearAuthSession();
      router.replace("/");
      return true;
    },
    [router],
  );

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await apiFetch(apiUrl("/telemetry/overview"), { cache: "no-store" });
      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(
            res,
            "Nao foi possivel carregar o monitoramento operacional.",
          ),
        );
      }

      setOverview((await res.json()) as MonitoringOverview);
    } catch (loadError: unknown) {
      setOverview(EMPTY_OVERVIEW);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar monitoramento.",
      );
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const filteredEvents = useMemo(() => {
    const term = search.trim().toLowerCase();

    return overview.recentEvents.filter((event) => {
      if (severityFilter === "AUTOMATION" && !event.automationOpen) return false;
      if (severityFilter !== "ALL" && severityFilter !== "AUTOMATION" && event.severity !== severityFilter) {
        return false;
      }

      if (!term) return true;

      const source = [
        event.generator.name,
        event.generator.serialNumber || "",
        event.generator.client?.companyName || "",
        event.generator.currentSite?.name || "",
        event.alarmType,
        event.activeOrders.map((order) => order.title).join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return source.includes(term);
    });
  }, [overview.recentEvents, search, severityFilter]);

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Telemetria e resposta"
        title="Monitoramento operacional com alertas, automacoes e ponte direta para o campo."
        description="A tela agora consome telemetria real, cruza eventos com ordens ativas e deixa visivel quando combustivel baixo ja abriu abastecimento automatico. Isso fecha melhor o fluxo alerta -> triagem -> O.S. -> despacho."
        stats={[
          {
            label: "Geradores monitorados",
            value: String(overview.stats.monitoredGenerators),
            helper: "Equipamentos com ultimo evento capturado no snapshot.",
            tone: "blue",
          },
          {
            label: "Alertas ativos",
            value: String(overview.stats.activeAlerts),
            helper: "Geradores cujo ultimo evento pede acompanhamento.",
            tone: "rose",
          },
          {
            label: "Baixo combustivel",
            value: String(overview.stats.lowFuelGenerators),
            helper: "Casos que podem disparar abastecimento automatico.",
            tone: "amber",
          },
          {
            label: "Automacoes abertas",
            value: String(overview.stats.automationOpenOrders),
            helper: "O.S. de abastecimento ativas ligadas a telemetria.",
            tone: "emerald",
          },
        ]}
        actions={
          <>
            <button type="button" onClick={() => void loadOverview()} className={SECONDARY_BUTTON}>
              Atualizar radar
            </button>
            <Link href="/dashboard/dispatch" className={PRIMARY_BUTTON}>
              Abrir despacho
            </Link>
          </>
        }
        aside={
          <FieldBox className="space-y-4 rounded-[28px] border-white/60 bg-white/82 p-5 shadow-[0_22px_60px_-40px_rgba(15,31,50,0.45)]">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Verificacao de fluxo
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Antes a pagina so relistava O.S. Agora ela enxerga o evento de telemetria,
                identifica resposta operacional em andamento e evidencia quando a automacao
                ja abriu uma O.S. de abastecimento.
              </p>
            </div>
            <Pulse
              label="Ordens ligadas"
              value={`${overview.stats.linkedActiveOrders} ativas`}
              helper="Fila operacional atualmente conectada aos geradores do snapshot."
              tone="blue"
            />
            <Pulse
              label="Falha de rede"
              value={`${overview.stats.gridFailures} ocorrencia(s)`}
              helper="Ultimo evento com grid offline ou alarme de falha de rede."
              tone="rose"
            />
          </FieldBox>
        }
      />

      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
        <SectionCard
          eyebrow="Eventos recentes"
          title="Alertas e telemetria operacional"
          description="Pesquise por gerador, cliente, site ou tipo de alarme e veja rapidamente se a resposta ja caiu em O.S. ou ainda pede despacho."
          actions={
            <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[680px] xl:flex-row xl:items-center xl:justify-end">
              <TextInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por gerador, cliente, site ou O.S...."
                className="xl:min-w-[320px]"
              />
              <SelectInput
                value={severityFilter}
                onChange={(event) =>
                  setSeverityFilter(
                    event.target.value as "ALL" | MonitoringSeverity | "AUTOMATION",
                  )
                }
                className="xl:w-[230px]"
              >
                <option value="ALL">Todos os eventos</option>
                <option value="critical">Criticos</option>
                <option value="warning">Avisos</option>
                <option value="ok">Estaveis</option>
                <option value="AUTOMATION">Com automacao aberta</option>
              </SelectInput>
            </div>
          }
        >
          {loading ? (
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-10 text-sm text-slate-500">
              Carregando telemetria...
            </div>
          ) : null}

          {!loading && filteredEvents.length === 0 ? (
            <EmptyState
              title="Nenhum evento encontrado"
              description="Ajuste o filtro ou aguarde a entrada de novas leituras de telemetria."
            />
          ) : null}

          {!loading && filteredEvents.length > 0 ? (
            <div className="space-y-4">
              {filteredEvents.map((event) => (
                <TelemetryEventCard key={event.id} event={event} />
              ))}
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          eyebrow="Pulso da frota"
          title="Ultimo status por gerador"
          description="Leitura consolidada por equipamento para priorizar quem pede visita, abastecimento ou apenas acompanhamento."
        >
          {loading ? (
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-10 text-sm text-slate-500">
              Montando snapshot...
            </div>
          ) : null}

          {!loading && overview.generatorSnapshots.length === 0 ? (
            <EmptyState
              title="Sem snapshot disponivel"
              description="Assim que os primeiros eventos chegarem, o monitoramento passa a montar o pulso da frota."
            />
          ) : null}

          {!loading && overview.generatorSnapshots.length > 0 ? (
            <div className="space-y-3">
              {overview.generatorSnapshots.slice(0, 8).map((snapshot) => (
                <GeneratorSnapshotCard
                  key={snapshot.generator.id}
                  snapshot={snapshot}
                />
              ))}
            </div>
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}

function TelemetryEventCard({ event }: { event: MonitoringEvent }) {
  const primaryOrder = event.activeOrders[0] || null;
  const siteLabel = formatSite(event.generator.currentSite);

  return (
    <article className="rounded-[28px] border border-slate-200 bg-white/92 px-5 py-5 shadow-[0_24px_60px_-48px_rgba(15,31,50,0.35)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-bold text-slate-950">{event.generator.name}</p>
            <DataPill tone={severityTone(event.severity)}>
              {severityLabel(event.severity)}
            </DataPill>
            <DataPill tone={alarmTone(event.alarmType, event.severity)}>
              {alarmLabel(event.alarmType)}
            </DataPill>
            {event.automationOpen ? <DataPill tone="amber">Automacao em curso</DataPill> : null}
            {event.activeOrderCount > 0 ? (
              <DataPill tone="blue">{event.activeOrderCount} O.S. ativa(s)</DataPill>
            ) : (
              <DataPill tone="slate">Sem O.S. vinculada</DataPill>
            )}
          </div>

          <p className="max-w-4xl text-sm leading-6 text-slate-600">
            {event.generator.client?.companyName || "Cliente nao identificado"} • {siteLabel}
            {event.generator.serialNumber ? ` • Serie ${event.generator.serialNumber}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {primaryOrder ? (
            <Link href={`/dashboard/orders/${primaryOrder.id}`} className={PRIMARY_BUTTON}>
              Abrir O.S.
            </Link>
          ) : (
            <Link href="/dashboard/dispatch" className={PRIMARY_BUTTON}>
              Despachar resposta
            </Link>
          )}
          <Link href={`/dashboard/equipments/${event.generator.id}`} className={SECONDARY_BUTTON}>
            Abrir equipamento
          </Link>
          {primaryOrder?.auvoLink ? (
            <a
              href={primaryOrder.auvoLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
            >
              Abrir Auvo
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-4">
        <EventSignal
          label="Recebido"
          value={formatDateTime(event.receivedAt)}
          helper="Momento da ultima leitura recebida."
          tone="slate"
        />
        <EventSignal
          label="Combustivel"
          value={formatFuel(event.fuelLevelPercent)}
          helper="Leitura usada para disparar abastecimento automatico."
          tone={fuelTone(event.fuelLevelPercent)}
        />
        <EventSignal
          label="Eletrica"
          value={formatBattery(event.batteryVoltage)}
          helper={`Grid: ${gridLabel(event.gridOnline)}`}
          tone={batteryTone(event.batteryVoltage, event.gridOnline)}
        />
        <EventSignal
          label="Motor"
          value={formatThermal(event.coolantTemperature, event.oilPressure)}
          helper="Temperatura e pressao do oleo da ultima captura."
          tone={thermalTone(event.coolantTemperature, event.oilPressure)}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {event.generator.criticality ? (
          <DataPill tone={criticalityTone(event.generator.criticality)}>
            {criticalityLabel(event.generator.criticality)}
          </DataPill>
        ) : null}
        {event.generator.operationalStatus ? (
          <DataPill tone={operationalTone(event.generator.operationalStatus)}>
            {operationalStatusLabel(event.generator.operationalStatus)}
          </DataPill>
        ) : null}
        {event.generator.lifecycleStatus ? (
          <DataPill tone="slate">
            {lifecycleStatusLabel(event.generator.lifecycleStatus)}
          </DataPill>
        ) : null}
      </div>

      <div className="mt-5">
        {event.activeOrders.length > 0 ? (
          <div className="space-y-3">
            {event.activeOrders.map((order) => (
              <ActiveOrderRow key={order.id} order={order} />
            ))}
          </div>
        ) : (
          <FieldBox className="rounded-[22px] border-slate-200 bg-slate-50/80 p-4">
            <p className="text-sm leading-6 text-slate-600">
              Nenhuma O.S. ativa ligada a este gerador neste momento. Se o alerta pedir
              resposta, o proximo passo e cair no despacho.
            </p>
          </FieldBox>
        )}
      </div>
    </article>
  );
}

function GeneratorSnapshotCard({ snapshot }: { snapshot: GeneratorSnapshot }) {
  const primaryOrder = snapshot.activeOrders[0] || null;

  return (
    <article className="rounded-[24px] border border-slate-200 bg-white/90 px-4 py-4 shadow-[0_20px_50px_-42px_rgba(15,31,50,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-950">{snapshot.generator.name}</p>
          <p className="mt-1 text-sm text-slate-600">
            {snapshot.generator.client?.companyName || "Cliente nao identificado"}
          </p>
        </div>
        <DataPill tone={severityTone(snapshot.severity)}>
          {severityLabel(snapshot.severity)}
        </DataPill>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {snapshot.generator.operationalStatus ? (
          <DataPill tone={operationalTone(snapshot.generator.operationalStatus)}>
            {operationalStatusLabel(snapshot.generator.operationalStatus)}
          </DataPill>
        ) : null}
        <DataPill tone="blue">{alarmLabel(snapshot.lastEvent.alarmType)}</DataPill>
        {snapshot.automationOpen ? <DataPill tone="amber">Abastecimento aberto</DataPill> : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <EventSignal
          label="Ultimo evento"
          value={formatDateTime(snapshot.lastEvent.receivedAt)}
          helper={formatSite(snapshot.generator.currentSite)}
          tone="slate"
        />
        <EventSignal
          label="Fila ligada"
          value={`${snapshot.activeOrderCount} O.S.`}
          helper={
            primaryOrder
              ? `${primaryOrder.title} • ${orderStatusLabel(primaryOrder.status)}`
              : "Sem resposta operacional ativa."
          }
          tone={snapshot.activeOrderCount > 0 ? "blue" : "slate"}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {primaryOrder ? (
          <Link href={`/dashboard/orders/${primaryOrder.id}`} className={PRIMARY_BUTTON}>
            Abrir O.S.
          </Link>
        ) : (
          <Link href="/dashboard/dispatch" className={PRIMARY_BUTTON}>
            Acionar despacho
          </Link>
        )}
        <Link href={`/dashboard/equipments/${snapshot.generator.id}`} className={SECONDARY_BUTTON}>
          Equipamento
        </Link>
      </div>
    </article>
  );
}

function ActiveOrderRow({ order }: { order: MonitoringOrder }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50/85 px-4 py-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">{order.title}</p>
            <DataPill tone={orderStatusTone(order.status)}>
              {orderStatusLabel(order.status)}
            </DataPill>
            <DataPill tone={priorityTone(order.priority)}>
              {priorityLabel(order.priority)}
            </DataPill>
            {order.type ? <DataPill tone="slate">{orderTypeLabel(order.type)}</DataPill> : null}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {order.technician?.name
              ? `Tecnico: ${order.technician.name}`
              : "Aguardando tecnico"}
            {order.contract?.code ? ` • Contrato ${order.contract.code}` : ""}
            {order.scheduledTo ? ` • Agenda ${formatDateTime(order.scheduledTo)}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href={`/dashboard/orders/${order.id}`} className={SECONDARY_BUTTON}>
            Ver O.S.
          </Link>
          {order.auvoLink ? (
            <a
              href={order.auvoLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
            >
              Auvo
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Pulse({
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
      <p className="mt-2 text-sm leading-6 text-slate-600">{helper}</p>
    </div>
  );
}

function EventSignal({
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
    <div className="rounded-[20px] border border-slate-200 bg-slate-50/85 px-4 py-4">
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

function severityTone(severity: MonitoringSeverity): Tone {
  if (severity === "critical") return "rose";
  if (severity === "warning") return "amber";
  return "emerald";
}

function severityLabel(severity: MonitoringSeverity) {
  const labels: Record<MonitoringSeverity, string> = {
    critical: "Critico",
    warning: "Aviso",
    ok: "Estavel",
  };
  return labels[severity];
}

function alarmTone(alarmType: string, severity: MonitoringSeverity): Tone {
  if (alarmType === "NONE") return "slate";
  return severityTone(severity);
}

function alarmLabel(alarmType?: string | null) {
  const labels: Record<string, string> = {
    NONE: "Sem alarme",
    LOW_FUEL: "Combustivel baixo",
    BATTERY_LOW: "Bateria baixa",
    HIGH_COOLANT_TEMPERATURE: "Alta temperatura",
    LOW_OIL_PRESSURE: "Baixa pressao de oleo",
    START_FAILURE: "Falha de partida",
    GRID_FAILURE: "Falha de rede",
  };
  return labels[alarmType || "NONE"] || alarmType || "Sem alarme";
}

function criticalityTone(criticality?: string | null): Tone {
  if (criticality === "A") return "rose";
  if (criticality === "B") return "amber";
  return "blue";
}

function criticalityLabel(criticality: string) {
  return `Criticidade ${criticality}`;
}

function operationalTone(status?: string | null): Tone {
  if (status === "STOPPED_BY_FAILURE") return "rose";
  if (status === "IN_MAINTENANCE") return "amber";
  if (status === "DEACTIVATED") return "slate";
  return "emerald";
}

function operationalStatusLabel(status: string) {
  const labels: Record<string, string> = {
    OPERATING: "Operando",
    STOPPED_BY_FAILURE: "Parado por falha",
    IN_MAINTENANCE: "Em manutencao",
    DEACTIVATED: "Desativado",
  };
  return labels[status] || status;
}

function lifecycleStatusLabel(status: string) {
  const labels: Record<string, string> = {
    AVAILABLE: "Disponivel",
    LEASED: "Locado",
    IN_MAINTENANCE: "Em manutencao",
    SCRAP: "Sucata",
  };
  return labels[status] || status;
}

function orderStatusTone(status: OrderStatus): Tone {
  if (status === "IN_PROGRESS") return "blue";
  if (status === "COMPLETED") return "emerald";
  if (status === "CANCELED") return "rose";
  return "amber";
}

function orderStatusLabel(status: OrderStatus) {
  const labels: Record<OrderStatus, string> = {
    OPEN: "Aberta",
    IN_PROGRESS: "Em andamento",
    COMPLETED: "Concluida",
    CANCELED: "Cancelada",
  };
  return labels[status];
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

function fuelTone(fuel?: number | null): Tone {
  if (fuel === null || typeof fuel === "undefined") return "slate";
  if (fuel < 15) return "rose";
  if (fuel < 30) return "amber";
  return "emerald";
}

function batteryTone(battery?: number | null, gridOnline?: boolean | null): Tone {
  if (gridOnline === false) return "rose";
  if (battery === null || typeof battery === "undefined") return "slate";
  if (battery < 12) return "amber";
  return "emerald";
}

function thermalTone(coolant?: number | null, oil?: number | null): Tone {
  if ((coolant !== null && typeof coolant !== "undefined" && coolant >= 98) || (oil !== null && typeof oil !== "undefined" && oil <= 20)) {
    return "rose";
  }
  if ((coolant !== null && typeof coolant !== "undefined" && coolant >= 90) || (oil !== null && typeof oil !== "undefined" && oil <= 30)) {
    return "amber";
  }
  return "emerald";
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sem leitura";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function formatFuel(value?: number | null) {
  if (value === null || typeof value === "undefined") return "Sem leitura";
  return `${value.toFixed(0)}%`;
}

function formatBattery(value?: number | null) {
  if (value === null || typeof value === "undefined") return "Sem leitura";
  return `${value.toFixed(1)} V`;
}

function formatThermal(coolant?: number | null, oil?: number | null) {
  const temp = coolant === null || typeof coolant === "undefined" ? "--" : `${coolant.toFixed(0)} C`;
  const pressure = oil === null || typeof oil === "undefined" ? "--" : `${oil.toFixed(0)}`;
  return `${temp} / ${pressure}`;
}

function gridLabel(gridOnline?: boolean | null) {
  if (gridOnline === false) return "Offline";
  if (gridOnline === true) return "Online";
  return "Sem leitura";
}

function formatSite(site?: MonitoringGenerator["currentSite"] | null) {
  if (!site?.name) return "Sem site vinculado";
  const location = [site.city, site.state].filter(Boolean).join(" / ");
  return location ? `${site.name} • ${location}` : site.name;
}
