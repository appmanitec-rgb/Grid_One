"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAccessFromToken } from "@/lib/access";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import {
  booleanOptions,
  formatStudioValue,
  getFieldValue,
  normalizeEditableValue,
  type StudioField,
  type StudioRecord,
  type StudioResource,
} from "./resources";

type SortState = {
  key: string;
  direction: "asc" | "desc";
};

type AuditEntry = {
  id: string;
  action: string;
  createdAt: string;
  reason?: string | null;
  actorUser?: { name?: string | null; email?: string | null } | null;
};

type ImportPreviewRow = {
  rowNumber: number;
  rawData: StudioRecord;
  normalizedData: StudioRecord;
  status: string;
  errors: Array<{ code: string; message: string; field?: string }>;
  warnings: Array<{ code: string; message: string; field?: string }>;
};

type ImportPreviewResult = {
  batchId: string;
  summary: {
    total: number;
    valid: number;
    warnings: number;
    invalid: number;
    duplicates: number;
    created?: number;
    skipped?: number;
    failed?: number;
  };
  rows: ImportPreviewRow[];
};

const PAGE_SIZE = 50;

export default function DataExplorer({ resource }: { resource: StudioResource }) {
  const router = useRouter();
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const [rows, setRows] = useState<StudioRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>({
    key: resource.fields.find((field) => field.sortable)?.key || resource.fields[0]?.key || "id",
    direction: "asc",
  });
  const [page, setPage] = useState(1);
  const [visibleKeys, setVisibleKeys] = useState<string[]>([]);
  const [selected, setSelected] = useState<StudioRecord | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditError, setAuditError] = useState("");
  const [showColumns, setShowColumns] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [executingImport, setExecutingImport] = useState(false);
  const [importError, setImportError] = useState("");
  const [access, setAccess] = useState(() => getAccessFromToken());

  const editableFields = useMemo(
    () =>
      resource.fields.filter(
        (field) =>
          field.editable &&
          !field.readOnly &&
          !field.hidden &&
          !field.key.includes("."),
      ),
    [resource.fields],
  );
  const canViewData = access.studio.dataView || access.studio.access;
  const canEditData = resource.canEdit && access.studio.dataEdit;
  const canExportData = resource.canExport && access.studio.dataExport;
  const canImportData =
    resource.canImport &&
    resource.importMode === "SAFE" &&
    access.studio.dataImport;

  useEffect(() => {
    const defaultKeys = resource.fields
      .filter((field) => !field.hiddenByDefault && !field.hidden && !field.sensitive)
      .map((field) => field.key);
    const saved = localStorage.getItem(`manitec_studio_columns_${resource.key}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setVisibleKeys(parsed.filter((key) => typeof key === "string"));
          return;
        }
      } catch {
        // ignore invalid local cache
      }
    }
    setVisibleKeys(defaultKeys);
  }, [resource]);

  useEffect(() => {
    setAccess(getAccessFromToken());
  }, []);

  useEffect(() => {
    if (visibleKeys.length === 0) return;
    localStorage.setItem(
      `manitec_studio_columns_${resource.key}`,
      JSON.stringify(visibleKeys),
    );
  }, [resource.key, visibleKeys]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiFetch(resource.endpoint, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, `Nao foi possivel carregar ${resource.pluralLabel}.`),
        );
      }
      const payload = await response.json();
      setRows(Array.isArray(payload) ? payload : []);
    } catch (loadError: unknown) {
      setRows([]);
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, [resource.endpoint, resource.pluralLabel]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    setPage(1);
  }, [query, sort.key, sort.direction, resource.key]);

  function openRecord(row: StudioRecord) {
    setIsCreating(false);
    setSelected(row);
    const nextDraft: Record<string, string | boolean> = {};
    for (const field of editableFields) {
      const value = getFieldValue(row, field.key);
      if (field.type === "boolean") {
        nextDraft[field.key] = Boolean(value);
      } else {
        nextDraft[field.key] = value === null || value === undefined ? "" : String(value);
      }
    }
    setDraft(nextDraft);
    void loadAudit(row.id);
  }

  function openNewRecord() {
    const nextDraft: Record<string, string | boolean> = {};
    for (const field of editableFields) {
      if (typeof field.defaultValue === "boolean") {
        nextDraft[field.key] = field.defaultValue;
      } else if (field.defaultValue !== undefined) {
        nextDraft[field.key] = String(field.defaultValue);
      } else {
        nextDraft[field.key] = field.type === "boolean" ? false : "";
      }
    }
    setSelected({});
    setDraft(nextDraft);
    setAuditEntries([]);
    setAuditError("");
    setIsCreating(true);
  }

  async function loadAudit(id: string) {
    setAuditEntries([]);
    setAuditError("");
    try {
      const params = new URLSearchParams({
        entityType: resource.entityType,
        entityId: id,
        limit: "20",
      });
      const response = await apiFetch(`/studio/history?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        setAuditError("Historico indisponivel para este recurso.");
        return;
      }
      const payload = await response.json();
      setAuditEntries(Array.isArray(payload) ? payload : []);
    } catch {
      setAuditError("Historico indisponivel para este recurso.");
    }
  }

  async function saveRecord() {
    if (!isCreating && !selected?.id) return;
    if (!canEditData) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const body: Record<string, unknown> = {};
      for (const field of editableFields) {
        body[field.key] = normalizeEditableValue(draft[field.key] ?? "", field);
      }
      const response = await apiFetch(
        isCreating
          ? `/studio/data/${resource.key}`
          : `/studio/data/${resource.key}/${selected?.id}`,
        {
          method: isCreating ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Nao foi possivel salvar o registro."),
        );
      }
      const updated = await response.json();
      if (isCreating) {
        setRows((current) => [updated, ...current]);
        setSelected(updated);
        setIsCreating(false);
        setSuccess("Registro criado com sucesso.");
        void loadAudit(updated.id);
      } else {
        setRows((current) =>
          current.map((row) => (row.id === selected?.id ? { ...row, ...updated } : row)),
        );
        setSelected((current) => (current ? { ...current, ...updated } : current));
        setSuccess("Registro atualizado com sucesso.");
        if (selected?.id) void loadAudit(selected.id);
      }
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar registro.");
    } finally {
      setSaving(false);
    }
  }

  const visibleFields = useMemo(
    () =>
      resource.fields.filter(
        (field) =>
          visibleKeys.includes(field.key) && !field.hidden && !field.sensitive,
      ),
    [resource.fields, visibleKeys],
  );
  const exportFields = useMemo(
    () => resource.fields.filter((field) => !field.hidden && !field.sensitive),
    [resource.fields],
  );
  const importFields = useMemo(
    () =>
      resource.fields.filter(
        (field) =>
          (field.editable || field.importable) &&
          !field.readOnly &&
          !field.hidden &&
          !field.sensitive,
      ),
    [resource.fields],
  );

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    const searchableFields = resource.fields.filter((field) => field.searchable);
    const filtered = rows.filter((row) => {
      if (!term) return true;
      return searchableFields.some((field) =>
        formatStudioValue(field.render ? field.render(row) : getFieldValue(row, field.key), field)
          .toLowerCase()
          .includes(term),
      );
    });

    const sortField = resource.fields.find((field) => field.key === sort.key);
    return [...filtered].sort((a, b) => {
      const aValue = sortField?.render ? sortField.render(a) : getFieldValue(a, sort.key);
      const bValue = sortField?.render ? sortField.render(b) : getFieldValue(b, sort.key);
      const result = compareValues(aValue, bValue, sortField);
      return sort.direction === "asc" ? result : -result;
    });
  }, [query, resource.fields, rows, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const paginatedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const firstIndex = filteredRows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastIndex = Math.min(page * PAGE_SIZE, filteredRows.length);

  function toggleSort(field: StudioField) {
    if (!field.sortable) return;
    setSort((current) =>
      current.key === field.key
        ? { key: field.key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key: field.key, direction: "asc" },
    );
  }

  function toggleColumn(key: string) {
    setVisibleKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  function exportCsv() {
    if (!canExportData) return;
    const csv = buildCsv(filteredRows, exportFields);
    downloadTextFile(
      `manitec-studio-${resource.key}-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
    );
  }

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/dashboard/developer/data");
  }

  function downloadTemplate() {
    if (!canImportData) return;
    const csv = buildCsv([], importFields);
    downloadTextFile(`modelo-importacao-${resource.key}.csv`, csv);
  }

  function scrollTable(direction: "left" | "right") {
    tableScrollRef.current?.scrollBy({
      left: direction === "left" ? -520 : 520,
      behavior: "smooth",
    });
  }

  function handleImportFile(file?: File | null) {
    if (!canImportData) return;
    if (!file) return;
    setImporting(true);
    setImportError("");
    setImportPreview(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const response = await apiFetch("/studio/imports/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resource: resource.key,
            originalFileName: file.name,
            csv: String(reader.result || ""),
            mode: "CREATE_ONLY",
          }),
        });
        if (!response.ok) {
          throw new Error(
            await readApiErrorMessage(response, "Nao foi possivel gerar a previa da importacao."),
          );
        }
        setImportPreview((await response.json()) as ImportPreviewResult);
      } catch (error: unknown) {
        setImportError(
          error instanceof Error ? error.message : "Falha ao ler importacao.",
        );
      } finally {
        setImporting(false);
      }
    };
    reader.onerror = () => {
      setImporting(false);
      setImportError("Nao foi possivel ler o arquivo CSV.");
    };
    reader.readAsText(file);
  }

  async function executeImport() {
    if (!importPreview?.batchId) return;
    setExecutingImport(true);
    setImportError("");
    try {
      const response = await apiFetch(
        `/studio/imports/${importPreview.batchId}/execute`,
        { method: "POST" },
      );
      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Nao foi possivel executar a importacao."),
        );
      }
      const payload = await response.json();
      setSuccess("Importacao executada com auditoria.");
      setImportPreview({
        batchId: payload.id,
        summary: payload.summary || {
          total: payload.totalRows || 0,
          valid: payload.validRows || 0,
          warnings: payload.warningRows || 0,
          invalid: payload.invalidRows || 0,
          duplicates: payload.duplicateRows || 0,
          created: payload.createdRows || 0,
          skipped: payload.skippedRows || 0,
          failed: payload.failedRows || 0,
        },
        rows: payload.rows || [],
      });
      void loadRows();
    } catch (error: unknown) {
      setImportError(
        error instanceof Error ? error.message : "Falha ao executar importacao.",
      );
    } finally {
      setExecutingImport(false);
    }
  }

  if (!canViewData) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-900">
        Seu perfil nao possui permissao para visualizar dados pelo Manitec Studio.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_24px_54px_-42px_rgba(15,23,42,0.28)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Studio / Dados
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">
              {resource.pluralLabel}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {resource.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {resource.createHref && resource.canCreate && canEditData ? (
              <Link
                href={resource.createHref}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Novo registro
              </Link>
            ) : null}
            {!resource.createHref && resource.canCreate && canEditData ? (
              <button
                type="button"
                onClick={openNewRecord}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Novo registro
              </button>
            ) : null}
            {canImportData ? (
              <button
                type="button"
                onClick={() => setShowImport((prev) => !prev)}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Importar
              </button>
            ) : null}
            {canExportData ? (
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Exportar CSV
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <Metric label="Registros" value={String(rows.length)} />
          <Metric label="Resultado atual" value={String(filteredRows.length)} />
          <Metric label="Campos visiveis" value={String(visibleFields.length)} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <label className="flex-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Buscar nos registros
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Buscar em ${resource.pluralLabel.toLowerCase()}...`}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium normal-case text-slate-800 outline-none focus:border-blue-500"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowColumns((prev) => !prev)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Colunas
            </button>
            <button
              type="button"
              onClick={() => void loadRows()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Atualizar
            </button>
          </div>
        </div>

        {showColumns ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {resource.fields.filter((field) => !field.hidden && !field.sensitive).map((field) => (
              <label
                key={field.key}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={visibleKeys.includes(field.key)}
                  onChange={() => toggleColumn(field.key)}
                />
                {field.label}
              </label>
            ))}
          </div>
        ) : null}

        {showImport && canImportData ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-bold text-amber-950">Importacao controlada</p>
                <p className="mt-1 text-sm leading-6 text-amber-900">
                  O Studio gera modelo, le o arquivo, mostra a previa e so grava os registros depois da confirmacao, com validacao e auditoria.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900"
                >
                  Baixar modelo
                </button>
                <label className="cursor-pointer rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900">
                  Ler CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) => handleImportFile(event.target.files?.[0])}
                  />
                </label>
              </div>
            </div>
            {importing ? (
              <p className="mt-4 rounded-xl border border-amber-200 bg-white p-3 text-sm font-semibold text-amber-900">
                Gerando previa da importacao...
              </p>
            ) : null}
            {importError ? (
              <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                {importError}
              </p>
            ) : null}
            {importPreview ? (
              <div className="mt-4 space-y-3">
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <ImportMetric label="Total" value={importPreview.summary.total} />
                  <ImportMetric label="Validos" value={importPreview.summary.valid} />
                  <ImportMetric label="Avisos" value={importPreview.summary.warnings} />
                  <ImportMetric label="Invalidos" value={importPreview.summary.invalid} />
                  <ImportMetric label="Duplicados" value={importPreview.summary.duplicates} />
                  <ImportMetric label="Criados" value={importPreview.summary.created ?? 0} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-amber-900">
                    Batch {importPreview.batchId}
                  </p>
                  <button
                    type="button"
                    disabled={
                      executingImport ||
                      importPreview.summary.valid + importPreview.summary.warnings === 0
                    }
                    onClick={() => void executeImport()}
                    className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {executingImport ? "Executando..." : "Confirmar importacao"}
                  </button>
                </div>
              <div className="mt-4 overflow-x-auto rounded-xl border border-amber-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-amber-50 text-xs uppercase tracking-[0.14em] text-amber-900">
                    <tr>
                      <th className="px-3 py-2">Linha</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Registro</th>
                      <th className="px-3 py-2">Problemas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {importPreview.rows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td className="px-3 py-2 text-slate-700">{row.rowNumber}</td>
                        <td className="px-3 py-2 font-semibold text-slate-800">{row.status}</td>
                        <td className="px-3 py-2 text-slate-700">
                          {String(row.normalizedData.companyName || row.normalizedData.name || "-")}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {[...row.errors, ...row.warnings]
                            .map((issue) => `${issue.code}: ${issue.message}`)
                            .join(" | ") || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {success}
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-stretch gap-2 md:grid-cols-[3rem_minmax(0,1fr)_3rem]">
        <div className="hidden items-center md:flex">
          <button
            type="button"
            onClick={() => scrollTable("left")}
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-xl font-black text-slate-700 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            aria-label="Rolar tabela para esquerda"
          >
            &lt;
          </button>
        </div>
      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div ref={tableScrollRef} className="overflow-x-auto scroll-smooth">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-sm text-slate-500">
                {visibleFields.map((field) => (
                  <th key={field.key} className="whitespace-nowrap p-4 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort(field)}
                      className={field.sortable ? "inline-flex items-center gap-2 hover:text-slate-900" : ""}
                    >
                      {field.label}
                      {field.sortable ? (
                        <span className="text-[11px]">
                          {sort.key === field.key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      ) : null}
                    </button>
                  </th>
                ))}
                <th className="p-4 text-right font-semibold">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={visibleFields.length + 1} className="p-8 text-center text-slate-500">
                    Carregando registros...
                  </td>
                </tr>
              ) : null}
              {!loading && paginatedRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  {visibleFields.map((field) => (
                    <td key={field.key} className="max-w-[280px] truncate p-4 text-sm text-slate-700">
                      {formatStudioValue(field.render ? field.render(row) : getFieldValue(row, field.key), field)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap p-4 text-right">
                    <button
                      type="button"
                      onClick={() => openRecord(row)}
                      className="text-sm font-semibold text-slate-700 hover:text-blue-700 hover:underline"
                    >
                      Abrir
                    </button>
                    {resource.detailHref ? (
                      <Link
                        href={resource.detailHref(row.id)}
                        className="ml-4 text-sm font-semibold text-slate-500 hover:text-slate-900 hover:underline"
                      >
                        Modulo
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!loading && filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={visibleFields.length + 1} className="p-8 text-center text-slate-500">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
          <span>
            {firstIndex}-{lastIndex} de {filteredRows.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="font-semibold">
              {page} / {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              Proxima
            </button>
          </div>
        </div>
      </section>
        <div className="hidden items-center md:flex">
          <button
            type="button"
            onClick={() => scrollTable("right")}
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-xl font-black text-slate-700 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            aria-label="Rolar tabela para direita"
          >
            &gt;
          </button>
        </div>
      </div>

      {selected ? (
        <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-[-24px_0_60px_-40px_rgba(15,23,42,0.6)]">
          <div className="border-b border-slate-200 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  {resource.label}
                </p>
                <h2 className="mt-2 text-2xl font-bold text-slate-950">
                  {isCreating
                    ? `Novo ${resource.label.toLowerCase()}`
                    : formatStudioValue(getFieldValue(selected, resource.fields[0]?.key || "id"))}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setIsCreating(false);
                }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
                  Dados
                </h3>
                {resource.editable && canEditData ? (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                    Edicao controlada
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                    Somente leitura
                  </span>
                )}
              </div>

              {resource.editable && canEditData && editableFields.length > 0 ? (
                <div className="grid gap-3">
                  {editableFields.map((field) => (
                    <EditField
                      key={field.key}
                      field={field}
                      value={draft[field.key]}
                      onChange={(value) =>
                        setDraft((current) => ({ ...current, [field.key]: value }))
                      }
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => void saveRecord()}
                    disabled={saving}
                    className="mt-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {saving
                      ? "Salvando..."
                      : isCreating
                        ? "Criar registro"
                        : "Salvar alteracoes"}
                  </button>
                </div>
              ) : (
                <dl className="grid gap-3">
                  {resource.fields.map((field) => (
                    <div key={field.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <dt className="text-xs font-bold uppercase text-slate-400">{field.label}</dt>
                      <dd className="mt-1 break-words text-sm font-semibold text-slate-800">
                        {formatStudioValue(field.render ? field.render(selected) : getFieldValue(selected, field.key), field)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>

            {!isCreating ? (
            <section>
              <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
                Historico
              </h3>
              {auditError ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  {auditError}
                </p>
              ) : null}
              {!auditError && auditEntries.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  Nenhum evento de auditoria encontrado para este registro.
                </p>
              ) : null}
              <div className="space-y-2">
                {auditEntries.map((entry) => (
                  <article key={entry.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-sm font-bold text-slate-900">{entry.action}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDateTime(entry.createdAt)} por {entry.actorUser?.name || entry.actorUser?.email || "Sistema"}
                    </p>
                    {entry.reason ? (
                      <p className="mt-2 text-sm text-slate-600">{entry.reason}</p>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function EditField({
  field,
  value,
  onChange,
}: {
  field: StudioField;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
}) {
  if (field.type === "boolean") {
    return (
      <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
        {field.label}
        <select
          value={String(Boolean(value))}
          onChange={(event) => onChange(event.target.value === "true")}
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium normal-case text-slate-800"
        >
          {booleanOptions().map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
        {field.label}
        <select
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium normal-case text-slate-800"
        >
          <option value="">Nao informado</option>
          {(field.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
      {field.label}
      <input
        value={String(value ?? "")}
        type={field.type === "number" ? "number" : "text"}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium normal-case text-slate-800"
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function ImportMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-white p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-800">{label}</p>
      <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function compareValues(a: unknown, b: unknown, field?: StudioField) {
  if (field?.type === "number") {
    return Number(a || 0) - Number(b || 0);
  }
  if (field?.type === "boolean") {
    return Number(Boolean(a)) - Number(Boolean(b));
  }
  return String(a ?? "").localeCompare(String(b ?? ""), "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

function buildCsv(rows: StudioRecord[], fields: StudioField[]) {
  const header = fields.map((field) => escapeCsv(field.key)).join(";");
  const body = rows.map((row) =>
    fields
      .map((field) =>
        escapeCsv(
          formatStudioValue(field.render ? field.render(row) : getFieldValue(row, field.key), field),
        ),
      )
      .join(";"),
  );
  return ["\uFEFF" + header, ...body].join("\n");
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  if (/[;"\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
