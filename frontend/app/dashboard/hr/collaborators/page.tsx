"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

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
  summary: {
    internalUsers: number;
    systemUsers: number;
    portalUsers: number;
    clients: number;
    auditors: number;
  };
};

type TabKey = "internal" | "users" | "clients" | "auditors";

export default function CollaboratorsPage() {
  const [payload, setPayload] = useState<AgentsPayload | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("internal");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      const res = await apiFetch("/hr-admin/agents", { cache: "no-store" });
      if (!res.ok) return;
      setPayload((await res.json()) as AgentsPayload);
    }

    void load();
  }, []);

  const query = search.trim().toLowerCase();
  const internalUsers = useMemo(
    () =>
      (payload?.internalUsers || []).filter((row) =>
        `${row.name} ${row.email} ${row.role} ${row.department || ""}`.toLowerCase().includes(query),
      ),
    [payload?.internalUsers, query],
  );
  const systemUsers = useMemo(
    () =>
      (payload?.systemUsers || []).filter((row) =>
        `${row.name} ${row.email} ${row.role}`.toLowerCase().includes(query),
      ),
    [payload?.systemUsers, query],
  );
  const clients = useMemo(
    () =>
      (payload?.clients || []).filter((row) =>
        `${row.companyName} ${row.tradeName || ""} ${row.cnpj || ""} ${row.contactName || ""}`.toLowerCase().includes(query),
      ),
    [payload?.clients, query],
  );
  const auditors = useMemo(
    () =>
      (payload?.auditors || []).filter((row) =>
        `${row.name} ${row.email} ${row.department || ""}`.toLowerCase().includes(query),
      ),
    [payload?.auditors, query],
  );

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Agentes</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Separação operacional entre colaboradores internos, usuários do sistema, clientes externos e auditores.
          </p>
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar agente, cliente, e-mail ou perfil"
          className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm lg:max-w-sm"
        />
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

      {activeTab === "internal" ? <InternalTable rows={internalUsers} showHourCost /> : null}
      {activeTab === "users" ? <SystemUsersTable rows={systemUsers} /> : null}
      {activeTab === "clients" ? <ClientsTable rows={clients} /> : null}
      {activeTab === "auditors" ? <InternalTable rows={auditors} /> : null}
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
