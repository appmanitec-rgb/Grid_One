"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  customerPortalGet,
  formatPortalDate,
  PortalDashboard,
  statusLabel,
} from "@/lib/customer-portal";

export default function PortalDashboardPage() {
  const [data, setData] = useState<PortalDashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const payload = await customerPortalGet<PortalDashboard>("/dashboard");
        if (!cancelled) setData(payload);
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Falha ao carregar portal.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <PortalState title="Carregando dados" />;
  if (error)
    return (
      <PortalState title="Não foi possível carregar" description={error} />
    );
  if (!data) return <PortalState title="Sem dados para exibir" />;

  const stats = [
    {
      label: "Equipamentos",
      value: data.stats.equipmentCount,
      href: "/portal/equipamentos",
    },
    {
      label: "Propostas pendentes",
      value: data.stats.awaitingProposals,
      href: "/portal/propostas",
    },
    {
      label: "OS abertas",
      value: data.stats.openOrders,
      href: "/portal/equipamentos",
    },
    {
      label: "Chamados abertos",
      value: data.stats.openTickets || 0,
      href: "/portal/chamados",
    },
    {
      label: "Solicitações abertas",
      value: data.stats.openQuoteRequests,
      href: "/portal/solicitacoes",
    },
    {
      label: "Aguardando cliente",
      value: data.stats.waitingCustomerTickets || 0,
      href: "/portal/chamados",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-bold uppercase text-blue-700">
          Área do Cliente
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-950">
          {data.client.tradeName || data.client.companyName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Acompanhe equipamentos, propostas, ordens, documentos e cobranças
          liberadas.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow"
          >
            <p className="text-xs font-bold uppercase text-slate-500">
              {stat.label}
            </p>
            <strong className="mt-3 block text-3xl font-extrabold text-slate-950">
              {stat.value}
            </strong>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Propostas recentes" href="/portal/propostas">
          {data.recentProposals.length ? (
            data.recentProposals.map((proposal) => (
              <Row key={proposal.id} href={`/portal/propostas/${proposal.id}`}>
                <div>
                  <p className="font-bold text-slate-900">{proposal.code}</p>
                  <p className="text-sm text-slate-500">
                    {proposal.generator?.name || "Sem equipamento vinculado"}
                  </p>
                </div>
                <StatusPill status={proposal.status} />
              </Row>
            ))
          ) : (
            <EmptyText text="Nenhuma proposta liberada para acompanhamento." />
          )}
        </Panel>

        <Panel title="Ordens recentes" href="/portal/equipamentos">
          {data.recentOrders.length ? (
            data.recentOrders.map((order) => (
              <Row
                key={order.id}
                href={`/portal/equipamentos/${order.generator?.id || ""}`}
              >
                <div>
                  <p className="font-bold text-slate-900">{order.title}</p>
                  <p className="text-sm text-slate-500">
                    {order.generator?.name || "Equipamento"}
                  </p>
                </div>
                <StatusPill status={order.status} />
              </Row>
            ))
          ) : (
            <EmptyText text="Nenhuma ordem recente para exibir." />
          )}
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Próximas preventivas" href="/portal/equipamentos">
          {data.upcomingPreventives.length ? (
            data.upcomingPreventives.map((item) => (
              <Row
                key={item.id}
                href={`/portal/equipamentos/${item.generator.id}`}
              >
                <div>
                  <p className="font-bold text-slate-900">
                    {item.generator.name}
                  </p>
                  <p className="text-sm text-slate-500">
                    {formatPortalDate(item.scheduledDate)}
                  </p>
                </div>
                <StatusPill status={item.status} />
              </Row>
            ))
          ) : (
            <EmptyText text="Nenhuma preventiva futura programada." />
          )}
        </Panel>

        <Panel title="Documentos recentes" href="/portal/documentos">
          {data.recentDocuments.length ? (
            data.recentDocuments.map((document) => (
              <Row key={document.id} href="/portal/documentos">
                <div>
                  <p className="font-bold text-slate-900">
                    {document.documentTitle ||
                      document.documentCode ||
                      document.documentType}
                  </p>
                  <p className="text-sm text-slate-500">
                    {formatPortalDate(document.createdAt)}
                  </p>
                </div>
                <StatusPill status={document.status} />
              </Row>
            ))
          ) : (
            <EmptyText text="Nenhum documento liberado ainda." />
          )}
        </Panel>
      </section>
    </div>
  );
}

function Panel({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-slate-950">{title}</h2>
        <Link
          href={href}
          className="text-sm font-bold text-blue-700 hover:text-blue-900"
        >
          Ver todos
        </Link>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 hover:border-blue-200 hover:bg-blue-50"
    >
      {children}
    </Link>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600">
      {statusLabel(status)}
    </span>
  );
}

function EmptyText({ text }: { text: string }) {
  return (
    <p className="rounded-md bg-slate-50 p-3 text-sm font-medium text-slate-500">
      {text}
    </p>
  );
}

function PortalState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-extrabold text-slate-950">{title}</h1>
      {description ? (
        <p className="mt-2 text-sm text-slate-500">{description}</p>
      ) : null}
    </section>
  );
}
