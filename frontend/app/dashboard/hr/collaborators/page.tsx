"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getAccessFromToken } from "@/lib/access";

type InternalUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string | null;
  branch?: string | null;
  hourCost?: number | null;
  isActive: boolean;
  technicianProfile?: { id: string } | null;
};

type PortalUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  linkedClient?: { id: string; companyName: string; tradeName?: string | null } | null;
};

type ClientAgent = {
  id: string;
  companyName: string;
  tradeName?: string | null;
  cnpj?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  portalUsers?: Array<{ id: string; name: string; email: string }>;
};

type AgentsPayload = {
  internalUsers: InternalUser[];
  systemUsers: Array<InternalUser | PortalUser>;
  portalUsers: PortalUser[];
  clients: ClientAgent[];
  auditors: InternalUser[];
  access?: {
    canViewSensitivePeople: boolean;
  };
  summary: {
    internalUsers: number;
    systemUsers: number;
    portalUsers: number;
    clients: number;
    auditors: number;
  };
};

type TabKey = "internal" | "users" | "clients" | "auditors";
type FilterOption = "ALL" | "YES" | "NO";

export default function CollaboratorsPage() {
  const [payload, setPayload] = useState<AgentsPayload | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("internal");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<FilterOption>("ALL");
  const [technicianFilter, setTechnicianFilter] = useState<FilterOption>("ALL");
  const [portalFilter, setPortalFilter] = useState<FilterOption>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const access = useMemo(() => getAccessFromToken(), []);
  const canViewSensitivePeople =
    payload?.access?.canViewSensitivePeople === true &&
    access.people.viewSensitive === true;

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await apiFetch("/hr-admin/agents", { cache: "no-store" });
        if (!res.ok) {
          setError("Nao foi possivel carregar agentes e acessos.");
          return;
        }
        setPayload((await res.json()) as AgentsPayload);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const query = search.trim().toLowerCase();
  const internalUsers = useMemo(
    () =>
      (payload?.internalUsers || []).filter((row) =>
        matchesUserFilters(row, query, roleFilter, statusFilter, technicianFilter),
      ),
    [payload?.internalUsers, query, roleFilter, statusFilter, technicianFilter],
  );
  const systemUsers = useMemo(
    () =>
      (payload?.systemUsers || []).filter((row) =>
        matchesUserFilters(row, query, roleFilter, statusFilter, technicianFilter),
      ),
    [payload?.systemUsers, query, roleFilter, statusFilter, technicianFilter],
  );
  const clients = useMemo(
    () =>
      (payload?.clients || []).filter((row) => {
        const matchesPortal =
          portalFilter === "ALL" ||
          (portalFilter === "YES"
            ? Boolean(row.portalUsers?.length)
            : !row.portalUsers?.length);
        if (!matchesPortal) return false;
        return `${row.companyName} ${row.tradeName || ""} ${row.cnpj || ""} ${row.contactName || ""} ${row.email || ""}`
          .toLowerCase()
          .includes(query);
      }),
    [payload?.clients, portalFilter, query],
  );
  const auditors = useMemo(
    () =>
      (payload?.auditors || []).filter((row) =>
        matchesUserFilters(row, query, roleFilter, statusFilter, technicianFilter),
      ),
    [payload?.auditors, query, roleFilter, statusFilter, technicianFilter],
  );

  const currentResultCount =
    activeTab === "internal"
      ? internalUsers.length
      : activeTab === "users"
        ? systemUsers.length
        : activeTab === "clients"
          ? clients.length
          : auditors.length;
  const activeFilterCount = [
    Boolean(search.trim()),
    roleFilter !== "ALL",
    statusFilter !== "ALL",
    technicianFilter !== "ALL",
    portalFilter !== "ALL",
  ].filter(Boolean).length;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Agentes e Acessos</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Separação operacional entre colaboradores internos, usuários do sistema, clientes externos e auditores.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <label className="block flex-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Buscar agente
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
          placeholder="Buscar agente, cliente, e-mail ou perfil"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
        />
        {showFilters ? (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            <SelectFilter
              label="Perfil"
              value={roleFilter}
              onChange={setRoleFilter}
              options={[
                { value: "ALL", label: "Todos" },
                { value: "ADMIN", label: "Admin" },
                { value: "SALES", label: "Comercial" },
                { value: "TECHNICIAN", label: "Tecnico" },
                { value: "CLIENT", label: "Cliente" },
                { value: "AUDITOR", label: "Auditor" },
              ]}
            />
            <SelectFilter
              label="Status"
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as FilterOption)}
              options={[
                { value: "ALL", label: "Todos" },
                { value: "YES", label: "Ativos" },
                { value: "NO", label: "Inativos" },
              ]}
            />
            <SelectFilter
              label="Tecnico"
              value={technicianFilter}
              onChange={(value) => setTechnicianFilter(value as FilterOption)}
              options={[
                { value: "ALL", label: "Todos" },
                { value: "YES", label: "Com perfil tecnico" },
                { value: "NO", label: "Sem perfil tecnico" },
              ]}
            />
            <SelectFilter
              label="Portal"
              value={portalFilter}
              onChange={(value) => setPortalFilter(value as FilterOption)}
              options={[
                { value: "ALL", label: "Todos" },
                { value: "YES", label: "Com acesso" },
                { value: "NO", label: "Sem acesso" },
              ]}
            />
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-zinc-500">
            {currentResultCount} resultado(s)
            {activeFilterCount ? ` | ${activeFilterCount} filtro(s) ativo(s)` : ""}
          </p>
          {activeFilterCount ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setRoleFilter("ALL");
                setStatusFilter("ALL");
                setTechnicianFilter("ALL");
                setPortalFilter("ALL");
              }}
              className="text-xs font-semibold text-zinc-600 hover:text-blue-700 hover:underline"
            >
              Limpar filtros
            </button>
          ) : null}
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Metric title="Colaboradores" value={String(payload?.summary.internalUsers ?? 0)} />
        <Metric title="Usuários" value={String(payload?.summary.systemUsers ?? 0)} />
        <Metric title="Clientes" value={String(payload?.summary.clients ?? 0)} />
        <Metric title="Auditores" value={String(payload?.summary.auditors ?? 0)} />
      </section>

      <div className="flex flex-wrap gap-2">
        <TabButton active={activeTab === "internal"} onClick={() => setActiveTab("internal")}>Colaboradores</TabButton>
        <TabButton active={activeTab === "users"} onClick={() => setActiveTab("users")}>Usuários do sistema</TabButton>
        <TabButton active={activeTab === "clients"} onClick={() => setActiveTab("clients")}>Clientes</TabButton>
        <TabButton active={activeTab === "auditors"} onClick={() => setActiveTab("auditors")}>Auditores</TabButton>
      </div>

      {loading ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          Carregando agentes e acessos...
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {!loading && !error && !canViewSensitivePeople ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Custos, alçadas e dados administrativos sensíveis ficam ocultos para esta permissão.
        </p>
      ) : null}

      {!loading && !error && activeTab === "internal" ? (
        <InternalTable rows={internalUsers} showHourCost={canViewSensitivePeople} />
      ) : null}
      {!loading && !error && activeTab === "users" ? <SystemUsersTable rows={systemUsers} /> : null}
      {!loading && !error && activeTab === "clients" ? <ClientsTable rows={clients} /> : null}
      {!loading && !error && activeTab === "auditors" ? <InternalTable rows={auditors} /> : null}
    </div>
  );
}

