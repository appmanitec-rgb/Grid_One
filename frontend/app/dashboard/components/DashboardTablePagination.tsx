"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { PAGE_SIZE_OPTIONS } from "./ListPagination";

const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

function createButton(label: string, title: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "dashboard-table-pagination-button";
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);
  return button;
}

function paginationHost(table: HTMLTableElement) {
  const parent = table.parentElement;
  if (parent?.classList.contains("overflow-x-auto") || parent?.classList.contains("overflow-auto")) {
    return parent;
  }
  return table;
}

function removePagination(table: HTMLTableElement) {
  const id = table.dataset.paginationId;
  if (id) {
    document.querySelector(`[data-table-pagination-for="${id}"]`)?.remove();
  }
  Array.from(table.tBodies[0]?.rows || []).forEach((row) => {
    row.hidden = false;
  });
}

function getDataRows(table: HTMLTableElement) {
  const columnCount = table.tHead?.rows[0]?.cells.length || 0;

  return Array.from(table.tBodies[0]?.rows || []).filter((row) => {
    if (row.dataset.paginationIgnore === "true") return false;
    if (row.cells.length !== 1) return true;

    const onlyCell = row.cells[0];
    return !(columnCount > 1 && onlyCell.colSpan >= columnCount);
  });
}

function refreshPagination(table: HTMLTableElement) {
  if (table.closest(".document-print-page") || table.dataset.paginationSkip === "true") {
    removePagination(table);
    return;
  }

  const allRows = Array.from(table.tBodies[0]?.rows || []);
  const rows = getDataRows(table);
  if (rows.length === 0) {
    removePagination(table);
    return;
  }

  allRows.forEach((row) => {
    if (!rows.includes(row)) row.hidden = false;
  });

  const id = table.dataset.paginationId || `table-${Math.random().toString(36).slice(2)}`;
  table.dataset.paginationId = id;
  const pageSize = Number(table.dataset.paginationPageSize || DEFAULT_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, Number(table.dataset.paginationPage || 1)), totalPages);
  table.dataset.paginationPage = String(page);

  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, rows.length);
  rows.forEach((row, index) => {
    row.hidden = index < start || index >= end;
  });

  let controls = document.querySelector<HTMLElement>(`[data-table-pagination-for="${id}"]`);
  if (!controls) {
    controls = document.createElement("div");
    controls.className = "dashboard-table-pagination";
    controls.dataset.tablePaginationFor = id;

    const summary = document.createElement("span");
    summary.className = "dashboard-table-pagination-summary";
    summary.dataset.paginationSummary = "true";

    const actions = document.createElement("div");
    actions.className = "dashboard-table-pagination-actions";

    const label = document.createElement("label");
    label.className = "dashboard-table-pagination-label";
    label.append("Itens por pagina ");

    const select = document.createElement("select");
    select.className = "dashboard-table-pagination-select";
    select.setAttribute("aria-label", "Itens por pagina");
    PAGE_SIZE_OPTIONS.forEach((option) => {
      const element = document.createElement("option");
      element.value = String(option);
      element.textContent = String(option);
      select.appendChild(element);
    });
    select.addEventListener("change", () => {
      table.dataset.paginationPageSize = select.value;
      table.dataset.paginationPage = "1";
      refreshPagination(table);
    });
    label.appendChild(select);

    const pageLabel = document.createElement("span");
    pageLabel.className = "dashboard-table-pagination-page";
    pageLabel.dataset.paginationPageLabel = "true";

    const previous = createButton("‹", "Pagina anterior");
    previous.dataset.paginationPrevious = "true";
    previous.addEventListener("click", () => {
      table.dataset.paginationPage = String(Math.max(1, Number(table.dataset.paginationPage || 1) - 1));
      refreshPagination(table);
    });

    const next = createButton("›", "Proxima pagina");
    next.dataset.paginationNext = "true";
    next.addEventListener("click", () => {
      table.dataset.paginationPage = String(Number(table.dataset.paginationPage || 1) + 1);
      refreshPagination(table);
    });

    actions.append(label, pageLabel, previous, next);
    controls.append(summary, actions);
    paginationHost(table).insertAdjacentElement("afterend", controls);
  }

  const select = controls.querySelector<HTMLSelectElement>("select");
  if (select) select.value = String(pageSize);
  const summary = controls.querySelector<HTMLElement>("[data-pagination-summary]");
  if (summary) summary.textContent = `Exibindo ${start + 1}-${end} de ${rows.length}`;
  const pageLabel = controls.querySelector<HTMLElement>("[data-pagination-page-label]");
  if (pageLabel) pageLabel.textContent = `${page} de ${totalPages}`;
  const previous = controls.querySelector<HTMLButtonElement>("[data-pagination-previous]");
  if (previous) previous.disabled = page <= 1;
  const next = controls.querySelector<HTMLButtonElement>("[data-pagination-next]");
  if (next) next.disabled = page >= totalPages;
}

function refreshTables() {
  document.querySelectorAll<HTMLTableElement>(".dashboard-main table").forEach(refreshPagination);
}

export default function DashboardTablePagination() {
  const pathname = usePathname();

  useEffect(() => {
    let scheduled = false;
    const run = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        refreshTables();
        scheduled = false;
      });
    };

    run();
    const root = document.querySelector(".dashboard-main");
    const observer = new MutationObserver(run);
    if (root) observer.observe(root, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
