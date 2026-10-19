"use client";

import { SelectField } from "@/app/dashboard/components/SelectField";
import { PageHeader } from "../components/DashboardPageKit";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAccessFromToken } from "@/lib/access";
import QuickRecordEditor from "../components/QuickRecordEditor";
import ListPagination from "../components/ListPagination";
import { usePagedList } from "../components/usePagedList";
import { ListSortHeader } from "../components/ListSortHeader";

type ClientListItem = {
  id: string;
  code: string;
  companyName: string;
  tradeName?: string | null;
  cnpj?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  preferences?: string | null;
  clientType?: "CONTRACT" | "NO_CONTRACT" | null;
  isProvisional?: boolean | null;
  isDelinquent?: boolean | null;
  proposalCreationBlocked?: boolean | null;
  proposalBlockReason?: string | null;
  withholdsInss?: boolean | null;
  withholdsIss?: boolean | null;
  contacts?: Array<{
    name?: string | null;
    role?: string | null;
    phone?: string | null;
    mobile?: string | null;
    email?: string | null;
  }>;
  addresses?: Array<{
    street?: string | null;
    number?: string | null;
    complement?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
  }>;
};

type FilterOption = "ALL" | "YES" | "NO";
type ContractFilter = "ALL" | "CONTRACT" | "NO_CONTRACT";

