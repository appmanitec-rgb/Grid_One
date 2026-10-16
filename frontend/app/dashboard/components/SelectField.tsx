"use client";

import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import styles from "./SearchableFields.module.css";

export const SELECT_RESULT_LIMIT = 10;
export function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}
type Choice = {
  value: string;
  label: string;
  search: string;
  disabled?: boolean;
};
function nodeText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number")
        return String(child);
      return isValidElement<{ children?: ReactNode }>(child)
        ? nodeText(child.props.children)
        : "";
    })
    .join("");
}
function choicesFrom(children: ReactNode, groupDisabled = false): Choice[] {
  const choices = Children.toArray(children).flatMap((child) => {
    if (
      !isValidElement<{
        children?: ReactNode;
        value?: string | number;
        label?: string;
        disabled?: boolean;
      }>(child)
    )
      return [];
    if (child.type === "option") {
      const text = nodeText(child.props.children);
      const value = String(child.props.value ?? text);
      const label = child.props.label || text || value;
      return [
        {
          value,
          label,
          search: normalizeSearch(label + " " + value),
          disabled: groupDisabled || child.props.disabled,
        },
      ];
    }
    if (child.type === "optgroup" || child.type === Fragment)
      return choicesFrom(
        child.props.children,
        groupDisabled || child.props.disabled,
      );
    return [];
  });
  return Array.from(
    new Map(choices.map((choice) => [choice.value, choice])).values(),
  );
}

type PickerProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "children"
> & {
  value: string;
  choices: Choice[];
  freeText?: boolean;
  onOpen?: () => void;
  loading?: boolean;
  error?: string;
  onPick: (value: string) => void;
  onTextChange?: (value: string, event: ChangeEvent<HTMLInputElement>) => void;
  children?: ReactNode;
};

