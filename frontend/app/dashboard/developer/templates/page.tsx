"use client";
import { useEffect, useRef, useState } from "react";
import {
  commercialFetch,
  commercialPost,
  CommercialCapabilities,
  Portfolio,
  PORTFOLIO_LABELS,
  Template,
  TEMPLATE_LABELS,
} from "@/lib/commercial-workspace";
import {
  PageHeader,
  SectionCard,
  InlineMessage,
  EmptyState,
  DataPill,
} from "../../components/DashboardPageKit";
import EditOverlay from "../../components/EditOverlay";
import TemplateHistory from "./TemplateHistory";
import Link from "next/link";
const field =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
type Form = {
  key?: string;
  expectedVersion: number;
  portfolio: Portfolio;
  category: string;
  name: string;
  subject: string;
  body: string;
};
export default function CommercialTemplatesPage() {
  const [capabilities, setCapabilities] = useState<CommercialCapabilities>();
  const [portfolio, setPortfolio] = useState<Portfolio>("partsServices");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Template[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [form, setForm] = useState<Form>();
  const [original, setOriginal] = useState("");
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");
  const [editorError, setEditorError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const rights = capabilities?.management[portfolio];
  const dirty = !!form && JSON.stringify(form) !== original;
  useEffect(() => {
    const controller = new AbortController();
    commercialFetch<CommercialCapabilities>("/capabilities", {
      signal: controller.signal,
    })
      .then(setCapabilities)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      commercialFetch<{ items: Template[]; hasMore: boolean }>(
        `/templates?portfolio=${portfolio}&q=${encodeURIComponent(query)}&page=${page}`,
        { signal: controller.signal },
      )
        .then((data) => {
          setItems(data.items);
          setHasMore(data.hasMore);
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(cause.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [portfolio, query, page, attempt]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function open(item?: Template) {
    const value: Form = item
      ? {
          key: item.key,
          expectedVersion: item.version,
          portfolio: item.portfolio,
          category: item.category,
          name: item.name,
          subject: item.subject || "",
          body: item.body,
        }
      : {
          expectedVersion: 0,
          portfolio,
          category: "EMAIL",
          name: "",
          subject: "",
          body: "Olá, {{cliente.nome}}.\n\nSegue a proposta {{proposta.codigo}} para sua avaliação.\n\nAtenciosamente,\n{{vendedor.nome}}",
        };
    setForm(value);
    setOriginal(JSON.stringify(value));
    setEditorError("");
    setClosing(false);
  }
  function close() {
    if (busy) return;
    if (dirty) setClosing(true);
    else setForm(undefined);
  }
  async function save() {
    if (!form) return;
    setBusy(true);
    setEditorError("");
    try {
      await commercialPost("/library/templates", form);
      setForm(undefined);
      setAttempt((n) => n + 1);
      setNotice(
        "Nova versão salva como rascunho. Confira o conteúdo antes de publicar.",
      );
    } catch (cause) {
      setEditorError(
        cause instanceof Error ? cause.message : "Falha ao salvar modelo.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="dashboard-page space-y-5">
      <PageHeader
        eyebrow="Manitec Studio"
        title="Biblioteca de modelos"
        description="Conteúdos comerciais com variáveis, versões e publicação por carteira."
        actions={
          rights?.templates ? (
            <button
              className="app-button app-button-primary"
              onClick={() => open()}
            >
              Novo modelo
            </button>
          ) : undefined
        }
      />
      <div className="flex flex-wrap gap-2">
        <Link
          className="app-button app-button-secondary"
          href="/dashboard/developer/document-editor"
        >
          Modelos de documentos
        </Link>
        <Link
          className="app-button app-button-secondary"
          href="/dashboard/catalog/technical-library"
        >
          Procedimentos técnicos
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Carteira
          <select
            className={field}
            value={portfolio}
            onChange={(event) => {
              setPortfolio(event.target.value as Portfolio);
              setPage(1);
              setItems([]);
            }}
          >
            {capabilities?.portfolios.map((value) => (
              <option key={value} value={value}>
                {PORTFOLIO_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Pesquisar modelos
          <input
            className={field}
            placeholder="Nome do modelo"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      {error ? (
        <InlineMessage tone="warning">
          {error}{" "}
          <button
            className="underline"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Tentar novamente
          </button>
        </InlineMessage>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      ) : null}
      <SectionCard
        title="Modelos da carteira"
        description="Publicar disponibiliza o texto para seleção. Não envia mensagens nem altera documentos aprovados."
      >
        {loading ? (
          <p role="status">Carregando modelos…</p>
        ) : items.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-semibold">{item.name}</h3>
                  <DataPill tone={item.publishedAt ? "emerald" : "amber"}>
                    {item.publishedAt ? "Publicado" : "Rascunho"}
                  </DataPill>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {TEMPLATE_LABELS[item.category]} · versão {item.version}
                </p>
                <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">
                  {item.body}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="app-button app-button-secondary"
                    onClick={() => open(item)}
                  >
                    {rights?.templates ? "Abrir e revisar" : "Visualizar"}
                  </button>
                  {rights?.publishTemplates && !item.publishedAt ? (
                    <button
                      className="app-button app-button-primary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          await commercialPost(
                            `/library/templates/${item.id}/publish`,
                            {},
                          );
                          setNotice("Versão publicada para esta carteira.");
                          setAttempt((n) => n + 1);
                        } catch (cause) {
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : "Falha ao publicar.",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Publicar versão {item.version}
                    </button>
                  ) : null}
                </div>
                {rights?.templates || rights?.publishTemplates ? (
                  <TemplateHistory templateKey={item.key} />
                ) : null}
              </article>
            ))}
          </div>
        ) : !error ? (
          <EmptyState
            title="Nenhum modelo nesta seleção"
            description="O administrador responsável pode cadastrar e publicar os conteúdos desta carteira."
          />
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="app-button app-button-secondary"
            disabled={loading || page <= 1}
            onClick={() => setPage((n) => n - 1)}
          >
            Anterior
          </button>
          <button
            className="app-button app-button-secondary"
            disabled={loading || !hasMore}
            onClick={() => setPage((n) => n + 1)}
          >
            Próxima
          </button>
        </div>
      </SectionCard>
      {form ? (
        <EditOverlay
          open
          title={form.name || "Novo modelo"}
          eyebrow={`${PORTFOLIO_LABELS[form.portfolio]} · ${TEMPLATE_LABELS[form.category]}`}
          busy={busy}
          onClose={close}
        >
          <div className="space-y-4">
            {closing ? (
              <div
                role="alert"
                className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"
              >
                <p>Há alterações não salvas neste modelo.</p>
                <div className="mt-3 flex gap-2">
                  <button
                    className="app-button app-button-secondary"
                    onClick={() => setClosing(false)}
                  >
                    Continuar editando
                  </button>
                  <button
                    className="app-button app-button-secondary"
                    onClick={() => setForm(undefined)}
                  >
                    Descartar alterações
                  </button>
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Nome
                <input
                  className={field}
                  maxLength={160}
                  value={form.name}
                  disabled={busy || !rights?.templates}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </label>
              <label className="text-sm">
                Tipo
                <select
                  className={field}
                  value={form.category}
                  disabled={busy || !rights?.templates || !!form.key}
                  onChange={(event) =>
                    setForm({ ...form, category: event.target.value })
                  }
                >
                  {Object.entries(TEMPLATE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm">
              Assunto opcional
              <input
                className={field}
                maxLength={300}
                value={form.subject}
                disabled={busy || !rights?.templates}
                onChange={(event) =>
                  setForm({ ...form, subject: event.target.value })
                }
              />
            </label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-medium text-slate-600">
                Inserir variável no conteúdo
              </p>
              <div className="flex flex-wrap gap-2">
                {capabilities?.variables.map((variable) => (
                  <button
                    key={variable}
                    type="button"
                    disabled={busy || !rights?.templates}
                    className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"
                    onClick={() => {
                      const el = bodyRef.current;
                      const start = el?.selectionStart ?? form.body.length;
                      const end = el?.selectionEnd ?? start;
                      const token = `{{${variable}}}`;
                      setForm({
                        ...form,
                        body:
                          form.body.slice(0, start) +
                          token +
                          form.body.slice(end),
                      });
                      requestAnimationFrame(() => {
                        el?.focus();
                        el?.setSelectionRange(
                          start + token.length,
                          start + token.length,
                        );
                      });
                    }}
                  >
                    {variable}
                  </button>
                ))}
              </div>
            </div>
            <label className="block text-sm">
              Conteúdo
              <textarea
                ref={bodyRef}
                className={field + " min-h-64 leading-relaxed"}
                maxLength={30000}
                value={form.body}
                disabled={busy || !rights?.templates}
                onChange={(event) =>
                  setForm({ ...form, body: event.target.value })
                }
              />
            </label>
            <details className="rounded-xl border border-slate-200 p-4" open>
              <summary className="cursor-pointer text-sm font-medium">
                Prévia do conteúdo e das variáveis
              </summary>
              <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">
                {form.body.split(/(\{\{[^{}]+\}\})/g).map((part, index) =>
                  part.startsWith("{{") ? (
                    <mark
                      key={index}
                      className="rounded bg-blue-100 px-1 text-blue-800"
                    >
                      {part}
                    </mark>
                  ) : (
                    part
                  ),
                )}
              </div>
            </details>
            <p className="text-xs text-slate-500">
              O conteúdo é texto com substituições permitidas. Não executa
              instruções, não cria serviços e não contrata intervenções. Escopos
              técnicos continuam sujeitos à biblioteca e à conferência técnica
              existentes.
            </p>
            {editorError ? (
              <InlineMessage tone="warning">{editorError}</InlineMessage>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                className="app-button app-button-secondary"
                disabled={busy}
                onClick={close}
              >
                Fechar
              </button>
              {rights?.templates ? (
                <button
                  className="app-button app-button-primary"
                  disabled={
                    busy || !dirty || !form.name.trim() || !form.body.trim()
                  }
                  onClick={() => void save()}
                >
                  {busy ? "Salvando…" : "Salvar nova versão"}
                </button>
              ) : null}
            </div>
          </div>
        </EditOverlay>
      ) : null}
    </main>
  );
}
