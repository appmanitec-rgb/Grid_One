"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { decodeJwtPayload, getStoredAccessToken } from "@/lib/auth-session";
import type { ExpenseReviewRule } from "@/lib/proposal-review";
import {
  persistDraftBackup,
  recoverEditingDraft,
  type EditingDraft as Draft,
  type DraftBackup,
} from "./draft-recovery";
type Context = {
  enabled: boolean;
  discountLimit: number;
  unrestricted: boolean;
  expenseRules: ExpenseReviewRule[];
};
export function useProposalEditingDraft(
  data: Record<string, unknown>,
  onRestore: (data: Record<string, unknown>) => void,
  ready = true,
) {
  const [context, setContext] = useState<Context | null>(null),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false),
    [loaded, setLoaded] = useState(false);
  const enabled = Boolean(
    context?.enabled && data.proposalFormType === "PARTS_AND_SERVICES",
  );
  const identity = useRef({ id: "", revision: 0 });
  const completed = useRef(false);
  const preferServer = useRef(false);
  const [recoveryConflict, setRecoveryConflict] = useState(false);
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const lastSaved = useRef("");
  const request = useRef<{ signature: string; key: string } | null>(null);
  const pending = useRef<Promise<Draft> | null>(null);
  const metrics = useRef({ clicks: 0, edits: 0 });
  const dataRef = useRef(data);
  const serialized = JSON.stringify(data);
  const restoreRef = useRef(onRestore);
  useEffect(() => {
    dataRef.current = data;
    restoreRef.current = onRestore;
  });
  const localKey = useRef("");
  useEffect(() => {
    const controller = new AbortController();
    void apiFetch("/proposals/editor/context", { signal: controller.signal })
      .then(async (response) => {
        if (response.ok) setContext((await response.json()) as Context);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!enabled || !ready || loaded) return;
    let active = true;
    const url = new URL(window.location.href);
    const payload = decodeJwtPayload(getStoredAccessToken() || "");
    const remoteId = url.searchParams.get("editingDraft");
    identity.current = { id: remoteId || crypto.randomUUID(), revision: 0 };
    localKey.current =
      "manitec:proposal-editor:" +
      String(payload?.sub || "current") +
      ":" +
      identity.current.id;
    url.searchParams.set("editingDraft", identity.current.id);
    window.history.replaceState(null, "", url);
    async function load() {
      let recovered = false;
      try {
        let backup: string | null = null;
        try {
          backup = localStorage.getItem(localKey.current);
        } catch {
          setMessage(
            "A cópia neste navegador não está disponível. Use Salvar rascunho antes de sair.",
          );
        }
        const saved = backup ? (JSON.parse(backup) as DraftBackup) : null;
        if (remoteId) {
          const response = await apiFetch(
            "/proposals/editor/drafts/" + remoteId,
            { cache: "no-store" },
          );
          if (response.status === 404 && saved?.formData) {
            identity.current = { id: saved.id, revision: saved.revision || 0 };
            restoreRef.current(saved.formData);
            setMessage(
              "Preenchimento recuperado neste navegador. Salve o rascunho no sistema.",
            );
            recovered = true;
            return;
          }
          if (response.status === 404) {
            recovered = true;
            return;
          } // Local-only draft with no server copy yet.
          if (!response.ok)
            throw new Error(
              await readApiErrorMessage(
                response,
                "Não foi possível recuperar o rascunho.",
              ),
            );
          const draft = (await response.json()) as Draft;
          if (!active) return;
          const recovery = recoverEditingDraft(
            draft,
            saved,
            preferServer.current,
          );
          preferServer.current = false;
          identity.current = { id: recovery.id, revision: recovery.revision };
          restoreRef.current(recovery.formData);
          setRecoveryConflict(recovery.conflict);
          lastSaved.current = JSON.stringify(draft.formData);
          setMessage(
            recovery.conflict
              ? "Outra aba salvou uma versão diferente. Sua edição local continua na tela e não substituirá a versão do sistema. Reabra a versão do sistema para continuar; a edição local será conservada em uma cópia separada."
              : "Rascunho recuperado do sistema.",
          );
        } else {
          if (saved?.id && saved.formData) {
            identity.current = { id: saved.id, revision: saved.revision || 0 };
            restoreRef.current(saved.formData);
            setMessage(
              "Preenchimento recuperado neste navegador. Salve para confirmar a versão no sistema.",
            );
          }
        }
        recovered = true;
      } catch (reason) {
        if (active)
          setMessage(
            reason instanceof Error
              ? reason.message
              : "Falha na recuperação do rascunho.",
          );
      } finally {
        if (active && recovered) {
          if (!identity.current.id) identity.current.id = crypto.randomUUID();
          setLoaded(true);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [enabled, ready, loaded, recoveryAttempt]);
  useEffect(() => {
    if (!enabled || !loaded || !localKey.current) return;
    const timer = window.setTimeout(() => {
      try {
        persistDraftBackup(
          localStorage,
          localKey.current,
          { ...identity.current, formData: dataRef.current },
          completed.current,
        );
      } catch {
        setMessage(
          "A cópia neste navegador não pôde ser gravada. Salve o rascunho no sistema antes de sair.",
        );
      }
    }, 600);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      try {
        persistDraftBackup(
          localStorage,
          localKey.current,
          { ...identity.current, formData: dataRef.current },
          completed.current,
        );
      } catch {
        if (JSON.stringify(dataRef.current) !== lastSaved.current) {
          event.preventDefault();
          event.returnValue = "";
        }
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeunload", beforeUnload);
      // Also preserve the last keystroke when navigating through a client-side link.
      try {
        persistDraftBackup(
          localStorage,
          localKey.current,
          { ...identity.current, formData: dataRef.current },
          completed.current,
        );
      } catch {
        /* The visible save warning remains authoritative. */
      }
    };
  }, [serialized, enabled, loaded]);
  const save = useCallback(
    async (overrides?: Record<string, unknown>) => {
      if (pending.current) return pending.current;
      if (!enabled || !loaded)
        throw new Error("A gravação do rascunho ainda não está disponível.");
      const current = { ...dataRef.current, ...overrides },
        signature = JSON.stringify(current);
      if (!request.current || request.current.signature !== signature)
        request.current = { signature, key: crypto.randomUUID() };
      const execute = async () => {
        setSaving(true);
        setMessage("");
        try {
          const response = await apiFetch(
            "/proposals/editor/drafts/" + identity.current.id,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                revision: identity.current.revision,
                requestKey: request.current!.key,
                proposalId: current.editingProposalId || undefined,
                formData: current,
                ...metrics.current,
              }),
            },
          );
          if (!response.ok)
            throw new Error(
              await readApiErrorMessage(
                response,
                "Não foi possível salvar o rascunho.",
              ),
            );
          const draft = (await response.json()) as Draft;
          identity.current = { id: draft.id, revision: draft.revision };
          lastSaved.current = signature;
          request.current = null;
          try {
            localStorage.setItem(
              localKey.current,
              JSON.stringify({
                ...identity.current,
                formData: { ...dataRef.current, ...overrides },
              }),
            );
          } catch {
            /* The server copy is already safe. */
          }
          const url = new URL(window.location.href);
          url.searchParams.set("editingDraft", draft.id);
          window.history.replaceState(null, "", url);
          setMessage(
            "Rascunho salvo no sistema às " +
              new Date(draft.updatedAt).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              }) +
              ".",
          );
          return draft;
        } catch (reason) {
          setMessage(
            reason instanceof Error
              ? reason.message
              : "Falha ao salvar. Seu preenchimento continua na tela.",
          );
          throw reason;
        } finally {
          setSaving(false);
          pending.current = null;
        }
      };
      pending.current = execute();
      return pending.current;
    },
    [enabled, loaded],
  );
  const complete = useCallback(() => {
    completed.current = true;
    try {
      localStorage.removeItem(localKey.current);
    } catch {
      /* Server draft is retained. */
    }
  }, []);
  const retryRecovery = useCallback(() => {
    if (recoveryConflict) {
      try {
        localStorage.setItem(
          localKey.current + ":conflict",
          JSON.stringify({ ...identity.current, formData: dataRef.current }),
        );
      } catch {
        setMessage(
          "A edição local não pôde ser preservada. Copie os ajustes antes de reabrir a versão do sistema.",
        );
        return;
      }
      preferServer.current = true;
      setLoaded(false);
    }
    setMessage("Tentando recuperar o rascunho...");
    setRecoveryAttempt((attempt) => attempt + 1);
  }, [recoveryConflict]);
  return {
    context,
    enabled,
    loaded,
    saving,
    message,
    save,
    metrics,
    complete,
    retryRecovery,
    recoveryConflict,
  };
}
