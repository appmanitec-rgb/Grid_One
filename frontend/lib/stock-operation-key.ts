// randomUUID is absent on some HTTP LAN pages; getRandomValues still supplies a UUID v4.
export function stockOperationKey(
  source: {
    randomUUID?: () => string;
    getRandomValues: (buffer: Uint8Array) => Uint8Array;
  } = globalThis.crypto,
): string {
  if (typeof source?.randomUUID === "function") return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const value = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20),
  ].join("-");
}
