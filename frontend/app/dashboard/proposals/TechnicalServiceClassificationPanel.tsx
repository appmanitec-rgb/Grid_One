"use client";

import { useEffect, useState } from "react";
import {
  previewTechnicalScope,
  technicalScopeRequestFingerprint,
  type TechnicalScopeRequest,
  type TechnicalScopePreview,
  type TechnicalServiceClassification,
} from "@/lib/technical-scopes";
import { TechnicalCodePicker } from "../catalog/TechnicalScopeCatalogPanel";

export default function TechnicalServiceClassificationPanel({
  request,
  onChange,
  disabled = false,
}: {
  request: TechnicalScopeRequest;
  onChange: (value: TechnicalServiceClassification[]) => void;
  disabled?: boolean;
}) {
  const [preview, setPreview] = useState<TechnicalScopePreview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewSourceKey, setPreviewSourceKey] = useState("");
  const key = technicalScopeRequestFingerprint(request);
  const sourceKey = technicalScopeRequestFingerprint({
    ...request,
    technicalScopeClassifications: [],
  });
  useEffect(() => {
    if (!request.items.length) {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      void previewTechnicalScope(request, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) {
            setPreview(value);
            setPreviewSourceKey(sourceKey);
          }
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted)
            setError(
              reason instanceof Error
                ? reason.message
                : "Não foi possível conferir a classificação.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // Serialized request includes quantities, equipment and explicit classifications.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const services = (
    previewSourceKey === sourceKey ? preview?.sources || [] : []
  ).filter((source) =>
    ["SERVICE", "HOURLY", "HOURS", "LABOR"].includes(source.kind),
  );
  const missing = services.filter((source) =>
    (preview?.alerts || []).some(
      (alert) =>
        alert.severity === "error" && alert.sourceKeys?.includes(source.key),
    ),
  ).length;
  function change(
    sourceKey: string,
    value: Omit<TechnicalServiceClassification, "sourceKey">,
  ) {
    const current = request.technicalScopeClassifications || [];
    onChange([
      ...current.filter((row) => row.sourceKey !== sourceKey),
      {
        sourceKey,
        ...value,
        sourceFacts: preview?.sources.find((source) => source.key === sourceKey)
          ?.classificationFacts,
      },
    ]);
  }
  return (
    <section
      id="proposal-service-technical"
      tabIndex={-1}
      className="proposal-form-section space-y-4"
      aria-label="Classificação técnica dos serviços"
      aria-busy={loading}
    >
      <div>
        <h2 className="text-lg font-semibold">
          Finalidade e execução dos serviços
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Confirme o procedimento de cada serviço contratado. Para horas ou
          serviços genéricos, escolha um procedimento ou descreva a execução
          acordada.
        </p>
      </div>
      <p role="status" className="text-sm text-[var(--text-muted)]">
        {loading
          ? "Conferindo itens e procedimentos..."
          : preview
            ? `${preview.sources.filter((source) => source.kind === "MATERIAL").length} materiais · ${services.length - missing} serviços definidos · ${missing} pendências · ${preview.operationalConditions.length} condições de execução`
            : "Adicione um item para conferir o escopo."}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-rose-600">
          {error} Seu preenchimento foi preservado.
        </p>
      ) : null}
      {services.map((source) => {
        const value = request.technicalScopeClassifications?.find(
          (row) => row.sourceKey === source.key,
        );
        const defined =
          !(preview?.alerts || []).some(
            (alert) =>
              alert.severity === "error" &&
              alert.sourceKeys?.includes(source.key),
          ) &&
          (source.procedureCodes.length > 0 ||
            Boolean(source.technical?.manualDescription));
        return (
          <div
            key={source.key}
            className="space-y-3 rounded-xl border border-[var(--border)] p-4"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {source.description} ·{" "}
                {source.hours !== undefined
                  ? `${source.hours} h`
                  : `${source.quantity} un.`}
              </h3>
              <span className="text-xs text-[var(--text-muted)]">
                {defined
                  ? "Execução definida — confira a prévia"
                  : "Classificação pendente"}
              </span>
            </div>
            {source.procedureCodes.length && !value ? (
              <p className="text-sm text-[var(--text-muted)]">
                Vínculo do catálogo:{" "}
                {source.procedureCodes
                  .map(
                    (code) =>
                      preview?.procedureOptions?.find(
                        (option) => option.code === code,
                      )?.name || code,
                  )
                  .join("; ")}
              </p>
            ) : null}
            {source.technical?.stale && value ? (
              <div className="space-y-2">
                <p className="text-sm text-[var(--text-muted)]">
                  O item ou suas quantidades mudaram. A classificação anterior
                  foi preservada; confirme sua aplicação ao serviço atual.
                </p>
                <button
                  type="button"
                  className="app-button app-button-secondary"
                  disabled={disabled}
                  onClick={() =>
                    change(source.key, {
                      procedureCodes: value.procedureCodes,
                      manualDescription: value.manualDescription,
                    })
                  }
                >
                  Confirmar classificação para este serviço
                </button>
              </div>
            ) : null}
            <TechnicalCodePicker
              label={`Procedimentos para ${source.description}`}
              options={preview?.procedureOptions || []}
              value={value?.procedureCodes || []}
              disabled={disabled}
              onChange={(procedureCodes) =>
                change(source.key, { procedureCodes, manualDescription: "" })
              }
              description="Esta seleção substitui o vínculo e o pacote técnico deste serviço somente nesta proposta. O cadastro do catálogo permanece intacto."
            />
            <label className="block text-sm font-medium">
              Ou descreva a finalidade e a execução
              <textarea
                rows={3}
                maxLength={2000}
                disabled={disabled}
                value={value?.manualDescription || ""}
                onChange={(event) =>
                  change(source.key, {
                    procedureCodes: [],
                    manualDescription: event.target.value,
                  })
                }
                className="app-input mt-2 w-full border p-3"
                placeholder="Informe o componente/sistema, a intervenção e o resultado a verificar. Mínimo de 40 caracteres e 6 palavras."
              />
            </label>
            {value ? (
              <button
                type="button"
                className="app-button app-button-ghost"
                disabled={disabled}
                onClick={() =>
                  onChange(
                    (request.technicalScopeClassifications || []).filter(
                      (row) => row.sourceKey !== source.key,
                    ),
                  )
                }
              >
                Usar vínculo do catálogo
              </button>
            ) : null}
          </div>
        );
      })}
      {preview?.operationalConditions.length ? (
        <p className="text-xs leading-5 text-[var(--text-muted)]">
          Há atividades condicionadas à confirmação técnica ou autorização
          operacional. Confira as condições na prévia; a seleção do procedimento
          não autoriza a execução.
        </p>
      ) : null}
    </section>
  );
}
