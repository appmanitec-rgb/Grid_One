"use client";

import { useEffect, useRef, useState } from "react";
import {
  previewTechnicalScope,
  technicalScopeRequestFingerprint,
  technicalScopeSnapshotMatchesRequest,
  type TechnicalScopePreview,
  type TechnicalScopeRequest,
  type TechnicalScopeReview,
} from "@/lib/technical-scopes";
import EditOverlay from "../components/EditOverlay";
import { InterfaceIcon } from "../components/InterfaceIcon";
import { StatusBanner } from "../components/DashboardPageKit";

export type TechnicalScopeGeneratorProps = {
  request: TechnicalScopeRequest;
  scope: string;
  onApply: (text: string, review: TechnicalScopeReview) => void;
  snapshot?: unknown;
  canGenerate?: boolean;
  /** Notifies edits to the preview; does not apply them to the proposal. */
  onManualChange?: (text: string) => void;
};

export default function TechnicalScopeGenerator({
  request,
  scope,
  onApply,
  snapshot,
  canGenerate = true,
  onManualChange,
}: TechnicalScopeGeneratorProps) {
  const [preview, setPreview] = useState<TechnicalScopePreview | null>(null);
  const [previewRequestKey, setPreviewRequestKey] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"apply" | "regenerate" | null>(null);
  const controller = useRef<AbortController | null>(null);
  const requestKey = technicalScopeRequestFingerprint(request);
  const stale = Boolean(preview && previewRequestKey !== requestKey);
  const savedSnapshot =
    snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
      ? (snapshot as Record<string, unknown>)
      : null;
  const savedStale =
    savedSnapshot?.stale === true ||
    savedSnapshot?.isStale === true ||
    !technicalScopeSnapshotMatchesRequest(snapshot, request);
  useEffect(() => () => controller.current?.abort(), []);

  async function generate() {
    if (!canGenerate || busy || request.items.length === 0) return;
    setDialog(null);
    setBusy(true);
    setError("");
    setNotice("");
    controller.current?.abort();
    const activeController = new AbortController();
    controller.current = activeController;
    try {
      const result = await previewTechnicalScope(
        request,
        activeController.signal,
      );
      if (activeController.signal.aborted) return;
      setPreview(result);
      setText(result.generatedText);
      setPreviewRequestKey(requestKey);
    } catch (reason) {
      if (!activeController.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível gerar a prévia técnica.",
        );
    } finally {
      if (!activeController.signal.aborted) setBusy(false);
    }
  }

  function requestGeneration() {
    if (preview && text.trim() !== preview.generatedText.trim())
      setDialog("regenerate");
    else void generate();
  }

  function safeReplacement(): string | null {
    if (!scope.trim()) return text;
    if (scope.includes(text.trim())) return scope;
    const baseline =
      typeof savedSnapshot?.generatedText === "string"
        ? savedSnapshot.generatedText
        : "";
    if (baseline && scope.includes(baseline))
      return scope.replace(baseline, text);
    return null;
  }

  function requestApplication() {
    const replacement = safeReplacement();
    if (replacement === null) setDialog("apply");
    else apply("safe", replacement);
  }

  function apply(mode: "replace" | "append" | "safe", replacement?: string) {
    if (!preview || stale || busy || !canGenerate || !text.trim()) return;
    const appliedText =
      mode === "safe"
        ? (replacement ?? text)
        : mode === "append" && scope.trim() && !scope.includes(text.trim())
          ? [scope.trim(), text.trim()].join("\n\n")
          : mode === "append" && scope.includes(text.trim())
            ? scope
            : text;
    onApply(appliedText, {
      sourceHash: preview.sourceHash,
      libraryHash: preview.libraryHash,
      reviewed: true,
    });
    setDialog(null);
    setNotice(
      "Prévia aplicada ao escopo. Salve a proposta para registrar a revisão.",
    );
  }

  const sourceName = (key: string) =>
    preview?.sources.find((source) => source.key === key)?.description || key;
  return (
    <section
      className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--foreground)] sm:p-5"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h3 className="text-base font-semibold">Escopo da proposta</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
            Gere uma prévia com os itens da proposta e os procedimentos
            cadastrados. Confira o texto e as pendências antes de aplicar.
          </p>
        </div>
        {canGenerate ? (
          <button
            type="button"
            onClick={requestGeneration}
            disabled={busy || request.items.length === 0}
            className="app-button app-button-secondary"
          >
            <InterfaceIcon
              name="refresh"
              className={busy ? "h-4 w-4 motion-safe:animate-spin" : "h-4 w-4"}
            />
            {busy
              ? "Gerando prévia..."
              : preview
                ? "Atualizar prévia"
                : "Gerar escopo técnico"}
          </button>
        ) : null}
      </div>
      {!request.items.length ? (
        <p className="text-sm text-[var(--text-muted)]">
          Adicione os itens da proposta para gerar o escopo.
        </p>
      ) : null}
      {scope.trim() && !preview ? (
        <p className="text-xs leading-5 text-[var(--text-muted)]">
          {savedSnapshot?.sourceHash
            ? "O escopo técnico salvo será preservado enquanto você revisa uma nova prévia."
            : "O texto já informado será preservado até você aplicar a prévia."}
        </p>
      ) : null}
      {stale || (savedStale && !preview) ? (
        <StatusBanner tone="amber">
          Os itens ou o equipamento foram alterados. Gere uma nova prévia e
          revise o escopo antes de aplicar.
        </StatusBanner>
      ) : null}
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {notice ? <StatusBanner tone="emerald">{notice}</StatusBanner> : null}
      {preview ? (
        <div className="space-y-4">
          {preview.alerts.length ? (
            <details
              className="rounded-xl border border-[var(--border)] p-4"
              open={preview.alerts.some((alert) => alert.severity === "error")}
            >
              <summary className="cursor-pointer text-sm font-semibold">
                Conferência técnica ·{" "}
                {
                  preview.alerts.filter((alert) => alert.severity === "error")
                    .length
                }{" "}
                pendências ·{" "}
                {
                  preview.alerts.filter((alert) => alert.severity !== "error")
                    .length
                }{" "}
                avisos
              </summary>
              <ul className="mt-3 space-y-2 text-sm text-[var(--text-muted)]">
                {Array.from(
                  new Map(
                    preview.alerts.map((alert) => [
                      alert.code + alert.message,
                      alert,
                    ]),
                  ).values(),
                )
                  .filter(
                    (alert) =>
                      alert.code !== "OPERATIONAL_AUTHORIZATION_PENDING" &&
                      !preview.operationalConditions.some(
                        (condition) => condition.code === alert.code,
                      ),
                  )
                  .map((alert, index) => (
                    <li key={alert.code + index}>
                      <span className="font-medium">
                        {alert.severity === "error"
                          ? "Corrigir: "
                          : "Conferir: "}
                      </span>
                      {alert.message}
                      {alert.sourceKeys?.length ? (
                        <span className="block text-xs">
                          {alert.sourceKeys.map(sourceName).join("; ")}
                        </span>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </details>
          ) : null}
          <label className="block text-sm font-medium">
            <span className="mb-2 block">Prévia editável</span>
            <textarea
              rows={14}
              value={text}
              disabled={!canGenerate || busy}
              onChange={(event) => {
                setText(event.target.value);
                setNotice("");
                onManualChange?.(event.target.value);
              }}
              className="app-input w-full border p-3 text-sm leading-6"
              aria-describedby="technical-scope-preview-help"
            />
          </label>
          <p
            id="technical-scope-preview-help"
            className="text-xs leading-5 text-[var(--text-muted)]"
          >
            Editar esta prévia não altera o escopo da proposta. Use Revisar e
            aplicar quando terminar a conferência.
          </p>
          {preview.sections.length ? (
            <details className="rounded-xl border border-[var(--border)] p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Seções e origem das atividades
              </summary>
              <div className="mt-3 space-y-4">
                {preview.sections.map((section) => (
                  <section key={section.id}>
                    <h4 className="text-sm font-semibold">{section.title}</h4>
                    <ul className="mt-2 space-y-2">
                      {section.activities.map((activity) => (
                        <li
                          key={activity.id}
                          className="rounded-lg bg-[var(--surface-soft)] p-3 text-sm"
                        >
                          <p>{activity.text}</p>
                          {activity.auxiliary ? (
                            <p className="mt-1 text-xs text-[var(--text-muted)]">
                              Procedimento auxiliar
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            Origem:{" "}
                            {activity.sourceKeys.map(sourceName).join("; ") ||
                              "Procedimento técnico cadastrado"}
                          </p>
                          {activity.procedureCodes.length ? (
                            <p className="mt-1 text-xs text-[var(--text-muted)]">
                              Procedimentos:{" "}
                              {activity.procedureCodes.join(", ")}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </details>
          ) : null}
          {preview.operationalConditions.length ? (
            <details
              className="rounded-xl border border-[var(--border)] p-3"
              open
            >
              <summary className="cursor-pointer text-sm font-medium">
                Condições de execução
              </summary>
              <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
                A contratação do serviço não substitui a autorização
                operacional.
              </p>
              <ul className="mt-3 space-y-2">
                {preview.operationalConditions.map((condition, index) => (
                  <li key={condition.code + index} className="text-sm">
                    <span className="mr-2 text-xs font-semibold text-[var(--text-muted)]">
                      {condition.status === "PENDING"
                        ? "Pendente"
                        : condition.status === "INCLUDED"
                          ? "Previsto no escopo"
                          : "Não incluído"}
                    </span>
                    {condition.text}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <details className="rounded-xl border border-[var(--border)] p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Procedimentos e versões utilizados
            </summary>
            {preview.procedures.length ? (
              <ul className="mt-3 space-y-2">
                {preview.procedures.map((procedure) => (
                  <li key={procedure.code} className="text-sm">
                    <span className="font-medium">{procedure.name}</span>
                    <span className="ml-2 text-xs text-[var(--text-muted)]">
                      {procedure.code} · Versão {procedure.version}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Nenhum procedimento de execução associado. Confira o
                fornecimento e os alertas da prévia.
              </p>
            )}
          </details>
          {canGenerate ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
              <p className="text-xs text-[var(--text-muted)]">
                As quantidades e os itens comerciais permanecem como
                cadastrados.
              </p>
              <button
                type="button"
                disabled={busy || stale || !text.trim()}
                onClick={requestApplication}
                className="app-button app-button-primary"
              >
                <InterfaceIcon name="check" />
                Revisar e aplicar
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {dialog ? (
        <EditOverlay
          open
          title={
            dialog === "apply"
              ? "Aplicar escopo revisado"
              : "Gerar outra prévia"
          }
          eyebrow="Escopo técnico"
          closeLabel="Fechar revisão de escopo"
          onClose={() => setDialog(null)}
        >
          <div className="space-y-4 text-[var(--foreground)]">
            {dialog === "apply" ? (
              <>
                <p className="text-sm leading-6">
                  O escopo atual contém edições que não podem ser combinadas
                  automaticamente. Nada será alterado até você escolher como
                  aplicar a prévia.
                </p>
                <p className="text-xs leading-5 text-[var(--text-muted)]">
                  Adicionar mantém seu texto e inclui a prévia ao final.
                  Substituir troca o texto existente pela prévia.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="app-button app-button-primary"
                    onClick={() => apply("append")}
                    disabled={stale || busy}
                  >
                    Adicionar preservando texto
                  </button>
                  <button
                    type="button"
                    className="app-button app-button-secondary"
                    onClick={() => apply("replace")}
                    disabled={stale || busy}
                  >
                    Substituir escopo
                  </button>
                  <button
                    type="button"
                    className="app-button app-button-ghost"
                    onClick={() => setDialog(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm leading-6">
                  Você editou esta prévia. Gerar outra descarta apenas as
                  alterações da prévia; o escopo da proposta continua
                  preservado.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="app-button app-button-primary"
                    onClick={() => void generate()}
                  >
                    Gerar nova prévia
                  </button>
                  <button
                    type="button"
                    className="app-button app-button-secondary"
                    onClick={() => setDialog(null)}
                  >
                    Manter edição
                  </button>
                </div>
              </>
            )}
          </div>
        </EditOverlay>
      ) : null}
    </section>
  );
}
