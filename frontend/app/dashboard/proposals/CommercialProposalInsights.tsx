"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Availability,
  commercialFetch,
  commercialPost,
  CostEstimate,
  EstimateInput,
  ManagementRights,
} from "@/lib/commercial-workspace";
import { commercialLabel } from "@/lib/commercial-labels";
import {
  DataPill,
  InlineMessage,
  SectionCard,
} from "../components/DashboardPageKit";
import { SearchLookup } from "../components/SelectField";
import CommercialEstimatePanel from "./CommercialEstimatePanel";
import { AvailabilityList } from "./CommercialDraftTools";
type Task = {
  step: string;
  title: string;
  department: string;
  assignment: {
    ownerId: string;
    owner: { name: string };
    dueAt: string;
    version: number;
  } | null;
};
type Insights = {
  capabilities: ManagementRights;
  sourceHash: string;
  estimateInput: EstimateInput;
  estimate: CostEstimate | null;
  availability: Availability[];
  revision: {
    previousId: string;
    previousCode: string;
    fields: Array<{
      field: string;
      label: string;
      before: unknown;
      after: unknown;
    }>;
    itemsChanged: boolean;
    previousItems: unknown[];
    currentItems: unknown[];
  } | null;
  approval: {
    requestedDiscountPercent: number | null;
    reason: string | null;
    waitingSince: string;
    status: string;
  };
  deliveries: Array<{
    id: string;
    channel: string;
    status: string;
    sentAt: string | null;
    deliveredAt: string | null;
    shareToken: { lastOpenedAt: string | null; openedCount: number } | null;
  }>;
  handoff: Task[];
};
function readable(value: unknown, field = ""): string {
  if (value === null || value === undefined || value === "")
    return "Não informado";
  const currency = (amount: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(amount);
  if (["totalValue", "discount"].includes(field) && typeof value === "number")
    return currency(value);
  if (field === "deliveryLeadTimeDays") return `${value} dias`;
  if (field === "validUntil" && typeof value === "string")
    return new Date(value).toLocaleDateString("pt-BR");
  if (Array.isArray(value))
    return value.length
      ? value.map((item) => readable(item, field)).join("\n")
      : "Nenhum registro";
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    if (field === "paymentPlan")
      return `${({ CASH: "À vista", "50_50": "50% de entrada e 50% no saldo", CUSTOM: "Personalizado" } as Record<string, string>)[String(row.preset)] || "Parcelamento"} · entrada ${row.entryType === "PERCENTAGE" ? `${Number(row.entryValue || 0)}%` : currency(Number(row.entryValue || 0))} · saldo em ${Number(row.balanceInstallments || 0)} parcela(s)`;
    if (field === "operationalExpenses")
      return `${String(row.label || commercialLabel(String(row.expenseType || "OTHER")))} · ${String(row.quantity || 0)} × ${currency(Number(row.unitPrice || 0))}`;
    return "Condição alterada. Confira o detalhamento na ficha da revisão.";
  }
  return commercialLabel(String(value));
}
function AssignTask({
  proposalId,
  task,
  onSaved,
}: {
  proposalId: string;
  task: Task;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [selected, setSelected] = useState(
    task.assignment
      ? { value: task.assignment.ownerId, label: task.assignment.owner.name }
      : undefined,
  );
  const [dueAt, setDueAt] = useState(
    task.assignment?.dueAt
      ? new Date(
          new Date(task.assignment.dueAt).getTime() -
            new Date().getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16)
      : "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLooking(true);
      commercialFetch<
        Array<{ id: string; name: string; department: string | null }>
      >(`/proposals/${proposalId}/owners?q=${encodeURIComponent(search)}`, {
        signal: controller.signal,
      })
        .then((rows) =>
          setOptions(
            rows.map((row) => ({
              value: row.id,
              label: `${row.name}${row.department ? ` · ${row.department}` : ""}`,
            })),
          ),
        )
        .catch((cause) => {
          if (!controller.signal.aborted) setError(cause.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLooking(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [proposalId, search]);
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!selected || !dueAt) {
          setError("Selecione o responsável e o prazo.");
          return;
        }
        setBusy(true);
        setError("");
        try {
          await commercialPost(`/proposals/${proposalId}/handoff`, {
            step: task.step,
            ownerId: selected.value,
            dueAt: new Date(dueAt).toISOString(),
            version: task.assignment?.version ?? 0,
          });
          onSaved();
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível atribuir.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block text-sm">
        Responsável
        <SearchLookup
          aria-label={`Responsável por ${task.title}`}
          value={selected?.value || ""}
          selected={selected}
          options={options}
          loading={looking}
          onSearch={setSearch}
          onSelect={(value) =>
            setSelected(options.find((option) => option.value === value))
          }
          placeholder="Pesquisar colaborador"
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        Prazo
        <input
          required
          type="datetime-local"
          value={dueAt}
          onChange={(event) => setDueAt(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="app-button app-button-primary"
      >
        {busy ? "Registrando…" : "Registrar responsabilidade"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </form>
  );
}
export default function CommercialProposalInsights({
  proposalId,
  status,
}: {
  proposalId: string;
  status: string;
}) {
  const [data, setData] = useState<Insights>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(undefined);
    commercialFetch<Insights>(`/proposals/${proposalId}/insights`, {
      signal: controller.signal,
    })
      .then(setData)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [proposalId, status, attempt]);
  return (
    <div className="print:hidden">
      <SectionCard
        title="Conferência e acompanhamento comercial"
        description="Disponibilidade, revisões, comunicação e continuidade da venda."
      >
        {loading ? (
          <p role="status" className="text-sm text-slate-500">
            Carregando conferência…
          </p>
        ) : error ? (
          <InlineMessage tone="warning">
            {error}{" "}
            <button type="button" className="underline" onClick={reload}>
              Tentar novamente
            </button>
          </InlineMessage>
        ) : data ? (
          <div className="space-y-4">
            {data.capabilities.costs || data.capabilities.margins ? (
              <details className="rounded-xl border border-slate-200 p-4">
                <summary className="cursor-pointer font-medium">
                  Custos e rentabilidade · acesso restrito
                </summary>
                <div className="mt-4">
                  <CommercialEstimatePanel
                    key={`${proposalId}-${data.estimate?.version || 0}`}
                    input={data.estimateInput}
                    initial={data.estimate}
                    proposalId={proposalId}
                    sourceHash={data.sourceHash}
                    canEdit={data.capabilities.costs && status === "DRAFT"}
                    onSaved={reload}
                  />
                </div>
              </details>
            ) : null}
            <details className="rounded-xl border border-slate-200 p-4">
              <summary className="cursor-pointer font-medium">
                Disponibilidade e confirmação de prazo
              </summary>
              <div className="mt-4">
                <AvailabilityList items={data.availability} />
              </div>
            </details>
            {["BOARD_REVIEW", "DISCOUNT_REVIEW", "REVISION_REQUIRED"].includes(
              data.approval.status,
            ) ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                <p className="font-medium">
                  {commercialLabel(data.approval.status)}
                </p>
                <p className="mt-1">
                  Última alteração:{" "}
                  {new Date(data.approval.waitingSince).toLocaleString("pt-BR")}
                </p>
                {data.approval.requestedDiscountPercent != null ? (
                  <p className="mt-1">
                    Desconto solicitado:{" "}
                    {data.approval.requestedDiscountPercent}%
                  </p>
                ) : null}
                {data.approval.reason ? (
                  <p className="mt-1 whitespace-pre-wrap">
                    Justificativa: {data.approval.reason}
                  </p>
                ) : null}
              </div>
            ) : null}
            {data.revision ? (
              <details className="rounded-xl border border-slate-200 p-4">
                <summary className="cursor-pointer font-medium">
                  O que mudou em relação à {data.revision.previousCode}
                </summary>
                <div className="mt-4 space-y-3">
                  <Link
                    href={`/dashboard/proposals/${data.revision.previousId}`}
                    className="text-sm text-blue-700 underline"
                  >
                    Consultar a ficha da revisão anterior
                  </Link>
                  {data.revision.fields.length ? (
                    data.revision.fields.map((field) => (
                      <div key={field.label}>
                        <h4 className="text-sm font-medium">{field.label}</h4>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <div className="min-w-0 rounded-lg bg-slate-50 p-3">
                            <p className="mb-1 text-xs text-slate-500">
                              Anterior
                            </p>
                            <p className="whitespace-pre-wrap break-words text-sm">
                              {readable(field.before, field.field)}
                            </p>
                          </div>
                          <div className="min-w-0 rounded-lg border border-blue-200 bg-blue-50 p-3">
                            <p className="mb-1 text-xs text-blue-700">Atual</p>
                            <p className="whitespace-pre-wrap break-words text-sm">
                              {readable(field.after, field.field)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">
                      Condições comerciais preservadas.
                    </p>
                  )}
                  {data.revision.itemsChanged ? (
                    <div>
                      <h4 className="font-medium">Itens alterados</h4>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {[
                          ["Anterior", data.revision.previousItems],
                          ["Atual", data.revision.currentItems],
                        ].map(([title, rows]) => (
                          <div
                            key={String(title)}
                            className="min-w-0 rounded-lg border border-slate-200 p-3"
                          >
                            <p className="mb-2 text-xs text-slate-500">
                              {String(title)}
                            </p>
                            {(rows as Array<Record<string, unknown>>).map(
                              (row, index) => (
                                <p
                                  key={index}
                                  className="mb-2 break-words text-sm"
                                >
                                  {String(row.description || "Item")} ·{" "}
                                  {String(row.hours ?? row.quantity)} ·{" "}
                                  {new Intl.NumberFormat("pt-BR", {
                                    style: "currency",
                                    currency: "BRL",
                                  }).format(Number(row.totalPrice || 0))}
                                </p>
                              ),
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Itens preservados.</p>
                  )}
                </div>
              </details>
            ) : null}
            <details className="rounded-xl border border-slate-200 p-4">
              <summary className="cursor-pointer font-medium">
                Envios e acessos do cliente
              </summary>
              <p className="mt-3 text-xs text-slate-500">
                Acesso ao link não comprova leitura pelo responsável. O aceite é
                registrado separadamente no andamento da proposta.
              </p>
              {data.deliveries.length ? (
                <div className="mt-3 divide-y divide-slate-200">
                  {data.deliveries.map((delivery) => (
                    <div key={delivery.id} className="py-3 text-sm">
                      <div className="flex flex-wrap gap-2">
                        <DataPill>{commercialLabel(delivery.channel)}</DataPill>
                        <span>{commercialLabel(delivery.status)}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {delivery.sentAt
                          ? `Enviado em ${new Date(delivery.sentAt).toLocaleString("pt-BR")}`
                          : "Envio ainda não confirmado"}
                        {delivery.shareToken?.lastOpenedAt
                          ? ` · Link acessado em ${new Date(delivery.shareToken.lastOpenedAt).toLocaleString("pt-BR")} (${delivery.shareToken.openedCount} acessos)`
                          : " · Sem acesso ao link registrado"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  Nenhum envio registrado.
                </p>
              )}
            </details>
            {status === "WON" ? (
              <div>
                <h3 className="mb-3 font-semibold">Continuidade da venda</h3>
                <p className="mb-3 text-xs text-slate-500">
                  Pendências calculadas a partir dos módulos responsáveis.
                  Atribuir acompanhamento não confirma pagamento, reserva,
                  compra ou agendamento.
                </p>
                {data.handoff.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {data.handoff.map((task) => (
                      <article
                        key={task.step}
                        className="rounded-xl border border-slate-200 p-4"
                      >
                        <h4 className="font-medium">{task.title}</h4>
                        <p className="mt-1 text-sm text-slate-500">
                          {task.department}
                        </p>
                        <p className="mt-2 text-sm">
                          {task.assignment
                            ? `${task.assignment.owner.name} · ${new Date(task.assignment.dueAt).toLocaleString("pt-BR")}`
                            : "Responsável e prazo ainda não definidos"}
                        </p>
                        {data.capabilities.team ? (
                          <details className="mt-3">
                            <summary className="cursor-pointer text-sm text-blue-700">
                              Definir acompanhamento
                            </summary>
                            <AssignTask
                              proposalId={proposalId}
                              task={task}
                              onSaved={reload}
                            />
                          </details>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    Nenhuma pendência identificada pelas regras deste
                    acompanhamento. Consulte os módulos de execução para o
                    andamento completo.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
