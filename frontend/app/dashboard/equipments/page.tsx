"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { getAccessFromToken } from "@/lib/access";

type EquipmentListItem = {
  id: string;
  name: string;
  brand?: string | null;
  serialNumber?: string | null;
  assetTag?: string | null;
  power?: number | null;
  hourMeter?: number | null;
  operationalStatus?: string | null;
  lifecycleStatus?: string | null;
  criticality?: string | null;
  voltage?: string | null;
  currentSite?: { id: string; name?: string | null; code?: string | null } | null;
  model?: { id: string; name?: string | null; brand?: string | null } | null;
  client?: { id: string; companyName?: string | null } | null;
  orders?: Array<{
    id: string;
    title?: string | null;
    status?: string | null;
    openedAt?: string | null;
    finishedAt?: string | null;
    updatedAt?: string | null;
  }>;
  contractSchedules?: Array<{
    id: string;
    scheduledDate?: string | null;
    status?: string | null;
    contract?: { id: string; code?: string | null; status?: string | null } | null;
  }>;
  contractLinks?: Array<{
    id: string;
    contract?: { id: string; code?: string | null; status?: string | null } | null;
  }>;
  serviceTickets?: Array<{
    id: string;
    code?: string | null;
    title?: string | null;
    status?: string | null;
    priority?: string | null;
  }>;
};

const STATUS_STYLES: Record<string, string> = {
  OPERATING: "border-emerald-200 bg-emerald-50 text-emerald-700",
  IN_MAINTENANCE: "border-blue-200 bg-blue-50 text-blue-700",
  STOPPED_BY_FAILURE: "border-rose-200 bg-rose-50 text-rose-700",
  DEACTIVATED: "border-slate-200 bg-slate-50 text-slate-600",
};

const CRITICALITY_STYLES: Record<string, string> = {
  A: "border-rose-200 bg-rose-50 text-rose-700",
  B: "border-amber-200 bg-amber-50 text-amber-700",
  C: "border-slate-200 bg-slate-50 text-slate-600",
};

