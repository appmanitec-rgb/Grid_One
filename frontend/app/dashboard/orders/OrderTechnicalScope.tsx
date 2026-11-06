"use client";
import { useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { SectionCard, StatusBanner } from "../components/DashboardPageKit";

type Condition = { code: string; text: string; allowedLoadModes?: string[] };
type Authorization = {
  status?: string;
  responsibleName?: string;
  note?: string;
  recordedAt?: string;
  loadMode?: string;
};
export default function OrderTechnicalScope({
  id,
  checklist,
  canEdit,
  onSaved,
}: {
  id: string;
  checklist?: Record<string, unknown> | null;
  canEdit: boolean;
  onSaved: () => Promise<void>;
}) {
  const source = checklist?.technicalScope as
    | {
        version?: number;
        scopeText?: string;
        operationalConditions?: Condition[];
      }
    | undefined;
  const authorizations = (checklist?.technicalScopeAuthorizations ||
    {}) as Record<string, Authorization>;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!source) return null;
  async function save(
    event: React.FormEvent<HTMLFormElement>,
    condition: Condition,
  ) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await apiFetch(
        `/maintenance-orders/${id}/technical-authorizations`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conditionCode: condition.code,
            status: form.get("status"),
            responsibleName: form.get("responsibleName"),
            note: form.get("note"),
            ...(condition.allowedLoadModes?.length
              ? { loadMode: form.get("loadMode") || undefined }
              : {}),
          }),
        },
      );
      if (!response.ok)
        throw new Error(
          await readApiErrorMessage(
            response,
            "Não foi possível registrar a autorização.",
          ),
        );
      await onSaved();
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Erro ao registrar a autorização.",
      );
    } finally {
      setBusy(false);
    }
  }
  const field =
    "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm";
  return (
    <SectionCard
      title="Escopo aprovado e condições de execução"
      description={`Versão técnica ${source.version || 1}. Os registros de execução preservam o que foi vendido.`}
    >
      <details>
        <summary className="cursor-pointer text-sm font-semibold">
          Consultar escopo contratado
        </summary>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
          {source.scopeText}
        </p>
      </details>
      <div className="mt-4 space-y-4">
        {(source.operationalConditions || []).map((condition) => {
          const saved = authorizations[condition.code] || {};
          return (
            <div
              className="rounded-xl border border-[var(--border)] p-4"
              key={condition.code}
            >
              <p className="text-sm font-semibold">{condition.text}</p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {saved.status === "AUTHORIZED"
                  ? "Autorizado"
                  : saved.status === "NOT_AUTHORIZED"
                    ? "Não autorizado"
                    : "Pendente de autorização"}
                {saved.responsibleName ? ` · ${saved.responsibleName}` : ""}
                {saved.recordedAt
                  ? ` · ${new Date(saved.recordedAt).toLocaleString("pt-BR")}`
                  : ""}
              </p>
              {saved.note ? <p className="mt-2 text-sm">{saved.note}</p> : null}
              {canEdit ? (
                <form
                  onSubmit={(event) => void save(event, condition)}
                  className="mt-3 grid gap-3 sm:grid-cols-2"
                >
                  <label className="space-y-1 text-xs">
                    Situação
                    <select
                      name="status"
                      defaultValue={saved.status || "PENDING"}
                      className={field}
                    >
                      <option value="PENDING">Pendente</option>
                      <option value="AUTHORIZED">Autorizado</option>
                      <option value="NOT_AUTHORIZED">Não autorizado</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-xs">
                    Responsável pela autorização
                    <input
                      name="responsibleName"
                      maxLength={200}
                      defaultValue={saved.responsibleName || ""}
                      className={field}
                    />
                  </label>
                  {condition.allowedLoadModes?.length ? (
                    <label className="space-y-1 text-xs">
                      Modalidade contratada
                      <select
                        name="loadMode"
                        defaultValue={saved.loadMode || ""}
                        className={field}
                      >
                        <option value="">Confirme a modalidade</option>
                        {condition.allowedLoadModes.map((mode) => (
                          <option key={mode} value={mode}>
                            {mode === "LOAD_BANK"
                              ? "Banco de cargas"
                              : "Carga da instalação"}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="space-y-1 text-xs sm:col-span-2">
                    Registro operacional / motivo da não autorização
                    <textarea
                      name="note"
                      maxLength={3000}
                      defaultValue={saved.note || ""}
                      className={field}
                      rows={2}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={busy}
                    className="app-button app-button-secondary justify-self-start"
                  >
                    {busy ? "Registrando..." : "Registrar condição"}
                  </button>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>
      {message ? <StatusBanner tone="rose">{message}</StatusBanner> : null}
    </SectionCard>
  );
}
