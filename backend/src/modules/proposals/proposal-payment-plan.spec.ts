import {
  buildPaymentSchedule,
  resolvePaymentPlan,
  ProposalPaymentPlan,
} from './proposal-payment-plan';

const plan = (
  preset: ProposalPaymentPlan['preset'],
  patch: Partial<ProposalPaymentPlan> = {},
): ProposalPaymentPlan => ({
  preset,
  entryType: 'PERCENTAGE',
  entryValue: 0,
  balanceInstallments: 1,
  ...patch,
});

describe('composição comercial do pagamento', () => {
  it.each([
    ['50_50', 254.65, 254.65],
    ['30_70', 152.79, 356.51],
  ] as const)('calcula %s sobre o total final', (preset, entry, balance) => {
    const result = resolvePaymentPlan(plan(preset), 509.3);
    expect(result.downPaymentAmount).toBe(entry);
    expect(result.schedule.map((row) => row.amount)).toEqual([entry, balance]);
  });
  it('a condição padrão prevalece sobre valores enviados pelo cliente', () => {
    const result = resolvePaymentPlan(
      plan('50_50', {
        entryType: 'VALUE',
        entryValue: 1,
        balanceInstallments: 5,
      }),
      1000,
    );
    expect(result.plan).toEqual(plan('50_50', { entryValue: 50 }));
    expect(result.schedule.map((row) => row.amount)).toEqual([500, 500]);
  });
  it('distribui os centavos restantes na última parcela sem alterar o total', () => {
    const result = resolvePaymentPlan(
      plan('CUSTOM', { entryValue: 30, balanceInstallments: 3 }),
      1000.01,
    );
    expect(result.schedule.map((row) => row.amount)).toEqual([
      300, 233.33, 233.33, 233.35,
    ]);
    expect(
      result.schedule.reduce(
        (sum, row) => sum + Math.round(row.amount * 100),
        0,
      ),
    ).toBe(100001);
  });
  it('permite entrada em valor e parcelamento do saldo', () => {
    const result = resolvePaymentPlan(
      plan('CUSTOM', {
        entryType: 'VALUE',
        entryValue: 250,
        balanceInstallments: 5,
      }),
      509.3,
    );
    expect(result.schedule.map((row) => row.amount)).toEqual([
      250, 51.86, 51.86, 51.86, 51.86, 51.86,
    ]);
  });
  it('gera somente a entrada no pagamento integral antecipado', () => {
    const result = resolvePaymentPlan(plan('PREPAID'), 100);
    expect(result.schedule.map((row) => row.amount)).toEqual([100]);
    expect(result.plan.balanceInstallments).toBe(0);
  });
  it.each([
    plan('CUSTOM', { entryValue: 101 }),
    plan('CUSTOM', { entryType: 'VALUE', entryValue: 1001 }),
    plan('CUSTOM', { balanceInstallments: 0 }),
    plan('CUSTOM', { balanceInstallments: 37 }),
  ])('rejeita uma composição inválida', (input) =>
    expect(() => resolvePaymentPlan(input, 1000)).toThrow(),
  );
  it('mantém o valor das propostas antigas ao montar o cronograma', () =>
    expect(
      buildPaymentSchedule(509.3, 250, 5).map((row) => row.amount),
    ).toEqual([250, 51.86, 51.86, 51.86, 51.86, 51.86]));
});
