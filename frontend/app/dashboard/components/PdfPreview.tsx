"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { withPreviewDeadline } from "@/lib/pdf-preview";

/** Renders the exact emitted PDF bytes, independently of native PDF plug-ins. */
export default function PdfPreview({
  url,
  onRendered,
}: {
  url: string;
  onRendered?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const callback = useRef(onRendered);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [attempt, setAttempt] = useState(0);
  callback.current = onRendered;

  useEffect(() => {
    let disposed = false;
    let task:
      | ReturnType<(typeof import("pdfjs-dist"))["getDocument"]>
      | undefined;
    setBusy(true);
    setError("");
    setDocument(null);
    setPage(1);
    void withPreviewDeadline(() => import("pdfjs-dist"))
      .then(async (pdfjs) => {
        if (disposed) return;
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        task = pdfjs.getDocument({ url });
        const loadingTask = task;
        const pdf = await withPreviewDeadline(
          () => loadingTask.promise,
          () => {
            void loadingTask.destroy();
          },
        );
        if (!disposed) setDocument(pdf);
      })
      .catch(() => {
        if (!disposed) {
          setError(
            "Não foi possível carregar o PDF. Tente novamente ou baixe a prévia para conferir.",
          );
          setBusy(false);
        }
      });
    return () => {
      disposed = true;
      void task?.destroy();
    };
  }, [url, attempt]);

  useEffect(() => {
    if (!document || !canvas.current) return;
    let disposed = false;
    let render: RenderTask | undefined;
    setBusy(true);
    setError("");
    setText("");
    void document
      .getPage(page)
      .then(async (pdfPage) => {
        if (disposed || !canvas.current) return;
        const surface = canvas.current;
        const viewport = pdfPage.getViewport({ scale: 1.5 });
        surface.width = viewport.width;
        surface.height = viewport.height;
        render = pdfPage.render({ canvas: surface, viewport });
        const rendering = render;
        await withPreviewDeadline(
          () => rendering.promise,
          () => rendering.cancel(),
        );
        const content = await pdfPage.getTextContent();
        if (disposed) return;
        setText(
          content.items
            .map((item) =>
              "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
            )
            .join(""),
        );
        setBusy(false);
        callback.current?.();
      })
      .catch((reason: unknown) => {
        if (
          !disposed &&
          !(
            reason instanceof Error &&
            reason.name === "RenderingCancelledException"
          )
        ) {
          setError(
            "Não foi possível renderizar esta página. Tente novamente ou baixe a prévia para conferir.",
          );
          setBusy(false);
        }
      });
    return () => {
      disposed = true;
      render?.cancel();
    };
  }, [document, page]);

  return (
    <section
      aria-label="Prévia renderizada do documento do cliente"
      className="pdf-preview space-y-3"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="app-icon-button"
            aria-label="Página anterior do PDF"
            disabled={busy || page <= 1}
            onClick={() => setPage(page - 1)}
          >
            ‹
          </button>
          <span className="text-sm tabular-nums">
            Página {page} de {document?.numPages || "—"}
          </span>
          <button
            type="button"
            className="app-icon-button"
            aria-label="Próxima página do PDF"
            disabled={busy || !document || page >= document.numPages}
            onClick={() => setPage(page + 1)}
          >
            ›
          </button>
        </div>
        <a
          className="app-button app-button-secondary"
          href={url}
          download="previa-proposta.pdf"
        >
          Baixar prévia PDF
        </a>
      </div>
      <p role="status" className="text-sm text-[var(--text-muted)]">
        {busy
          ? "Renderizando o documento…"
          : error
            ? "A prévia não foi renderizada."
            : "Página renderizada. Confira o conteúdo antes de continuar."}
      </p>
      {error ? (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-[var(--border)] p-3"
        >
          <p>{error}</p>
          <button
            type="button"
            className="app-button app-button-secondary"
            onClick={() => setAttempt(attempt + 1)}
          >
            Tentar novamente
          </button>
        </div>
      ) : null}
      <canvas
        ref={canvas}
        hidden={Boolean(error)}
        role="img"
        aria-label={`Página ${page} da proposta. Texto disponível logo abaixo.`}
        className="h-auto w-full rounded border border-slate-300 bg-white"
      />
      {text ? (
        <details className="rounded-lg border border-[var(--border)] p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Texto acessível desta página
          </summary>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{text}</p>
        </details>
      ) : null}
    </section>
  );
}
