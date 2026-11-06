"use client";
import { useEffect, useState } from "react";
import { commercialFetch, Template } from "@/lib/commercial-workspace";
function VersionList({ templateKey }: { templateKey: string }) {
  const [data, setData] = useState<{ items: Template[]; hasMore: boolean }>();
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined);
    setError("");
    commercialFetch<{ items: Template[]; hasMore: boolean }>(
      `/library/templates/${templateKey}/versions?page=${page}`,
      { signal: controller.signal },
    )
      .then(setData)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, [templateKey, page]);
  return (
    <div className="mt-3 space-y-3">
      {error ? (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      ) : !data ? (
        <p role="status" className="text-sm text-slate-500">
          Carregando histórico…
        </p>
      ) : (
        data.items.map((item) => (
          <details
            key={item.id}
            className="rounded-lg border border-slate-200 p-3"
          >
            <summary className="cursor-pointer text-sm">
              Versão {item.version} ·{" "}
              {item.publishedAt
                ? `Publicada em ${new Date(item.publishedAt).toLocaleString("pt-BR")}`
                : "Rascunho"}
            </summary>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-600">
              {item.body}
            </p>
          </details>
        ))
      )}
      <div className="flex gap-2">
        <button
          className="app-button app-button-secondary"
          disabled={!data || page <= 1}
          onClick={() => setPage((n) => n - 1)}
        >
          Anterior
        </button>
        <button
          className="app-button app-button-secondary"
          disabled={!data?.hasMore}
          onClick={() => setPage((n) => n + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

export default function TemplateHistory({
  templateKey,
}: {
  templateKey: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="mt-3 rounded-lg border border-slate-200 p-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-medium">
        Histórico de versões
      </summary>
      {open ? <VersionList templateKey={templateKey} /> : null}
    </details>
  );
}
