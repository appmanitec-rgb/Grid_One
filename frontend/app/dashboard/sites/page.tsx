"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { matchesSearch } from "@/lib/search";
import { canAccessDashboardPath, getAccessFromToken } from "@/lib/access";
import {
  EmptyState,
  PageHeader,
  StatusBanner,
} from "../components/DashboardPageKit";
import ModalDialog from "../components/ModalDialog";
import ListPagination, {
  useListPagination,
} from "../components/ListPagination";

type ClientAddress = {
  type?: string;
  street?: string;
  number?: string;
  city?: string;
  state?: string;
};
type Client = { id: string; companyName: string; addresses?: ClientAddress[] };
type Generator = {
  id: string;
  installationSite?: string | null;
  client?: { companyName?: string | null } | null;
};
type SiteRow = {
  key: string;
  name: string;
  city: string;
  state: string;
  clients: string[];
  equipmentCount: number;
};
const UNASSIGNED = "Sem local definido";

export default function SitesPage() {
  const [clients, setClients] = useState<Client[]>([]),
    [generators, setGenerators] = useState<Generator[]>([]);
  const [search, setSearch] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<SiteRow | null>(null),
    [clientQuery, setClientQuery] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const responses = await Promise.all([
        apiFetch("/clients", { cache: "no-store", signal }),
        apiFetch("/generators", { cache: "no-store", signal }),
      ]);
      for (const response of responses)
        if (!response.ok)
          throw new Error(
            await readApiErrorMessage(
              response,
              "Não foi possível consultar os locais.",
            ),
          );
      const [nextClients, nextGenerators] = await Promise.all(
        responses.map((response) => response.json()),
      );
      if (!signal?.aborted) {
        setClients(nextClients);
        setGenerators(nextGenerators);
      }
    } catch (reason) {
      if (!signal?.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível consultar os locais.",
        );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const rows = useMemo(() => {
    const map = new Map<string, SiteRow>();
    for (const generator of generators) {
      const key = generator.installationSite?.trim() || UNASSIGNED,
        name = generator.client?.companyName || "Sem cliente";
      if (!map.has(key))
        map.set(key, {
          key,
          name: key,
          city: "-",
          state: "-",
          clients: [],
          equipmentCount: 0,
        });
      const row = map.get(key)!;
      row.equipmentCount += 1;
      if (!row.clients.includes(name)) row.clients.push(name);
    }
    for (const client of clients)
      for (const address of (client.addresses || []).filter(
        (address) => address.type === "INSTALLATION",
      )) {
        const key = `${address.street || "Endereço"}${address.number ? `, ${address.number}` : ""}`;
        if (!map.has(key))
          map.set(key, {
            key,
            name: key,
            city: address.city || "-",
            state: address.state || "-",
            clients: [],
            equipmentCount: 0,
          });
        const row = map.get(key)!;
        if (!row.clients.includes(client.companyName))
          row.clients.push(client.companyName);
      }
    return [...map.values()].sort(
      (a, b) => b.equipmentCount - a.equipmentCount,
    );
  }, [clients, generators]);
  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesSearch(
          [row.name, row.city, row.state, ...row.clients].join(" "),
          search,
        ),
      ),
    [rows, search],
  );
  const { paginatedItems, paginationProps } = useListPagination(
    filtered,
    search,
  );
  const matchingClients = useMemo(
    () =>
      (selected?.clients || []).filter((name) =>
        matchesSearch(name, clientQuery),
      ),
    [selected, clientQuery],
  );
  const clientIds = useMemo(
    () => new Map(clients.map((client) => [client.companyName, client.id])),
    [clients],
  );
  function clientSummary(row: SiteRow) {
    return (
      <div className="space-y-1">
        <p className="font-medium">
          {row.clients.length.toLocaleString("pt-BR")} cliente(s)
        </p>
        {row.clients.slice(0, 2).map((name) => (
          <p
            key={name}
            className="max-w-xs truncate text-xs text-[var(--text-muted)]"
            title={name}
          >
            {name}
          </p>
        ))}
        {!!row.clients.length && (
          <button
            type="button"
            className="mt-1 text-sm font-semibold text-[var(--theme-link,var(--brand))] hover:underline"
            onClick={() => {
              setClientQuery("");
              setSelected(row);
            }}
            aria-label={`Consultar clientes de ${row.name}`}
          >
            Consultar vínculos
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="dashboard-page space-y-4">
      <PageHeader
        eyebrow="Ativos"
        title="Locais e obras"
        description="Consulte instalações, clientes e equipamentos vinculados."
        actions={
          <Link
            href="/dashboard/clients/new"
            className="app-button app-button-primary"
          >
            Novo cliente com obra
          </Link>
        }
      />
      <dl className="grid grid-cols-3 gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        {[
          ["Locais", rows.filter((row) => row.key !== UNASSIGNED).length],
          [
            "Clientes vinculados",
            new Set(rows.flatMap((row) => row.clients)).size,
          ],
          ["Equipamentos", generators.length],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {Number(value).toLocaleString("pt-BR")}
            </dd>
          </div>
        ))}
      </dl>
      {error && (
        <StatusBanner tone="rose">
          {error}{" "}
          <button
            type="button"
            onClick={() => void load()}
            className="ml-2 font-semibold underline"
          >
            Tentar novamente
          </button>
        </StatusBanner>
      )}
      <section
        className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
        aria-busy={loading}
      >
        <label className="block text-sm font-medium">
          Buscar local ou cliente
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Endereço, cidade ou cliente"
            className="app-input mt-2 w-full"
          />
        </label>
        {loading ? (
          <EmptyState
            title="Carregando locais"
            description="Consultando as instalações e seus vínculos."
          />
        ) : !filtered.length ? (
          <EmptyState
            title={error ? "Dados indisponíveis" : "Nenhum local encontrado"}
            description={
              search
                ? "Tente outro endereço, cidade ou cliente."
                : "As instalações são informadas no cadastro do cliente ou do equipamento."
            }
          />
        ) : (
          <>
            <div
              className="hidden overflow-x-auto md:block"
              tabIndex={0}
              role="region"
              aria-label="Locais e vínculos. Role horizontalmente para ver todas as colunas."
            >
              <table
                data-pagination-skip="true"
                className="w-full text-left text-sm"
              >
                <thead>
                  <tr className="border-b border-[var(--border)] text-xs text-[var(--text-muted)]">
                    <th className="px-3 py-3">Local</th>
                    <th className="px-3 py-3">Cidade / UF</th>
                    <th className="px-3 py-3">Clientes</th>
                    <th className="px-3 py-3 text-right">Equipamentos</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((row) => (
                    <tr
                      key={row.key}
                      className="border-b border-[var(--border)] align-top last:border-b-0"
                    >
                      <td className="max-w-xs px-3 py-4">
                        <p className="font-semibold">{row.name}</p>
                        {row.key === UNASSIGNED && (
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            Equipamentos com instalação pendente de
                            identificação.
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4">
                        {row.city} / {row.state}
                      </td>
                      <td className="px-3 py-4">{clientSummary(row)}</td>
                      <td className="px-3 py-4 text-right tabular-nums">
                        {row.equipmentCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-[var(--border)] md:hidden">
              {paginatedItems.map((row) => (
                <article key={row.key} className="space-y-3 py-4 first:pt-0">
                  <h2 className="break-words text-base font-semibold">
                    {row.name}
                  </h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    {row.key === UNASSIGNED
                      ? "Instalação pendente de identificação."
                      : `${row.city} / ${row.state}`}
                  </p>
                  <p className="text-sm">{row.equipmentCount} equipamento(s)</p>
                  {clientSummary(row)}
                </article>
              ))}
            </div>
            <ListPagination {...paginationProps} />
          </>
        )}
      </section>
      {selected && (
        <ModalDialog
          title={`Clientes · ${selected.name}`}
          onClose={() => setSelected(null)}
        >
          <div className="space-y-4">
            <label className="block text-sm font-medium">
              Buscar cliente vinculado
              <input
                type="search"
                className="app-input mt-2 w-full"
                value={clientQuery}
                onChange={(event) => setClientQuery(event.target.value)}
                placeholder="Nome do cliente"
              />
            </label>
            <p role="status" className="text-sm text-[var(--text-muted)]">
              {matchingClients.length} resultado(s)
              {matchingClients.length > 10
                ? " · Exibindo 10. Refine a busca."
                : ""}
            </p>
            <ul className="divide-y divide-[var(--border)]">
              {matchingClients.slice(0, 10).map((name) => (
                <li key={name} className="py-3 text-sm">
                  {clientIds.has(name) &&
                  canAccessDashboardPath(
                    "/dashboard/clients",
                    getAccessFromToken().pages,
                  ) ? (
                    <Link
                      className="font-medium text-[var(--theme-link,var(--brand))] hover:underline"
                      href={`/dashboard/clients/${clientIds.get(name)}`}
                    >
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                </li>
              ))}
            </ul>
            {!matchingClients.length && (
              <p className="text-sm">
                Nenhum cliente encontrado para esta busca.
              </p>
            )}
          </div>
        </ModalDialog>
      )}
    </div>
  );
}
