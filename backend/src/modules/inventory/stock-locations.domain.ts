import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';

export const stockRound = (value: number) => Math.round(value * 1e6) / 1e6;
export function operationHash(value: unknown): string {
  const stable = (input: unknown): unknown =>
    Array.isArray(input)
      ? input.map(stable)
      : input && typeof input === 'object'
        ? Object.fromEntries(
            Object.entries(input)
              .filter(([, v]) => v !== undefined)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, stable(v)]),
          )
        : input;
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}
export function stockState(balance: {
  id: string;
  locationId: string | null;
  physicalQty: number;
  reservedQty: number;
  updatedAt: Date;
  lastVerifiedAt?: Date | null;
}) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        balance.id,
        balance.locationId,
        balance.physicalQty,
        balance.reservedQty,
        balance.updatedAt.toISOString(),
        balance.lastVerifiedAt?.toISOString() ?? null,
      ]),
    )
    .digest('hex');
}
export function assertStockState(
  balance: Parameters<typeof stockState>[0],
  expected: string,
) {
  if (stockState(balance) !== expected)
    throw new ConflictException(
      'O saldo ou a posição mudou. Atualize a conferência antes de confirmar.',
    );
}
export function assertStockQuantity(quantity: number, unit?: string | null) {
  if (
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    quantity > 1e9 ||
    Math.abs(quantity - stockRound(quantity)) > 1e-9
  )
    throw new BadRequestException(
      'Informe uma quantidade válida, com até seis casas decimais.',
    );
  if (
    ['UN', 'UND', 'UNIDADE', 'PC', 'PÇ'].includes((unit ?? '').toUpperCase()) &&
    !Number.isInteger(quantity)
  )
    throw new BadRequestException('Este item é contado em unidades inteiras.');
}
export function qrBaseUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw Error();
    return url.origin;
  } catch {
    throw new BadRequestException(
      'Informe o endereço do sistema, como https://sistema.empresa.com.br, sem caminho, usuário ou senha.',
    );
  }
}
export function isLoopbackUrl(value: string) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname);
}
