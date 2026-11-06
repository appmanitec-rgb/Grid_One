"use client";

import { useEffect, useState } from "react";
import { getAccessFromToken } from "@/lib/access";
import { canScreenAction } from "@/lib/access-rules";
import {
  fetchTechnicalScopeLibrary,
  installTechnicalScopeLibrary,
  parseTechnicalObject,
  saveScopeFamily,
  saveScopeProcedure,
  type ScopeActivityDefinition,
  type ScopeFamily,
  type ScopeProcedure,
  type ScopeProcedureDefinition,
  type TechnicalScopeLibrary,
} from "@/lib/technical-scopes";
import {
  CatalogSearchField,
  type CatalogSearchItem,
} from "../../components/CatalogSearchField";
import {
  PageHeader,
  StatusBanner,
  EmptyState,
} from "../../components/DashboardPageKit";
import EditOverlay from "../../components/EditOverlay";
import { InterfaceIcon } from "../../components/InterfaceIcon";
import { normalizeSearch, SelectField } from "../../components/SelectField";
import TechnicalScopeCatalogPanel, {
  TechnicalCodePicker,
} from "../TechnicalScopeCatalogPanel";

type Tab = "families" | "procedures" | "profiles";
type Editor = "family" | "procedure" | "profile" | "seed" | null;
type FamilyDraft = {
  code: string;
  name: string;
  kind: "MATERIAL" | "SERVICE";
  description: string;
  procedureCodes: string[];
  isActive: boolean;
};
type ProcedureDraft = {
  code: string;
  name: string;
  category: string;
  description: string;
  trigger: "MATERIAL" | "SERVICE" | "";
  sectionId: string;
  sectionTitle: string;
  sectionOrder: string;
  activities: ScopeActivityDefinition[];
  isActive: boolean;
  requiresOperationalAuthorization: boolean;
  loadMode: "INSTALLATION" | "LOAD_BANK" | "";
  advanced: string;
};
const blankFamily = (): FamilyDraft => ({
  code: "",
  name: "",
  kind: "SERVICE",
  description: "",
  procedureCodes: [],
  isActive: true,
});
const blankProcedure = (): ProcedureDraft => ({
  code: "",
  name: "",
  category: "",
  description: "",
  trigger: "SERVICE",
  sectionId: "INTERVENCOES",
  sectionTitle: "Intervenções e serviços",
  sectionOrder: "40",
  activities: [],
  isActive: true,
  requiresOperationalAuthorization: false,
  loadMode: "",
  advanced: "{}",
});
const tabs: Array<{ key: Tab; label: string }> = [
  { key: "families", label: "Famílias" },
  { key: "procedures", label: "Procedimentos" },
  { key: "profiles", label: "Vínculos de catálogo" },
];
const input = "app-input w-full border border-[var(--border)] px-3 py-2";

