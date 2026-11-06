"use client";

import { useId, useMemo, useState } from "react";
import EditOverlay from "../../components/EditOverlay";
import { InterfaceIcon } from "../../components/InterfaceIcon";
import {
  normalizeSearch,
  SELECT_RESULT_LIMIT,
} from "../../components/SelectField";

export type EquipmentPickerItem = {
  id: string;
  catalogItemId?: string;
  alreadyAdded?: boolean;
  name: string;
  sku?: string | null;
  quantity: number;
  unit?: string | null;
  group?: string | null;
  searchTerms?: string;
  disabled?: boolean;
  disabledReason?: string;
};

export type EquipmentPickerGroup = {
  id: string;
  label: string;
  description?: string;
  itemIds: readonly string[];
};

export type EquipmentItemsPickerProps = {
  open: boolean;
  equipmentName?: string;
  items: readonly EquipmentPickerItem[];
  groups: readonly EquipmentPickerGroup[];
  selectedIds: readonly string[];
  onToggleItem: (id: string) => void;
  onGroupSelect: (groupId: string) => void;
  onConfirm: (mode?: "add" | "sum" | "separate", reason?: string) => void;
  onClose: () => void;
  onClearSelection?: () => void;
  loading?: boolean;
  error?: string;
  busy?: boolean;
  onRetry?: () => void;
};

const quantityFormat = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 4,
});

