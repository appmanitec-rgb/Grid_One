import {
  decimal,
  freightShares,
  money,
  offerNet,
  projectedShortage,
} from './procurement-calculations';
describe('procurement monetary and availability rules', () => {
  it('uses decimal money instead of binary floating point', () =>
    expect(money(decimal('0.1').plus('0.2')).toFixed(2)).toBe('0.30'));
  it('applies discounts before shared freight and tax', () =>
    expect(offerNet(3, '19.99', 7).toFixed(2)).toBe('55.77'));
  it('allocates every freight cent without increasing the global amount', () => {
    const parts = freightShares('0.01', [1, 1, 1]);
    expect(parts.map((p) => p.toFixed(2))).toEqual(['0.00', '0.00', '0.01']);
    expect(parts.reduce((s, p) => s.plus(p), decimal(0)).toFixed(2)).toBe(
      '0.01',
    );
  });
  it('supports rateio by quantity or value with a deterministic residual', () =>
    expect(freightShares(100, [1, 2]).map((p) => p.toFixed(2))).toEqual([
      '33.33',
      '66.67',
    ]));
  it('does not silently distribute freight without a positive base', () =>
    expect(() => freightShares(10, [0, 0])).toThrow());
  it('considers both reservations and already ordered materials', () => {
    expect(projectedShortage(20, 10, 4, 12)).toBe(2);
    expect(projectedShortage(10, 12, 4, 5)).toBe(0);
  });
});
