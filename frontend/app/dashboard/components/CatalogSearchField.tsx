"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";
import { SearchLookup } from "./SelectField";

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
  placeholder = "Buscar por nome, código ou SKU",
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
  const [term, setTerm] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [results, setResults] = useState<CatalogSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (term === null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ take: "10" });
        if (term.trim()) params.set("q", term.trim());
        if (type) params.set("type", type);
        const response = await apiFetch(
          apiUrl("/catalogs/lookup?" + params.toString()),
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok)
          throw new Error(
            await readApiErrorMessage(
              response,
              "Não foi possível buscar os produtos.",
            ),
          );
        const items = (await response.json()) as CatalogSearchItem[];
        if (!controller.signal.aborted) setResults(items.slice(0, 10));
      } catch (reason) {
        if (!controller.signal.aborted) {
          setResults([]);
          setError(
            reason instanceof Error ? reason.message : "Falha na busca.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [term, type, reload]);

  return (
    <SearchLookup
      value={value}
      options={results.map((item) => ({
        value: item.id,
        label: itemLabel(item),
      }))}
      selected={
        selectedItem?.id === value
          ? { value, label: itemLabel(selectedItem) }
          : undefined
      }
      loading={loading}
      error={error}
      placeholder={placeholder}
      aria-label={placeholder}
      className={className}
      onSearch={(next) => {
        setTerm(next);
        setReload((current) => current + 1);
        setResults([]);
        setLoading(true);
      }}
      onSelect={(id) => {
        const item =
          results.find((candidate) => candidate.id === id) ||
          (selectedItem?.id === id ? selectedItem : undefined);
        onChange(id, item);
      }}
    />
  );
}
