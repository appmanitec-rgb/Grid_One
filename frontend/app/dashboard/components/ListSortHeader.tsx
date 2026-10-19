"use client";

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
        {active ? (direction === "asc" ? "↑" : "↓") : "↕"}
      </button>
    </th>
  );
}
