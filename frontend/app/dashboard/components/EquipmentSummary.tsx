"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { canAccessDashboardPath, getAccessFromToken } from "@/lib/access";
import { commercialLabel } from "@/lib/commercial-labels";
import { preparePhoto } from "../profile/ProfilePhotoField";
import { PermissionAwareLink } from "./OperationalLinks";

type Order = {
  id: string;
  title: string;
  status: string;
  scheduledTo?: string | null;
  finishedAt?: string | null;
};
type OrderSummary = {
  pending: { total: number; items: Order[] };
  completed: { total: number; items: Order[] };
};
export type EquipmentSummaryData = {
  client?: { id: string; companyName: string } | null;
  operationalStatus?: unknown;
  installationSite?: unknown;
};
function dateLabel(value?: string | null) {
  if (!value) return "Sem data definida";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("pt-BR")
    : "Sem data definida";
}
export default function EquipmentSummary({
  id,
  equipment,
  photo,
  onPhotoChange,
  canEdit,
  busy,
  onBusyChange,
  children,
}: {
  id: string;
  equipment: EquipmentSummaryData;
  photo: string;
  onPhotoChange: (photo: string) => void;
  canEdit: boolean;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  children?: ReactNode;
}) {
  const [access] = useState(getAccessFromToken);
  const canViewOrders =
    access.orders.view &&
    canAccessDashboardPath("/dashboard/orders", access.pages);
  const [orders, setOrders] = useState<OrderSummary | null>(null);
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [failedPhoto, setFailedPhoto] = useState("");
  const [reading, setReading] = useState(false);
  const [retry, setRetry] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!canViewOrders) return;
    const controller = new AbortController();
    setError("");
    void apiFetch("/generators/" + encodeURIComponent(id) + "/order-summary", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            await readApiErrorMessage(
              response,
              "Não foi possível carregar as O.S.",
            ),
          );
        return response.json() as Promise<OrderSummary>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setOrders(data);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Não foi possível carregar as O.S.",
          );
      });
    return () => controller.abort();
  }, [id, canViewOrders, retry]);
  async function attach(file?: File) {
    if (!file) return;
    setReading(true);
    onBusyChange(true);
    setPhotoError("");
    try {
      onPhotoChange(await preparePhoto(file));
    } catch (reason) {
      setPhotoError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível anexar a foto.",
      );
    } finally {
      setReading(false);
      onBusyChange(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  return (
    <section
      aria-label="Visão geral do equipamento"
      className="mb-6 space-y-5 border-b border-slate-100 pb-6"
    >
      <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
        <div className="flex h-44 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {photo && failedPhoto !== photo ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo}
                alt="Foto do equipamento do cliente"
                className="h-full w-full object-contain"
                onError={() => setFailedPhoto(photo)}
              />
            </>
          ) : (
            <div className="px-5 text-center text-sm text-slate-500">
              <svg
                viewBox="0 0 48 48"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
                className="mx-auto mb-2 h-10 w-10"
              >
                <rect x="6" y="12" width="36" height="25" rx="3" />
                <path d="M12 19h10m-10 6h10m-10 6h10m8-12h6v12h-6M12 37v4m24-4v4" />
              </svg>
              {photo ? "Foto indisponível" : "Equipamento sem foto"}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-950">
            Máquina do cliente
          </h3>
          {equipment.client ? (
            <PermissionAwareLink
              href={"/dashboard/clients/" + equipment.client.id}
              permission="clients.view"
              className="mt-2 block break-words text-sm font-semibold text-blue-700"
            >
              {equipment.client.companyName}
            </PermissionAwareLink>
          ) : null}
          <p className="mt-2 text-sm text-slate-600">
            {equipment.operationalStatus === "OPERATING" ||
            !equipment.operationalStatus
              ? "Em operação"
              : commercialLabel(String(equipment.operationalStatus))}
          </p>
          {equipment.installationSite ? (
            <p className="mt-1 break-words text-sm text-slate-500">
              {String(equipment.installationSite)}
            </p>
          ) : null}
          {canEdit ? (
            <div className="mt-4">
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Anexar foto do equipamento"
                disabled={busy || reading}
                onChange={(event) => void attach(event.target.files?.[0])}
                className="sr-only"
              />
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy || reading}
                  onClick={() => fileInput.current?.click()}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  {reading
                    ? "Preparando foto..."
                    : photo
                      ? "Trocar foto"
                      : "Anexar foto"}
                </button>
                {photo ? (
                  <button
                    type="button"
                    disabled={busy || reading}
                    onClick={() => onPhotoChange("")}
                    className="text-sm font-semibold text-red-700 disabled:opacity-50"
                  >
                    Remover foto
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                JPG, PNG ou WebP, até 5 MB. Confirme em Salvar alterações.
              </p>
              {photoError ? (
                <p role="alert" className="mt-2 text-sm text-red-700">
                  {photoError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {children}
      {canViewOrders ? (
        <div>
          <h3 className="mb-3 text-base font-bold text-slate-950">
            Ordens de serviço
          </h3>
          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
            >
              {error}{" "}
              <button
                type="button"
                onClick={() => setRetry((current) => current + 1)}
                className="font-semibold underline"
              >
                Tentar novamente
              </button>
            </p>
          ) : !orders ? (
            <p className="text-sm text-slate-500">Carregando O.S...</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {(
                [
                  {
                    key: "pending",
                    title: "O.S. a fazer",
                    empty: "Nenhuma O.S. pendente.",
                    tone: "bg-amber-50 text-amber-800",
                  },
                  {
                    key: "completed",
                    title: "O.S. realizadas",
                    empty: "Nenhuma O.S. realizada.",
                    tone: "bg-emerald-50 text-emerald-800",
                  },
                ] as const
              ).map((group) => (
                <section
                  key={group.key}
                  aria-label={group.title}
                  className="min-w-0 rounded-xl border border-slate-200 bg-white"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                    <h4 className="text-sm font-semibold text-slate-800">
                      {group.title}
                    </h4>
                    <span
                      className={
                        "rounded-full px-2.5 py-1 text-xs font-bold " +
                        group.tone
                      }
                    >
                      {orders[group.key].total}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {orders[group.key].items.length ? (
                      orders[group.key].items.map((order) => (
                        <PermissionAwareLink
                          key={order.id}
                          href={"/dashboard/orders/" + order.id}
                          permission="orders.view"
                          className="block px-4 py-3 hover:bg-slate-50"
                        >
                          <p className="break-words text-sm font-semibold text-slate-800">
                            {order.title}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {commercialLabel(order.status)} ·{" "}
                            {dateLabel(
                              group.key === "completed"
                                ? order.finishedAt
                                : order.scheduledTo,
                            )}
                          </p>
                        </PermissionAwareLink>
                      ))
                    ) : (
                      <p className="px-4 py-4 text-sm text-slate-500">
                        {group.empty}
                      </p>
                    )}
                  </div>
                  {orders[group.key].total > orders[group.key].items.length ? (
                    <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
                      Exibindo as {orders[group.key].items.length} mais
                      recentes.
                    </p>
                  ) : null}
                </section>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
