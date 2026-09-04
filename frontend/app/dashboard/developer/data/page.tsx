"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { STUDIO_RESOURCES } from "./resources";

type ResourceCount = Record<string, number>;

const categoryOrder = ["Comercial", "Operacao", "Ativos", "Suprimentos", "Financeiro", "RH"];

export default function StudioDataPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [counts, setCounts] = useState<ResourceCount>({});

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/dashboard");
  }

  useEffect(() => {
    let cancelled = false;

    async function loadCounts() {
      const entries = await Promise.allSettled(
        STUDIO_RESOURCES.map(async (resource) => {
          const response = await apiFetch(resource.endpoint, { cache: "no-store" });
          if (!response.ok) return [resource.key, 0] as const;
          const payload = await response.json();
          return [resource.key, Array.isArray(payload) ? payload.length : 0] as const;
        }),
      );

      if (cancelled) return;
      const next: ResourceCount = {};
      for (const entry of entries) {
        if (entry.status === "fulfilled") {
          next[entry.value[0]] = entry.value[1];
        }
      }
      setCounts(next);
    }

    void loadCounts();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredResources = useMemo(() => {
    const term = query.trim().toLowerCase();
    return STUDIO_RESOURCES.filter((resource) => {
      if (!term) return true;
      return `${resource.pluralLabel} ${resource.category} ${resource.description}`
        .toLowerCase()
        .includes(term);
    });
  }, [query]);

  const groupedResources = categoryOrder
    .map((category) => ({
      category,
      resources: filteredResources.filter((resource) => resource.category === category),
    }))
    .filter((group) => group.resources.length > 0);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_24px_54px_-42px_rgba(15,23,42,0.28)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Manitec Studio
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">
              Dados / Tabelas
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Gerencie registros operacionais sem expor tabelas fisicas do banco. A edicao segue regras do ERP, com recursos de menor risco liberados primeiro.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <Metric label="Recursos" value={String(STUDIO_RESOURCES.length)} />
          <Metric
            label="Editaveis"
            value={String(STUDIO_RESOURCES.filter((resource) => resource.editable).length)}
          />
          <Metric
            label="Protegidos"
            value={String(STUDIO_RESOURCES.filter((resource) => !resource.editable).length)}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
          Pesquisar tabela
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Clientes, equipamentos, fornecedores, catalogo..."
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium normal-case text-slate-800 outline-none focus:border-blue-500"
          />
        </label>
      </section>

      {groupedResources.map((group) => (
        <section key={group.category} className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
            {group.category}
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {group.resources.map((resource) => (
              <Link
                key={resource.key}
                href={`/dashboard/developer/data/${resource.key}`}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">
                      {resource.pluralLabel}
                    </h2>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                      {resource.description}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                    {counts[resource.key] ?? "-"}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                  <span>{resource.editable ? "Edicao controlada" : "Somente leitura"}</span>
                  <span>Abrir</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}
