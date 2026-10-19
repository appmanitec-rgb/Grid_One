import { ForbiddenException } from '@nestjs/common';

export const PORTFOLIOS = ['generators', 'partsServices', 'contracts'] as const;
export type Portfolio = (typeof PORTFOLIOS)[number];
export const ORDER_TYPES = [
  'PREVENTIVE',
  'CORRECTIVE',
  'EMERGENCY',
  'INSTALLATION',
  'DEMOBILIZATION',
  'REFUELING',
] as const;
export type OrderCreationType = (typeof ORDER_TYPES)[number];
export type ScreenRule = { view: boolean; actions: Record<string, boolean> };
export type OnCallShift = { startsAt: string; endsAt: string };
export type DetailedAccessRules = {
  version: 1;
  screens: Record<string, ScreenRule>;
  commercial: Record<Portfolio, boolean>;
  orderTypes: Record<OrderCreationType, boolean>;
  onCallShifts: OnCallShift[];
};
export type RuleActor = {
  sub: string;
  role?: string;
  isSystemMaster?: boolean;
  accessRules?: unknown;
  approvalDiscountLimit?: number | null;
};
export function unrestricted(actor: RuleActor) {
  return actor.isSystemMaster === true || actor.role === 'ADMIN';
}
export function readRules(value: unknown): DetailedAccessRules {
  const source =
    value && typeof value === 'object'
      ? (value as Partial<DetailedAccessRules>)
      : {};
  const screens: Record<string, ScreenRule> = {};
  for (const [key, rule] of Object.entries(source.screens || {})) {
    if (!rule || typeof rule !== 'object') continue;
    screens[key] = {
      view: rule.view === true,
      actions: Object.fromEntries(
        Object.entries(rule.actions || {}).filter(
          ([, v]) => typeof v === 'boolean',
        ),
      ),
    };
  }
  return {
    version: 1,
    screens,
    commercial: Object.fromEntries(
      PORTFOLIOS.map((p) => [p, source.commercial?.[p] === true]),
    ) as DetailedAccessRules['commercial'],
    orderTypes: Object.fromEntries(
      ORDER_TYPES.map((p) => [p, source.orderTypes?.[p] === true]),
    ) as DetailedAccessRules['orderTypes'],
    onCallShifts: Array.isArray(source.onCallShifts)
      ? source.onCallShifts.filter(
          (s) =>
            s &&
            Number.isFinite(Date.parse(s.startsAt)) &&
            Date.parse(s.startsAt) < Date.parse(s.endsAt),
        )
      : [],
  };
}
export function portfolioForProposal(type: string): Portfolio {
  return type === 'GENERATOR_SALE'
    ? 'generators'
    : type === 'CONTRACT'
      ? 'contracts'
      : 'partsServices';
}
export function portfolioForPipeline(pipeline: string): Portfolio {
  if (pipeline === 'COMMERCIAL_01_GENERATORS') return 'generators';
  if (pipeline === 'COMMERCIAL_02_CONTRACTS') return 'contracts';
  return 'partsServices';
}
export function allowedPortfolios(actor: RuleActor): Portfolio[] {
  return unrestricted(actor)
    ? [...PORTFOLIOS]
    : PORTFOLIOS.filter((p) => readRules(actor.accessRules).commercial[p]);
}
export function assertPortfolio(actor: RuleActor, portfolio: Portfolio) {
  if (!allowedPortfolios(actor).includes(portfolio))
    throw new ForbiddenException(
      'Seu departamento não possui acesso a esta carteira comercial.',
    );
}
export function assertScreen(
  actor: RuleActor,
  screen: string,
  action?: string,
) {
  if (unrestricted(actor)) return;
  const screens = readRules(actor.accessRules).screens;
  const rule = screens[screen];
  if (Object.keys(screens).length && !rule)
    throw new ForbiddenException('Esta tela não foi liberada para seu perfil.');
  // An explicit matrix denies unlisted screens; accounts without a matrix keep their role policy.
  if (rule && (!rule.view || (action && rule.actions[action] !== true)))
    throw new ForbiddenException('Seu perfil não possui permissão nesta tela.');
}
export function assertOrderCreation(
  actor: RuleActor,
  type: string,
  now = new Date(),
) {
  if (unrestricted(actor)) return;
  const rules = readRules(actor.accessRules);
  if (!rules.orderTypes[type as OrderCreationType])
    throw new ForbiddenException(
      'Seu perfil não pode criar este tipo de tarefa.',
    );
  if (actor.role === 'TECHNICIAN') {
    if (type !== 'EMERGENCY')
      throw new ForbiddenException(
        'Técnicos podem abrir somente atendimentos emergenciais.',
      );
    if (
      !rules.onCallShifts.some(
        (s) =>
          Date.parse(s.startsAt) <= now.getTime() &&
          now.getTime() < Date.parse(s.endsAt),
      )
    )
      throw new ForbiddenException(
        'A abertura de atendimento emergencial está disponível somente durante seu plantão.',
      );
  }
}
export function assertDiscount(actor: RuleActor, percent: number) {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100)
    throw new ForbiddenException('Informe um desconto válido entre 0% e 100%.');
  if (unrestricted(actor)) return;
  const limit = Number(actor.approvalDiscountLimit ?? 0);
  if (percent > limit + 0.000001)
    throw new ForbiddenException(
      `O desconto excede sua alçada de ${limit}%. Solicite aprovação a um responsável.`,
    );
}

export function canReadBankBalances(
  actor: RuleActor,
  legacyFinanceView: boolean,
) {
  if (unrestricted(actor)) return true;
  const screens = readRules(actor.accessRules).screens;
  return Object.keys(screens).length
    ? ['bankAccounts', 'cashFlow', 'bankMovements', 'reconciliation'].some(
        (key) => screens[key]?.view === true,
      )
    : legacyFinanceView;
}