export default function EquipmentsPage() {
  const [equipments, setEquipments] = useState<EquipmentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [access, setAccess] = useState(() => getAccessFromToken());

  useEffect(() => {
    setAccess(getAccessFromToken());
    void loadEquipments();
  }, []);

  async function loadEquipments() {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/generators", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Nao foi possivel carregar equipamentos."),
        );
      }
      setEquipments((await res.json()) as EquipmentListItem[]);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar equipamentos.",
      );
      setEquipments([]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return equipments;
    return equipments.filter((item) =>
      [
        item.name,
        item.assetTag,
        item.serialNumber,
        item.client?.companyName,
        item.currentSite?.name,
        item.model?.name,
        item.brand,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [equipments, query]);

  const totals = useMemo(
    () => ({
      total: equipments.length,
      critical: equipments.filter((item) => item.criticality === "A").length,
      openTickets: equipments.reduce(
        (sum, item) => sum + (item.serviceTickets?.length || 0),
        0,
      ),
      contracted: equipments.filter((item) => item.contractLinks?.[0]?.contract)
        .length,
    }),
    [equipments],
  );

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Cadastro mestre tecnico
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">
              Equipamentos
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Geradores por cliente, contrato, manutencao, chamados e
              prontuario tecnico.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {access.equipments.manageModels ? (
              <Link href="/dashboard/equipments/models" className={SECONDARY_BUTTON}>
                Modelos
              </Link>
            ) : null}
            {access.equipments.create ? (
              <Link href="/dashboard/equipments/new" className={PRIMARY_BUTTON}>
                Novo equipamento
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Equipamentos" value={String(totals.total)} />
        <Metric label="Criticidade A" value={String(totals.critical)} tone="rose" />
        <Metric label="Com contrato" value={String(totals.contracted)} tone="blue" />
        <Metric label="Chamados abertos" value={String(totals.openTickets)} tone="amber" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome, tag, serie, cliente, local ou modelo"
            className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 md:max-w-xl"
          />
          <button
            type="button"
            onClick={() => void loadEquipments()}
            className={SECONDARY_BUTTON}
          >
            Atualizar
          </button>
        </div>
      </section>

      {loading ? <State text="Carregando equipamentos..." /> : null}
      {error ? <State text={error} tone="error" /> : null}
      {!loading && !error && filtered.length === 0 ? (
        <State text="Nenhum equipamento encontrado para os filtros atuais." />
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        {filtered.map((item) => {
          const lastOrder = item.orders?.[0];
          const nextPreventive = item.contractSchedules?.[0];
          const contract = item.contractLinks?.[0]?.contract;
          const openTickets = item.serviceTickets?.length || 0;

          return (
            <article
              key={item.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="break-words text-xl font-bold text-slate-950">
                      {item.name}
                    </h2>
                    <Badge className={CRITICALITY_STYLES[item.criticality || ""]}>
                      Criticidade {item.criticality || "-"}
                    </Badge>
                    <Badge className={STATUS_STYLES[item.operationalStatus || ""]}>
                      {statusLabel(item.operationalStatus)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.assetTag || "Sem tag"} | Serie{" "}
                    {item.serialNumber || "nao informada"}
                  </p>
                </div>

                <Link
                  href={`/dashboard/equipments/${item.id}`}
                  className={PRIMARY_BUTTON}
                >
                  Abrir ficha
                </Link>
              </div>

              <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Info label="Cliente" value={item.client?.companyName || "-"} />
                <Info label="Local" value={item.currentSite?.name || "-"} />
                <Info
                  label="Modelo"
                  value={item.model?.name || item.brand || "-"}
                />
                <Info label="Potencia" value={item.power ? `${item.power} kVA` : "-"} />
                <Info
                  label="Horimetro"
                  value={item.hourMeter != null ? `${item.hourMeter} h` : "-"}
                />
                <Info label="Tensao" value={item.voltage || "-"} />
              </dl>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <TimelineItem
                  label="Ultima OS"
                  value={lastOrder?.title || "-"}
                  helper={
                    lastOrder
                      ? `${statusLabel(lastOrder.status)} | ${formatDate(
                          lastOrder.finishedAt || lastOrder.updatedAt,
                        )}`
                      : "Sem OS recente"
                  }
                  href={lastOrder?.id ? `/dashboard/orders/${lastOrder.id}` : undefined}
                />
                <TimelineItem
                  label="Proxima preventiva"
                  value={formatDate(nextPreventive?.scheduledDate)}
                  helper={
                    nextPreventive?.contract?.code
                      ? `Contrato ${nextPreventive.contract.code}`
                      : "Sem agenda preventiva"
                  }
                  href={
                    nextPreventive?.contract?.id
                      ? `/dashboard/contracts/${nextPreventive.contract.id}`
                      : undefined
                  }
                />
                <TimelineItem
                  label="Contrato"
                  value={contract?.code || "-"}
                  helper={contract ? statusLabel(contract.status) : "Nao vinculado"}
                  href={contract?.id ? `/dashboard/contracts/${contract.id}` : undefined}
                />
                <TimelineItem
                  label="Chamados"
                  value={openTickets ? `${openTickets} aberto(s)` : "Sem chamados"}
                  helper={item.serviceTickets?.[0]?.title || "Nenhuma pendencia aberta"}
                  href={
                    item.serviceTickets?.[0]?.id
                      ? `/dashboard/atendimento/${item.serviceTickets[0].id}`
                      : undefined
                  }
                />
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

const PRIMARY_BUTTON =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800";
const SECONDARY_BUTTON =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50";

function Metric({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "rose" | "blue" | "amber";
}) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-950",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  };
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone]}`}>
      <p className="text-xs font-bold uppercase tracking-[0.16em] opacity-70">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <dt className="text-[11px] font-bold uppercase text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-slate-800">
        {value}
      </dd>
    </div>
  );
}

function TimelineItem({
  label,
  value,
  helper,
  href,
}: {
  label: string;
  value: string;
  helper: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 transition hover:border-sky-200 hover:bg-sky-50">
      <p className="text-[11px] font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-slate-900">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{helper}</p>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function Badge({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
        className || "border-slate-200 bg-slate-50 text-slate-600"
      }`}
    >
      {children}
    </span>
  );
}

function State({ text, tone }: { text: string; tone?: "error" }) {
  return (
    <div
      className={`rounded-2xl border p-4 text-sm font-semibold ${
        tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      {text}
    </div>
  );
}

function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    OPERATING: "Operando",
    STOPPED_BY_FAILURE: "Parado por falha",
    IN_MAINTENANCE: "Em manutencao",
    DEACTIVATED: "Desativado",
    AVAILABLE: "Disponivel",
    LEASED: "Locado",
    SCRAP: "Sucata",
    OPEN: "Aberta",
    TRIAGE: "Triagem",
    WAITING_CUSTOMER: "Aguardando cliente",
    WAITING_INTERNAL: "Aguardando interno",
    SCHEDULED: "Agendado",
    IN_PROGRESS: "Em andamento",
    CONVERTING_TO_ORDER: "Convertendo para OS",
    CONVERTED_TO_ORDER: "Convertido para OS",
    RESOLVED: "Resolvido",
    CLOSED: "Fechado",
    CANCELED: "Cancelado",
    COMPLETED: "Concluida",
    PREVENTIVE: "Preventiva",
    CORRECTIVE: "Corretiva",
  };
  return status ? labels[status] || status.replace(/_/g, " ") : "-";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR").format(parsed);
}