export default function EquipmentItemsPicker({
  open,
  equipmentName,
  items,
  groups,
  selectedIds,
  onToggleItem,
  onGroupSelect,
  onConfirm,
  onClose,
  onClearSelection,
  loading = false,
  error = "",
  busy = false,
  onRetry,
}: EquipmentItemsPickerProps) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [reviewing, setReviewing] = useState(false);
  const [duplicateMode, setDuplicateMode] = useState<"sum" | "separate">("sum");
  const [duplicateReason, setDuplicateReason] = useState("");
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectable = useMemo(
    () =>
      new Set(items.filter((item) => !item.disabled).map((item) => item.id)),
    [items],
  );
  const selectedCount = useMemo(
    () => Array.from(selected).filter((id) => selectable.has(id)).length,
    [selected, selectable],
  );
  const matches = useMemo(() => {
    const term = normalizeSearch(query);
    return items.filter(
      (item) =>
        !term ||
        normalizeSearch(
          [item.name, item.sku, item.group, item.searchTerms]
            .filter(Boolean)
            .join(" "),
        ).includes(term),
    );
  }, [items, query]);
  const pageCount = Math.max(
    1,
    Math.ceil(matches.length / SELECT_RESULT_LIMIT),
  );
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * SELECT_RESULT_LIMIT;
  const visibleItems = matches.slice(start, start + SELECT_RESULT_LIMIT);
  const unavailable = loading || Boolean(error) || busy;
  const selectedItems = items.filter(
    (item) => selected.has(item.id) && !item.disabled,
  );
  const hasDuplicates =
    selectedItems.some((item) => item.alreadyAdded) ||
    new Set(selectedItems.map((item) => item.catalogItemId || item.id)).size !==
      selectedItems.length;

  function clearSearch() {
    setQuery("");
    setPage(1);
  }

  function closePicker() {
    if (busy) return;
    setReviewing(false);
    clearSearch();
    onClose();
  }

  if (!open) return null;

  if (reviewing)
    return (
      <EditOverlay
        open
        title="Conferir itens selecionados"
        eyebrow="Itens do equipamento"
        closeLabel="Fechar conferência de itens"
        onClose={() => setReviewing(false)}
      >
        <div className="space-y-4 p-5">
          <p className="text-sm text-[var(--text-muted)]">
            Confira todos os {selectedItems.length} itens selecionados. As
            quantidades vêm do cadastro do equipamento; nenhum serviço adicional
            será incluído.
          </p>
          <div className="max-h-[45vh] space-y-2 overflow-y-auto">
            {selectedItems.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-[var(--border)] p-3 text-sm"
              >
                <strong>
                  {item.sku || "Sem código"} · {item.name}
                </strong>
                <p className="mt-1 text-[var(--text-muted)]">
                  Quantidade: {quantityFormat.format(item.quantity)}{" "}
                  {item.unit || ""} · Origem: equipamento
                  {item.group ? " / " + item.group : ""}
                  {item.alreadyAdded ? " · Já consta na proposta" : ""}
                </p>
              </div>
            ))}
          </div>
          {hasDuplicates ? (
            <fieldset className="space-y-3 rounded-xl border border-[var(--border)] p-4">
              <legend className="px-1 text-sm font-semibold">
                Há itens repetidos. Escolha como adicionar.
              </legend>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="duplicate-mode"
                  checked={duplicateMode === "sum"}
                  onChange={() => setDuplicateMode("sum")}
                />
                Somar as quantidades quando o item e o preço forem iguais.
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="duplicate-mode"
                  checked={duplicateMode === "separate"}
                  onChange={() => setDuplicateMode("separate")}
                />
                Manter linhas separadas, com justificativa interna.
              </label>
              {duplicateMode === "separate" ? (
                <label className="block text-sm">
                  Motivo das linhas separadas
                  <textarea
                    aria-label="Motivo das linhas separadas"
                    value={duplicateReason}
                    maxLength={2000}
                    rows={2}
                    onChange={(event) => setDuplicateReason(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
                  />
                </label>
              ) : null}
            </fieldset>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="app-button app-button-secondary"
              onClick={() => setReviewing(false)}
            >
              Voltar à seleção
            </button>
            <button
              type="button"
              className="app-button app-button-secondary"
              onClick={closePicker}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="app-button app-button-primary"
              disabled={
                !selectedItems.length ||
                (hasDuplicates &&
                  duplicateMode === "separate" &&
                  duplicateReason.trim().length < 8)
              }
              onClick={() => {
                onConfirm(
                  hasDuplicates ? duplicateMode : "add",
                  duplicateReason,
                );
                setReviewing(false);
              }}
            >
              Confirmar inclusão de {selectedItems.length} item(ns)
            </button>
          </div>
        </div>
      </EditOverlay>
    );

  return (
    <EditOverlay
      open
      title="Selecionar itens da máquina"
      eyebrow="Itens do equipamento"
      closeLabel="Fechar seleção de itens"
      busy={busy}
      onClose={closePicker}
    >
      <div className="space-y-5 text-[var(--foreground)]">
        <div className="space-y-1">
          {equipmentName ? (
            <p className="break-words text-sm font-semibold">{equipmentName}</p>
          ) : null}
          <p className="text-sm leading-6 text-[var(--text-muted)]">
            Selecione os itens cadastrados para esta máquina e confira as
            quantidades antes de adicionar à proposta.
          </p>
        </div>

        {groups.length ? (
          <fieldset disabled={unavailable} className="space-y-2">
            <legend className="text-sm font-semibold">
              Conjuntos de manutenção
            </legend>
            <p className="text-xs leading-5 text-[var(--text-muted)]">
              Os conjuntos marcam os itens para você conferir antes de
              adicionar.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {groups.map((group) => {
                const availableIds = Array.from(new Set(group.itemIds)).filter(
                  (id) => selectable.has(id),
                );
                const checked =
                  availableIds.length > 0 &&
                  availableIds.every((id) => selected.has(id));
                return (
                  <button
                    key={group.id}
                    type="button"
                    disabled={unavailable || availableIds.length === 0}
                    onClick={() => onGroupSelect(group.id)}
                    aria-label={
                      (checked
                        ? "Desmarcar conjunto "
                        : "Selecionar conjunto ") + group.label
                    }
                    aria-pressed={checked}
                    className={
                      "rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-50 " +
                      (checked
                        ? "border-[var(--brand)] bg-[var(--surface-soft)]"
                        : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-soft)]")
                    }
                  >
                    <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                      <span>{group.label}</span>
                      {checked ? (
                        <InterfaceIcon
                          name="check"
                          className="h-4 w-4 text-[var(--theme-link,var(--brand))]"
                        />
                      ) : (
                        <InterfaceIcon
                          name="plus"
                          className="h-4 w-4 text-[var(--text-muted)]"
                        />
                      )}
                    </span>
                    {group.description ? (
                      <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">
                        {group.description}
                      </span>
                    ) : null}
                    <span className="mt-2 block text-xs text-[var(--text-muted)]">
                      {availableIds.length
                        ? availableIds.length +
                          (availableIds.length === 1
                            ? " item disponível"
                            : " itens disponíveis")
                        : "Nenhum item disponível"}
                    </span>
                    <span className="mt-2 block text-xs font-semibold text-[var(--theme-link,var(--brand))]">
                      {checked ? "Desmarcar conjunto" : "Selecionar conjunto"}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <div className="space-y-2">
          <label htmlFor={inputId} className="block text-sm font-medium">
            Buscar item
          </label>
          <div className="relative">
            <InterfaceIcon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              id={inputId}
              type="search"
              autoComplete="off"
              value={query}
              disabled={busy}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Nome, SKU ou grupo"
              className="app-input w-full border border-[var(--border)] py-2 pl-9 pr-3"
            />
          </div>
        </div>

        <div className="space-y-3" aria-busy={loading}>
          {loading ? (
            <div
              role="status"
              className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-5 text-center text-sm text-[var(--text-muted)]"
            >
              <InterfaceIcon
                name="refresh"
                className="h-5 w-5 motion-safe:animate-spin"
              />
              Carregando itens da máquina...
            </div>
          ) : error ? (
            <div
              role="alert"
              className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-5 text-center"
            >
              <p className="text-sm font-medium">
                Não foi possível carregar os itens.
              </p>
              <p className="break-words text-sm text-[var(--text-muted)]">
                {error}
              </p>
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={busy}
                  className="app-button app-button-secondary"
                >
                  <InterfaceIcon name="refresh" />
                  Tentar novamente
                </button>
              ) : null}
            </div>
          ) : !visibleItems.length ? (
            <div
              role="status"
              className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-5 text-center"
            >
              <p className="text-sm font-medium">
                {query.trim()
                  ? "Nenhum item encontrado."
                  : "Esta máquina ainda não possui itens de manutenção cadastrados."}
              </p>
              {query.trim() ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  disabled={busy}
                  className="app-button app-button-ghost"
                >
                  Limpar busca
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <ul
                aria-label="Itens de manutenção da máquina"
                className="max-h-[36vh] divide-y divide-[var(--border)] overflow-y-auto overscroll-contain rounded-xl border border-[var(--border)] sm:max-h-[42vh]"
              >
                {visibleItems.map((item, index) => (
                  <li key={item.id}>
                    <label
                      htmlFor={inputId + "-item-" + index}
                      className={
                        "flex items-start gap-3 px-3 py-3 transition-colors sm:px-4 " +
                        (item.disabled || busy
                          ? "cursor-not-allowed opacity-60"
                          : selected.has(item.id)
                            ? "cursor-pointer bg-[var(--surface-soft)]"
                            : "cursor-pointer bg-[var(--surface)] hover:bg-[var(--surface-soft)]")
                      }
                    >
                      <input
                        id={inputId + "-item-" + index}
                        type="checkbox"
                        checked={selected.has(item.id)}
                        disabled={item.disabled || busy}
                        onChange={() => onToggleItem(item.id)}
                        className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-semibold">
                          {item.name}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                          <span>SKU: {item.sku || "Não informado"}</span>
                          <span>Grupo: {item.group || "Sem grupo"}</span>
                        </span>
                        {item.disabledReason ? (
                          <span className="mt-1 block text-xs text-[var(--text-muted)]">
                            {item.disabledReason}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-right text-xs text-[var(--text-muted)]">
                        <span className="block">Quantidade</span>
                        <span className="mt-1 block text-sm font-semibold tabular-nums text-[var(--foreground)]">
                          {Number.isFinite(item.quantity)
                            ? quantityFormat.format(item.quantity)
                            : "—"}{" "}
                          {item.unit || "un"}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
                <p aria-live="polite">
                  Mostrando {start + 1} a{" "}
                  {Math.min(start + SELECT_RESULT_LIMIT, matches.length)} de{" "}
                  {matches.length} {matches.length === 1 ? "item" : "itens"}
                </p>
                {pageCount > 1 ? (
                  <nav
                    aria-label="Páginas dos itens"
                    className="flex items-center gap-2"
                  >
                    <button
                      type="button"
                      disabled={busy || currentPage === 1}
                      onClick={() => setPage(currentPage - 1)}
                      aria-label="Página anterior de itens"
                      className="app-icon-button"
                    >
                      <InterfaceIcon name="arrow-left" className="h-4 w-4" />
                    </button>
                    <span className="tabular-nums">
                      {currentPage} de {pageCount}
                    </span>
                    <button
                      type="button"
                      disabled={busy || currentPage === pageCount}
                      onClick={() => setPage(currentPage + 1)}
                      aria-label="Próxima página de itens"
                      className="app-icon-button"
                    >
                      <InterfaceIcon name="arrow-right" className="h-4 w-4" />
                    </button>
                  </nav>
                ) : null}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-[var(--text-muted)]" aria-live="polite">
              {selectedCount}{" "}
              {selectedCount === 1 ? "item selecionado" : "itens selecionados"}
            </p>
            {onClearSelection && selectedCount > 0 ? (
              <button
                type="button"
                onClick={onClearSelection}
                disabled={unavailable}
                className="app-button app-button-ghost"
              >
                Limpar seleção
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <button
              type="button"
              onClick={closePicker}
              disabled={busy}
              className="app-button app-button-secondary"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => setReviewing(true)}
              disabled={unavailable || selectedCount === 0}
              className="app-button app-button-primary"
            >
              <InterfaceIcon
                name={busy ? "refresh" : "plus"}
                className={
                  busy ? "h-4 w-4 motion-safe:animate-spin" : "h-4 w-4"
                }
              />
              {busy ? "Adicionando..." : "Adicionar selecionados"}
            </button>
          </div>
        </div>
      </div>
    </EditOverlay>
  );
}
