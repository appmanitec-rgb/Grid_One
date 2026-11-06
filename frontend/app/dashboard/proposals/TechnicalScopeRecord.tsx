"use client";

import { useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { SectionCard, StatusBanner } from "../components/DashboardPageKit";
import { reviewProposal } from "@/lib/proposal-review";

type Snapshot = {
  version?: number;
  stale?: boolean;
  manuallyEdited?: boolean;
  reviewedAt?: string;
  alerts?: Array<{ code: string; message: string; severity: string }>;
  operationalConditions?: Array<{ code: string; text: string }>;
};
type Version = { id: string; version: number; text: string; createdAt: string };
export default function TechnicalScopeRecord({
  proposalId,
  scope,
  snapshot,
}: {
  proposalId: string;
  scope?: string | null;
  snapshot?: Snapshot | null;
}) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const technicalIssues = reviewProposal({
    items: [],
    scopeSnapshot: snapshot,
  }).issues.filter((issue) => issue.origin === "scope");
  if (!scope && !snapshot) return null;
  async function history() {
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch(
        `/proposals/${proposalId}/technical-scope/history`,
        { cache: "no-store" },
      );
      if (!response.ok)
        throw new Error(
          await readApiErrorMessage(
            response,
            "Não foi possível carregar as versões.",
          ),
        );
      setVersions((await response.json()) as Version[]);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Erro ao carregar as versões.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SectionCard
      title="Escopo técnico"
      description={
        snapshot
          ? `Versão ${snapshot.version || 1}${snapshot.manuallyEdited ? " · Com ajustes manuais" : ""}`
          : "Texto da proposta"
      }
    >
      {snapshot?.stale ? (
        <StatusBanner tone="amber">
          Os itens ou o equipamento mudaram após a revisão técnica. Revise o
          escopo no rascunho.
        </StatusBanner>
      ) : null}
      <p className="whitespace-pre-wrap text-sm leading-7">
        {scope || "Sem texto aplicado."}
      </p>
      {snapshot?.operationalConditions?.length ? (
        <div className="mt-4 rounded-xl border border-[var(--border)] p-4">
          <h3 className="text-sm font-semibold">Condições de execução</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            A contratação não substitui a autorização operacional, registrada na
            O.S.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {snapshot.operationalConditions.map((condition) => (
              <li key={condition.code}>{condition.text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {technicalIssues.length ? (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold">
            Conferência técnica ·{" "}
            {
              technicalIssues.filter((issue) => issue.severity === "error")
                .length
            }{" "}
            erro(s) ·{" "}
            {
              technicalIssues.filter((issue) => issue.severity === "warning")
                .length
            }{" "}
            aviso(s)
          </summary>
          <ul className="mt-2 space-y-2">
            {technicalIssues.map((issue, index) => (
              <li key={issue.code + index}>
                {issue.severity === "error" ? "Correção necessária" : "Aviso"} ·{" "}
                {issue.description}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {snapshot ? (
        <button
          type="button"
          className="app-button app-button-secondary mt-4"
          disabled={busy}
          onClick={() => void history()}
        >
          {busy ? "Carregando versões..." : "Histórico do escopo"}
        </button>
      ) : null}
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {versions ? (
        <div className="mt-4 space-y-3">
          {versions.slice(page * 10, page * 10 + 10).map((version) => (
            <details
              key={version.id}
              className="rounded-xl border border-[var(--border)] p-3"
            >
              <summary className="cursor-pointer text-sm font-semibold">
                Versão {version.version} ·{" "}
                {new Date(version.createdAt).toLocaleString("pt-BR")}
              </summary>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
                {version.text}
              </p>
            </details>
          ))}
          {versions.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              Esta revisão comercial herdou o escopo anterior. Novas
              conferências serão registradas aqui.
            </p>
          ) : null}
          {versions.length > 10 ? (
            <div className="flex items-center gap-3">
              <button
                className="app-button app-button-secondary"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </button>
              <span className="text-xs">
                {page + 1} de {Math.ceil(versions.length / 10)}
              </span>
              <button
                className="app-button app-button-secondary"
                disabled={(page + 1) * 10 >= versions.length}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </SectionCard>
  );
}
