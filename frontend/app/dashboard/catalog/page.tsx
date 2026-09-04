"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getAccessFromToken } from "@/lib/access";
import { apiFetch, readApiErrorMessage } from "@/lib/api";

type CatalogItem = {
  id: string;
  sku?: string | null;
  name: string;
  description?: string | null;
  commercialDescription?: string | null;
  type: "PART" | "SERVICE";
  category?: string | null;
  unit?: string | null;
  basePrice: number;
  costPrice?: number | null;
  averageCost?: number | null;
  taxPercentage?: number | null;
  profitMargin?: number | null;
  stockCurrent?: number | null;
  stockMin?: number | null;
  stockMax?: number | null;
  storageLocation?: string | null;
  operationalSummary?: {
    availableQty: number;
    reservedQty: number;
    isLowStock: boolean;
  };
};

type CatalogGroupKey =
  | "all"
  | "internal"
  | "technicalTools"
  | "generatorParts"
  | "services"
  | "lowStock";

export default function CatalogPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [canViewCosts, setCanViewCosts] = useState(false);
  const [canManageItems, setCanManageItems] = useState(false);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [activeGroup, setActiveGroup] = useState<CatalogGroupKey>("all");

  useEffect(() => {
    const access = getAccessFromToken();
    setCanViewCosts(access.catalog.viewCosts);
    setCanManageItems(access.catalog.manageItems);
    setHydrated(true);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch("/catalogs");
        if (!res.ok) {
          throw new Error(await readApiErrorMessage(res, "Falha ao carregar catalogo."));
        }
        setItems(await res.json());
      } catch (loadError: unknown) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Erro ao carregar catalogo.",
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (!matchesCatalogGroup(item, activeGroup)) return false;
      if (!q) return true;
      return `${item.name} ${item.sku || ""} ${item.category || ""} ${item.storageLocation || ""} ${item.description || ""} ${item.commercialDescription || ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [activeGroup, items, search]);

  const metrics = useMemo(() => {
    const parts = items.filter((item) => item.type === "PART").length;
    const services = items.filter((item) => item.type === "SERVICE").length;
    const lowStock = items.filter((item) => item.operationalSummary?.isLowStock).length;
    return { total: items.length, parts, services, lowStock };
  }, [items]);
  const activeFilterCount = [
    Boolean(search.trim()),
    activeGroup !== "all",
  ].filter(Boolean).length;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-zinc-800">Catalogo de Pecas e Servicos</h1>
          <p className="text-zinc-500 mt-1">Controle de itens e precificacao por perfil de usuario.</p>
        </div>

        <div className="flex items-center gap-2">
          {hydrated && canManageItems && (
            <Link
              href="/dashboard/suppliers"
              className="ml-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 font-semibold text-zinc-700 transition-colors hover:bg-zinc-100"
            >
              Fornecedores
            </Link>
          )}
          {hydrated && canManageItems && (
            <Link
              href="/dashboard/catalog/new"
              className="ml-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg font-semibold transition-colors shadow-sm"
            >
              Novo Item
            </Link>
          )}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>}

      <section className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
        <Metric title="Itens ativos" value={String(metrics.total)} />
        <Metric title="Pecas" value={String(metrics.parts)} />
        <Metric title="Servicos" value={String(metrics.services)} />
        <Metric title="Baixo estoque" value={String(metrics.lowStock)} tone={metrics.lowStock > 0 ? "amber" : "emerald"} />
      </section>

      <section className="mb-4 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <label className="block flex-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Buscar item
          </label>
          <button
            type="button"
            onClick={() => setShowFilters((prev) => !prev)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            {showFilters ? "Fechar filtros" : "Filtros"}
          </button>
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Item, SKU, categoria, descricao ou localizacao..."
          className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
        />
        {showFilters ? (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            <SelectFilter
              label="Grupo"
              value={activeGroup}
              onChange={(value) => setActiveGroup(value as CatalogGroupKey)}
              options={buildCatalogGroups(items).map((group) => ({
                value: group.key,
                label: `${group.label} (${group.count})`,
              }))}
            />
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-zinc-500">
            {filteredItems.length} resultado(s)
            {activeFilterCount ? ` | ${activeFilterCount} filtro(s) ativo(s)` : ""}
          </p>
          {activeFilterCount ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setActiveGroup("all");
              }}
              className="text-xs font-semibold text-zinc-600 hover:text-blue-700 hover:underline"
            >
              Limpar filtros
            </button>
          ) : null}
        </div>
      </section>

      <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 text-zinc-500 text-sm border-b border-zinc-200">
                <th className="p-4 font-medium">Item</th>
                <th className="p-4 font-medium">Descricao</th>
                <th className="p-4 font-medium">SKU / Local</th>
                <th className="p-4 font-medium">Tipo</th>
                <th className="p-4 font-medium">Saldo</th>
                <th className="p-4 font-medium">Preco Final</th>
                {hydrated && canViewCosts && <th className="p-4 font-medium">Custo</th>}
                {hydrated && canViewCosts && <th className="p-4 font-medium">Margem</th>}
                <th className="p-4 font-medium text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {!loading &&
                filteredItems.map((item) => {
                  const availableQty = item.operationalSummary?.availableQty ?? Number(item.stockCurrent || 0);
                  const low = item.operationalSummary?.isLowStock === true;
                  return (
                  <tr key={item.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="p-4 font-bold text-zinc-800">{item.name}</td>
                    <td className="p-4 text-zinc-600 text-sm max-w-md truncate">{item.description || item.commercialDescription || "Sem descricao"}</td>
                    <td className="p-4 text-sm text-zinc-600">
                      <p>{item.sku || "-"}</p>
                      <p className="text-xs text-zinc-500">{item.storageLocation || "Sem localizacao"}</p>
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-3 py-1 text-xs rounded-full font-semibold ${
                          item.type === "SERVICE" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {item.type === "SERVICE" ? "SERVICO" : "PECA"}
                      </span>
                      <p className="mt-2 text-xs font-semibold text-zinc-500">
                        {catalogGroupLabel(classifyCatalogItem(item))}
                      </p>
                    </td>
                    <td className={`p-4 text-sm font-semibold ${low ? "text-red-600" : "text-zinc-800"}`}>
                      {availableQty}
                      <p className="text-xs font-normal text-zinc-500">Min/Max {item.stockMin ?? 0}/{item.stockMax ?? 0}</p>
                    </td>
                    <td className="p-4 text-zinc-800 font-medium">R$ {Number(item.basePrice).toFixed(2)}</td>
                    {hydrated && canViewCosts && <td className="p-4 text-zinc-700">{item.averageCost != null ? `R$ ${Number(item.averageCost).toFixed(2)}` : item.costPrice != null ? `R$ ${Number(item.costPrice).toFixed(2)}` : "-"}</td>}
                    {hydrated && canViewCosts && <td className="p-4 text-zinc-700">{item.profitMargin != null ? `${Number(item.profitMargin).toFixed(2)}%` : "-"}</td>}
                    <td className="p-4 text-right">
                      <Link href={`/dashboard/catalog/${item.id}`} className="text-sm font-semibold text-zinc-600 hover:text-zinc-900 hover:underline">
                        Abrir
                      </Link>
                      {hydrated && canManageItems && (
                        <Link href={`/dashboard/catalog/new?editItemId=${item.id}`} className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 hover:underline ml-4">
                          Editar
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}

              {loading && (
                <tr>
                  <td colSpan={hydrated && canViewCosts ? 9 : 7} className="p-8 text-center text-zinc-500">
                    Carregando catalogo...
                  </td>
                </tr>
              )}

              {!loading && filteredItems.length === 0 && (
                <tr>
                  <td colSpan={hydrated && canViewCosts ? 9 : 7} className="p-8 text-center text-zinc-500">
                    Nenhum item encontrado para o filtro atual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric({
  title,
  value,
  tone = "slate",
}: {
  title: string;
  value: string;
  tone?: "slate" | "amber" | "emerald";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : tone === "emerald"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-zinc-200 bg-white text-zinc-900";
  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-70">{title}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-sm font-medium normal-case text-zinc-700"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function buildCatalogGroups(items: CatalogItem[]) {
  return [
    { key: "all" as const, label: "Todos", count: items.length },
    {
      key: "internal" as const,
      label: "Uso interno",
      count: items.filter((item) => classifyCatalogItem(item) === "internal").length,
    },
    {
      key: "technicalTools" as const,
      label: "Ferramentas tecnicas",
      count: items.filter((item) => classifyCatalogItem(item) === "technicalTools").length,
    },
    {
      key: "generatorParts" as const,
      label: "Pecas de geradores",
      count: items.filter((item) => classifyCatalogItem(item) === "generatorParts").length,
    },
    {
      key: "services" as const,
      label: "Servicos",
      count: items.filter((item) => item.type === "SERVICE").length,
    },
    {
      key: "lowStock" as const,
      label: "Baixo estoque",
      count: items.filter((item) => item.operationalSummary?.isLowStock).length,
    },
  ];
}

function matchesCatalogGroup(item: CatalogItem, group: CatalogGroupKey) {
  if (group === "all") return true;
  if (group === "services") return item.type === "SERVICE";
  if (group === "lowStock") return item.operationalSummary?.isLowStock === true;
  return classifyCatalogItem(item) === group;
}

function classifyCatalogItem(item: CatalogItem): Exclude<CatalogGroupKey, "all" | "lowStock"> {
  if (item.type === "SERVICE") return "services";

  const haystack = [
    item.name,
    item.sku,
    item.category,
    item.description,
    item.commercialDescription,
    item.storageLocation,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (matchesAny(haystack, INTERNAL_USE_TERMS)) return "internal";
  if (matchesAny(haystack, TECHNICAL_TOOL_TERMS)) return "technicalTools";
  return "generatorParts";
}

function catalogGroupLabel(group: Exclude<CatalogGroupKey, "all" | "lowStock">) {
  const labels = {
    internal: "Uso interno",
    technicalTools: "Ferramenta tecnica",
    generatorParts: "Peca de gerador",
    services: "Servico",
  };
  return labels[group];
}

function matchesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

const INTERNAL_USE_TERMS = [
  "uso interno",
  "consumo interno",
  "administrativo",
  "escritorio",
  "papel",
  "a4",
  "folha",
  "fita",
  "pilha",
  "bateria comum",
  "caneta",
  "toner",
  "limpeza",
  "copa",
];

const TECHNICAL_TOOL_TERMS = [
  "ferramenta",
  "alicate",
  "chave",
  "multimetro",
  "torquimetro",
  "furadeira",
  "parafusadeira",
  "maleta",
  "escada",
  "epi",
  "capacete",
  "luva",
  "oculos",
  "protetor",
];
