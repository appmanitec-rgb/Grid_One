"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, apiUrl, readApiErrorMessage } from "@/lib/api";

export default function ApproveButton({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const [isApproving, setIsApproving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  async function handleApprove() {
    setIsApproving(true);
    setFeedback(null);

    try {
      const res = await apiFetch(apiUrl(`/proposals/${proposalId}/approve`), {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(res, "Nao foi possivel aprovar a proposta."),
        );
      }

      setFeedback({
        kind: "success",
        text: "Proposta aprovada e ordem de servico enviada para a fila.",
      });
      setIsConfirming(false);
      router.refresh();
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Erro de comunicacao com o servidor.",
      });
    } finally {
      setIsApproving(false);
    }
  }

  return (
    <div className="mr-4 space-y-2 opacity-0 transition-opacity group-hover:opacity-100">
      {isConfirming ? (
        <div className="rounded-lg border border-emerald-200 bg-white p-3 shadow-sm">
          <p className="text-xs text-zinc-600">
            Aprovar esta proposta tambem pode gerar OS automatica.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleApprove()}
              disabled={isApproving}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {isApproving ? "Aprovando..." : "Confirmar"}
            </button>
            <button
              type="button"
              onClick={() => setIsConfirming(false)}
              disabled={isApproving}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setFeedback(null);
            setIsConfirming(true);
          }}
          disabled={isApproving}
          className="text-sm font-semibold text-emerald-600 hover:text-emerald-500 hover:underline disabled:opacity-50"
        >
          {isApproving ? "Aprovando..." : "Aprovar"}
        </button>
      )}

      {feedback ? (
        <p
          className={`rounded-md px-2.5 py-2 text-xs ${
            feedback.kind === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