export default function TechnicalLibraryPage() {
  const [access] = useState(getAccessFromToken);
  const canView = access.catalog.view && access.pages.catalog;
  const canEdit =
    canView && access.catalog.update && canScreenAction("catalog", "update");
  const [library, setLibrary] = useState<TechnicalScopeLibrary>({
    families: [],
    procedures: [],
    profiles: [],
  });
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState<Tab>("families");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState<Editor>(null);
  const [editorError, setEditorError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [family, setFamily] = useState<FamilyDraft>(blankFamily);
  const [procedure, setProcedure] = useState<ProcedureDraft>(blankProcedure);
  const [activityPage, setActivityPage] = useState(1);
  const [selectedCatalogItem, setSelectedCatalogItem] =
    useState<CatalogSearchItem | null>(null);

  useEffect(() => {
    if (!canView) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void fetchTechnicalScopeLibrary(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setLibrary(data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Não foi possível carregar a biblioteca.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [canView, revision]);

  function closeEditor() {
    if (saving) return;
    setEditor(null);
    setEditorError("");
  }
  function openFamily(value?: ScopeFamily) {
    setFamily(
      value
        ? {
            code: value.code,
            name: value.name,
            kind: value.kind,
            description: value.definitionJson.description || "",
            procedureCodes: value.definitionJson.procedureCodes || [],
            isActive: value.isActive !== false,
          }
        : blankFamily(),
    );
    setEditing(Boolean(value));
    setEditorError("");
    setEditor("family");
  }
  function openProcedure(value?: ScopeProcedure) {
    if (value) {
      const {
        section,
        activities,
        description,
        category,
        trigger,
        requiresOperationalAuthorization,
        loadMode,
        ...advanced
      } = value.definitionJson;
      setProcedure({
        code: value.code,
        name: value.name,
        category: value.category || category || "",
        description: description || "",
        trigger: trigger || "",
        sectionId: section.id,
        sectionTitle: section.title,
        sectionOrder: String(section.order ?? 40),
        activities: activities.map((entry) => ({ ...entry })),
        isActive: value.isActive !== false,
        requiresOperationalAuthorization: Boolean(
          requiresOperationalAuthorization,
        ),
        loadMode: loadMode || "",
        advanced: JSON.stringify(advanced, null, 2),
      });
    } else setProcedure(blankProcedure());
    setActivityPage(1);
    setEditing(Boolean(value));
    setEditorError("");
    setEditor("procedure");
  }
  function openProfile(item?: CatalogSearchItem) {
    setSelectedCatalogItem(item || null);
    setEditorError("");
    setEditor("profile");
  }
  function changeActivity(
    index: number,
    change: Partial<ScopeActivityDefinition>,
  ) {
    setProcedure((current) => ({
      ...current,
      activities: current.activities.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...change } : entry,
      ),
    }));
  }
  function addActivity() {
    const used = new Set(procedure.activities.map((entry) => entry.id));
    let number = procedure.activities.length + 1;
    const prefix = procedure.code.trim() || "ATIVIDADE";
    while (used.has(prefix + "_" + number)) number++;
    const updated = [
      ...procedure.activities,
      { id: prefix + "_" + number, text: "", auxiliary: false },
    ];
    setProcedure((current) => ({ ...current, activities: updated }));
    setActivityPage(Math.ceil(updated.length / 10));
  }
  async function saveEditor() {
    if (!canEdit || saving) return;
    setEditorError("");
    setSaving(true);
    try {
      if (editor === "seed") {
        await installTechnicalScopeLibrary();
        setMessage(
          "Biblioteca inicial instalada. Os cadastros existentes foram preservados.",
        );
      } else if (editor === "family") {
        if (!/^[A-Z0-9_-]+$/.test(family.code.trim()) || !family.name.trim())
          throw new Error(
            "Informe um código com letras maiúsculas, números, hífen ou sublinhado e um nome.",
          );
        await saveScopeFamily(family.code.trim(), {
          name: family.name.trim(),
          kind: family.kind,
          isActive: family.isActive,
          definitionJson: {
            description: family.description.trim(),
            procedureCodes: family.procedureCodes,
          },
        });
        setMessage("Família técnica salva.");
      } else if (editor === "procedure") {
        if (
          !/^[A-Z0-9_-]+$/.test(procedure.code.trim()) ||
          !procedure.name.trim() ||
          !procedure.sectionId.trim() ||
          !procedure.sectionTitle.trim()
        )
          throw new Error("Preencha código, nome e seção do procedimento.");
        if (
          !procedure.activities.length ||
          procedure.activities.some(
            (entry) => !entry.id.trim() || !entry.text.trim(),
          )
        )
          throw new Error(
            "Cadastre ao menos uma atividade com identificador e texto.",
          );
        if (
          new Set(procedure.activities.map((entry) => entry.id.trim())).size !==
          procedure.activities.length
        )
          throw new Error(
            "Os identificadores das atividades devem ser distintos dentro do procedimento.",
          );
        if (!Number.isFinite(Number(procedure.sectionOrder)))
          throw new Error("Informe uma ordem numérica para a seção.");
        const definitionJson: ScopeProcedureDefinition = {
          ...parseTechnicalObject(procedure.advanced),
          description: procedure.description.trim(),
          category: procedure.category.trim() || undefined,
          trigger: procedure.trigger || undefined,
          section: {
            id: procedure.sectionId.trim(),
            title: procedure.sectionTitle.trim(),
            order: Number(procedure.sectionOrder),
          },
          activities: procedure.activities.map((entry) => ({
            ...entry,
            id: entry.id.trim(),
            text: entry.text.trim(),
          })),
          requiresOperationalAuthorization:
            procedure.requiresOperationalAuthorization,
          loadMode: procedure.loadMode || undefined,
        };
        await saveScopeProcedure(procedure.code.trim(), {
          name: procedure.name.trim(),
          category: procedure.category.trim() || undefined,
          isActive: procedure.isActive,
          definitionJson,
        });
        setMessage("Procedimento técnico salvo.");
      }
      setEditor(null);
      setRevision((current) => current + 1);
    } catch (reason) {
      setEditorError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar o cadastro.",
      );
    } finally {
      setSaving(false);
    }
  }

  const term = normalizeSearch(query);
  const filteredFamilies = library.families.filter((entry) =>
    normalizeSearch(entry.code + " " + entry.name).includes(term),
  );
  const filteredProcedures = library.procedures.filter((entry) =>
    normalizeSearch(
      entry.code +
        " " +
        entry.name +
        " " +
        (entry.category || entry.definitionJson.category || ""),
    ).includes(term),
  );
  const filteredProfiles = library.profiles.filter((entry) =>
    normalizeSearch(
      [
        entry.catalogItem?.name,
        entry.catalogItem?.sku,
        ...entry.familyCodes,
        ...(entry.procedureCodes || []),
      ]
        .filter(Boolean)
        .join(" "),
    ).includes(term),
  );
  const count =
    tab === "families"
      ? filteredFamilies.length
      : tab === "procedures"
        ? filteredProcedures.length
        : filteredProfiles.length;
  const pages = Math.max(1, Math.ceil(count / 10));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * 10;
  const activityPages = Math.max(
    1,
    Math.ceil(procedure.activities.length / 10),
  );
  const currentActivityPage = Math.min(activityPage, activityPages);
  const activityStart = (currentActivityPage - 1) * 10;

  if (!canView)
    return (
      <StatusBanner tone="amber">
        Seu acesso não permite consultar a biblioteca técnica.
      </StatusBanner>
    );
  return (
    <div className="dashboard-page space-y-5 text-[var(--foreground)]">
      <PageHeader
        eyebrow="Catálogo"
        title="Biblioteca técnica"
        description="Organize famílias, procedimentos e vínculos usados na geração dos escopos das propostas."
        actions={
          <>
            <button
              type="button"
              className="app-button app-button-secondary"
              onClick={() => setRevision((current) => current + 1)}
              disabled={loading}
            >
              <InterfaceIcon name="refresh" />
              Atualizar
            </button>
            {canEdit ? (
              <button
                type="button"
                className="app-button app-button-secondary"
                onClick={() => {
                  setEditorError("");
                  setEditor("seed");
                }}
              >
                Instalar biblioteca inicial
              </button>
            ) : null}
          </>
        }
      />
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {message ? <StatusBanner tone="emerald">{message}</StatusBanner> : null}
      <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav
            aria-label="Cadastros da biblioteca técnica"
            className="flex flex-wrap gap-2"
          >
            {tabs.map((entry) => (
              <button
                key={entry.key}
                type="button"
                aria-pressed={tab === entry.key}
                className={
                  "app-button " +
                  (tab === entry.key
                    ? "app-button-primary"
                    : "app-button-secondary")
                }
                onClick={() => {
                  setTab(entry.key);
                  setPage(1);
                  setQuery("");
                }}
              >
                {entry.label}
              </button>
            ))}
          </nav>
          {canEdit ? (
            <button
              type="button"
              className="app-button app-button-secondary"
              onClick={() =>
                tab === "families"
                  ? openFamily()
                  : tab === "procedures"
                    ? openProcedure()
                    : openProfile()
              }
            >
              <InterfaceIcon name="plus" />
              {tab === "families"
                ? "Nova família"
                : tab === "procedures"
                  ? "Novo procedimento"
                  : "Novo vínculo"}
            </button>
          ) : null}
        </div>
        <label className="block text-sm font-medium">
          <span className="mb-1 block">
            Pesquisar{" "}
            {tab === "families"
              ? "famílias"
              : tab === "procedures"
                ? "procedimentos"
                : "vínculos"}
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            className={input}
            placeholder="Nome, código ou SKU"
          />
        </label>
        {loading ? (
          <p role="status" className="py-6 text-sm text-[var(--text-muted)]">
            Carregando biblioteca...
          </p>
        ) : !count ? (
          <EmptyState
            title="Nenhum registro encontrado"
            description={
              query
                ? "Ajuste a busca para encontrar o cadastro."
                : "Cadastre um registro ou instale a biblioteca inicial para começar."
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
            {tab === "families"
              ? filteredFamilies.slice(start, start + 10).map((entry) => (
                  <li
                    key={entry.code}
                    className="flex flex-wrap items-start justify-between gap-3 p-4"
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold">
                        {entry.name}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {entry.code} ·{" "}
                        {entry.kind === "SERVICE" ? "Serviço" : "Material"} ·{" "}
                        {entry.isActive === false ? "Inativa" : "Ativa"}
                      </p>
                      {entry.definitionJson.description ? (
                        <p className="mt-2 text-sm text-[var(--text-muted)]">
                          {entry.definitionJson.description}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="app-button app-button-secondary"
                      onClick={() => openFamily(entry)}
                    >
                      {canEdit ? "Editar" : "Consultar"}
                    </button>
                  </li>
                ))
              : tab === "procedures"
                ? filteredProcedures.slice(start, start + 10).map((entry) => (
                    <li
                      key={entry.code}
                      className="flex flex-wrap items-start justify-between gap-3 p-4"
                    >
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold">
                          {entry.name}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          {entry.code} · Versão {entry.version || 1} ·{" "}
                          {entry.isActive === false ? "Inativo" : "Ativo"}
                        </p>
                        <p className="mt-2 text-sm text-[var(--text-muted)]">
                          {entry.definitionJson.activities.length} atividade(s)
                          · {entry.definitionJson.section.title}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="app-button app-button-secondary"
                        onClick={() => openProcedure(entry)}
                      >
                        {canEdit ? "Editar" : "Consultar"}
                      </button>
                    </li>
                  ))
                : filteredProfiles.slice(start, start + 10).map((entry) => (
                    <li
                      key={entry.catalogItemId}
                      className="flex flex-wrap items-start justify-between gap-3 p-4"
                    >
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold">
                          {entry.catalogItem?.name || "Item do catálogo"}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          SKU: {entry.catalogItem?.sku || "Não informado"} ·{" "}
                          {entry.isActive === false ? "Inativo" : "Ativo"}
                        </p>
                        <p className="mt-2 text-sm text-[var(--text-muted)]">
                          {entry.familyCodes.length} família(s) ·{" "}
                          {(entry.procedureCodes?.length || 0) +
                            (entry.includedProcedureCodes?.length || 0)}{" "}
                          procedimento(s)
                        </p>
                      </div>
                      <button
                        type="button"
                        className="app-button app-button-secondary"
                        onClick={() =>
                          openProfile({
                            id: entry.catalogItemId,
                            name: entry.catalogItem?.name || "Item do catálogo",
                            sku: entry.catalogItem?.sku,
                          })
                        }
                      >
                        {canEdit ? "Editar" : "Consultar"}
                      </button>
                    </li>
                  ))}
          </ul>
        )}
        {!loading && count > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
            <span>
              Mostrando {start + 1} a {Math.min(start + 10, count)} de {count}
            </span>
            {pages > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="app-icon-button"
                  aria-label="Página anterior"
                >
                  <InterfaceIcon name="arrow-left" />
                </button>
                <span>
                  {currentPage} de {pages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === pages}
                  className="app-icon-button"
                  aria-label="Próxima página"
                >
                  <InterfaceIcon name="arrow-right" />
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      {editor ? (
        <EditOverlay
          open
          title={
            editor === "family"
              ? "Família técnica"
              : editor === "procedure"
                ? "Procedimento técnico"
                : editor === "profile"
                  ? "Vínculos do catálogo"
                  : "Instalar biblioteca inicial"
          }
          eyebrow="Biblioteca técnica"
          closeLabel="Fechar cadastro técnico"
          busy={saving}
          onClose={closeEditor}
        >
          <div className="space-y-4 text-[var(--foreground)]">
            {editorError ? (
              <StatusBanner tone="rose">{editorError}</StatusBanner>
            ) : null}
            {editor === "seed" ? (
              <p className="text-sm leading-6">
                Adicionar as famílias e os procedimentos iniciais da Manitec? A
                instalação preserva os cadastros já existentes e pode ser
                executada novamente sem duplicá-los.
              </p>
            ) : editor === "profile" ? (
              <>
                <label className="block text-sm font-medium">
                  <span className="mb-1 block">Produto ou serviço</span>
                  <CatalogSearchField
                    value={selectedCatalogItem?.id || ""}
                    selectedItem={selectedCatalogItem}
                    onChange={(_id, item) =>
                      setSelectedCatalogItem(item || null)
                    }
                    className={input}
                  />
                </label>
                {selectedCatalogItem ? (
                  <TechnicalScopeCatalogPanel
                    key={selectedCatalogItem.id}
                    catalogItemId={selectedCatalogItem.id}
                    canEdit={canEdit}
                    onSaved={() => {
                      setRevision((current) => current + 1);
                    }}
                  />
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    Pesquise um produto ou serviço para configurar seus
                    vínculos.
                  </p>
                )}
              </>
            ) : editor === "family" ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium">
                    Código
                    <input
                      value={family.code}
                      disabled={!canEdit || editing || saving}
                      maxLength={80}
                      onChange={(event) =>
                        setFamily((current) => ({
                          ...current,
                          code: event.target.value.toUpperCase(),
                        }))
                      }
                      className={input + " mt-1"}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Nome
                    <input
                      value={family.name}
                      disabled={!canEdit || saving}
                      maxLength={160}
                      onChange={(event) =>
                        setFamily((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      className={input + " mt-1"}
                    />
                  </label>
                </div>
                <label className="block text-sm font-medium">
                  Tipo
                  <SelectField
                    value={family.kind}
                    disabled={!canEdit || saving}
                    onChange={(event) =>
                      setFamily((current) => ({
                        ...current,
                        kind: event.target.value as FamilyDraft["kind"],
                      }))
                    }
                    className={input + " mt-1"}
                  >
                    <option value="MATERIAL">Material</option>
                    <option value="SERVICE">Serviço</option>
                  </SelectField>
                </label>
                <label className="block text-sm font-medium">
                  Descrição
                  <textarea
                    rows={3}
                    value={family.description}
                    disabled={!canEdit || saving}
                    onChange={(event) =>
                      setFamily((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    className={input + " mt-1"}
                  />
                </label>
                <TechnicalCodePicker
                  label="Procedimentos da família"
                  value={family.procedureCodes}
                  options={library.procedures.filter(
                    (entry) => entry.isActive !== false,
                  )}
                  onChange={(procedureCodes) =>
                    setFamily((current) => ({ ...current, procedureCodes }))
                  }
                  disabled={!canEdit || saving}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={family.isActive}
                    disabled={!canEdit || saving}
                    onChange={(event) =>
                      setFamily((current) => ({
                        ...current,
                        isActive: event.target.checked,
                      }))
                    }
                  />
                  Família ativa
                </label>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium">
                    Código
                    <input
                      value={procedure.code}
                      disabled={!canEdit || editing || saving}
                      maxLength={80}
                      onChange={(event) =>
                        setProcedure((current) => ({
                          ...current,
                          code: event.target.value.toUpperCase(),
                        }))
                      }
                      className={input + " mt-1"}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Nome
                    <input
                      value={procedure.name}
                      disabled={!canEdit || saving}
                      maxLength={160}
                      onChange={(event) =>
                        setProcedure((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      className={input + " mt-1"}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Categoria
                    <input
                      value={procedure.category}
                      disabled={!canEdit || saving}
                      onChange={(event) =>
                        setProcedure((current) => ({
                          ...current,
                          category: event.target.value,
                        }))
                      }
                      className={input + " mt-1"}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Aplicabilidade
                    <SelectField
                      value={procedure.trigger}
                      disabled={!canEdit || saving}
                      onChange={(event) =>
                        setProcedure((current) => ({
                          ...current,
                          trigger: event.target
                            .value as ProcedureDraft["trigger"],
                        }))
                      }
                      className={input + " mt-1"}
                    >
                      <option value="">Conforme os vínculos</option>
                      <option value="MATERIAL">Material</option>
                      <option value="SERVICE">Serviço</option>
                    </SelectField>
                  </label>
                </div>
                <label className="block text-sm font-medium">
                  Descrição
                  <textarea
                    rows={2}
                    value={procedure.description}
                    disabled={!canEdit || saving}
                    onChange={(event) =>
                      setProcedure((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    className={input + " mt-1"}
                  />
                </label>
                <fieldset className="space-y-3 rounded-xl border border-[var(--border)] p-3">
                  <legend className="px-1 text-sm font-semibold">
                    Seção do escopo
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="text-xs font-medium">
                      Identificador
                      <input
                        value={procedure.sectionId}
                        disabled={!canEdit || saving}
                        onChange={(event) =>
                          setProcedure((current) => ({
                            ...current,
                            sectionId: event.target.value,
                          }))
                        }
                        className={input + " mt-1"}
                      />
                    </label>
                    <label className="text-xs font-medium">
                      Título
                      <input
                        value={procedure.sectionTitle}
                        disabled={!canEdit || saving}
                        onChange={(event) =>
                          setProcedure((current) => ({
                            ...current,
                            sectionTitle: event.target.value,
                          }))
                        }
                        className={input + " mt-1"}
                      />
                    </label>
                    <label className="text-xs font-medium">
                      Ordem
                      <input
                        type="number"
                        value={procedure.sectionOrder}
                        disabled={!canEdit || saving}
                        onChange={(event) =>
                          setProcedure((current) => ({
                            ...current,
                            sectionOrder: event.target.value,
                          }))
                        }
                        className={input + " mt-1"}
                      />
                    </label>
                  </div>
                </fieldset>
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Atividades</h3>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={addActivity}
                        disabled={saving || procedure.activities.length >= 200}
                        className="app-button app-button-secondary"
                      >
                        <InterfaceIcon name="plus" />
                        Adicionar atividade
                      </button>
                    ) : null}
                  </div>
                  <p className="text-xs leading-5 text-[var(--text-muted)]">
                    Mantenha identificadores estáveis. Use o mesmo identificador
                    apenas para atividades tecnicamente equivalentes.
                  </p>
                  {procedure.activities
                    .slice(activityStart, activityStart + 10)
                    .map((activity, offset) => {
                      const index = activityStart + offset;
                      return (
                        <fieldset
                          key={index}
                          className="space-y-2 rounded-xl border border-[var(--border)] p-3"
                        >
                          <legend className="px-1 text-xs text-[var(--text-muted)]">
                            Atividade {index + 1}
                          </legend>
                          <label className="block text-xs font-medium">
                            Identificador técnico
                            <input
                              value={activity.id}
                              disabled={!canEdit || saving}
                              onChange={(event) =>
                                changeActivity(index, {
                                  id: event.target.value,
                                })
                              }
                              className={input + " mt-1"}
                            />
                          </label>
                          <label className="block text-xs font-medium">
                            Descrição da atividade
                            <textarea
                              rows={3}
                              maxLength={4000}
                              value={activity.text}
                              disabled={!canEdit || saving}
                              onChange={(event) =>
                                changeActivity(index, {
                                  text: event.target.value,
                                })
                              }
                              className={input + " mt-1"}
                            />
                          </label>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={Boolean(activity.auxiliary)}
                                disabled={!canEdit || saving}
                                onChange={(event) =>
                                  changeActivity(index, {
                                    auxiliary: event.target.checked,
                                  })
                                }
                              />
                              Procedimento auxiliar
                            </label>
                            {canEdit ? (
                              <button
                                type="button"
                                disabled={saving}
                                className="app-button app-button-ghost"
                                onClick={() =>
                                  setProcedure((current) => ({
                                    ...current,
                                    activities: current.activities.filter(
                                      (_entry, entryIndex) =>
                                        entryIndex !== index,
                                    ),
                                  }))
                                }
                              >
                                Remover atividade
                              </button>
                            ) : null}
                          </div>
                        </fieldset>
                      );
                    })}
                  {!procedure.activities.length ? (
                    <p className="text-sm text-[var(--text-muted)]">
                      Nenhuma atividade cadastrada.
                    </p>
                  ) : null}
                  {activityPages > 1 ? (
                    <div className="flex items-center justify-end gap-2 text-xs">
                      <button
                        type="button"
                        disabled={currentActivityPage === 1}
                        onClick={() => setActivityPage(currentActivityPage - 1)}
                        className="app-icon-button"
                        aria-label="Atividades anteriores"
                      >
                        <InterfaceIcon name="arrow-left" />
                      </button>
                      <span>
                        {currentActivityPage} de {activityPages}
                      </span>
                      <button
                        type="button"
                        disabled={currentActivityPage === activityPages}
                        onClick={() => setActivityPage(currentActivityPage + 1)}
                        className="app-icon-button"
                        aria-label="Próximas atividades"
                      >
                        <InterfaceIcon name="arrow-right" />
                      </button>
                    </div>
                  ) : null}
                </section>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={procedure.requiresOperationalAuthorization}
                    disabled={!canEdit || saving}
                    onChange={(event) =>
                      setProcedure((current) => ({
                        ...current,
                        requiresOperationalAuthorization: event.target.checked,
                      }))
                    }
                  />
                  Exige autorização operacional para execução
                </label>
                <label className="block text-sm font-medium">
                  Origem da carga, quando aplicável
                  <SelectField
                    value={procedure.loadMode}
                    disabled={!canEdit || saving}
                    onChange={(event) =>
                      setProcedure((current) => ({
                        ...current,
                        loadMode: event.target
                          .value as ProcedureDraft["loadMode"],
                      }))
                    }
                    className={input + " mt-1"}
                  >
                    <option value="">Não definida</option>
                    <option value="INSTALLATION">Carga da instalação</option>
                    <option value="LOAD_BANK">Banco de cargas</option>
                  </SelectField>
                </label>
                <details className="rounded-xl border border-[var(--border)] p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Dependências, compatibilidade e condições avançadas
                  </summary>
                  <p className="my-2 text-xs leading-5 text-[var(--text-muted)]">
                    Configuração em JSON para o responsável técnico. Permite
                    dependsOnCodes, requiredServiceFamilyCodes,
                    requiredMaterialFamilyCodes, compatibleEquipment,
                    requirements e operationalConditions. As atividades e a
                    seção são editadas nos campos acima.
                  </p>
                  <textarea
                    aria-label="Regras avançadas do procedimento em JSON"
                    rows={10}
                    spellCheck={false}
                    value={procedure.advanced}
                    disabled={!canEdit || saving}
                    onChange={(event) =>
                      setProcedure((current) => ({
                        ...current,
                        advanced: event.target.value,
                      }))
                    }
                    className={input + " font-mono text-xs"}
                  />
                </details>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={procedure.isActive}
                    disabled={!canEdit || saving}
                    onChange={(event) =>
                      setProcedure((current) => ({
                        ...current,
                        isActive: event.target.checked,
                      }))
                    }
                  />
                  Procedimento ativo
                </label>
              </div>
            )}
            {editor !== "profile" ? (
              <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
                <button
                  type="button"
                  className="app-button app-button-secondary"
                  onClick={closeEditor}
                  disabled={saving}
                >
                  {canEdit ? "Cancelar" : "Fechar"}
                </button>
                {canEdit ? (
                  <button
                    type="button"
                    className="app-button app-button-primary"
                    onClick={() => void saveEditor()}
                    disabled={saving}
                  >
                    {saving
                      ? "Salvando..."
                      : editor === "seed"
                        ? "Instalar biblioteca"
                        : "Salvar cadastro"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </EditOverlay>
      ) : null}
    </div>
  );
}
