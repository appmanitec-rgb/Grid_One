"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type SortDirection = "asc" | "desc";
type SortValue =
  | { kind: "number"; value: number }
  | { kind: "date"; value: number }
  | { kind: "text"; value: string };

const SKIPPED_HEADERS = new Set(["acao", "acoes", "ação", "ações"]);

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeKey(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseDateValue(text: string) {
  const dateMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (dateMatch) {
    const [, day, month, year, hour = "0", minute = "0"] = dateMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    const value = new Date(
      Number(fullYear),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    ).getTime();
    return Number.isNaN(value) ? null : value;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const value = new Date(isoMatch[0]).getTime();
    return Number.isNaN(value) ? null : value;
  }

  return null;
}

function parseNumberValue(text: string) {
  const compact = text.replace(/\s/g, "");
  const hasNumericSignal = /(?:^[-+]?\d)|R\$|%/.test(compact);
  const hasLetters = /[A-Za-z]/.test(compact.replace(/R\$/g, ""));

  if (!hasNumericSignal || hasLetters) return null;

  const numberText = compact
    .replace(/R\$/g, "")
    .replace(/%/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  if (!/^[-+]?\d+(?:\.\d+)?$/.test(numberText)) return null;

  const value = Number(numberText);
  return Number.isNaN(value) ? null : value;
}

function toSortValue(text: string): SortValue {
  const normalized = normalizeText(text);
  const dateValue = parseDateValue(normalized);
  if (dateValue !== null) return { kind: "date", value: dateValue };

  const numberValue = parseNumberValue(normalized);
  if (numberValue !== null) return { kind: "number", value: numberValue };

  return { kind: "text", value: normalized.toLocaleLowerCase("pt-BR") };
}

function compareValues(a: SortValue, b: SortValue) {
  if (a.kind === b.kind && a.kind !== "text" && b.kind !== "text") {
    return a.value - b.value;
  }

  return String(a.value).localeCompare(String(b.value), "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

function getHeaderLabel(header: HTMLTableCellElement) {
  const clone = header.cloneNode(true) as HTMLTableCellElement;
  clone.querySelectorAll(".dashboard-table-sort-button").forEach((node) => node.remove());
  return normalizeText(clone.innerText);
}

function updateSortIndicators(table: HTMLTableElement, activeIndex: number, direction: SortDirection) {
  const headers = Array.from(table.tHead?.rows[0]?.cells || []);

  headers.forEach((header, index) => {
    const button = header.querySelector<HTMLButtonElement>(".dashboard-table-sort-button");
    if (!button) return;

    const isActive = index === activeIndex;
    header.setAttribute("aria-sort", isActive ? (direction === "asc" ? "ascending" : "descending") : "none");
    button.dataset.direction = isActive ? direction : "none";
    button.textContent = isActive ? (direction === "asc" ? "↑" : "↓") : "↕";
  });
}

function sortTable(table: HTMLTableElement, columnIndex: number, direction: SortDirection) {
  const body = table.tBodies[0];
  if (!body) return;

  const rows = Array.from(body.rows).map((row, originalIndex) => ({
    row,
    originalIndex,
    value: toSortValue(row.cells[columnIndex]?.innerText || ""),
  }));

  rows.sort((a, b) => {
    const result = compareValues(a.value, b.value);
    return (direction === "asc" ? result : -result) || a.originalIndex - b.originalIndex;
  });

  const fragment = document.createDocumentFragment();
  rows.forEach(({ row }) => fragment.appendChild(row));
  body.appendChild(fragment);

  table.dataset.sortColumn = String(columnIndex);
  table.dataset.sortDirection = direction;
  updateSortIndicators(table, columnIndex, direction);
}

function enhanceTable(table: HTMLTableElement) {
  if (table.dataset.sortEnhanced === "1") return;
  if (table.closest(".document-print-page")) return;

  const headerRow = table.tHead?.rows[0];
  const body = table.tBodies[0];
  if (!headerRow || !body || body.rows.length < 2) return;

  Array.from(headerRow.cells).forEach((header, columnIndex) => {
    const label = getHeaderLabel(header);
    if (!label || SKIPPED_HEADERS.has(normalizeKey(label))) return;

    header.setAttribute("aria-sort", "none");
    header.classList.add("dashboard-table-sortable-header");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "dashboard-table-sort-button";
    button.textContent = "↕";
    button.dataset.direction = "none";
    button.setAttribute("aria-label", `Ordenar por ${label}`);
    button.title = `Ordenar por ${label}`;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const currentColumn = table.dataset.sortColumn;
      const currentDirection = table.dataset.sortDirection as SortDirection | undefined;
      const nextDirection: SortDirection =
        currentColumn === String(columnIndex) && currentDirection === "asc" ? "desc" : "asc";

      sortTable(table, columnIndex, nextDirection);
    });

    header.appendChild(button);
  });

  table.dataset.sortEnhanced = "1";

  const savedColumn = Number(table.dataset.sortColumn);
  const savedDirection = table.dataset.sortDirection as SortDirection | undefined;
  if (Number.isInteger(savedColumn) && (savedDirection === "asc" || savedDirection === "desc")) {
    sortTable(table, savedColumn, savedDirection);
  }
}

function enhanceTables() {
  document.querySelectorAll<HTMLTableElement>(".dashboard-main table").forEach(enhanceTable);
}

export default function DashboardTableSorting() {
  const pathname = usePathname();

  useEffect(() => {
    let sortingInternally = false;
    const runEnhancement = () => {
      if (sortingInternally) return;
      sortingInternally = true;
      window.requestAnimationFrame(() => {
        enhanceTables();
        sortingInternally = false;
      });
    };

    runEnhancement();

    const observer = new MutationObserver(runEnhancement);
    const root = document.querySelector(".dashboard-main");
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
    }

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
