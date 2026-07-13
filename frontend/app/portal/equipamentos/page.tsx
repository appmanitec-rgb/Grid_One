"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  customerPortalGet,
  formatPortalDate,
  PortalEquipment,
  statusLabel,
} from "@/lib/customer-portal";

export default function PortalEquipmentPage() {
  const [items, setItems] = useState<PortalEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const payload = await customerPortalGet<PortalEquipment[]>("/equipment");
        if (!cancelled) setItems(payload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar equipamentos.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-5">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-extrabold text-slate-950">Equipamentos</h1>
        <p className="mt-1 text-sm text-slate-500">Geradores vinculados ao seu cadastro.</p>
      </header>

      {loading ? <State text="Carregando equipamentos..." /> : null}
      {error ? <State text={error} tone="error" /> : null}
      {!loading && !error && !items.length ? <State text="Nenhum equipamento encontrado." /> : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/portal/equipamentos/${item.id}`}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-950">{item.name}</h2>
                <p className="text-sm text-slate-500">
                  {item.brand} {item.serialNumber ? `- ${item.serialNumber}` : ""}
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                {statusLabel(item.operationalStatus)}
              </span>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <Info label="Potência" value={`${item.power} kVA`} />
              <Info label="Modelo" value={item.model?.name || "-"} />
              <Info label="Local" value={item.currentSite?.name || "-"} />
              <Info label="Horímetro" value={item.hourMeter ? `${item.hourMeter} h` : "-"} />
              <Info label="Última OS" value={item.lastOrder ? statusLabel(item.lastOrder.status) : "-"} />
              <Info label="Próxima preventiva" value={formatPortalDate(item.nextPreventive?.scheduledDate)} />
            </dl>
          </Link>
        ))}
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-2">
      <dt className="text-xs font-bold uppercase text-slate-400">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-700">{value}</dd>
    </div>
  );
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
