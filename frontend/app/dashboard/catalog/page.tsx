"use client";

import { SelectField } from "@/app/dashboard/components/SelectField";

import { PageHeader } from "../components/DashboardPageKit";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { getAccessFromToken } from "@/lib/access";
import QuickRecordEditor from "../components/QuickRecordEditor";
import ListPagination from "../components/ListPagination";
import { usePagedList } from "../components/usePagedList";
import { ListSortHeader } from "../components/ListSortHeader";

type CatalogItem = {
  catalogGroup?: "internal" | "technicalTools" | "generatorParts" | "services";
  id: string;
  sku?: string | null;
  legacyCode?: string | null;
  legacySequence?: string | null;
  radarCode?: string | null;
  manufacturerPartNumber?: string | null;
  identifiers?: Array<{ code: string }>;
  name: string;
  description?: string | null;
  commercialDescription?: string | null;
  type: "PART" | "SERVICE";
  itemClassification?: string | null;
  acquisitionOrigin?: string | null;
  category?: string | null;
  unit?: string | null;
  basePrice: number;
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
  const [hydrated, setHydrated] = useState(false);
  const [canCreateItem, setCanCreateItem] = useState(false);
  const [canUpdateItem, setCanUpdateItem] = useState(false);
  const [canViewSuppliers, setCanViewSuppliers] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [activeGroup, setActiveGroup] = useState<CatalogGroupKey>("all");

  useEffect(() => {
    const access = getAccessFromToken();
    setCanCreateItem(access.catalog.create);
    setCanUpdateItem(access.catalog.update);
    setCanViewSuppliers(access.purchaseOrders.view);
    setHydrated(true);
  }, []);

  const { items: filteredItems, total, loading, error, refresh: refreshItems, paginationProps, sort, direction, onSort, hasLoaded } = usePagedList<CatalogItem>({
    endpoint: "/catalogs/page", filters: { group: activeGroup }, search,
  });
  const [summary, setSummary] = useState<CatalogSummary | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [summaryRevision, setSummaryRevision] = useState(0);
  const metrics = summary ?? EMPTY_CATALOG_SUMMARY;
  function loadItems() {
    refreshItems();
    setSummaryRevision((current) => current + 1);
  }
  useEffect(() => {
    if (!hasLoaded) return;
    const controller = new AbortController();
    setSummaryError("");
    async function loadSummary() {
      try {
        const response = await apiFetch("/catalogs/list-summary", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(await readApiErrorMessage(response, "Não foi possível atualizar os indicadores."));
        const next = await response.json() as CatalogSummary;
        if (!controller.signal.aborted) setSummary(next);
      } catch (error) {
        if (!controller.signal.aborted) setSummaryError(error instanceof Error ? error.message : "Não foi possível atualizar os indicadores.");
      }
    }
    void loadSummary();
    return () => controller.abort();
  }, [hasLoaded, summaryRevision]);

  const activeFilterCount = [
    Boolean(search.trim()),
    activeGroup !== "all",
  ].filter(Boolean).length;

  return (
    <div className="dashboard-page space-y-5">
      <PageHeader
        eyebrow="Suprimentos"
        title="Catálogo de peças e serviços"
        description="Consulte itens, preços, estoque e dados para propostas e atendimentos."
        actions={<>
<div className="flex flex-wrap items-center gap-2">
          {hydrated && canViewSuppliers && (
            <Link
              href="/dashboard/suppliers"
              className="ml-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 font-semibold text-zinc-700 transition-colors hover:bg-zinc-100"
            >
              Fornecedores
            </Link>
          )}
          {hydrated && canCreateItem && (
            <Link
              href="/dashboard/catalog/new"
              className="ml-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg font-semibold transition-colors shadow-sm"
            >
              Novo Item
            </Link>
          )}
        </div>
</>}
      />

      {error && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={loadItems}
            className="text-sm font-bold underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      <section className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
        <Metric title="Itens ativos" value={summary ? String(metrics.total) : "—"} />
        <Metric title="Pecas" value={summary ? String(metrics.parts) : "—"} />
        <Metric title="Servicos" value={summary ? String(metrics.services) : "—"} />
        <Metric
          title="Baixo estoque"
          value={summary ? String(metrics.lowStock) : "—"}
          tone={!summary ? "slate" : metrics.lowStock > 0 ? "amber" : "emerald"}
        />
      </section>

      {summaryError ? <p role="status" className="text-sm text-amber-700">
        {summaryError}{" "}
        <button type="button" className="font-semibold underline" onClick={() => setSummaryRevision((current) => current + 1)}>Atualizar indicadores</button>
      </p> : null}
      <section className="mb-4 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <label
            htmlFor="catalog-search"
            className="block flex-1 text-xs font-semibold uppercase tracking-wide text-zinc-500"
          >
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
          id="catalog-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Item, SKU, PN, outros codigos, descricao ou localizacao..."
          className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
        />
        {showFilters ? (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            <SelectFilter
              label="Grupo"
              value={activeGroup}
              onChange={(value) => setActiveGroup(value as CatalogGroupKey)}
              options={buildCatalogGroups(metrics.groups).map((group) => ({
                value: group.key,
                label: summary ? `${group.label} (${group.count})` : group.label,
              }))}
            />
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-zinc-500">
            {total} resultado(s)
            {activeFilterCount
              ? ` | ${activeFilterCount} filtro(s) ativo(s)`
              : ""}
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
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela de registros. Role horizontalmente para ver todas as colunas.">
          <table data-pagination-skip="true" data-sort-skip="true" aria-busy={loading} className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 text-zinc-500 text-sm border-b border-zinc-200">
                <ListSortHeader column="name" sort={sort} direction={direction} onSort={onSort}>Item</ListSortHeader>
                <ListSortHeader column="description" sort={sort} direction={direction} onSort={onSort}>Descricao</ListSortHeader>
                <ListSortHeader column="sku" sort={sort} direction={direction} onSort={onSort}>SKU / PN</ListSortHeader>
                <ListSortHeader column="type" sort={sort} direction={direction} onSort={onSort}>Tipo</ListSortHeader>
                <ListSortHeader column="stock" sort={sort} direction={direction} onSort={onSort}>Saldo</ListSortHeader>
                <ListSortHeader column="price" sort={sort} direction={direction} onSort={onSort}>Venda sugerida</ListSortHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {!loading &&
                filteredItems.map((item) => {
                  const availableQty =
                    item.operationalSummary?.availableQty ??
                    Number(item.stockCurrent || 0);
                  const low = item.operationalSummary?.isLowStock === true;
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-zinc-50 transition-colors"
                    >
                      <td className="p-4 font-bold text-zinc-800">
                        <button
                          type="button"
                          onClick={() => setSelectedItemId(item.id)}
                          className="dashboard-record-link text-left"
                          title={item.type === "SERVICE" ? "Abrir resumo do serviço" : "Abrir resumo da peça"}
                        >
                          {item.name}
                        </button>
                      </td>
                      <td className="p-4 text-zinc-600 text-sm max-w-md truncate">
                        {item.description ||
                          item.commercialDescription ||
                          "Sem descricao"}
                      </td>
                      <td className="p-4 text-sm text-zinc-600">
                        <p className="tabular-nums font-semibold text-zinc-800">
                          SKU: {item.sku || "-"}
                        </p>
                        <p className="mt-1 tabular-nums text-xs text-zinc-600">
                          PN: {item.manufacturerPartNumber || "-"}
                        </p>
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-3 py-1 text-xs rounded-full font-semibold ${
                            item.type === "SERVICE"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {item.type === "SERVICE" ? "SERVICO" : "PECA"}
                        </span>
                        <p className="mt-2 text-xs font-semibold text-zinc-500">
                          {catalogGroupLabel(classifyCatalogItem(item))}
                        </p>
                      </td>
                      <td
                        className={`p-4 text-sm font-semibold ${low ? "text-red-600" : "text-zinc-800"}`}
                      >
                        {availableQty}
                        <p className="text-xs font-normal text-zinc-500">
                          Min/Max {item.stockMin ?? 0}/{item.stockMax ?? 0}
                        </p>
                      </td>
                      <td className="p-4 text-zinc-800 font-medium">
                        R$ {Number(item.basePrice).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}

              {loading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-500">
                    Carregando catalogo...
                  </td>
                </tr>
              )}

              {!loading && filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-500">
                    Nenhum item encontrado para o filtro atual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ListPagination {...paginationProps} />
      {selectedItemId ? (
        <QuickRecordEditor kind="catalog" id={selectedItemId} canEdit={canUpdateItem} onClose={() => setSelectedItemId(null)} onSaved={loadItems} />
      ) : null}
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
      <p className="text-xs font-bold uppercase tracking-wide opacity-70">
        {title}
      </p>
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
      <SelectField
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-sm font-medium normal-case text-zinc-700"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
    </label>
  );
}


type CatalogSummary = { total: number; parts: number; services: number; lowStock: number; groups: Record<CatalogGroupKey, number> };
const EMPTY_CATALOG_SUMMARY: CatalogSummary = { total: 0, parts: 0, services: 0, lowStock: 0, groups: { all: 0, internal: 0, technicalTools: 0, generatorParts: 0, services: 0, lowStock: 0 } };
function buildCatalogGroups(groups: Record<CatalogGroupKey, number>) {
  return ([
    ["all", "Todos"], ["internal", "Uso interno"], ["technicalTools", "Ferramentas tecnicas"],
    ["generatorParts", "Pecas de geradores"], ["services", "Servicos"], ["lowStock", "Baixo estoque"],
  ] as const).map(([key, label]) => ({ key, label, count: groups[key] }));
}
function classifyCatalogItem(item: CatalogItem) {
  return item.catalogGroup ?? (item.type === "SERVICE" ? "services" : "generatorParts");
}
function catalogGroupLabel(group: Exclude<CatalogGroupKey, "all" | "lowStock">) {
  return { internal: "Uso interno", technicalTools: "Ferramenta tecnica", generatorParts: "Peca de gerador", services: "Servico" }[group];
}