/** A portal keeps results visible inside scrolling tables, cards and dialogs. */
function Picker({
  value,
  choices,
  freeText,
  onOpen,
  loading,
  error,
  onPick,
  onTextChange,
  children,
  className,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: PickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    width: 0,
    maxHeight: 280,
    above: false,
  });
  const selected = choices.find((choice) => choice.value === value);
  const term = normalizeSearch(freeText ? value : editing ? query : "");
  const matches = choices.filter(
    (choice) => !term || choice.search.includes(term),
  );
  const results = loading || error ? [] : matches.slice(0, SELECT_RESULT_LIMIT);
  const activeIndex = Math.min(active, results.length - 1);
  const expanded = open && !props.disabled;
  const currentText = freeText
    ? value
    : open && editing
      ? query
      : selected?.label || "";

  useLayoutEffect(() => {
    if (!expanded) return;
    const place = () => {
      const field = input.current;
      if (!field) return;
      const box = field.getBoundingClientRect();
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const width = Math.min(Math.max(box.width, 240), window.innerWidth - 16);
      const below = height - box.bottom - 12;
      const above = box.top - 12;
      const upward = below < 200 && above > below;
      const maxHeight = Math.max(80, Math.min(360, upward ? above : below));
      setPosition({
        left: Math.max(8, Math.min(box.left, window.innerWidth - width - 8)),
        top: upward ? box.top - 4 : box.bottom + 4,
        width,
        maxHeight,
        above: upward,
      });
      if (box.bottom < 0 || box.top > height || field.matches(":disabled"))
        setOpen(false);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    const outside = (event: PointerEvent) => {
      if (
        !input.current?.contains(event.target as Node) &&
        !popup.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", outside);
    };
  }, [expanded]);

  useEffect(() => {
    if (expanded && activeIndex >= 0)
      document
        .getElementById(listId + "-" + activeIndex)
        ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, expanded, listId]);

  function start() {
    if (input.current?.matches(":disabled")) return;
    setQuery("");
    setEditing(false);
    input.current?.select();
    setActive(0);
    setOpen(true);
    onOpen?.();
  }
  function pick(choice: Choice) {
    if (choice.disabled || input.current?.matches(":disabled")) return;
    onPick(choice.value);
    setOpen(false);
  }
  return (
    <>
      <input
        {...props}
        ref={input}
        className={className || styles.input}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={
          expanded && activeIndex >= 0 ? listId + "-" + activeIndex : undefined
        }
        value={currentText}
        placeholder={
          open && !freeText ? "Digite para pesquisar..." : props.placeholder
        }
        onFocus={(event) => {
          start();
          onFocus?.(event);
        }}
        onClick={() => {
          if (!open) start();
        }}
        onBlur={(event) => {
          setOpen(false);
          onBlur?.(event);
        }}
        onChange={(event) => {
          setEditing(true);
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
          onTextChange?.(event.target.value, event);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) start();
            else
              setActive((current) => {
                const direction = event.key === "ArrowDown" ? 1 : -1;
                let next = Math.max(
                  0,
                  Math.min(results.length - 1, current + direction),
                );
                while (
                  results[next]?.disabled &&
                  next + direction >= 0 &&
                  next + direction < results.length
                )
                  next += direction;
                return next;
              });
          } else if (event.key === "Enter" && expanded) {
            event.preventDefault();
            const choice = results[activeIndex];
            if (choice) pick(choice);
          }
          onKeyDown?.(event);
        }}
      />
      {children}
      {expanded && position.width > 0
        ? createPortal(
            <div
              ref={popup}
              className={styles.popup}
              style={{
                left: position.left,
                top: position.top,
                width: position.width,
                maxHeight: position.maxHeight,
                transform: position.above ? "translateY(-100%)" : undefined,
              }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              <div
                id={listId}
                role="listbox"
                aria-label="Resultados da pesquisa"
              >
                {results.map((choice, index) => (
                  <button
                    key={choice.value}
                    id={listId + "-" + index}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={choice.value === value}
                    disabled={choice.disabled}
                    className={
                      styles.option +
                      (index === activeIndex ? " " + styles.active : "")
                    }
                    onClick={() => pick(choice)}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
              <p className={styles.hint} role="status">
                {loading
                  ? "Buscando..."
                  : error
                    ? error
                    : results.length === 0
                      ? "Nenhum resultado encontrado."
                      : matches.length > SELECT_RESULT_LIMIT
                        ? "Mostrando 10 resultados. Digite para refinar a busca."
                        : results.length +
                          (results.length === 1 ? " resultado" : " resultados")}
              </p>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  searchable?: boolean;
  ref?: Ref<HTMLSelectElement>;
};

/** Retains native form values and events; large lists share one searchable UI. */
export function SelectField({
  searchable,
  children,
  ref,
  ...props
}: SelectFieldProps) {
  const native = useRef<HTMLSelectElement>(null);
  const choices = choicesFrom(children);
  const enabled =
    !props.multiple && (searchable || choices.length > SELECT_RESULT_LIMIT);
  const [uncontrolledValue, setUncontrolledValue] = useState(
    String(
      props.defaultValue ??
        choices.find((choice) => !choice.disabled)?.value ??
        "",
    ),
  );
  const selectedValue = String(props.value ?? uncontrolledValue);
  function assignRef(element: HTMLSelectElement | null) {
    native.current = element;
    if (typeof ref === "function") ref(element);
    else if (ref) ref.current = element;
  }
  if (!enabled)
    return (
      <select {...props} ref={assignRef}>
        {children}
      </select>
    );
  return (
    <Picker
      id={props.id}
      value={selectedValue}
      choices={choices}
      disabled={props.disabled}
      className={[styles.searchInput, props.className || styles.input].join(
        " ",
      )}
      style={props.style}
      title={props.title}
      autoFocus={props.autoFocus}
      aria-label={props["aria-label"]}
      aria-labelledby={props["aria-labelledby"]}
      aria-describedby={props["aria-describedby"]}
      aria-required={props.required}
      aria-invalid={props["aria-invalid"]}
      data-testid={
        (props as Record<string, unknown>)["data-testid"] as string | undefined
      }
      onPick={(value) => {
        const element = native.current;
        if (!element) return;
        element.value = value;
        setUncontrolledValue(value);
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }}
    >
      <select
        {...props}
        ref={assignRef}
        id={undefined}
        data-testid={undefined}
        autoFocus={undefined}
        aria-hidden="true"
        tabIndex={-1}
        hidden
        style={{ display: "none" }}
        onInvalid={(event) => {
          props.onInvalid?.(event);
          event.preventDefault();
          const field = event.currentTarget
            .previousElementSibling as HTMLInputElement | null;
          field?.focus();
          field?.setCustomValidity("Selecione uma opção da lista.");
          field?.reportValidity();
          field?.setCustomValidity("");
        }}
      >
        {children}
      </select>
    </Picker>
  );
}

/** Suggestions allow free text while limiting the visible matches to ten. */
export function SuggestionInput({
  children,
  onChange,
  value,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const choices = choicesFrom(children);
  const input = useRef<HTMLInputElement | null>(null);
  // Preserve the input event for existing name/value based form handlers.
  return (
    <span
      className={styles.suggestion}
      ref={(element) => {
        input.current = element?.querySelector("input") ?? null;
      }}
    >
      <Picker
        {...props}
        value={String(value ?? "")}
        choices={choices}
        freeText
        onTextChange={(_next, event) => onChange?.(event)}
        onPick={(next) => {
          const element = input.current;
          if (element) {
            Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              "value",
            )?.set?.call(element, next);
            element.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }}
      />
    </span>
  );
}

/** Shared search UI for fields whose options are fetched as the user types. */
export function SearchLookup({
  value,
  options,
  selected,
  onSearch,
  onSelect,
  ...props
}: Omit<
  PickerProps,
  "choices" | "onPick" | "onTextChange" | "children" | "onSelect"
> & {
  options: Array<{ value: string; label: string }>;
  selected?: { value: string; label: string };
  onSearch?: (query: string) => void;
  onSelect: (value: string) => void;
}) {
  const [picked, setPicked] = useState<
    { value: string; label: string } | undefined
  >(selected);
  const retained = selected || (picked?.value === value ? picked : undefined);
  const entries =
    retained && !options.some((option) => option.value === retained.value)
      ? [...options, retained]
      : options;
  const choices = entries.map((option) => ({
    ...option,
    search: normalizeSearch(option.label + " " + option.value),
  }));
  return (
    <Picker
      {...props}
      value={value}
      choices={choices}
      onOpen={() => {
        const current = entries.find((option) => option.value === value);
        if (current) setPicked(current);
        onSearch?.("");
      }}
      onTextChange={(query) => onSearch?.(query)}
      onPick={(next) => {
        const current = entries.find((option) => option.value === next);
        if (current) setPicked(current);
        onSelect(next);
      }}
    />
  );
}
