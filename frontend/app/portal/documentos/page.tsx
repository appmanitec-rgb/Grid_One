"use client";

import { useEffect, useState } from "react";
import {
  customerPortalGet,
  formatPortalDate,
  PortalDocument,
  statusLabel,
} from "@/lib/customer-portal";

export default function PortalDocumentsPage() {
  const [items, setItems] = useState<PortalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const payload = await customerPortalGet<PortalDocument[]>("/documents");
        if (!cancelled) setItems(payload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar documentos.");
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
        <h1 className="text-2xl font-extrabold text-slate-950">Documentos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Documentos enviados ou liberados para sua empresa. Downloads amplos dependem de liberacao explicita.
        </p>
      </header>

      {loading ? <State text="Carregando documentos..." /> : null}
      {error ? <State text={error} tone="error" /> : null}
      {!loading && !error && !items.length ? <State text="Nenhum documento liberado ainda." /> : null}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {items.map((item) => (
          <article
            key={item.id}
            className="grid gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0 md:grid-cols-[1fr_auto_auto]"
          >
            <div>
              <h2 className="font-extrabold text-slate-950">
                {item.documentTitle || item.documentCode || item.documentType}
              </h2>
              <p className="text-sm text-slate-500">
                {item.documentType} - {item.channel}
              </p>
            </div>
            <span className="rounded-full bg-slate-50 px-2 py-1 text-xs font-bold text-slate-600">
              {statusLabel(item.status)}
            </span>
            <span className="text-sm font-semibold text-slate-600">{formatPortalDate(item.createdAt)}</span>
          </article>
        ))}
      </section>
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
