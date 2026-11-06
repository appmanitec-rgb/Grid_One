/** Retries only the idempotent PDF read, never saving or approval requests. */
export async function readPreviewWithRetry(
  readPdf: () => Promise<Response>,
): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await readPdf();
      if (![500, 502, 503, 504].includes(response.status)) return response;
      await response.body?.cancel();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
    }
  }
  throw new Error(
    'Não foi possível carregar o PDF. Clique em "Visualizar proposta" para tentar novamente. O rascunho permanece salvo.',
  );
}

export async function withPreviewDeadline<T>(
  operation: () => Promise<T>,
  cancel?: () => void,
  timeoutMs = 20000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("A renderização excedeu o tempo de espera."));
          cancel?.();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
