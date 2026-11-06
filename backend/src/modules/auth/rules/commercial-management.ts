import { ForbiddenException } from '@nestjs/common';
import {
  PORTFOLIOS,
  Portfolio,
  RuleActor,
  allowedPortfolios,
  portfolioForPipeline,
  portfolioForProposal,
} from './access-rules';
import { Prisma } from '@prisma/client';

export const MANAGEMENT_ACTIONS = [
  'team',
  'costs',
  'margins',
  'templates',
  'publishTemplates',
] as const;
export type ManagementAction = (typeof MANAGEMENT_ACTIONS)[number];
export type CommercialManagement = Partial<
  Record<Portfolio, Partial<Record<ManagementAction | 'responsible', boolean>>>
>;

// Sensitive commercial rights never inherit the ADMIN bypass or a role preset.
export function managementAllowed(
  actor: RuleActor,
  portfolio: Portfolio,
  action: ManagementAction,
) {
  if (actor.role === 'CLIENT') return false;
  if (!allowedPortfolios(actor).includes(portfolio)) return false;
  const raw = actor.accessRules as
    | { commercialManagement?: CommercialManagement }
    | undefined;
  const grant = raw?.commercialManagement?.[portfolio];
  return grant?.responsible === true && grant[action] === true;
}
export function assertManagement(
  actor: RuleActor,
  portfolio: Portfolio,
  action: ManagementAction,
) {
  if (!managementAllowed(actor, portfolio, action))
    throw new ForbiddenException(
      'Acesso reservado ao administrador responsável por esta carteira.',
    );
}
export function managementCapabilities(actor: RuleActor) {
  return Object.fromEntries(
    allowedPortfolios(actor).map((portfolio) => [
      portfolio,
      Object.fromEntries(
        MANAGEMENT_ACTIONS.map((action) => [
          action,
          managementAllowed(actor, portfolio, action),
        ]),
      ),
    ]),
  ) as Partial<Record<Portfolio, Record<ManagementAction, boolean>>>;
}
export function managedProposalScope(
  actor: RuleActor,
): Prisma.ProposalWhereInput {
  return {
    OR: allowedPortfolios(actor).map((portfolio) => ({
      type: {
        in:
          portfolio === 'generators'
            ? ['GENERATOR_SALE']
            : portfolio === 'contracts'
              ? ['CONTRACT']
              : ['PARTS', 'SERVICES', 'PARTS_AND_SERVICES'],
      },
      ...(managementAllowed(actor, portfolio, 'team')
        ? {}
        : {
            OR: [
              { userId: actor.sub },
              { salesOpportunity: { assignedSellerId: actor.sub } },
            ],
          }),
    })),
  };
}
export function managedOpportunityScope(
  actor: RuleActor,
): Prisma.SalesOpportunityWhereInput {
  return {
    OR: allowedPortfolios(actor).map((portfolio) => ({
      pipeline:
        portfolio === 'generators'
          ? 'COMMERCIAL_01_GENERATORS'
          : portfolio === 'contracts'
            ? 'COMMERCIAL_02_CONTRACTS'
            : 'COMMERCIAL_03_PARTS_SERVICES',
      ...(managementAllowed(actor, portfolio, 'team')
        ? {}
        : { assignedSellerId: actor.sub }),
    })),
  };
}
export function managedActivityScope(
  actor: RuleActor,
): Prisma.CrmActivityWhereInput {
  return {
    OR: [
      { opportunity: managedOpportunityScope(actor) },
      {
        opportunityId: null,
        OR: [{ ownerId: actor.sub }, { createdById: actor.sub }],
      },
    ],
  };
}
export function commercialPortfolio(value?: string): Portfolio | undefined {
  if (!value || value === 'all') return undefined;
  if (!PORTFOLIOS.includes(value as Portfolio))
    throw new ForbiddenException('Carteira comercial inválida.');
  return value as Portfolio;
}
export { portfolioForPipeline, portfolioForProposal };