function InternalTable({ rows, showHourCost = false }: { rows: InternalUser[]; showHourCost?: boolean }) {
  return (
    <TableShell empty={rows.length === 0 ? "Nenhum colaborador interno encontrado." : undefined}>
      <thead>
        <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
          <th className="px-3 py-3">Nome</th>
          <th className="px-3 py-3">Perfil</th>
          <th className="px-3 py-3">Departamento</th>
          <th className="px-3 py-3">Filial</th>
          {showHourCost ? <th className="px-3 py-3">Custo HH</th> : null}
          <th className="px-3 py-3">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b border-zinc-100">
            <td className="px-3 py-3">
              <p className="font-semibold text-zinc-900">{row.name}</p>
              <p className="text-xs text-zinc-500">{row.email}</p>
            </td>
            <td className="px-3 py-3 text-zinc-700">{row.role}</td>
            <td className="px-3 py-3 text-zinc-700">{row.department || "-"}</td>
            <td className="px-3 py-3 text-zinc-700">{row.branch || "-"}</td>
            {showHourCost ? <td className="px-3 py-3 text-zinc-700">R$ {Number(row.hourCost || 0).toFixed(2)}</td> : null}
            <td className="px-3 py-3 text-zinc-700">{row.isActive ? "Ativo" : "Inativo"}</td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function SystemUsersTable({ rows }: { rows: Array<InternalUser | PortalUser> }) {
  return (
    <TableShell empty={rows.length === 0 ? "Nenhum usuário encontrado." : undefined}>
      <thead>
        <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
          <th className="px-3 py-3">Usuário</th>
          <th className="px-3 py-3">Perfil</th>
          <th className="px-3 py-3">Classificação</th>
          <th className="px-3 py-3">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b border-zinc-100">
            <td className="px-3 py-3">
              <p className="font-semibold text-zinc-900">{row.name}</p>
              <p className="text-xs text-zinc-500">{row.email}</p>
            </td>
            <td className="px-3 py-3 text-zinc-700">{row.role}</td>
            <td className="px-3 py-3 text-zinc-700">
              {row.role === "CLIENT" ? "Portal do cliente" : row.role === "AUDITOR" ? "Auditoria" : "Interno"}
            </td>
            <td className="px-3 py-3 text-zinc-700">{row.isActive ? "Ativo" : "Inativo"}</td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function ClientsTable({ rows }: { rows: ClientAgent[] }) {
  return (
    <TableShell empty={rows.length === 0 ? "Nenhum cliente encontrado." : undefined}>
      <thead>
        <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
          <th className="px-3 py-3">Cliente</th>
          <th className="px-3 py-3">Contato</th>
          <th className="px-3 py-3">Portal</th>
          <th className="px-3 py-3">Ação</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b border-zinc-100">
            <td className="px-3 py-3">
              <p className="font-semibold text-zinc-900">{row.tradeName || row.companyName}</p>
              <p className="text-xs text-zinc-500">{row.cnpj || "-"}</p>
            </td>
            <td className="px-3 py-3 text-zinc-700">
              {row.contactName || row.email || row.phone || "-"}
            </td>
            <td className="px-3 py-3 text-zinc-700">{row.portalUsers?.length || 0} usuário(s)</td>
            <td className="px-3 py-3">
              <Link href={`/dashboard/clients/${row.id}`} className="text-sm font-semibold text-blue-700 hover:underline">
                Abrir cliente
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function TableShell({ children, empty }: { children: ReactNode; empty?: string }) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">{children}</table>
      </div>
      {empty ? <p className="p-6 text-center text-sm text-zinc-500">{empty}</p> : null}
    </section>
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

function matchesUserFilters(
  row: InternalUser | PortalUser,
  query: string,
  roleFilter: string,
  statusFilter: FilterOption,
  technicianFilter: FilterOption,
) {
  if (roleFilter !== "ALL" && row.role !== roleFilter) return false;
  if (statusFilter !== "ALL") {
    const active = Boolean(row.isActive);
    if (statusFilter === "YES" && !active) return false;
    if (statusFilter === "NO" && active) return false;
  }
  if (technicianFilter !== "ALL") {
    const isTechnician =
      row.role === "TECHNICIAN" || Boolean((row as InternalUser).technicianProfile);
    if (technicianFilter === "YES" && !isTechnician) return false;
    if (technicianFilter === "NO" && isTechnician) return false;
  }
  return `${row.name} ${row.email} ${row.role} ${"department" in row ? row.department || "" : ""}`
    .toLowerCase()
    .includes(query);
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
        active
          ? "border-slate-950 bg-slate-950 text-white"
          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      {children}
    </button>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      <p className="mt-1 text-2xl font-bold text-zinc-900">{value}</p>
    </div>
  );
}
