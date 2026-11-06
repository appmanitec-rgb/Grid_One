"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";

type ListPage<T, S> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  summary?: S;
};
type QueryState<T, S> = {
  key: string;
  data?: ListPage<T, S>;
  error: string;
  loading: boolean;
};

export function usePagedList<T, S = undefined>({
  endpoint,
  filters = {},
  search,
  initialSummary,
  initialPage = 1,
  initialPageSize = 20,
  initialSort = "name",
  initialDirection = "asc",
}: {
  endpoint: string;
  filters?: Record<string, string>;
  search: string;
  initialSummary?: S;
  initialPage?: number;
  initialPageSize?: number;
  initialSort?: string;
  initialDirection?: "asc" | "desc";
}) {
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [pagination, setPagination] = useState({
    scope: new URLSearchParams(filters).toString() + "|" + search.trim(),
    page: initialPage,
    pageSize: initialPageSize,
  });
  const [sort, setSort] = useState(initialSort);
  const [direction, setDirection] = useState<"asc" | "desc">(initialDirection);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<QueryState<T, S>>({
    key: "",
    error: "",
    loading: true,
  });
  const filterQuery = new URLSearchParams(filters).toString();
  const scope = filterQuery + "|" + debouncedSearch.trim();
  const requestPage = pagination.scope === scope ? pagination.page : 1;
  const query = useMemo(() => {
    const params = new URLSearchParams(filterQuery);
    params.set("q", debouncedSearch.trim());
    params.set("page", String(requestPage));
    params.set("pageSize", String(pagination.pageSize));
    params.set("sort", sort);
    params.set("direction", direction);
    return params.toString();
  }, [
    filterQuery,
    debouncedSearch,
    requestPage,
    pagination.pageSize,
    sort,
    direction,
  ]);
  const key = endpoint + "?" + query + "#" + revision;

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, key, error: "", loading: true }));
    async function load() {
      try {
        const response = await apiFetch(endpoint + "?" + query, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            await readApiErrorMessage(
              response,
              "Não foi possível carregar a lista.",
            ),
          );
        const data = (await response.json()) as ListPage<T, S>;
        if (!controller.signal.aborted)
          setState({ key, data, error: "", loading: false });
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({
            key,
            error:
              error instanceof Error
                ? error.message
                : "Não foi possível carregar a lista.",
            loading: false,
          });
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [endpoint, query, key]);

  const current = state.key === key && !state.loading;
  const data = current ? state.data : undefined;
  const loading = !current;
  const summary = state.data?.summary ?? initialSummary;
  return {
    hasLoaded: Boolean(state.data),
    items: data?.items ?? [],
    total: data?.total ?? 0,
    summary: summary as S,
    loading,
    error: state.key === key ? state.error : "",
    refresh: () => setRevision((current) => current + 1),
    sort,
    direction,
    setOrder: (column: string, order: "asc" | "desc") => {
      setSort(column);
      setDirection(order);
      setPagination((current) => ({ ...current, scope, page: 1 }));
    },
    onSort: (column: string) => {
      setDirection(sort === column && direction === "asc" ? "desc" : "asc");
      setSort(column);
      setPagination((current) => ({ ...current, scope, page: 1 }));
    },
    paginationProps: {
      totalItems: data?.total ?? 0,
      page: data?.page ?? requestPage,
      pageSize: pagination.pageSize,
      onPageChange: (page: number) =>
        setPagination((current) => ({ ...current, scope, page })),
      onPageSizeChange: (pageSize: number) =>
        setPagination({ scope, page: 1, pageSize }),
      disabled: loading,
    },
  };
}
