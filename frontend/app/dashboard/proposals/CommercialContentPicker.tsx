"use client";
import { useEffect, useState } from "react";
import {
  commercialFetch,
  CommercialValues,
  Portfolio,
  renderCommercialText,
  TEMPLATE_LABELS,
  Template,
} from "@/lib/commercial-workspace";
import { SearchLookup } from "../components/SelectField";
import { InlineMessage } from "../components/DashboardPageKit";

type Preview = { subject: string; body: string };
export default function CommercialContentPicker({
  proposalId,
  portfolio,
  category = "EMAIL",
  previewValues,
  onApply,
}: {
  proposalId?: string;
  portfolio: Portfolio;
  category?: string;
  previewValues?: CommercialValues;
  onApply: (value: Preview) => void;
}) {
  const [activeCategory, setActiveCategory] = useState(category);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template>();
  const [remotePreview, setRemotePreview] = useState<Preview>();
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const local = previewValues !== undefined;
  useEffect(() => {
    setActiveCategory(category);
    setSelected(undefined);
    setRemotePreview(undefined);
  }, [category, portfolio, proposalId]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      setError("");
      commercialFetch<{ items: Template[] }>(
        `/templates?publishedOnly=true&portfolio=${portfolio}&category=${activeCategory}&q=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      )
        .then((data) => {
          if (!controller.signal.aborted)
            setOptions(
              data.items.filter((item) => item.publishedAt).slice(0, 10),
            );
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(cause.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, portfolio, activeCategory]);
  useEffect(() => {
    setRemotePreview(undefined);
    if (!selected || !proposalId || local) return;
    const controller = new AbortController();
    setPreviewing(true);
    setError("");
    commercialFetch<Preview>(`/templates/${selected.id}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalId }),
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setRemotePreview(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewing(false);
      });
    return () => controller.abort();
  }, [selected, proposalId, local]);
  let preview = remotePreview;
  let localError = "";
  if (selected && previewValues) {
    try {
      preview = {
        subject: selected.subject
          ? renderCommercialText(selected.subject, previewValues)
          : "",
        body: renderCommercialText(selected.body, previewValues),
      };
    } catch (cause) {
      localError =
        cause instanceof Error
          ? cause.message
          : "Não foi possível conferir o modelo.";
    }
  }
  const categories = ["SERVICE_SCOPE", "PARTS_SCOPE"].includes(category)
    ? ["SERVICE_SCOPE", "PARTS_SCOPE"]
    : ["EMAIL", "NOTICE", "REMINDER", "AUTOMATION"];
  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Usar conteúdo da biblioteca
      </summary>
      <div className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Tipo de conteúdo
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              value={activeCategory}
              onChange={(event) => {
                setActiveCategory(event.target.value);
                setSelected(undefined);
                setRemotePreview(undefined);
                setQuery("");
              }}
            >
              {categories.map((value) => (
                <option key={value} value={value}>
                  {TEMPLATE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Modelo publicado
            <SearchLookup
              aria-label="Pesquisar modelo publicado"
              options={options.map((item) => ({
                value: item.id,
                label: `${item.name} · versão ${item.version}`,
              }))}
              selected={
                selected
                  ? {
                      value: selected.id,
                      label: `${selected.name} · versão ${selected.version}`,
                    }
                  : undefined
              }
              value={selected?.id || ""}
              onSearch={(value) => setQuery(value.slice(0, 100))}
              loading={searching}
              onSelect={(value) => {
                setSelected(options.find((item) => item.id === value));
                setRemotePreview(undefined);
              }}
              placeholder="Pesquisar por nome"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            />
          </label>
        </div>
        {error || localError ? (
          <InlineMessage tone="warning">{error || localError}</InlineMessage>
        ) : null}
        {previewing ? (
          <p role="status" className="text-sm text-slate-500">
            Preparando a prévia…
          </p>
        ) : null}
        {preview ? (
          <>
            <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white p-4 text-sm">
              {preview.subject ? (
                <p className="mb-3 font-medium">{preview.subject}</p>
              ) : null}
              <p className="whitespace-pre-wrap break-words">{preview.body}</p>
            </div>
            <button
              type="button"
              className="app-button app-button-secondary"
              disabled={previewing || !!localError}
              onClick={() => onApply(preview!)}
            >
              Usar este conteúdo
            </button>
            <p className="text-xs text-slate-500">
              {local
                ? "Prévia com o preenchimento atual. Confira o escopo e as condições antes de salvar a proposta."
                : "Confira o conteúdo antes de enviar. Usar o modelo apenas preenche a mensagem."}
            </p>
          </>
        ) : null}
      </div>
    </details>
  );
}
