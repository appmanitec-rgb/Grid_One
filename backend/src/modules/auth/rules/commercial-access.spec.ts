import type { DatabaseService } from '../../../database/database.service';
import type { ExecutionContext } from '@nestjs/common';
import {
  proposalScope,
  opportunityScope,
  combinedDiscountPercent,
  checkOrderCreation,
  checkProposalPricing,
} from './commercial-access';
import { CommercialScopeGuard } from './commercial-scope.guard';
import { validateSync } from 'class-validator';
import { UpdateUserDto } from '../../users/dto/update-user.dto';
describe('commercial access integration points', () => {
  const rules = {
    version: 1,
    screens: {},
    commercial: { generators: false, partsServices: true, contracts: false },
    orderTypes: { EMERGENCY: true },
    onCallShifts: [],
  };
  const user = {
    id: 'sales',
    role: 'SALES',
    isSystemMaster: false,
    accessRules: rules,
    approvalDiscountLimit: 5,
  };
  const db = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    proposal: { findUnique: jest.fn().mockResolvedValue({ type: 'CONTRACT' }) },
    salesOpportunity: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ pipeline: 'COMMERCIAL_01_GENERATORS' }),
    },
  };
  it('filters list and aggregate predicates to the assigned portfolio', async () => {
    expect(
      await proposalScope(db as unknown as DatabaseService, 'sales'),
    ).toEqual({
      type: { in: ['PARTS', 'SERVICES', 'PARTS_AND_SERVICES'] },
    });
    expect(
      await opportunityScope(db as unknown as DatabaseService, 'sales'),
    ).toEqual({
      pipeline: { in: ['COMMERCIAL_03_PARTS_SERVICES'] },
    });
  });
  it('blocks a direct proposal URL and a linked opportunity from another portfolio', async () => {
    const guard = new CommercialScopeGuard(db as unknown as DatabaseService);
    const context = (request: any) =>
      ({
        switchToHttp: () => ({ getRequest: () => request }),
      }) as unknown as ExecutionContext;
    await expect(
      guard.canActivate(
        context({
          user: { ...user, sub: user.id },
          path: '/proposals/foreign',
          params: { id: 'foreign' },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      guard.canActivate(
        context({
          user: { ...user, sub: user.id },
          path: '/proposals',
          params: {},
          body: { type: 'PARTS', salesOpportunityId: 'other' },
        }),
      ),
    ).rejects.toThrow();
  });
  it('counts line and general discounts together', () => {
    expect(
      combinedDiscountPercent(
        [{ quantity: 2, unitPrice: 50, discountPercent: 5 }],
        5,
      ),
    ).toBe(10);
  });
  it('rejects task creation when the actor has no assigned task type', async () => {
    await expect(
      checkOrderCreation(
        db as unknown as DatabaseService,
        'sales',
        'PREVENTIVE',
      ),
    ).rejects.toThrow();
  });
  it('includes a lowered catalogue price in the discount ceiling', async () => {
    const pricingDb = {
      ...db,
      catalogItem: {
        findMany: jest.fn().mockResolvedValue([{ id: 'part', basePrice: 100 }]),
      },
    };
    await expect(
      checkProposalPricing(
        pricingDb as unknown as DatabaseService,
        'sales',
        [{ catalogItemId: 'part', quantity: 1, unitPrice: 90 }],
        0,
      ),
    ).rejects.toThrow();
    await expect(
      checkProposalPricing(
        pricingDb as unknown as DatabaseService,
        'sales',
        [{ catalogItemId: 'part', quantity: 1, unitPrice: 95 }],
        0,
      ),
    ).resolves.toBeUndefined();
  });
  it('allows currency rounding at the ceiling but rejects an extra cent', async () => {
    await expect(
      checkProposalPricing(
        db as unknown as DatabaseService,
        'sales',
        [{ quantity: 1, unitPrice: 59.3 }],
        2.97,
      ),
    ).resolves.toBeUndefined();
    await expect(
      checkProposalPricing(
        db as unknown as DatabaseService,
        'sales',
        [{ quantity: 1, unitPrice: 59.3 }],
        2.98,
      ),
    ).rejects.toThrow();
  });
  it('keeps the generator price floor when accessories precede the generator line', async () => {
    const pricingDb = {
      ...db,
      catalogItem: {
        findMany: jest.fn().mockResolvedValue([{ id: 'part', basePrice: 100 }]),
      },
      commercialGenerator: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ basePrice: 1000, suggestedPrice: 1000 }),
      },
    };
    const rows = [
      { catalogItemId: 'part', quantity: 2, unitPrice: 100 },
      { quantity: 1, unitPrice: 1000 },
    ];
    for (const items of [rows, [...rows].reverse()])
      await expect(
        checkProposalPricing(
          pricingDb as unknown as DatabaseService,
          'sales',
          items,
          60,
          'generator',
        ),
      ).resolves.toBeUndefined();
    await expect(
      checkProposalPricing(
        pricingDb as unknown as DatabaseService,
        'sales',
        [rows[0], { quantity: 1, unitPrice: 900 }],
        0,
        'generator',
      ),
    ).rejects.toThrow();
  });
  it('validates ceilings, screen names and chronological duty windows', () => {
    const invalid = Object.assign(new UpdateUserDto(), {
      approvalDiscountLimit: 101,
      accessRules: {
        ...rules,
        screens: { unknown: { view: true, actions: {} } },
      },
    });
    expect(validateSync(invalid).map((e) => e.property)).toEqual(
      expect.arrayContaining(['approvalDiscountLimit', 'accessRules']),
    );
    const backwards = Object.assign(new UpdateUserDto(), {
      accessRules: {
        ...rules,
        onCallShifts: [
          { startsAt: '2026-10-20T21:00:00Z', endsAt: '2026-10-19T11:00:00Z' },
        ],
      },
    });
    expect(
      validateSync(backwards).some((e) => e.property === 'accessRules'),
    ).toBe(true);
    const valid = Object.assign(new UpdateUserDto(), {
      approvalDiscountLimit: 5,
      accessRules: rules,
    });
    expect(validateSync(valid)).toHaveLength(0);
  });
});
