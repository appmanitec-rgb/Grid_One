"use client";
import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import type { DashboardOverview } from "@/lib/dashboard-overview";
import {
  DataPill,
  InlineMessage,
  MetricCard,
  PageHeader,
  SectionCard,
} from "../components/DashboardPageKit";
import { SearchLookup } from "../components/SelectField";
const secondary =
  "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const primary =
  "rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50";
const input =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900";
const labels: Record<string, string> = {
  OVERDUE: "Vencido",
  PARTIAL: "Parcial",
  UNRECONCILED: "Sem conciliar",
  IN_REVIEW: "Em revisão",
  WORK: "Trabalho",
  TRANSIT: "Deslocamento",
  PAUSE: "Pausa",
  MAINTENANCE: "Em manutenção",
  BLOCKED: "Bloqueado",
  PREPARATION: "Em preparação",
  CONSULTING: "Consultando fornecedores",
  OFFERS_RECEIVED: "Ofertas recebidas",
  AWAITING_APPROVAL: "Aguardando aprovação",
  TRIAGE: "Triagem",
  WAITING_CUSTOMER: "Aguardando cliente",
  WAITING_INTERNAL: "Aguardando equipe",
  SCHEDULED: "Programado",
  CONVERTING_TO_ORDER: "Gerando O.S.",

  SENT: "Enviado",
  APPROVED: "Aprovado",
  PARTIALLY_RECEIVED: "Recebido parcialmente",
  RESERVED: "Reservado",
  AWAITING_RESERVATION: "Aguardando reserva",
  EXPIRED: "Vencido",
  EXPIRING: "A vencer",
  DRAFT: "Rascunho",
  AWAITING_ANALYSIS: "Aguardando análise",
  ANALYZED: "Analisada",
  IN_QUOTATION: "Em cotação",
  PARTIALLY_FULFILLED: "Parcialmente atendida",
  OPEN: "Aberta",
  IN_PROGRESS: "Em andamento",
  REVISION: "Em revisão",
};
const displayDate = (date: string) =>
  date.slice(0, 10).split("-").reverse().join("/");
