"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";

type ClientListItem = {
  id: string;
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
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [inssFilter, setInssFilter] = useState<FilterOption>("ALL");
  const [retentionFilter, setRetentionFilter] = useState<FilterOption>("ALL");
  const [delinquentFilter, setDelinquentFilter] = useState<FilterOption>("ALL");
  const [proposalBlockFilter, setProposalBlockFilter] =
    useState<FilterOption>("ALL");
  const [contractFilter, setContractFilter] = useState<ContractFilter>("ALL");

  useEffect(() => {
    void loadClients();
  }, []);

  async function loadClients() {
    try {
      const res = await apiFetch(apiUrl("/clients"), { cache: "no-store" });
      if (!res.ok) return;
      setClients((await res.json()) as ClientListItem[]);
    } catch {
      setClients([]);
    }
  }

  const filteredClients = useMemo(() => {
    const term = query.trim().toLowerCase();
    return clients.filter((client) => {
      const matchesInss =
        inssFilter === "ALL" ||
        (inssFilter === "YES" ? Boolean(client.withholdsInss) : !client.withholdsInss);
      const matchesRetention =
        retentionFilter === "ALL" ||
        (retentionFilter === "YES" ? Boolean(client.withholdsIss) : !client.withholdsIss);
      const matchesDelinquent =
        delinquentFilter === "ALL" ||
        (delinquentFilter === "YES"
          ? Boolean(client.isDelinquent)
          : !client.isDelinquent);
      const matchesContract =
        contractFilter === "ALL" || client.clientType === contractFilter;
      const matchesProposalBlock =
        proposalBlockFilter === "ALL" ||
        (proposalBlockFilter === "YES"
          ? Boolean(client.proposalCreationBlocked)
          : !client.proposalCreationBlocked);

      if (
        !matchesInss ||
        !matchesRetention ||
        !matchesDelinquent ||
        !matchesContract ||
        !matchesProposalBlock
      ) {
        return false;
      }
      if (!term) return true;

      const topLevel = [
        client.companyName,
        client.tradeName,
        client.cnpj,
        client.email,
        client.phone,
        client.address,
        client.city,
        client.state,
        client.preferences,
      ];

      const contactFields =
        client.contacts?.flatMap((contact) => [
          contact.name,
          contact.role,
          contact.phone,
          contact.mobile,
          contact.email,
        ]) ?? [];

      const addressFields =
        client.addresses?.flatMap((address) => [
          address.street,
          address.number,
          address.complement,
          address.district,
          address.city,
          address.state,
          address.zipCode,
        ]) ?? [];

      return [...topLevel, ...contactFields, ...addressFields].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(term),
      );
    });
  }, [
    clients,
    query,
    inssFilter,
    retentionFilter,
    delinquentFilter,
    contractFilter,
    proposalBlockFilter,
  ]);

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-zinc-800">Carteira de Clientes</h1>
          <p className="mt-1 text-zinc-500">Faca a gestao das empresas, contatos e equipamentos associados.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/clients/new" className="ml-2 flex items-center rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white shadow-sm transition-colors hover:bg-blue-500">
            <span className="mr-2">+</span> Novo Cliente
          </Link>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <label className="block flex-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
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
              onChange={(value) => setProposalBlockFilter(value as FilterOption)}
              options={[
                { value: "ALL", label: "Todos" },
                { value: "YES", label: "Bloqueados" },
                { value: "NO", label: "Liberados" },
              ]}
            />
          </div>
        ) : null}
        <p className="mt-2 text-xs text-zinc-500">
          {filteredClients.length} resultado(s)
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
                <th className="p-4 font-medium">Empresa / Nome</th>
                <th className="p-4 font-medium">CNPJ/CPF</th>
                <th className="p-4 font-medium">Contatos</th>
                <th className="p-4 font-medium">Endereco</th>
                <th className="p-4 text-right font-medium">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {filteredClients.map((client) => (
                <tr key={client.id} className="transition-colors hover:bg-zinc-50">
                  <td className="p-4">
                    <p className="font-bold text-zinc-800">{client.companyName}</p>
                    <p className="text-xs text-zinc-500">{client.tradeName || "---"}</p>
                    {client.proposalCreationBlocked ? (
                      <span
                        className="mt-2 inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700"
                        title={client.proposalBlockReason || "Propostas bloqueadas"}
                      >
                        Propostas bloqueadas
                      </span>
                    ) : null}
                  </td>
                  <td className="p-4 font-medium text-zinc-600">{client.cnpj || "Nao informado"}</td>
                  <td className="p-4 text-sm text-zinc-600">
                    <p>{client.email || "Sem e-mail"}</p>
                    <p>{client.phone || "Sem telefone"}</p>
                  </td>
                  <td className="max-w-xs truncate p-4 text-sm text-zinc-600">
                    {client.address ? `${client.address} - ${client.city || ""}/${client.state || ""}` : `${client.city || ""}/${client.state || ""}`}
                  </td>
                  <td className="p-4 text-right">
                    <Link href={`/dashboard/clients/${client.id}`} className="text-sm font-semibold text-zinc-600 hover:text-blue-700 hover:underline">
                      Ver detalhes
                    </Link>
                  </td>
                </tr>
              ))}
              {filteredClients.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-zinc-500">Nenhum cliente registrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
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
