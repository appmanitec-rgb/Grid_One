"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";

type Equipment = {
  id: string;
  name: string;
  brand: string;
  serialNumber?: string | null;
  power: number;
  hourMeter?: number | null;
  condition?: string | null;
  assetTag?: string | null;
  installationSite?: string | null;
  operationalStatus?: string | null;
  lifecycleStatus?: string | null;
  criticality?: string | null;
  manufactureYear?: number | null;
  installationDate?: string | null;
  warrantyEndDate?: string | null;
  hasMaintenanceContract?: boolean | null;
  client?: { id: string; companyName: string } | null;
  currentSite?: { id: string; name: string; code?: string | null } | null;
  model?: { id: string; name: string; brand?: string | null } | null;
  proposals?: Array<{ id: string; code: string; status: string; totalValue: number }>;
  orders?: Array<{ id: string; title: string; status: string; priority: string; serviceReport?: { id: string; code: string } | null }>;
  serviceTickets?: Array<{ id: string; code?: string | null; title: string; status: string }>;
  serviceReports?: Array<{ id: string; code: string; status: string; title?: string | null }>;
  contractLinks?: Array<{ id: string; contract?: { id: string; code: string; status: string } | null }>;
  baseItems?: Array<{ id: string; serviceGroup: string; quantity: number; catalogItem?: { id: string; name: string; sku?: string | null } | null }>;
};

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await apiFetch(apiUrl(`/generators/${id}`), { cache: "no-store" });
        if (!res.ok) throw new Error("Nao foi possivel carregar o equipamento.");
        setEquipment(await res.json());
      } catch (e: any) {
        setError(e.message || "Erro ao carregar equipamento.");
      }
    })();
  }, [id]);

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!equipment) return <div className="p-8 text-zinc-500">Carregando...</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-800">{equipment.name}</h1>
          <p className="text-zinc-500 mt-1">Prontuario tecnico, comercial e operacional do equipamento.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {equipment.client?.id ? <DeepLink href={`/dashboard/clients/${equipment.client.id}`}>Cliente</DeepLink> : null}
          {equipment.contractLinks?.[0]?.contract?.id ? <DeepLink href={`/dashboard/contracts/${equipment.contractLinks[0].contract.id}`}>Contrato</DeepLink> : null}
          <Link href="/dashboard/equipments" className="rounded-lg border border-zinc-300 px-4 py-2 text-zinc-700">Voltar</Link>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 rounded-xl border border-zinc-200 bg-white p-6 md:grid-cols-3 xl:grid-cols-4">
        <Info label="Nome" value={equipment.name} />
        <Info label="Cliente" value={equipment.client?.companyName || "-"} href={equipment.client?.id ? `/dashboard/clients/${equipment.client.id}` : undefined} />
        <Info label="Local/site" value={equipment.currentSite?.name || equipment.installationSite || "-"} />
        <Info label="Tag patrimonial" value={equipment.assetTag || "-"} />
        <Info label="Status operacional" value={labelStatus(equipment.operationalStatus)} />
        <Info label="Ciclo de vida" value={labelStatus(equipment.lifecycleStatus)} />
        <Info label="Criticidade" value={equipment.criticality || "-"} />
        <Info label="Contrato ativo" value={equipment.hasMaintenanceContract ? "Sim" : "Nao"} />
      </section>

      <section className="grid grid-cols-1 gap-4 rounded-xl border border-zinc-200 bg-white p-6 md:grid-cols-3 xl:grid-cols-4">
        <Info label="Fabricante" value={equipment.brand} />
        <Info label="Modelo" value={equipment.model?.name || "-"} />
        <Info label="Numero de serie" value={equipment.serialNumber || "-"} />
        <Info label="Potencia" value={`${equipment.power} kVA`} />
        <Info label="Horimetro" value={equipment.hourMeter != null ? String(equipment.hourMeter) : "-"} />
        <Info label="Condicao" value={equipment.condition || "-"} />
        <Info label="Ano fabricacao" value={equipment.manufactureYear ? String(equipment.manufactureYear) : "-"} />
        <Info label="Garantia ate" value={formatDate(equipment.warrantyEndDate)} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RelatedCard title="Contratos vinculados" empty="Nenhum contrato vinculado.">
          {(equipment.contractLinks || []).map((link) =>
            link.contract ? (
              <DeepListLink key={link.id} href={`/dashboard/contracts/${link.contract.id}`} title={link.contract.code} subtitle={link.contract.status} />
            ) : null,
          )}
        </RelatedCard>

        <RelatedCard title="Peças base / manutenção" empty="Nenhuma peça base cadastrada.">
          {(equipment.baseItems || []).map((item) => (
            <DeepListLink
              key={item.id}
              href={item.catalogItem?.id ? `/dashboard/catalog/${item.catalogItem.id}` : "#"}
              title={item.catalogItem?.name || "Item"}
              subtitle={`${item.serviceGroup} | qtd. ${item.quantity}${item.catalogItem?.sku ? ` | ${item.catalogItem.sku}` : ""}`}
            />
          ))}
        </RelatedCard>
      </section>

      <section className="bg-white border border-zinc-200 rounded-xl p-6">
        <h2 className="font-bold text-zinc-800 mb-3">Propostas vinculadas</h2>
        {(equipment.proposals || []).length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma proposta vinculada.</p>
        ) : (
          <div className="space-y-2">
            {(equipment.proposals || []).map((p) => (
              <DeepListLink key={p.id} href={`/dashboard/proposals/${p.id}`} title={p.code} subtitle={`${p.status} - R$ ${Number(p.totalValue || 0).toFixed(2)}`} />
            ))}
          </div>
        )}
      </section>

      <section className="bg-white border border-zinc-200 rounded-xl p-6">
        <h2 className="font-bold text-zinc-800 mb-3">Ordens de servico</h2>
        {(equipment.orders || []).length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma O.S. vinculada.</p>
        ) : (
          <div className="space-y-2">
            {(equipment.orders || []).map((o) => (
              <div key={o.id} className="rounded-lg border border-zinc-200 p-3 hover:bg-zinc-50">
                <DeepListLink href={`/dashboard/orders/${o.id}`} title={o.title} subtitle={`${o.status} - ${o.priority}`} />
                {o.serviceReport?.id ? (
                  <Link href={`/dashboard/relatorios-tecnicos/${o.serviceReport.id}`} className="mt-2 inline-flex text-xs font-semibold text-blue-700 hover:underline">
                    Laudo {o.serviceReport.code}
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RelatedCard title="Chamados relacionados" empty="Nenhum chamado relacionado.">
          {(equipment.serviceTickets || []).map((ticket) => (
            <DeepListLink key={ticket.id} href={`/dashboard/atendimento/${ticket.id}`} title={ticket.code || ticket.title} subtitle={ticket.status} />
          ))}
        </RelatedCard>
        <RelatedCard title="Laudos tecnicos" empty="Nenhum laudo relacionado.">
          {(equipment.serviceReports || []).map((report) => (
            <DeepListLink key={report.id} href={`/dashboard/relatorios-tecnicos/${report.id}`} title={report.code} subtitle={report.title || report.status} />
          ))}
        </RelatedCard>
      </section>
    </div>
  );
}

function Info({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = <p className="text-sm font-medium text-zinc-800 break-words">{value}</p>;
  return (
    <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
      <p className="text-xs font-bold text-zinc-500 uppercase mb-1">{label}</p>
      {href ? <Link href={href} className="text-blue-700 hover:underline">{content}</Link> : content}
    </div>
  );
}

function RelatedCard({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  const hasItems = Array.isArray(items) ? items.length > 0 : Boolean(items);
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="mb-3 font-bold text-zinc-800">{title}</h2>
      {hasItems ? <div className="space-y-2">{items}</div> : <p className="text-sm text-zinc-500">{empty}</p>}
    </section>
  );
}

function DeepListLink({ href, title, subtitle }: { href: string; title: string; subtitle: string }) {
  return (
    <Link href={href} className="block rounded-lg border border-zinc-200 p-3 hover:bg-zinc-50">
      <p className="font-medium text-zinc-800">{title}</p>
      <p className="text-xs text-zinc-500">{subtitle}</p>
    </Link>
  );
}

function DeepLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
      {children}
    </Link>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(value));
}

function labelStatus(value?: string | null) {
  if (!value) return "-";
  return value.replace(/_/g, " ");
}
