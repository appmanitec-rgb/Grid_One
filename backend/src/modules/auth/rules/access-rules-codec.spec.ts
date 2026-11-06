import { packRules, unpackRules, RULE_ACTION_KEYS } from './access-rules-codec';
import { ACCESS_SCREENS, ACCESS_ACTION_LABELS } from './access-screens';
import { allAccessPolicy } from '../../users/access-policy';
describe('compact rules representation (not enabled until approved)', () => {
  const source = {
    version: 1 as const,
    screens: {
      proposals: {
        view: true,
        actions: {
          create: true,
          update: false,
          requestDiscountAboveLimit: true,
        },
      },
      renewals: { view: false, actions: { create: false } },
    },
    commercial: { generators: true, partsServices: false, contracts: true },
    orderTypes: { EMERGENCY: true, PREVENTIVE: false },
    onCallShifts: [
      {
        startsAt: '2026-10-16T21:00:00.000Z',
        endsAt: '2026-10-19T11:00:00.000Z',
      },
    ],
  };
  it('preserves explicit true and false grants, portfolio flags and exact duty boundaries', () => {
    expect(unpackRules(packRules(source))).toMatchObject(source);
  });
  it('keeps legacy sessions readable', () => {
    expect(unpackRules(source)).toEqual(source);
    expect(unpackRules(null)).toBeNull();
  });
  it('contains every action in the existing policy', () => {
    for (const [section, actions] of Object.entries(allAccessPolicy))
      if (section !== 'pages')
        for (const key of Object.keys(actions))
          expect(RULE_ACTION_KEYS).toContain(key);
  });
  it('fits every screen and 100 duty windows in an ordinary header', () => {
    const screens = Object.fromEntries(
      ACCESS_SCREENS.map((s) => [
        s.key,
        {
          view: true,
          actions: Object.fromEntries(
            Object.keys(ACCESS_ACTION_LABELS).map((k) => [k, true]),
          ),
        },
      ]),
    );
    const rules = {
      ...source,
      screens,
      onCallShifts: Array.from({ length: 100 }, (_, i) => ({
        startsAt: new Date(1700000000000 + i * 86400000).toISOString(),
        endsAt: new Date(1700000000000 + i * 86400000 + 3600000).toISOString(),
      })),
    };
    const packed = packRules(rules)!;
    expect(packed.s).toHaveLength(ACCESS_SCREENS.length);
    expect(unpackRules(packed)).toMatchObject(rules);
    expect(
      Buffer.byteLength(
        Buffer.from(
          JSON.stringify({
            sub: 'employee',
            role: 'MANAGER',
            accessPolicy: allAccessPolicy,
            accessRules: packed,
          }),
        ).toString('base64'),
      ) + 300,
    ).toBeLessThan(14000);
  });
});
