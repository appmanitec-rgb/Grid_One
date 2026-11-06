// A scanned label can resume after login; external URLs and other routes never redirect.
export function stockLocationReturnPath(
  value: string | null | undefined,
): string | null {
  return value &&
    /^\/dashboard\/inventory\/locations\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : null;
}
