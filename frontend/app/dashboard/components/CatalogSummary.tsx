"use client";

import { type ReactNode, useState } from "react";
import { canAccessDashboardPath, getAccessFromToken } from "@/lib/access";
import { commercialLabel } from "@/lib/commercial-labels";
import RecordPhotoField from "./RecordPhotoField";
import { PermissionAwareLink } from "./OperationalLinks";

type LinkedOrder = {
  id: string;
  title: string;
  status: string;
  generator?: { name: string; client?: { companyName: string } | null } | null;
};
export type CatalogSummaryData = {
  type?: string;
  maintenanceOrderMaterials?: { order: LinkedOrder | null }[];
};

export default function CatalogSummary({ item, photo, onPhotoChange, canEdit, busy, onBusyChange, children }: {
  item: CatalogSummaryData;
  photo: string;
  onPhotoChange: (photo: string) => void;
  canEdit: boolean;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  children: ReactNode;
}) {
  const [access] = useState(getAccessFromToken);
  const canViewOrders = access.orders.view && canAccessDashboardPath("/dashboard/orders", access.pages);
  const orders = Array.from(new Map(
    (item.maintenanceOrderMaterials || []).flatMap(entry => entry.order ? [[entry.order.id, entry.order] as const] : []),
  ).values());
  return (
    <div className="space-y-5">
      <RecordPhotoField value={photo} label={item.type === "SERVICE" ? "Foto do serviço" : "Foto da peça"} onChange={onPhotoChange} canEdit={canEdit} disabled={busy} onBusyChange={onBusyChange} />
      <section aria-labelledby="summary-catalog-data-title" className="border-t border-slate-100 pt-5">
        <h3 id="summary-catalog-data-title" className="mb-4 text-base font-bold text-slate-950">{item.type === "SERVICE" ? "Dados do serviço" : "Dados da peça"}</h3>
        {children}
      </section>
      {canViewOrders ? (
        <section aria-labelledby="summary-catalog-orders-title" className="border-t border-slate-100 pt-5">
          <h3 id="summary-catalog-orders-title" className="text-base font-bold text-slate-950">Ordens de serviço</h3>
          <p className="mb-3 mt-1 text-xs text-slate-500">Últimas ordens vinculadas a este item. Consulte o histórico na ficha completa.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {([
              { title: "O.S. a fazer", statuses: ["OPEN", "IN_PROGRESS"], empty: "Nenhuma O.S. pendente nos vínculos recentes." },
              { title: "O.S. realizadas", statuses: ["COMPLETED"], empty: "Nenhuma O.S. realizada nos vínculos recentes." },
            ] as const).map(group => {
              const items = orders.filter(order => (group.statuses as readonly string[]).includes(order.status)).slice(0, 5);
              return (
                <section key={group.title} aria-label={group.title} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <h4 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">{group.title}</h4>
                  <div className="divide-y divide-slate-100">
                    {items.length ? items.map(order => (
                      <PermissionAwareLink key={order.id} href={"/dashboard/orders/" + order.id} permission="orders.view" className="block px-4 py-3 hover:bg-slate-50">
                        <p className="break-words text-sm font-semibold text-slate-800">{order.title}</p>
                        <p className="mt-1 break-words text-xs text-slate-500">{commercialLabel(order.status)}{order.generator ? " · " + (order.generator.client?.companyName || order.generator.name) : ""}</p>
                      </PermissionAwareLink>
                    )) : <p className="px-4 py-4 text-sm text-slate-500">{group.empty}</p>}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