function Field({
  label,
  children,
}: {
  label: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>
      {children(id)}
    </div>
  );
}
function ValidityForm({ onSaved }: { onSaved: () => void }) {
  const [query, setQuery] = useState(""),
    [choices, setChoices] = useState<Array<{ value: string; label: string }>>(
      [],
    ),
    [selected, setSelected] = useState<{ value: string; label: string }>(),
    [lot, setLot] = useState(""),
    [expires, setExpires] = useState(""),
    [notes, setNotes] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [looking, setLooking] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLooking(true);
      void apiFetch(
        "/dashboard/product-options?q=" + encodeURIComponent(query),
        {
          signal: controller.signal,
        },
      )
        .then(async (response) => {
          if (!response.ok)
            throw Error(
              await readApiErrorMessage(
                response,
                "Falha na busca de produtos.",
              ),
            );
          return response.json() as Promise<
            Array<{ id: string; name: string; sku?: string; type: string }>
          >;
        })
        .then((rows) => {
          setChoices(
            rows
              .filter((r) => r.type !== "SERVICE")
              .slice(0, 10)
              .map((r) => ({
                value: r.id,
                label: (r.sku ? r.sku + " · " : "") + r.name,
              })),
          );
          setError("");
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setError(e instanceof Error ? e.message : "Falha ao pesquisar.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLooking(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/dashboard/product-validities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalogItemId: selected?.value,
          lotCode: lot,
          expiresAt: expires,
          notes,
        }),
      });
      if (!response.ok)
        throw Error(
          await readApiErrorMessage(
            response,
            "Não foi possível registrar a validade.",
          ),
        );
      setLot("");
      setExpires("");
      setNotes("");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-blue-700">
        Registrar ou atualizar validade de produto
      </summary>
      <div className="mt-4 space-y-4">
        <p className="text-xs text-slate-500">
          Informe o lote que deseja acompanhar. Este controle registra a
          validade e não movimenta estoque.
        </p>
        {error ? <InlineMessage tone="warning">{error}</InlineMessage> : null}
        <Field label="Produto">
          {(id) => (
            <SearchLookup
              id={id}
              aria-label="Produto"
              value={selected?.value || ""}
              options={choices}
              selected={selected}
              loading={looking}
              onSearch={setQuery}
              onSelect={(value) =>
                setSelected(
                  choices.find((c) => c.value === value) ||
                    (selected?.value === value ? selected : undefined),
                )
              }
              placeholder="Pesquisar produto ou código"
              className={input}
            />
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Lote">
            {(id) => (
              <input
                id={id}
                className={input}
                maxLength={120}
                value={lot}
                onChange={(e) => setLot(e.target.value)}
              />
            )}
          </Field>
          <Field label="Validade">
            {(id) => (
              <input
                id={id}
                className={input}
                type="date"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label="Observação">
          {(id) => (
            <input
              id={id}
              className={input}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
        <button
          className={primary}
          disabled={busy || !selected || !lot.trim() || !expires}
          onClick={() => void save()}
        >
          {busy ? "Salvando..." : "Salvar validade"}
        </button>
      </div>
    </details>
  );
}
export default function DepartmentDashboard({
  data,
  onRefresh,
  loading = false,
  compact = false,
}: {
  data: DashboardOverview;
  onRefresh: () => void;
  loading?: boolean;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  async function act(path: string, key: string, message: string) {
    if (!window.confirm(message)) return;
    setBusy(key);
    setError("");
    try {
      const response = await apiFetch(path, { method: "PATCH" });
      if (!response.ok)
        throw Error(
          await readApiErrorMessage(response, "A ação não foi concluída."),
        );
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar.");
    } finally {
      setBusy("");
    }
  }
  return (
    <div
      className="dashboard-page space-y-5 pb-8"
      data-dashboard-audience={data.audience}
    >
      {compact ? (
        <SectionCard
          title={
            data.audience === "EXECUTIVE"
              ? "Indicadores dos departamentos"
              : "Atividades da área comercial"
          }
          description="Indicadores das áreas autorizadas na visão gerencial."
          actions={
            <button
              className={secondary}
              disabled={loading}
              onClick={onRefresh}
            >
              {loading ? "Atualizando..." : "Atualizar setores"}
            </button>
          }
        >
          {null}
        </SectionCard>
      ) : (
        <PageHeader
          eyebrow={data.department || "Meu painel"}
          title={data.title}
          description={data.description}
          actions={
            <button
              className={secondary}
              disabled={loading}
              onClick={onRefresh}
            >
              {loading ? "Atualizando..." : "Atualizar dados"}
            </button>
          }
          meta={
            <>
              Atualizado às{" "}
              {new Date(data.generatedAt).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </>
          }
        />
      )}
      {error ? <InlineMessage tone="warning">{error}</InlineMessage> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => {
          const card = (
            <MetricCard
              label={metric.label}
              value={metric.value.toLocaleString("pt-BR")}
              helper={metric.helper}
              tone={metric.tone}
              loading={loading}
            />
          );
          return metric.href ? (
            <Link
              key={metric.id}
              href={metric.href}
              className="min-w-0 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {card}
            </Link>
          ) : (
            <div key={metric.id} className="min-w-0">
              {card}
            </div>
          );
        })}
      </div>
      {!data.metrics.length ? (
        <InlineMessage>
          Seu painel mostra as áreas liberadas para o seu usuário. Utilize os
          atalhos disponíveis para acompanhar suas atividades.
        </InlineMessage>
      ) : null}
      <div className="grid items-start gap-5 xl:grid-cols-2">
        {data.sections.map((section) => (
          <SectionCard
            key={section.id}
            title={section.title}
            description={section.description}
            actions={
              <div className="flex items-center gap-2">
                <DataPill tone={section.total ? "amber" : "slate"}>
                  {section.total.toLocaleString("pt-BR")}
                </DataPill>
                {section.href ? (
                  <Link href={section.href} className={secondary}>
                    Abrir área
                  </Link>
                ) : null}
              </div>
            }
          >
            <div className="divide-y divide-slate-100">
              {section.items.slice(0, 5).map((item) => (
                <article key={item.id} className="py-3 first:pt-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {item.href ? (
                        <Link
                          href={item.href}
                          className="break-words text-sm font-semibold text-blue-700 hover:underline"
                        >
                          {item.title}
                        </Link>
                      ) : (
                        <p className="break-words text-sm font-semibold text-slate-900">
                          {item.title}
                        </p>
                      )}
                      {item.subtitle ? (
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {item.subtitle}
                        </p>
                      ) : null}
                    </div>
                    {item.status ? (
                      <DataPill
                        tone={
                          item.status === "EXPIRED" || item.status === "OVERDUE"
                            ? "rose"
                            : item.status === "RESERVED"
                              ? "emerald"
                              : "slate"
                        }
                      >
                        {labels[item.status] || item.status}
                      </DataPill>
                    ) : null}
                  </div>
                  {item.dueAt ? (
                    <p className="mt-2 text-xs text-slate-500">
                      {["product-validity", "epis", "documents"].includes(
                        section.id,
                      )
                        ? "Validade: "
                        : ["time", "reconciliation", "invoices"].includes(
                              section.id,
                            )
                          ? "Data: "
                          : "Prazo: "}
                      {displayDate(item.dueAt)}
                    </p>
                  ) : null}
                  {section.id === "separation" && data.canSeparate ? (
                    <button
                      className={secondary + " mt-3"}
                      disabled={!!busy || item.status !== "RESERVED"}
                      onClick={() =>
                        void act(
                          "/dashboard/materials/" + item.id + "/separate",
                          item.id,
                          "Confirmar que o material foi conferido e separado para esta O.S.?",
                        )
                      }
                    >
                      {busy === item.id
                        ? "Confirmando..."
                        : "Confirmar separação"}
                    </button>
                  ) : null}
                  {section.id === "product-validity" &&
                  data.canManageValidity ? (
                    <button
                      className="mt-2 text-xs font-semibold text-slate-600 underline disabled:opacity-50"
                      disabled={!!busy}
                      onClick={() =>
                        void act(
                          "/dashboard/product-validities/" + item.id + "/close",
                          item.id,
                          "Encerrar o acompanhamento deste lote? O saldo de estoque será mantido.",
                        )
                      }
                    >
                      Encerrar acompanhamento
                    </button>
                  ) : null}
                </article>
              ))}
              {!section.items.length ? (
                <p className="py-4 text-sm leading-6 text-slate-500">
                  {section.emptyMessage}
                </p>
              ) : null}
            </div>
            {section.items.length >= 5 ? (
              <p className="mt-3 text-xs text-slate-500">
                Exibindo até 5 pendências para priorizar o atendimento.
              </p>
            ) : null}
            {section.notice ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                {section.notice}
              </p>
            ) : null}
            {section.id === "product-validity" && data.canManageValidity ? (
              <ValidityForm onSaved={onRefresh} />
            ) : null}
          </SectionCard>
        ))}
      </div>
      {data.shortcuts.length ? (
        <SectionCard
          title="Atalhos da sua área"
          description="Acessos de acordo com as suas permissões."
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.shortcuts.map((shortcut) => (
              <Link
                key={shortcut.id}
                href={shortcut.href}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-800 transition hover:border-blue-400 hover:text-blue-700"
              >
                {shortcut.label}{" "}
                <span aria-hidden="true" className="float-right">
                  →
                </span>
              </Link>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
