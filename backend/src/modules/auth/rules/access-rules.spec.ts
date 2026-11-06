import {
  assertDiscount,
  canReadBankBalances,
  assertOrderCreation,
  assertPortfolio,
  assertScreen,
  readRules,
  RuleActor,
} from './access-rules';
describe('detailed access restrictions', () => {
  const actor: RuleActor = {
    sub: 'employee',
    role: 'SALES',
    approvalDiscountLimit: 5,
    accessRules: {
      commercial: { partsServices: true },
      screens: { renewals: { view: false, actions: {} } },
      orderTypes: { EMERGENCY: true },
      onCallShifts: [
        { startsAt: '2026-10-16T21:00:00Z', endsAt: '2026-10-19T11:00:00Z' },
      ],
    },
  };
  it('does not grant portfolios without explicit assignment', () => {
    expect(readRules(null).commercial).toEqual({
      generators: false,
      partsServices: false,
      contracts: false,
    });
    expect(() => assertPortfolio(actor, 'partsServices')).not.toThrow();
    expect(() => assertPortfolio(actor, 'contracts')).toThrow();
    expect(() => assertPortfolio(actor, 'generators')).toThrow();
  });
  it('supports a manager explicitly assigned all portfolios', () => {
    const manager = {
      ...actor,
      role: 'MANAGER',
      accessRules: {
        commercial: { generators: true, partsServices: true, contracts: true },
      },
    };
    for (const p of ['generators', 'partsServices', 'contracts'] as const)
      expect(() => assertPortfolio(manager, p)).not.toThrow();
    expect(() =>
      assertPortfolio({ ...actor, role: 'MANAGER' }, 'contracts'),
    ).toThrow();
  });
  it('rejects discounts above an individual ceiling including nonfinite inputs', () => {
    expect(() => assertDiscount(actor, 5)).not.toThrow();
    for (const n of [5.01, 10, NaN, Infinity, -1])
      expect(() => assertDiscount(actor, n)).toThrow();
    expect(() =>
      assertDiscount({ ...actor, approvalDiscountLimit: 10 }, 10),
    ).not.toThrow();
    expect(() =>
      assertDiscount({ ...actor, approvalDiscountLimit: null }, 1),
    ).toThrow();
  });
  it('checks task types and real overnight/weekend duty boundaries', () => {
    const tech = { ...actor, role: 'TECHNICIAN' };
    expect(() =>
      assertOrderCreation(tech, 'EMERGENCY', new Date('2026-10-16T20:59:59Z')),
    ).toThrow();
    expect(() =>
      assertOrderCreation(tech, 'EMERGENCY', new Date('2026-10-16T21:00:00Z')),
    ).not.toThrow();
    expect(() =>
      assertOrderCreation(tech, 'EMERGENCY', new Date('2026-10-18T03:00:00Z')),
    ).not.toThrow();
    expect(() =>
      assertOrderCreation(tech, 'EMERGENCY', new Date('2026-10-19T11:00:00Z')),
    ).toThrow();
    expect(() => assertOrderCreation(tech, 'CORRECTIVE')).toThrow();
    expect(() =>
      assertOrderCreation(
        { ...actor, accessRules: { orderTypes: { PREVENTIVE: true } } },
        'PREVENTIVE',
      ),
    ).not.toThrow();
  });
  it('requires explicit actions when a screen rule is configured', () => {
    expect(() => assertScreen(actor, 'renewals')).toThrow();
    expect(() =>
      assertScreen(
        {
          ...actor,
          accessRules: {
            screens: {
              payables: { view: true, actions: { create: true, pay: false } },
            },
          },
        },
        'payables',
        'pay',
      ),
    ).toThrow();
  });
  it('keeps the three administrators unrestricted', () => {
    const admin = { ...actor, role: 'ADMIN' };
    expect(() => assertPortfolio(admin, 'contracts')).not.toThrow();
    expect(() => assertOrderCreation(admin, 'PREVENTIVE')).not.toThrow();
    expect(() => assertDiscount(admin, 100)).not.toThrow();
  });
  it('does not open sibling screens just because a shared module becomes visible', () => {
    expect(() =>
      assertScreen(
        {
          sub: 'staff',
          accessRules: {
            screens: { receivables: { view: true, actions: {} } },
          },
        },
        'payables',
      ),
    ).toThrow();
    expect(() =>
      assertScreen(
        {
          sub: 'staff',
          accessRules: {
            screens: { receivables: { view: true, actions: {} } },
          },
        },
        'receivables',
      ),
    ).not.toThrow();
  });

  it('keeps bank balances out of receivable-only lookup access', () => {
    expect(
      canReadBankBalances(
        {
          sub: 'staff',
          accessRules: {
            screens: { receivables: { view: true, actions: {} } },
          },
        },
        true,
      ),
    ).toBe(false);
    expect(
      canReadBankBalances(
        {
          sub: 'staff',
          accessRules: { screens: { cashFlow: { view: true, actions: {} } } },
        },
        true,
      ),
    ).toBe(true);
  });
});
