"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";

export type CatalogSearchItem = {
  id: string;
  name: string;
  sku?: string | null;
  code?: string | null;
  type?: string | null;
  basePrice?: number | null;
};

function itemLabel(item: CatalogSearchItem) {
  const code = item.code || item.sku;
  return `${code ? `${code} - ` : ""}${item.name}`;
}

export function CatalogSearchField({
  value,
  selectedItem,
  onChange,
  placeholder = "Buscar por nome, codigo ou SKU",
  type,
  className = "",
}: {
  value: string;
  selectedItem?: CatalogSearchItem | null;
  onChange: (id: string, item?: CatalogSearchItem) => void;
  placeholder?: string;
  type?: "PART" | "SERVICE";
  className?: string;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<CatalogSearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedItem && selectedItem.id === value) {
      setTerm(itemLabel(selectedItem));
    } else if (!value) {
      setTerm("");
    }
  }, [selectedItem, value]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ take: "20" });
        const normalized = term.trim();
        if (normalized) params.set("q", normalized);
        if (type) params.set("type", type);
        const response = await apiFetch(apiUrl(`/catalogs/lookup?${params.toString()}`), {
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        setResults((await response.json()) as CatalogSearchItem[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, term, type]);

  return (
    <div className={`relative ${className}`}>
      <input
        type="search"
        value={term}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 180)}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
          onChange("");
        }}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
      />
      {open ? (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {loading ? (
            <p className="px-3 py-2 text-sm text-slate-500">Buscando...</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">Nenhum item encontrado.</p>
          ) : (
            results.map((item) => (
              <button
                key={item.id}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setTerm(itemLabel(item));
                  onChange(item.id, item);
                  setOpen(false);
                }}
                className="block w-full rounded-lg px-3 py-2 text-left hover:bg-sky-50"
              >
                <span className="block text-sm font-semibold text-slate-800">{item.name}</span>
                <span className="block text-xs text-slate-500">
                  {[item.code || item.sku, item.type === "SERVICE" ? "Servico" : "Peca"]
                    .filter(Boolean)
                    .join(" | ")}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
