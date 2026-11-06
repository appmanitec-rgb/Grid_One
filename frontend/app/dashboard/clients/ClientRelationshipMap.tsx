"use client";

import { useEffect, useState } from "react";
import { canAccessDashboardPath, getAccessFromToken } from "@/lib/access";
import { commercialLabel } from "@/lib/commercial-labels";
import { TICKET_STATUS_LABELS, type TicketStatus } from "@/lib/tickets";
import { REPORT_STATUS_LABELS, type ReportStatus } from "@/lib/service-reports";
import { RelatedEntityGrid, type OperationalLinkItem } from "../components/OperationalLinks";

export type ClientRelationshipData = {
  generators?: Array<{ id: string; name?: string | null; serialNumber?: string | null; power?: number | null; orders?: Array<{ id: string; title: string; status: string; openedAt?: string | null }> }>;
  contracts?: Array<{ id: string; code: string; status: string; endDate?: string | null }>;
  proposals?: Array<{ id: string; code: string; status: string }>;
  serviceTickets?: Array<{ id: string; code?: string | null; title: string; status: string; generator?: { name?: string | null } | null }>;
  serviceReports?: Array<{ id: string; code: string; title?: string | null; status: string }>;
};

function endDateLabel(value?: string | null) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleDateString("pt-BR") : "não definida";
}

export default function ClientRelationshipMap({ client, compact = false }: { client: ClientRelationshipData; compact?: boolean }) {
  const [access, setAccess] = useState(getAccessFromToken);
  useEffect(() => { setAccess(getAccessFromToken()); }, []);
  const orders = (client.generators || []).flatMap(generator => (generator.orders || []).map(order => ({ ...order, generatorName: generator.name || "Equipamento" })))
    .sort((a,b) => new Date(b.openedAt || 0).getTime() - new Date(a.openedAt || 0).getTime());
  const groups: Array<{ allowed: boolean; items: OperationalLinkItem[] }> = [
    { allowed: access.equipments.view, items: (client.generators || []).slice(0, compact ? 1 : 6).map(generator => ({
      label: generator.name || generator.serialNumber || "Equipamento", description: "Série: " + (generator.serialNumber || "não informada") + (generator.power ? " · " + generator.power + " kVA" : ""),
      href: "/dashboard/equipments/" + generator.id, badge: "Equipamento", tone: "blue", permission: "equipments.view",
    })) },
    { allowed: access.proposals.view, items: (client.proposals || []).slice(0, compact ? 1 : 4).map(proposal => ({
      label: proposal.code, description: commercialLabel(proposal.status), href: "/dashboard/proposals/" + proposal.id, badge: "Proposta", tone: "blue", permission: "proposals.view",
    })) },
    { allowed: access.contracts.view, items: (client.contracts || []).slice(0, compact ? 1 : 4).map(contract => ({
      label: contract.code, description: commercialLabel(contract.status) + " · Vigência até " + endDateLabel(contract.endDate),
      href: "/dashboard/contracts/" + contract.id, badge: "Contrato", tone: "emerald", permission: "contracts.view",
    })) },
    { allowed: access.orders.view, items: orders.slice(0, compact ? 1 : 5).map(order => ({
      label: order.title, description: order.generatorName + " · " + commercialLabel(order.status), href: "/dashboard/orders/" + order.id, badge: "O.S.", tone: "amber", permission: "orders.view",
    })) },
    { allowed: access.tickets.view, items: (client.serviceTickets || []).slice(0, compact ? 1 : 4).map(ticket => ({
      label: ticket.code || ticket.title, description: ticket.title + " · " + (TICKET_STATUS_LABELS[ticket.status as TicketStatus] || commercialLabel(ticket.status)), href: "/dashboard/atendimento/" + ticket.id, badge: "Chamado", tone: "rose", permission: "tickets.view",
    })) },
    { allowed: access.serviceReports.view, items: (client.serviceReports || []).slice(0, compact ? 1 : 4).map(report => ({
      label: report.code, description: (report.title || "Laudo técnico") + " · " + (REPORT_STATUS_LABELS[report.status as ReportStatus] || commercialLabel(report.status)), href: "/dashboard/relatorios-tecnicos/" + report.id, badge: "Laudo", tone: "slate", permission: "serviceReports.view",
    })) },
  ];
  const items = groups.filter(group => group.allowed).flatMap(group => group.items)
    .filter(item => item.href && canAccessDashboardPath(item.href, access.pages));
  return <RelatedEntityGrid items={items} empty="Nenhum relacionamento disponível para este cliente." />;
}
