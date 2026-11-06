"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getAccessFromToken } from "@/lib/access";
import { formatDocument } from "@/lib/formatters";
import { PageHeader } from "../components/DashboardPageKit";
import QuickRecordEditor from "../components/QuickRecordEditor";
import ListPagination from "../components/ListPagination";
import { ListSortHeader } from "../components/ListSortHeader";
import { usePagedList } from "../components/usePagedList";
import { SelectField } from "../components/SelectField";

type Supplier = {
  id: string;
  companyName: string;
  tradeName?: string | null;
  cnpj?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  categories?: string[];
  representedBrands?: string[];
};

export default function SuppliersPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-4">
          Carregando fornecedores…
        </p>
      }
    >
      <SuppliersWorkspace />
    </Suspense>
  );
}

function SuppliersWorkspace() {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [state, setState] = useState(params.get("state") || "");
  const [city, setCity] = useState(params.get("city") || "");
  const [contact, setContact] = useState(params.get("contact") || "ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [access, setAccess] = useState({ create: false, update: false });
  useEffect(() => {
    setAccess(getAccessFromToken().purchaseOrders);
  }, []);
  const {
    items,
    total,
    loading,
    error,
    refresh,
    paginationProps,
    sort,
    direction,
    onSort,
    setOrder,
  } = usePagedList<Supplier>({
    endpoint: "/suppliers/page",
    search: query,
    filters: { state, city, contact },
    initialPage: Math.max(
      1,
      Math.min(1000000, Number(params.get("page")) || 1),
    ),
    initialPageSize: [20, 50, 100].includes(Number(params.get("pageSize")))
      ? Number(params.get("pageSize"))
      : 20,
    initialSort: params.get("sort") || "name",
    initialDirection: params.get("direction") === "desc" ? "desc" : "asc",
  });
  const viewQuery = new URLSearchParams({
    q: query,
    state,
    city,
    contact,
    page: String(paginationProps.page),
    pageSize: String(paginationProps.pageSize),
    sort,
    direction,
  }).toString();
  useEffect(() => {
    window.history.replaceState(
      window.history.state,
      "",
      "/dashboard/suppliers?" + viewQuery,
    );
  }, [viewQuery]);
  function clear() {
    setQuery("");
    setState("");
    setCity("");
    setContact("ALL");
  }
  return (
    <div className="dashboard-page space-y-5">
      <PageHeader
        eyebrow="Suprimentos"
        title="Fornecedores"
        description="Localize parceiros, contatos e condições de compra."
        actions={
          access.create ? (
            <Link
              href="/dashboard/suppliers/new"
              className="app-button app-button-primary"
            >
              Novo fornecedor
            </Link>
          ) : null
        }
      />
      <section
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 space-y-3"
        aria-label="Pesquisa de fornecedores"
      >
        <label className="block text-sm font-medium">
          Buscar fornecedor
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={256}
            placeholder="Nome, CPF/CNPJ, e-mail ou telefone"
            className="app-input mt-1 w-full px-3 py-2"
          />
        </label>
        <details
          open={Boolean(state || city || contact !== "ALL") || undefined}
        >
          <summary className="cursor-pointer text-sm font-medium">
            Filtros de localização e contato
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              UF
              <input
                value={state}
                maxLength={2}
                onChange={(e) => setState(e.target.value.toUpperCase())}
                placeholder="Todas"
                className="app-input mt-1 w-full px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Cidade
              <input
                value={city}
                maxLength={100}
                onChange={(e) => setCity(e.target.value)}
                className="app-input mt-1 w-full px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Contato
              <SelectField
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="app-input mt-1 w-full"
              >
                <option value="ALL">Todos</option>
                <option value="YES">Com contato</option>
                <option value="NO">Sem contato</option>
              </SelectField>
            </label>
          </div>
        </details>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span role="status" className="text-sm text-[var(--text-muted)]">
            {loading
              ? "Buscando fornecedores…"
              : error
                ? "Consulta não concluída"
                : `${total.toLocaleString("pt-BR")} fornecedor(es)`}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm">
              Ordenar por
              <SelectField
                value={sort + ":" + direction}
                onChange={(e) => {
                  const [field, order] = e.target.value.split(":");
                  setOrder(field, order === "desc" ? "desc" : "asc");
                }}
                className="app-input ml-2"
              >
                <option value="name:asc">Nome A–Z</option>
                <option value="name:desc">Nome Z–A</option>
                <option value="city:asc">Cidade</option>
                <option value="city:desc">Cidade Z–A</option>
                <option value="document:asc">Documento</option>
                <option value="document:desc">Documento decrescente</option>
              </SelectField>
            </label>
            <button
              type="button"
              onClick={clear}
              disabled={!query && !state && !city && contact === "ALL"}
              className="app-button app-button-secondary"
            >
              Limpar filtros
            </button>
          </div>
        </div>
      </section>
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 bg-[var(--surface)] p-4"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="app-button app-button-secondary mt-2"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div
          role="region"
          aria-label="Fornecedores encontrados"
          className="overflow-x-auto"
          tabIndex={0}
        >
          <table
            className="dashboard-responsive-table w-full text-left"
            data-pagination-skip="true"
            data-sort-skip="true"
          >
            <thead>
              <tr className="border-b border-[var(--border)] text-sm text-[var(--text-muted)]">
                <ListSortHeader
                  column="name"
                  sort={sort}
                  direction={direction}
                  onSort={onSort}
                >
                  Fornecedor
                </ListSortHeader>
                <ListSortHeader
                  column="document"
                  sort={sort}
                  direction={direction}
                  onSort={onSort}
                >
                  CPF/CNPJ
                </ListSortHeader>
                <th className="p-3 font-medium">Contato</th>
                <ListSortHeader
                  column="city"
                  sort={sort}
                  direction={direction}
                  onSort={onSort}
                >
                  Localização
                </ListSortHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {!loading && !error
                ? items.map((supplier) => (
                    <tr key={supplier.id}>
                      <td className="record-identity">
                        <button
                          type="button"
                          onClick={() => setSelectedId(supplier.id)}
                          className="dashboard-record-link text-left font-semibold"
                        >
                          {supplier.companyName}
                        </button>
                        {supplier.tradeName &&
                        supplier.tradeName !== supplier.companyName ? (
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            {supplier.tradeName}
                          </p>
                        ) : null}
                        <Link
                          href={`/dashboard/suppliers/${supplier.id}?returnTo=${encodeURIComponent("/dashboard/suppliers?" + viewQuery)}`}
                          className="mt-1 block text-xs text-[var(--theme-link)]"
                        >
                          Ver ficha completa
                        </Link>
                      </td>
                      <td
                        data-label="CPF/CNPJ"
                        className="whitespace-nowrap text-sm tabular-nums"
                      >
                        {formatDocument(supplier.cnpj)}
                      </td>
                      <td data-label="Contato" className="text-sm">
                        <p>{supplier.email || "Sem e-mail"}</p>
                        <p>{supplier.phone || "Sem telefone"}</p>
                      </td>
                      <td data-label="Localização" className="text-sm">
                        <p>
                          {supplier.city || "Não informada"}
                          {supplier.state ? `/${supplier.state}` : ""}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {(supplier.categories || []).slice(0, 2).join(", ")}
                        </p>
                      </td>
                    </tr>
                  ))
                : null}
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center" role="status">
                    Carregando fornecedores…
                  </td>
                </tr>
              ) : null}
              {!loading && !error && !items.length ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center">
                    <p>Nenhum fornecedor encontrado com estes filtros.</p>
                    <button
                      type="button"
                      onClick={clear}
                      className="app-button app-button-secondary mt-2"
                    >
                      Limpar busca e filtros
                    </button>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      <ListPagination {...paginationProps} />
      {selectedId ? (
        <QuickRecordEditor
          kind="supplier"
          id={selectedId}
          canEdit={access.update}
          onClose={() => setSelectedId(null)}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}
