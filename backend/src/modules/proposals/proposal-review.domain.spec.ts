import {
  financialComposition,
  paymentSummary,
  reviewProposal,
  type ReviewInput,
} from './proposal-review.domain';
import { buildPaymentSchedule } from './proposal-payment-plan';

const valid = (): ReviewInput => ({
  clientId: 'c',
  sellerId: 's',
  items: [
    {
      kind: 'PART_MATERIAL',
      catalogItemId: 'part',
      quantity: 1,
      unitPrice: 69.3,
    },
  ],
  unrestricted: true,
});
describe('Phase 1 proposal conference', () => {
  it('preserves technical warnings without converting them into approval blocks', () => {
    const report = reviewProposal({
      ...valid(),
      scopeSnapshot: {
        alerts: [
          {
            code: 'UNMAPPED_ITEM',
            severity: 'warning',
            message: 'Material sem classificação técnica',
          },
        ],
      },
    });
    expect(report.warnings).toBe(1);
    expect(
      report.issues.find((issue) => issue.code === 'SCOPE_UNMAPPED_ITEM')
        ?.severity,
    ).toBe('warning');
    expect(report.blocks('submit')).toEqual([]);
  });
  it('matches the reference total and deterministic category discount distribution', () => {
    const totals = financialComposition(
      [
        ...valid().items,
        {
          kind: 'CATALOG_SERVICE',
          catalogItemId: 's',
          quantity: 1,
          unitPrice: 440,
        },
      ],
      [
        { expenseType: 'MEAL', quantity: 150, unitPrice: 45 },
        { expenseType: 'PARKING', quantity: 165, unitPrice: 30 },
        { expenseType: 'DISPLACEMENT', quantity: 1, unitPrice: 1740 },
      ],
      697.47,
      true,
    );
    expect(totals).toMatchObject({
      subtotal: 13949.3,
      total: 13251.83,
      parts: 69.3,
      services: 440,
      expenses: 13440,
    });
    expect(
      totals.breakdown.reduce(
        (sum, row) => sum + Math.round(row.discount * 100),
        0,
      ),
    ).toBe(69747);
    expect(
      totals.breakdown.reduce(
        (sum, row) => sum + Math.round(row.total * 100),
        0,
      ),
    ).toBe(1325183);
  });
  it('keeps protected expenses outside the discount and assigns the residual deterministically', () => {
    const totals = financialComposition(
      [
        { kind: 'PART_MATERIAL', quantity: 1, unitPrice: 0.01 },
        { kind: 'OTHER', quantity: 1, unitPrice: 0.02 },
      ],
      [{ expenseType: 'MEAL', quantity: 1, unitPrice: 10 }],
      0.01,
      false,
    );
    expect(totals.breakdown.map((row) => row.discount)).toEqual([0, 0, 0.01]);
    expect(totals.total).toBe(10.02);
    expect(totals.eligible).toBe(0.03);
  });
  it('aggregates unrounded commercial lines before rounding, including half cents', () => {
    const totals = financialComposition(
      [
        { kind: 'PART_MATERIAL', quantity: 1, unitPrice: 0.005 },
        { kind: 'OTHER', quantity: 1, unitPrice: 0.005 },
      ],
      [],
      0,
      false,
    );
    expect(totals.parts + totals.services).toBe(0.01);
    expect(totals.total).toBe(0.01);
    expect(
      financialComposition(
        [{ kind: 'OTHER', quantity: 1, unitPrice: 1.005 }],
        [],
        0,
        false,
      ).total,
    ).toBe(1.01);
  });
  it('recomputes every subtotal when quantity, price and expense change', () => {
    const before = financialComposition(valid().items, [], 0, false);
    const after = financialComposition(
      [{ ...valid().items[0], quantity: 3, unitPrice: 80 }],
      [{ expenseType: 'MEAL', quantity: 2, unitPrice: 45 }],
      10,
      true,
    );
    expect(before.total).toBe(69.3);
    expect(after).toMatchObject({ parts: 240, expenses: 90, total: 320 });
  });
  it('allows incomplete drafts and blocks only decisive operations', () => {
    const report = reviewProposal({ items: [] });
    expect(report.blocks('draft')).toEqual([]);
    expect(report.blocks('submit').map((issue) => issue.code)).toEqual([
      'CLIENT_REQUIRED',
      'SELLER_REQUIRED',
      'ITEM_REQUIRED',
    ]);
  });
  it.each([0, -1, 1.5, NaN, Infinity])(
    'rejects invalid final item quantity %s',
    (quantity) => {
      const input = valid();
      input.items[0].quantity = quantity;
      expect(
        reviewProposal(input)
          .blocks('approve')
          .some((issue) => issue.code === 'QUANTITY_INVALID'),
      ).toBe(true);
    },
  );
  it('allows fractional positive hours while rejecting a mathematically inconsistent total', () => {
    const input = valid();
    input.items = [
      { kind: 'HOURLY_SERVICE', quantity: 1, hours: 1.5, unitPrice: 100 },
    ];
    input.totalValue = 149;
    expect(
      reviewProposal(input)
        .blocks('submit')
        .map((issue) => issue.code),
    ).toEqual(['TOTAL_MISMATCH']);
  });
  it('warns on configured atypical expenses without preventing drafts or approval', () => {
    const report = reviewProposal({
      ...valid(),
      expenses: [{ expenseType: 'MEAL', quantity: 150, unitPrice: 45 }],
      expenseRules: [
        { code: 'MEAL', name: 'Conferir refeições', sortOrder: 100 },
      ],
    });
    expect(
      report.issues.some((issue) => issue.code === 'EXPENSE_ATYPICAL'),
    ).toBe(true);
    expect(report.blocks('approve')).toEqual([]);
    expect(report.blocks('draft')).toEqual([]);
    expect(
      report.issues.find((issue) => issue.code === 'EXPENSE_ATYPICAL')
        ?.description,
    ).toContain('não foram inferidos');
  });
  it('distinguishes legacy wording from a proven structured cash-plan inconsistency', () => {
    const input = {
      ...valid(),
      paymentTerm: 'A_VISTA',
      hasDownPayment: true,
      downPaymentAmount: 10,
      installmentCount: 5,
    };
    expect(
      reviewProposal(input).issues.find(
        (issue) => issue.code === 'PAYMENT_LEGACY_AMBIGUOUS',
      )?.severity,
    ).toBe('warning');
    expect(reviewProposal(input).blocks('approve')).toEqual([]);
    expect(
      reviewProposal({
        ...input,
        paymentPlan: {
          preset: 'CASH',
          entryType: 'VALUE',
          entryValue: 10,
          balanceInstallments: 5,
        },
      })
        .blocks('approve')
        .some((issue) => issue.code === 'PAYMENT_PRESET_MISMATCH'),
    ).toBe(true);
  });
  it('describes the real cents schedule, entry and supplied date without changing receivables', () => {
    const rows = buildPaymentSchedule(13251.83, 250, 5);
    expect(
      rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0),
    ).toBe(1325183);
    expect(
      rows.filter((row) => row.stage === 'BALANCE').map((row) => row.amount),
    ).toEqual([2600.36, 2600.36, 2600.36, 2600.36, 2600.39]);
    const summary = paymentSummary(13251.83, 250, 5, '2026-10-30', 30);
    expect(summary).toContain('250,00');
    expect(summary).toContain('2.600,36');
    expect(summary).toContain('2.600,39');
    expect(summary).toContain('30/10/2026');
  });
  it('does not invent a fiscal allocation when two issuers are selected', () => {
    const report = reviewProposal({
      ...valid(),
      paymentProfiles: [
        { purpose: 'PARTS', issuerCompanyId: 'one' },
        { purpose: 'SERVICES', issuerCompanyId: 'two' },
      ],
    });
    expect(
      report.issues.find((issue) => issue.code === 'MULTIPLE_ISSUERS')
        ?.severity,
    ).toBe('warning');
    expect(report.totals.total).toBe(69.3);
    expect(report.blocks('approve')).toEqual([]);
  });
  it('requires a reason for intentional duplicates and invalidates it after a quantity change', () => {
    const input = valid();
    input.items.push({ ...input.items[0] });
    const issue = reviewProposal(input).issues.find(
      (issue) => issue.code === 'DUPLICATE_ITEM',
    )!;
    expect(reviewProposal(input).blocks('draft')).toEqual([]);
    expect(reviewProposal(input).blocks('submit')).toContainEqual(issue);
    input.acknowledgements = [
      {
        code: issue.code,
        signature: issue.signature,
        reason: 'Fornecimento em dois locais diferentes',
      },
    ];
    expect(reviewProposal(input).blocks('submit')).toEqual([]);
    input.items[1].quantity = 2;
    expect(
      reviewProposal(input)
        .blocks('submit')
        .some((issue) => issue.code === 'DUPLICATE_ITEM'),
    ).toBe(true);
  });
  it('ignores empty rows in totals without creating an identified commercial line', () => {
    const report = reviewProposal({
      ...valid(),
      items: [
        ...valid().items,
        { kind: 'OTHER', description: ' ', quantity: 1, unitPrice: 1000 },
      ],
    });
    expect(report.totals.total).toBe(69.3);
    expect(report.blocks('submit')).toEqual([]);
  });
  it('permits a request for higher authority without allowing the seller to approve the discount', () => {
    const report = reviewProposal({
      ...valid(),
      unrestricted: false,
      discountLimit: 5,
      discount: 6.93,
    });
    expect(report.blocks('submit')).toEqual([]);
    expect(
      report
        .blocks('approve')
        .some((issue) => issue.code === 'DISCOUNT_AUTHORITY'),
    ).toBe(true);
  });
  it('includes protected/unprotected expense policy and catalog price reductions in authority checks', () => {
    const input = {
      ...valid(),
      unrestricted: false,
      discountLimit: 5,
      discount: 8.46,
      expenses: [{ expenseType: 'MEAL', quantity: 1, unitPrice: 100 }],
    };
    expect(
      reviewProposal({ ...input, allowExpenseDiscount: true }).blocks(
        'approve',
      ),
    ).toEqual([]);
    expect(
      reviewProposal(input)
        .blocks('approve')
        .some((issue) => issue.code === 'DISCOUNT_AUTHORITY'),
    ).toBe(true);
    expect(
      reviewProposal({
        ...valid(),
        unrestricted: false,
        discountLimit: 5,
        items: [
          { ...valid().items[0], unitPrice: 50, referenceUnitPrice: 100 },
        ],
      })
        .blocks('approve')
        .some((issue) => issue.code === 'DISCOUNT_AUTHORITY'),
    ).toBe(true);
  });
  it('requires manual scope review again when its public text changes and blocks a stale source', () => {
    const input = {
      ...valid(),
      scopeText: 'Texto revisado',
      scopeSnapshot: { manuallyEdited: true },
    };
    const issue = reviewProposal(input).issues.find(
      (issue) => issue.code === 'SCOPE_MANUAL_REVIEW',
    )!;
    const acknowledged = {
      ...input,
      acknowledgements: [
        {
          code: issue.code,
          signature: issue.signature,
          reason: 'Conferido com o responsável técnico',
        },
      ],
    };
    expect(reviewProposal(acknowledged).blocks('submit')).toEqual([]);
    expect(
      reviewProposal({ ...acknowledged, scopeText: 'Outra atividade' }).blocks(
        'submit',
      ),
    ).not.toEqual([]);
    expect(
      reviewProposal({ ...valid(), scopeSnapshot: { stale: true } })
        .blocks('document')
        .some((issue) => issue.code === 'SCOPE_STALE'),
    ).toBe(true);
  });
});