export default function ClientsPage() {
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [canEditClients, setCanEditClients] = useState(false);
  const [inssFilter, setInssFilter] = useState<FilterOption>("ALL");
  const [retentionFilter, setRetentionFilter] = useState<FilterOption>("ALL");
  const [delinquentFilter, setDelinquentFilter] = useState<FilterOption>("ALL");
  const [proposalBlockFilter, setProposalBlockFilter] =
    useState<FilterOption>("ALL");
  const [contractFilter, setContractFilter] = useState<ContractFilter>("ALL");

  useEffect(() => {
    setCanEditClients(getAccessFromToken().clients.update);
  }, []);

  const { items: filteredClients, total, loading, error, refresh: loadClients, paginationProps, sort, direction, onSort } = usePagedList<ClientListItem>({
    endpoint: "/clients/page", search: query,
    filters: { inss: inssFilter, iss: retentionFilter, delinquent: delinquentFilter, blocked: proposalBlockFilter, contract: contractFilter },
  });

  return (
    <div className="dashboard-page space-y-5">
      <PageHeader
        eyebrow="Comercial"
        title="Carteira de Clientes"
        description="Gerencie empresas, contatos e equipamentos associados."
        actions={<>
<div className="flex items-center gap-2">
          <Link
            href="/dashboard/clients/new"
            className="ml-2 flex items-center rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white shadow-sm transition-colors hover:bg-blue-500"
          >
            <span className="mr-2">+</span> Novo Cliente
          </Link>
        </div>
</>}
      />

      {error ? (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadClients()}
            className="text-sm font-bold underline"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <label
            htmlFor="client-search"
            className="block flex-1 text-xs font-semibold uppercase tracking-wide text-zinc-500"
          >
            Buscar cliente
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
          id="client-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="CNPJ, nome, razao social, endereco, contato, e-mail, telefone..."
          className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
        />
        {showFilters ? (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-5">
            <SelectFilter
              label="Retem INSS"
              value={inssFilter}
              onChange={(value) => setInssFilter(value as FilterOption)}
              options={[
                { value: "ALL", label: "Todos" },
                { value: "YES", label: "Sim" },
                { value: "NO", label: "Nao" },
              ]}
            />
            <SelectFilter
              label="Retem ISS"
              value={retentionFilter}
              onChange={(value) => setRetentionFilter(value as FilterOption)}
              options={[
                { value: "ALL", label: "Todos" },
                { value: "YES", label: "Sim" },
                { value: "NO", label: "Nao" },
              ]}
            />
            <SelectFilter
              label="Inadimplente"
              value={delinquentFilter}
              onChange={(value) => setDelinquentFilter(value as FilterOption)}
              options={[
                { value: "ALL", label: "Todos" },
                { value: "YES", label: "Sim" },
                { value: "NO", label: "Nao" },
              ]}
            />
            <SelectFilter
              label="Tipo de Cliente"
              value={contractFilter}
              onChange={(value) => setContractFilter(value as ContractFilter)}
              options={[
                { value: "ALL", label: "Todos" },
                { value: "CONTRACT", label: "Com contrato" },
                { value: "NO_CONTRACT", label: "Sem contrato" },
              ]}
            />
            <SelectFilter
              label="Bloqueio de propostas"
              value={proposalBlockFilter}
              onChange={(value) =>
                setProposalBlockFilter(value as FilterOption)
              }
              options={[
                { value: "ALL", label: "Todos" },
                { value: "YES", label: "Bloqueados" },
                { value: "NO", label: "Liberados" },
              ]}
            />
          </div>
        ) : null}
        <p className="mt-2 text-xs text-zinc-500">
          {total} resultado(s)
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela de registros. Role horizontalmente para ver todas as colunas.">
          <table data-pagination-skip="true" data-sort-skip="true" aria-busy={loading} className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
                <ListSortHeader column="code" sort={sort} direction={direction} onSort={onSort}>Codigo</ListSortHeader>
                <ListSortHeader column="name" sort={sort} direction={direction} onSort={onSort}>Empresa / Nome</ListSortHeader>
                <ListSortHeader column="document" sort={sort} direction={direction} onSort={onSort}>CNPJ/CPF</ListSortHeader>
                <ListSortHeader column="contact" sort={sort} direction={direction} onSort={onSort}>Contatos</ListSortHeader>
                <ListSortHeader column="address" sort={sort} direction={direction} onSort={onSort}>Endereco</ListSortHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {!loading &&
                filteredClients.map((client) => (
                  <tr
                    key={client.id}
                    className="transition-colors hover:bg-zinc-50"
                  >
                    <td className="p-4 tabular-nums text-sm font-bold text-zinc-700">
                      {client.code}
                    </td>
                    <td className="p-4">
                      <button type="button" onClick={() => setSelectedClientId(client.id)} className="dashboard-record-link text-left font-bold" title="Abrir resumo do cliente">
                        {client.companyName}
                      </button>
                      <p className="text-xs text-zinc-500">
                        {client.tradeName || "---"}
                      </p>
                      {client.proposalCreationBlocked ? (
                        <span
                          className="mt-2 inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700"
                          title={
                            client.proposalBlockReason || "Propostas bloqueadas"
                          }
                        >
                          Propostas bloqueadas
                        </span>
                      ) : null}
                      {client.isProvisional ? (
                        <span className="mt-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                          Vinculo de maquina pendente
                        </span>
                      ) : null}
                    </td>
                    <td className="p-4 font-medium text-zinc-600">
                      {client.cnpj || "Nao informado"}
                    </td>
                    <td className="p-4 text-sm text-zinc-600">
                      <p>{client.email || "Sem e-mail"}</p>
                      <p>{client.phone || "Sem telefone"}</p>
                    </td>
                    <td className="max-w-xs truncate p-4 text-sm text-zinc-600">
                      {client.address
                        ? `${client.address} - ${client.city || ""}/${client.state || ""}`
                        : `${client.city || ""}/${client.state || ""}`}
                    </td>
                  </tr>
                ))}
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-zinc-500">
                    Carregando clientes...
                  </td>
                </tr>
              ) : null}
              {!loading && filteredClients.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-zinc-500">
                    Nenhum cliente registrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ListPagination {...paginationProps} />
      {selectedClientId ? (
        <QuickRecordEditor kind="client" id={selectedClientId} canEdit={canEditClients} onClose={() => setSelectedClientId(null)} onSaved={loadClients} />
      ) : null}
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
