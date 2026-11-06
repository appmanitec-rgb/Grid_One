"use client";
import { useState } from "react";
import type { ReviewIssue, ReviewAcknowledgement } from "@/lib/proposal-review";
const groups = [
  { id: "commercial", label: "Dados comerciais" },
  { id: "items", label: "Itens e quantidades" },
  { id: "scope", label: "Serviços e escopo" },
  { id: "expenses", label: "Despesas" },
  { id: "payment", label: "Pagamento" },
  { id: "discount", label: "Descontos e alçadas" },
  { id: "document", label: "Documento" },
];
export default function ProposalConference({
  issues,
  acknowledgements,
  onAcknowledge,
  onNavigate,
  busy = false,
  documentRendered = false,
  error = "",
  onRetry,
}: {
  issues: ReviewIssue[];
  acknowledgements: ReviewAcknowledgement[];
  onAcknowledge: (value: ReviewAcknowledgement) => void;
  onNavigate: (issue: ReviewIssue) => void;
  busy?: boolean;
  documentRendered?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const resolved = (issue: ReviewIssue) =>
    issue.requiresReason &&
    acknowledgements.some(
      (ack) =>
        ack.code === issue.code &&
        ack.signature === issue.signature &&
        ack.reason.trim().length >= 8,
    );
  const errors = issues.filter(
    (issue) => issue.severity === "error" && !resolved(issue),
  ).length;
  const warnings = issues.filter(
    (issue) => issue.severity === "warning" && !resolved(issue),
  ).length;
  return (
    <section
      className="proposal-form-section space-y-4"
      aria-label="Conferência da proposta"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Conferência da proposta</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {error
              ? "A conferência não foi concluída. Seu preenchimento foi preservado."
              : busy
                ? "Conferindo com os cadastros do sistema..."
                : errors
                  ? "Corrija as pendências antes de liberar a proposta."
                  : warnings
                    ? "Confira os avisos antes de solicitar aprovação."
                    : "Pronta para solicitar aprovação."}
          </p>
        </div>
        <span role="status" className="text-sm font-semibold">
          {error
            ? "Conferência indisponível"
            : busy
              ? "Conferindo…"
              : `${errors} erro(s) · ${warnings} aviso(s) · ${issues.filter(resolved).length} ressalva(s) reconhecida(s)`}
        </span>
      </div>
      {error ? (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-[var(--border)] p-3"
        >
          <p>{error}</p>
          <button
            type="button"
            className="app-button app-button-secondary"
            onClick={onRetry}
          >
            Tentar conferência novamente
          </button>
        </div>
      ) : null}
      {groups.map((group) => {
        const entries = issues.filter((issue) => issue.group === group.id);
        return (
          <details
            key={group.id}
            open={entries.some((issue) => !resolved(issue))}
            className="rounded-xl border border-[var(--border)] p-3"
          >
            <summary className="cursor-pointer text-sm font-semibold">
              {group.label}
              <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
                {entries.length
                  ? `${entries.filter((issue) => issue.severity === "error" && !resolved(issue)).length} erro(s) · ${entries.filter((issue) => issue.severity === "warning" && !resolved(issue)).length} aviso(s)${entries.some(resolved) ? ` · ${entries.filter(resolved).length} reconhecida(s)` : ""}`
                  : error
                    ? "Não validado"
                    : busy
                      ? "Conferindo…"
                      : group.id === "document"
                        ? documentRendered
                          ? "Prévia renderizada"
                          : "Prévia ainda não renderizada"
                        : "Sem pendências"}
              </span>
            </summary>
            <div className="mt-3 space-y-3">
              {!entries.length ? (
                <p className="text-sm text-[var(--text-muted)]">
                  {group.id === "document" && !documentRendered
                    ? "Os dados documentais não têm pendências detectadas. Abra a prévia e confira a renderização e o conteúdo."
                    : "Nenhuma pendência identificada nesta conferência."}
                </p>
              ) : (
                entries.map((issue, index) => (
                  <div
                    key={issue.code + issue.signature + index}
                    className={
                      "rounded-lg border border-[var(--border)] p-3 " +
                      (resolved(issue) ? "opacity-70" : "")
                    }
                  >
                    <p className="text-sm font-semibold">
                      {resolved(issue)
                        ? "Conferido · "
                        : issue.severity === "error"
                          ? "Correção necessária · "
                          : "Atenção · "}
                      {issue.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                      {issue.description}
                    </p>
                    <button
                      type="button"
                      className="app-button app-button-secondary mt-2"
                      onClick={() => onNavigate(issue)}
                    >
                      {issue.action}
                    </button>
                    {issue.requiresReason && !resolved(issue) ? (
                      <div className="mt-3 space-y-2">
                        <label className="block text-xs font-medium">
                          Justificativa interna
                          <textarea
                            aria-label={"Justificativa: " + issue.title}
                            maxLength={2000}
                            rows={2}
                            value={reasons[issue.signature] || ""}
                            onChange={(event) =>
                              setReasons((previous) => ({
                                ...previous,
                                [issue.signature]: event.target.value,
                              }))
                            }
                            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-sm"
                          />
                        </label>
                        <button
                          type="button"
                          className="app-button app-button-secondary"
                          disabled={
                            (reasons[issue.signature] || "").trim().length < 8
                          }
                          onClick={() =>
                            onAcknowledge({
                              code: issue.code,
                              signature: issue.signature,
                              reason: reasons[issue.signature].trim(),
                            })
                          }
                        >
                          Registrar conferência
                        </button>
                        <p className="text-xs text-[var(--text-muted)]">
                          A justificativa fica no histórico interno e não
                          aparece no documento do cliente.
                        </p>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </details>
        );
      })}
    </section>
  );
}
