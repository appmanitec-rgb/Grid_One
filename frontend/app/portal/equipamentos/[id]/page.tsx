"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  customerPortalGet,
  formatPortalDate,
  PortalEquipment,
  statusLabel,
} from "@/lib/customer-portal";

export default function PortalEquipmentDetailPage() {
  const params = useParams<{ id: string }>();
  const [equipment, setEquipment] = useState<PortalEquipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const payload = await customerPortalGet<PortalEquipment>(`/equipment/${params.id}`);
        if (!cancelled) setEquipment(payload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar equipamento.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (params.id) void load();

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (loading) return <State text="Carregando equipamento..." />;
  if (error) return <State text={error} tone="error" />;
  if (!equipment) return <State text="Equipamento não encontrado." />;

  return (
    <div className="space-y-5">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <Link href="/portal/equipamentos" className="text-sm font-bold text-blue-700 hover:text-blue-900">
          Voltar para equipamentos
        </Link>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-950">{equipment.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {equipment.brand} {equipment.serialNumber ? `- Série ${equipment.serialNumber}` : ""}
            </p>
          </div>
          <span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">
            {statusLabel(equipment.operationalStatus)}
          </span>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Info label="Potência" value={`${equipment.power} kVA`} />
        <Info label="Modelo" value={equipment.model?.name || "-"} />
        <Info label="Local" value={equipment.currentSite?.name || "-"} />
        <Info label="Criticidade" value={equipment.criticality || "-"} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Histórico de OS">
          {equipment.orders?.length ? (
            equipment.orders.map((order) => (
              <div key={order.id} className="rounded-md border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900">{order.title}</p>
                    <p className="text-sm text-slate-500">
                      {formatPortalDate(order.openedAt)} - {statusLabel(order.status)}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-600">
                    {statusLabel(order.type)}
                  </span>
                </div>
                {order.customerReport ? (
                  <p className="mt-3 rounded-md bg-white p-3 text-sm text-slate-600">{order.customerReport}</p>
                ) : null}
              </div>
            ))
          ) : (
            <Empty text="Nenhuma OS registrada para este equipamento." />
          )}
        </Panel>

        <Panel title="Preventivas programadas">
          {equipment.contractSchedules?.length ? (
            equipment.contractSchedules.map((schedule) => (
              <div key={schedule.id} className="rounded-md border border-slate-100 bg-slate-50 p-3">
                <p className="font-bold text-slate-900">{formatPortalDate(schedule.scheduledDate)}</p>
                <p className="text-sm text-slate-500">
                  {schedule.contract?.code || "Contrato"} - {statusLabel(schedule.status)}
                </p>
              </div>
            ))
          ) : (
            <Empty text="Nenhuma preventiva futura encontrada." />
          )}
        </Panel>
      </section>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-extrabold text-slate-950">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <dt className="text-xs font-bold uppercase text-slate-400">{label}</dt>
      <dd className="mt-2 font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-md bg-slate-50 p-3 text-sm font-medium text-slate-500">{text}</p>;
}

function State({ text, tone }: { text: string; tone?: "error" }) {
  return (
    <div
      className={`rounded-lg border p-4 text-sm font-semibold ${
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      {text}
    </div>
  );
}
