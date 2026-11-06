import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RuleActor } from '../auth/rules/access-rules';
import {
  managementAllowed,
  managedOpportunityScope,
  managedProposalScope,
} from '../auth/rules/commercial-management';
import {
  stripCommercialCosts,
  commercialVisibility,
} from '../auth/rules/commercial-privacy.interceptor';
import {
  compareCommercialVersions,
  estimateProfit,
  proposalSourceHash,
  renderTemplate,
  validateTemplate,
} from './commercial.domain';
import { CommercialEstimateInput } from './commercial.dto';
import { CommercialService } from './commercial.service';

const actor: RuleActor = {
  sub: 'seller',
  role: 'SALES',
  accessRules: { commercial: { partsServices: true } },
};
const admin: RuleActor = {
  sub: 'admin',
  role: 'ADMIN',
  accessRules: {
    commercialManagement: {
      partsServices: {
        responsible: true,
        team: true,
        costs: true,
        margins: true,
        templates: true,
        publishTemplates: true,
      },
    },
  },
};
describe('commercial access by administrator and portfolio', () => {
  it('does not inherit sensitive rights from ADMIN or system master', () => {
    for (const current of [
      { sub: 'admin', role: 'ADMIN' },
      { sub: 'master', isSystemMaster: true },
    ])
      for (const action of [
        'team',
        'costs',
        'margins',
        'templates',
        'publishTemplates',
      ] as const)
        expect(managementAllowed(current, 'partsServices', action)).toBe(false);
  });
  it('requires an explicit responsibility and its own action grant', () => {
    expect(managementAllowed(admin, 'partsServices', 'costs')).toBe(true);
    expect(managementAllowed(admin, 'contracts', 'costs')).toBe(false);
    expect(
      managementAllowed({ ...admin, role: 'CLIENT' }, 'partsServices', 'costs'),
    ).toBe(false);
    expect(
      managementAllowed(
        {
          ...actor,
          accessRules: {
            commercial: { partsServices: true },
            commercialManagement: { partsServices: { costs: true } },
          },
        },
        'partsServices',
        'costs',
      ),
    ).toBe(false);
  });
  it('designates a manager without changing the global role or another portfolio', () => {
    const manager = {
      ...admin,
      role: 'MANAGER',
      accessRules: {
        commercial: { partsServices: true },
        commercialManagement: {
          partsServices: { responsible: true, costs: true },
        },
      },
    };
    expect(managementAllowed(manager, 'partsServices', 'costs')).toBe(true);
    expect(managementAllowed(manager, 'partsServices', 'team')).toBe(false);
    expect(managementAllowed(manager, 'contracts', 'costs')).toBe(false);
    expect(manager.role).toBe('MANAGER');
  });
  it('does not reuse a broad catalog cost flag to expose costing to sellers', () => {
    expect(
      commercialVisibility({
        ...actor,
        accessPolicy: { catalog: { viewCosts: true } },
      }),
    ).toEqual({ costs: false, margins: false });
    expect(commercialVisibility(admin, 'partsServices')).toEqual({
      costs: true,
      margins: true,
    });
    expect(commercialVisibility(admin, 'generators')).toEqual({
      costs: false,
      margins: false,
    });
  });
  it('scopes sellers to their own opportunities and proposals', () => {
    expect(managedOpportunityScope(actor)).toEqual({
      OR: [
        {
          pipeline: 'COMMERCIAL_03_PARTS_SERVICES',
          assignedSellerId: 'seller',
        },
      ],
    });
    expect(JSON.stringify(managedProposalScope(actor))).toContain(
      '"userId":"seller"',
    );
    expect(JSON.stringify(managedProposalScope(actor))).not.toContain(
      'CONTRACT',
    );
  });
  it('expands only the explicitly assigned team portfolio', () => {
    const scope = managedOpportunityScope(admin).OR as Array<
      Record<string, unknown>
    >;
    expect(
      scope.find((row) => row.pipeline === 'COMMERCIAL_03_PARTS_SERVICES'),
    ).not.toHaveProperty('assignedSellerId');
    expect(
      scope.find((row) => row.pipeline === 'COMMERCIAL_02_CONTRACTS'),
    ).toHaveProperty('assignedSellerId', 'admin');
  });
  it('redacts nested costs and margins without modifying input or dates', () => {
    const date = new Date();
    const source = {
      items: [
        { catalogItem: { costPrice: 10, basePrice: 20 }, profitMargin: 50 },
      ],
      commercialSnapshot: { costPrice: 5 },
      date,
    };
    expect(stripCommercialCosts(source)).toEqual({
      items: [{ catalogItem: { basePrice: 20 } }],
      commercialSnapshot: {},
      date,
    });
    expect(source.items[0].catalogItem.costPrice).toBe(10);
  });
});
describe('commercial estimate integrity', () => {
  const base = {
    revenue: 1000,
    items: [{ key: 'item', quantity: 2, unitCost: 100, source: 'Conferido' }],
    laborCost: 50,
    travelCost: 20,
    freightCost: 30,
    otherCost: 0,
  };
  it('calculates contribution only with all costs explicitly known', () => {
    expect(estimateProfit(base)).toMatchObject({
      complete: true,
      estimatedCost: 300,
      contribution: 700,
      marginPercent: 70,
    });
  });
  it('does not report margin for an unknown item cost', () => {
    expect(
      estimateProfit({
        ...base,
        items: [{ ...base.items[0], unitCost: null }],
      }),
    ).toMatchObject({
      complete: false,
      marginPercent: null,
      contribution: null,
    });
  });
  it('distinguishes an unreviewed extra cost from an explicit zero', () => {
    expect(estimateProfit({ ...base, freightCost: undefined }).complete).toBe(
      false,
    );
    expect(estimateProfit({ ...base, freightCost: 0 }).complete).toBe(true);
  });
  it('allows an explicitly reviewed zero item cost and a negative result', () => {
    expect(estimateProfit({ ...base, revenue: 100 })).toMatchObject({
      complete: true,
      contribution: -200,
      marginPercent: -200,
    });
    expect(
      estimateProfit({ ...base, items: [{ ...base.items[0], unitCost: 0 }] })
        .complete,
    ).toBe(true);
  });
  it('rejects nonfinite inputs and excessive lists at the API boundary', () => {
    expect(
      validateSync(
        plainToInstance(CommercialEstimateInput, {
          portfolio: 'partsServices',
          revenue: Infinity,
          items: [],
        }),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateSync(
        plainToInstance(CommercialEstimateInput, {
          portfolio: 'partsServices',
          revenue: 0,
          items: Array(201).fill({}),
        }),
      ).length,
    ).toBeGreaterThan(0);
  });
});
describe('content and revision safety', () => {
  it('keeps an estimate valid across a status timestamp change and invalidates commercial changes', () => {
    const quote = {
      totalValue: 100,
      items: [],
      scope: 'Escopo',
      updatedAt: '2026-10-28T01:00:00Z',
    };
    expect(proposalSourceHash(quote)).toBe(
      proposalSourceHash({ ...quote, updatedAt: '2026-10-28T02:00:00Z' }),
    );
    expect(proposalSourceHash(quote)).not.toBe(
      proposalSourceHash({ ...quote, scope: 'Escopo alterado' }),
    );
    expect(proposalSourceHash(quote)).not.toBe(
      proposalSourceHash({ ...quote, totalValue: 90 }),
    );
  });
  it('renders only allowed literal variables including repeated occurrences', () => {
    expect(
      renderTemplate('Olá {{cliente.nome}} / {{ cliente.nome }}', {
        'cliente.nome': 'A $& B',
      }),
    ).toBe('Olá A $& B / A $& B');
  });
  it('does not allow internal notes, costs, expressions or malformed tokens', () => {
    for (const value of [
      '{{proposta.internalNotes}}',
      '{{proposta.costPrice}}',
      '{{process.env}}',
      '{{cliente.nome}',
      '{{7*7}}',
    ])
      expect(() => validateTemplate(value)).toThrow();
  });
  it('ignores regenerated item IDs and order but detects real quantity changes', () => {
    const previous = {
      items: [{ id: 'a', description: 'Filtro', quantity: 1, totalPrice: 20 }],
    };
    expect(
      compareCommercialVersions(previous, {
        items: [
          { id: 'b', description: 'Filtro', quantity: 1, totalPrice: 20 },
        ],
      }).itemsChanged,
    ).toBe(false);
    expect(
      compareCommercialVersions(previous, {
        items: [{ description: 'Filtro', quantity: 2, totalPrice: 40 }],
      }).itemsChanged,
    ).toBe(true);
  });
  it('does not include internal notes in a commercial comparison', () => {
    expect(
      compareCommercialVersions(
        { internalNotes: 'secret' },
        { internalNotes: 'other' },
      ).fields,
    ).toEqual([]);
  });
});
describe('commercial service boundaries', () => {
  it('refuses costs before querying the catalog for unauthorized users', async () => {
    const db = { catalogItem: { findMany: jest.fn() } };
    const service = new CommercialService(db as never);
    await expect(
      service.estimate(actor, {
        portfolio: 'partsServices',
        revenue: 0,
        items: [],
        version: 0,
      }),
    ).rejects.toThrow();
    expect(db.catalogItem.findMany).not.toHaveBeenCalled();
  });
  it('does not disclose team analytics without an explicit grant', async () => {
    await expect(
      new CommercialService({} as never).analytics(actor, {
        page: 1,
        kind: 'activities',
      }),
    ).rejects.toThrow();
  });
  it('sums duplicate demand against one stock balance', async () => {
    const db = {
      catalogItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'filter',
            name: 'Filtro',
            type: 'PART',
            inventoryBalances: [{ physicalQty: 6, reservedQty: 1 }],
          },
        ]),
      },
    };
    const service = new CommercialService(db as never);
    const items = [
      { key: 'a', catalogItemId: 'filter', quantity: 3, revenue: 10 },
      { key: 'b', catalogItemId: 'filter', quantity: 3, revenue: 10 },
    ];
    const result = await service.availability(actor, {
      portfolio: 'partsServices',
      items,
      revenue: 20,
      version: 0,
    });
    expect(result).toHaveLength(2);
    expect(
      result.every(
        (row) =>
          row.requested === 6 &&
          row.available === 5 &&
          row.status === 'PURCHASE_REQUIRED',
      ),
    ).toBe(true);
  });
  it('does not turn missing stock or a service into confirmed availability', async () => {
    const db = {
      catalogItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'service',
            name: 'Serviço',
            type: 'SERVICE',
            inventoryBalances: [],
          },
        ]),
      },
    };
    const service = new CommercialService(db as never);
    const result = await service.availability(actor, {
      portfolio: 'partsServices',
      items: [
        { key: 'a', catalogItemId: 'service', quantity: 1, revenue: 10 },
        { key: 'b', quantity: 1, revenue: 10 },
      ],
      revenue: 20,
      version: 0,
    });
    expect(result.map((row) => row.status)).toEqual([
      'PLANNING_REQUIRED',
      'UNCONFIRMED',
    ]);
  });
  it('refuses cross-portfolio preview and client access', async () => {
    const service = new CommercialService({} as never);
    await expect(
      service.availability(actor, {
        portfolio: 'contracts',
        items: [],
        revenue: 0,
        version: 0,
      }),
    ).rejects.toThrow();
    expect(() =>
      service.capabilities({ sub: 'client', role: 'CLIENT' }),
    ).toThrow();
  });
});
