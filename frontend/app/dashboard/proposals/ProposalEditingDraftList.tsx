"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
type Draft = { id: string; label: string; step: number; updatedAt: string };
export default function ProposalEditingDraftList() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void apiFetch("/proposals/editor/context", { signal: controller.signal })
      .then(async (response) => (response.ok ? response.json() : null))
      .then(async (context) => {
        if (context?.enabled) {
          const response = await apiFetch("/proposals/editor/drafts", {
            cache: "no-store",
            signal: controller.signal,
          });
          if (response.ok) setDrafts((await response.json()) as Draft[]);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  if (!drafts.length) return null;
  return (
    <details className="dashboard-create-panel">
      <summary>Rascunhos em edição · {drafts.length}</summary>
      <div className="p-3">
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Preenchimentos salvos antes de concluir a proposta. Nenhum deles é
          publicado automaticamente.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {drafts.map((draft) => (
            <Link
              key={draft.id}
              href={"/dashboard/proposals/new?editingDraft=" + draft.id}
              className="rounded-lg border border-[var(--border)] p-3 text-sm hover:bg-[var(--surface-muted)]"
            >
              <strong>{draft.label}</strong>
              <span className="mt-1 block text-xs text-[var(--text-muted)]">
                Etapa {draft.step + 1} ·{" "}
                {new Date(draft.updatedAt).toLocaleString("pt-BR")}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </details>
  );
}
