"use client";

import { InterfaceIcon } from "./InterfaceIcon";

export function ListSortHeader({
  column,
  sort,
  direction,
  onSort,
  children,
}: {
  column: string;
  sort: string;
  direction: "asc" | "desc";
  onSort: (column: string) => void;
  children: string;
}) {
  const active = column === sort;
  return (
    <th
      className="p-4 font-medium dashboard-table-sortable-header"
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
    >
      {children}
      <button
        type="button"
        className="dashboard-table-sort-button"
        aria-label={`Ordenar por ${children}`}
        title={`Ordenar por ${children}`}
        data-direction={active ? direction : "none"}
        onClick={() => onSort(column)}
      >
        {active ? (
          <InterfaceIcon name={direction === "asc" ? "arrow-up" : "arrow-down"} className="h-3.5 w-3.5" />
        ) : (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
            <path d="M5 12V3m-2 2 2-2 2 2M11 4v9m-2-2 2 2 2-2" />
          </svg>
        )}
      </button>
    </th>
  );
}
