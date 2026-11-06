import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  assertStockQuantity,
  assertStockState,
  operationHash,
  qrBaseUrl,
  stockState,
} from './stock-locations.domain';
describe('Warehouse position rules', () => {
  const balance = {
    id: 'balance',
    locationId: 'position',
    physicalQty: 10,
    reservedQty: 3,
    updatedAt: new Date('2026-11-06T10:00:00Z'),
    lastVerifiedAt: null,
  };
  it('rejects a stale count after a receipt, reservation or position change', () => {
    const expected = stockState(balance);
    expect(() => assertStockState(balance, expected)).not.toThrow();
    for (const change of [
      { physicalQty: 11 },
      { reservedQty: 4 },
      { locationId: 'other' },
      { updatedAt: new Date('2026-11-06T10:01:00Z') },
    ])
      expect(() =>
        assertStockState({ ...balance, ...change }, expected),
      ).toThrow(ConflictException);
  });
  it('treats reordered payload keys as the same confirmation but not changed quantities', () => {
    expect(operationHash({ quantity: 2, client: { name: 'A', id: 1 } })).toBe(
      operationHash({ client: { id: 1, name: 'A' }, quantity: 2 }),
    );
    expect(operationHash({ quantity: 2 })).not.toBe(
      operationHash({ quantity: 3 }),
    );
  });
  it('counts indivisible pieces as whole units and accepts measured quantities', () => {
    expect(() => assertStockQuantity(2.5, 'UN')).toThrow(BadRequestException);
    expect(() => assertStockQuantity(2.5, 'L')).not.toThrow();
    expect(() => assertStockQuantity(0, 'UN')).not.toThrow();
  });
  it.each([-1, NaN, Infinity, 0.0000001, 1000000001])(
    'rejects invalid stock quantity %s',
    (value) =>
      expect(() => assertStockQuantity(value, 'L')).toThrow(
        BadRequestException,
      ),
  );
  it.each([
    'javascript:alert(1)',
    'https://user:pass@example.com',
    'https://example.com/path',
    'https://example.com/?token=secret',
    'https://example.com/#frag',
  ])('rejects unsafe or ambiguous label origin %s', (url) =>
    expect(() => qrBaseUrl(url)).toThrow(BadRequestException),
  );
  it('keeps only a clean origin, including a local network server', () => {
    expect(qrBaseUrl('https://SISTEMA.EXAMPLE.COM/')).toBe(
      'https://sistema.example.com',
    );
    expect(qrBaseUrl('http://192.168.0.25:3001')).toBe(
      'http://192.168.0.25:3001',
    );
  });
});
