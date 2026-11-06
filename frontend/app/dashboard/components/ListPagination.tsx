"use client";

import { InterfaceIcon } from "./InterfaceIcon";
import { SelectField } from "@/app/dashboard/components/SelectField";
import { useEffect, useMemo, useState } from "react";

export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

type PaginationProps = {
  disabled?: boolean;
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export function useListPagination<T>(items: readonly T[], resetKey: string) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return {
    paginatedItems,
    paginationProps: {
      totalItems: items.length,
      page,
      pageSize,
      onPageChange: setPage,
      onPageSizeChange: (nextPageSize: number) => {
        setPageSize(nextPageSize);
        setPage(1);
      },
    } satisfies PaginationProps,
  };
}

export default function ListPagination({
  disabled = false,
  totalItems,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const firstItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);

  return (
    <nav aria-label="Paginação da lista" className="dashboard-list-pagination flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p aria-live="polite" className="text-xs text-slate-500">
        Exibindo {firstItem}-{lastItem} de {totalItems}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          Itens por página
          <SelectField
            disabled={disabled}
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500"
            aria-label="Itens por página"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </SelectField>
        </label>

        <span className="min-w-20 text-center text-xs font-semibold text-slate-500">
          {page} de {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
          className="app-icon-button"
          aria-label="Página anterior"
          title="Página anterior"
        >
          <InterfaceIcon name="chevron-right" className="h-4 w-4 rotate-180" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= totalPages}
          className="app-icon-button"
          aria-label="Próxima página"
          title="Próxima página"
        >
          <InterfaceIcon name="chevron-right" className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
