"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAccessFromToken } from "@/lib/access";
import { canScreenAction } from "@/lib/access-rules";
import {
  fetchTechnicalScopeLibrary,
  parseScopeCompatibility,
  saveScopeCatalogProfile,
  type TechnicalScopeLibrary,
} from "@/lib/technical-scopes";
import { SelectField } from "../components/SelectField";
import { InterfaceIcon } from "../components/InterfaceIcon";
import { InlineMessage, StatusBanner } from "../components/DashboardPageKit";

export function TechnicalCodePicker({
  label,
  value,
  options,
  onChange,
  disabled = false,
  description,
}: {
  label: string;
  value: readonly string[];
  options: ReadonlyArray<{ code: string; name: string }>;
  onChange: (value: string[]) => void;
  disabled?: boolean;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">
        <span className="mb-1 block">{label}</span>
        <SelectField
          searchable
          value=""
          disabled={disabled}
          onChange={(event) => {
            const code = event.target.value;
            if (code && !value.includes(code)) onChange([...value, code]);
          }}
          className="app-input w-full border px-3 py-2"
        >
          <option value="">Pesquisar e adicionar</option>
          {options
            .filter((option) => !value.includes(option.code))
            .map((option) => (
              <option key={option.code} value={option.code}>
                {option.code} - {option.name}
              </option>
            ))}
        </SelectField>
      </label>
      {description ? (
        <p className="text-xs leading-5 text-[var(--text-muted)]">
          {description}
        </p>
      ) : null}
      {value.length ? (
        <ul
          className="flex flex-wrap gap-2"
          aria-label={"Selecionados: " + label}
        >
          {value.map((code) => (
            <li
              key={code}
              className="inline-flex max-w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-2.5 py-1.5 text-xs"
            >
              <span className="break-words">
                {options.find((option) => option.code === code)?.name || code}
              </span>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() =>
                    onChange(value.filter((entry) => entry !== code))
                  }
                  aria-label={"Remover " + code}
                  className="inline-flex rounded p-1 text-[var(--text-muted)] focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
                >
                  <InterfaceIcon name="close" className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">
          Nenhum vínculo selecionado.
        </p>
      )}
    </div>
  );
}

export default function TechnicalScopeCatalogPanel({
  catalogItemId,
  canEdit,
  onSaved,
}: {
  catalogItemId: string;
  canEdit: boolean;
  onSaved?: () => void;
}) {
  const [access] = useState(getAccessFromToken);
  const canUpdate =
    canEdit && access.catalog.update && canScreenAction("catalog", "update");
  const [library, setLibrary] = useState<TechnicalScopeLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [familyCodes, setFamilyCodes] = useState<string[]>([]);
  const [procedureCodes, setProcedureCodes] = useState<string[]>([]);
  const [includedProcedureCodes, setIncludedProcedureCodes] = useState<
    string[]
  >([]);
  const [compatibility, setCompatibility] = useState("{}");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!catalogItemId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSuccess("");
    void fetchTechnicalScopeLibrary(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        const profile = data.profiles.find(
          (entry) => entry.catalogItemId === catalogItemId,
        );
        setLibrary(data);
        setFamilyCodes(profile?.familyCodes || []);
        setProcedureCodes(profile?.procedureCodes || []);
        setIncludedProcedureCodes(profile?.includedProcedureCodes || []);
        setCompatibility(JSON.stringify(profile?.compatibility || {}, null, 2));
        setIsActive(profile?.isActive !== false);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Não foi possível carregar os vínculos técnicos.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [catalogItemId, revision]);

  async function save() {
    if (!canUpdate || saving || !library) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await saveScopeCatalogProfile(catalogItemId, {
        familyCodes,
        procedureCodes,
        includedProcedureCodes,
        compatibility: parseScopeCompatibility(compatibility),
        isActive,
      });
      setSuccess("Vínculos técnicos salvos.");
      onSaved?.();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar os vínculos.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!catalogItemId)
    return (
      <InlineMessage>
        Salve o cadastro do item para configurar seus procedimentos técnicos.
      </InlineMessage>
    );
  return (
    <section
      className="space-y-4 text-[var(--foreground)]"
      aria-busy={loading || saving}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">
            Procedimentos técnicos associados
          </h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Defina como este item participa do escopo. Os vínculos não alteram
            preços, estoque ou serviços vendidos.
          </p>
        </div>
        <Link
          href="/dashboard/catalog/technical-library"
          className="app-button app-button-secondary"
        >
          Biblioteca técnica
          <InterfaceIcon name="arrow-right" />
        </Link>
      </div>
      {loading ? (
        <p role="status" className="py-4 text-sm text-[var(--text-muted)]">
          Carregando vínculos...
        </p>
      ) : null}
      {error ? (
        <StatusBanner tone="rose">
          {error}
          {!library ? (
            <button
              type="button"
              className="app-button app-button-ghost ml-2"
              onClick={() => setRevision((value) => value + 1)}
            >
              Tentar novamente
            </button>
          ) : null}
        </StatusBanner>
      ) : null}
      {success ? <StatusBanner tone="emerald">{success}</StatusBanner> : null}
      {!loading && library ? (
        <div className="space-y-5">
          <TechnicalCodePicker
            label="Famílias técnicas"
            value={familyCodes}
            options={library.families.filter(
              (entry) => entry.isActive !== false,
            )}
            onChange={setFamilyCodes}
            disabled={!canUpdate || saving}
          />
          <TechnicalCodePicker
            label="Procedimentos associados"
            value={procedureCodes}
            options={library.procedures.filter(
              (entry) => entry.isActive !== false,
            )}
            onChange={setProcedureCodes}
            disabled={!canUpdate || saving}
          />
          <TechnicalCodePicker
            label="Procedimentos incluídos no pacote"
            value={includedProcedureCodes}
            options={library.procedures.filter(
              (entry) => entry.isActive !== false,
            )}
            onChange={setIncludedProcedureCodes}
            disabled={!canUpdate || saving}
            description="Selecione apenas os procedimentos já incluídos neste item comercial. A venda de material isolado não contrata mão de obra."
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              disabled={!canUpdate || saving}
              className="h-4 w-4 accent-[var(--brand)]"
            />
            Vínculo ativo
          </label>
          <details className="rounded-xl border border-[var(--border)] p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Compatibilidade do equipamento
            </summary>
            <p className="my-2 text-xs leading-5 text-[var(--text-muted)]">
              Configuração avançada: informe um objeto JSON com características
              e listas de valores aceitos. Mantenha vazio quando não houver
              restrição validada.
            </p>
            <textarea
              aria-label="Compatibilidade técnica em JSON"
              value={compatibility}
              onChange={(event) => setCompatibility(event.target.value)}
              disabled={!canUpdate || saving}
              rows={5}
              spellCheck={false}
              className="app-input w-full rounded-lg border p-3 font-mono text-xs"
            />
          </details>
          {canUpdate ? (
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="app-button app-button-primary"
            >
              <InterfaceIcon name="check" />
              {saving ? "Salvando..." : "Salvar vínculos técnicos"}
            </button>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">
              Seu acesso permite consultar os vínculos técnicos.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
