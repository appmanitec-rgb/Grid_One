import { ACCESS_SCREENS, ACCESS_ACTION_LABELS } from './access-screens';
export const RULE_ACTION_KEYS = [
  ...new Set([
    ...Object.keys(ACCESS_ACTION_LABELS),
    'view',
    'viewOwn',
    'commentOwn',
    'viewSensitive',
    'manageSensitive',
    'access',
    'dataView',
  ]),
].sort();
type PlainRules = {
  version: 1;
  screens: Record<string, { view: boolean; actions: Record<string, boolean> }>;
  commercial: Record<string, boolean>;
  orderTypes: Record<string, boolean>;
  onCallShifts: Array<{ startsAt: string; endsAt: string }>;
};
export type PackedRules = {
  v: 2;
  s: Array<[number, number, string]>;
  c: number;
  o: number;
  d: Array<[number, number]>;
};
const portfolios = ['generators', 'partsServices', 'contracts'];
const orderTypes = [
  'PREVENTIVE',
  'CORRECTIVE',
  'EMERGENCY',
  'INSTALLATION',
  'DEMOBILIZATION',
  'REFUELING',
];
export function packRules(value: unknown): PackedRules | null {
  if (!value || typeof value !== 'object') return null;
  const rules = value as Partial<PlainRules>;
  const screens: PackedRules['s'] = [];
  ACCESS_SCREENS.forEach((screen, index) => {
    const rule = rules.screens?.[screen.key];
    if (!rule) return;
    let bits = BigInt(0);
    RULE_ACTION_KEYS.forEach((key, i) => {
      if (rule.actions?.[key] === true) bits |= BigInt(1) << BigInt(i);
    });
    screens.push([index, rule.view ? 1 : 0, bits.toString(16)]);
  });
  return {
    v: 2,
    s: screens,
    c: portfolios.reduce(
      (mask, k, i) => mask | (rules.commercial?.[k] ? 1 << i : 0),
      0,
    ),
    o: orderTypes.reduce(
      (mask, k, i) => mask | (rules.orderTypes?.[k] ? 1 << i : 0),
      0,
    ),
    d: (rules.onCallShifts || [])
      .map(
        (s) =>
          [Date.parse(s.startsAt), Date.parse(s.endsAt)] as [number, number],
      )
      .filter(([start, end]) => Number.isFinite(start) && start < end),
  };
}
export function unpackRules(value: unknown): PlainRules | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const packed = value as PackedRules;
  if (packed.v !== 2) return value as PlainRules;
  try {
    const screens: PlainRules['screens'] = {};
    for (const [index, view, hex] of packed.s) {
      const screen = ACCESS_SCREENS[index];
      if (!screen) continue;
      const bits = BigInt('0x' + (hex || '0'));
      screens[screen.key] = {
        view: view === 1,
        actions: Object.fromEntries(
          RULE_ACTION_KEYS.map((key, i) => [
            key,
            (bits & (BigInt(1) << BigInt(i))) !== BigInt(0),
          ]),
        ),
      };
    }
    return {
      version: 1,
      screens,
      commercial: Object.fromEntries(
        portfolios.map((k, i) => [k, Boolean(packed.c & (1 << i))]),
      ),
      orderTypes: Object.fromEntries(
        orderTypes.map((k, i) => [k, Boolean(packed.o & (1 << i))]),
      ),
      onCallShifts: packed.d.map(([start, end]) => ({
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
      })),
    };
  } catch {
    return null;
  }
}
