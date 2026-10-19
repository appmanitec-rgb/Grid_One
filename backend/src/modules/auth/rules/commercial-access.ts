import { DatabaseService } from '../../../database/database.service';
import { Prisma } from '@prisma/client';
import {
  allowedPortfolios,
  assertDiscount,
  assertOrderCreation,
  assertPortfolio,
  portfolioForPipeline,
  portfolioForProposal,
  RuleActor,
  unrestricted,
} from './access-rules';
export async function ruleActor(
  db: DatabaseService,
  id?: string,
): Promise<RuleActor | undefined> {
  if (!id) return undefined;
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      isSystemMaster: true,
      accessRules: true,
      approvalDiscountLimit: true,
    },
  });
  return user ? { ...user, sub: user.id } : undefined;
}
export async function proposalScope(
  db: DatabaseService,
  id?: string,
): Promise<Prisma.ProposalWhereInput> {
  const actor = await ruleActor(db, id);
  if (!actor || unrestricted(actor) || actor.role === 'CLIENT') return {};
  const portfolios = allowedPortfolios(actor);
  return {
    type: {
      in: [
        ...(portfolios.includes('generators')
          ? ['GENERATOR_SALE' as const]
          : []),
        ...(portfolios.includes('contracts') ? ['CONTRACT' as const] : []),
        ...(portfolios.includes('partsServices')
          ? [
              'PARTS' as const,
              'SERVICES' as const,
              'PARTS_AND_SERVICES' as const,
            ]
          : []),
      ],
    },
  };
}
export async function opportunityScope(
  db: DatabaseService,
  id?: string,
): Promise<Prisma.SalesOpportunityWhereInput> {
  const actor = await ruleActor(db, id);
  if (!actor || unrestricted(actor)) return {};
  const portfolios = allowedPortfolios(actor);
  return {
    pipeline: {
      in: [
        ...(portfolios.includes('generators')
          ? ['COMMERCIAL_01_GENERATORS' as const]
          : []),
        ...(portfolios.includes('contracts')
          ? ['COMMERCIAL_02_CONTRACTS' as const]
          : []),
        ...(portfolios.includes('partsServices')
          ? ['COMMERCIAL_03_PARTS_SERVICES' as const]
          : []),
      ],
    },
  };
}
export async function checkProposalType(
  db: DatabaseService,
  id: string | undefined,
  type: string,
) {
  const actor = await ruleActor(db, id);
  if (actor && actor.role !== 'CLIENT')
    assertPortfolio(actor, portfolioForProposal(type));
}
export async function checkPipeline(
  db: DatabaseService,
  id: string | undefined,
  pipeline: string,
) {
  const actor = await ruleActor(db, id);
  if (actor) assertPortfolio(actor, portfolioForPipeline(pipeline));
}
export async function checkOrderCreation(
  db: DatabaseService,
  id: string | undefined,
  type: string,
) {
  const actor = await ruleActor(db, id);
  if (actor) assertOrderCreation(actor, type);
}
export async function checkDiscount(
  db: DatabaseService,
  id: string | undefined,
  percent: number,
) {
  const actor = await ruleActor(db, id);
  if (actor) assertDiscount(actor, percent);
}
export function combinedDiscountPercent(
  items: Array<{
    quantity: number;
    unitPrice: number;
    discountPercent?: number;
  }>,
  globalDiscount: number,
) {
  const gross = items.reduce(
    (sum, i) => sum + Number(i.quantity) * Number(i.unitPrice),
    0,
  );
  const lineDiscount = items.reduce(
    (sum, i) =>
      sum +
      (Number(i.quantity) *
        Number(i.unitPrice) *
        Number(i.discountPercent || 0)) /
        100,
    0,
  );
  return gross > 0
    ? ((Number(globalDiscount) + lineDiscount) / gross) * 100
    : globalDiscount > 0
      ? 100
      : 0;
}

export async function checkProposalPricing(
  db: DatabaseService,
  id: string | undefined,
  items: Array<{
    catalogItemId?: string | null;
    quantity: number;
    unitPrice: number;
    discountPercent?: number;
  }>,
  discount: number,
  commercialGeneratorId?: string | null,
) {
  const actor = await ruleActor(db, id);
  if (!actor || unrestricted(actor)) return;
  const catalogIds = items
    .map((i) => i.catalogItemId)
    .filter((v): v is string => Boolean(v));
  const references = catalogIds.length
    ? await db.catalogItem.findMany({
        where: { id: { in: catalogIds } },
        select: { id: true, basePrice: true },
      })
    : [];
  const prices = new Map(references.map((r) => [r.id, r.basePrice]));
  const generator = commercialGeneratorId
    ? await db.commercialGenerator.findUnique({
        where: { id: commercialGeneratorId },
        select: { basePrice: true, suggestedPrice: true },
      })
    : null;
  const unlinkedGross = items
    .filter((item) => !item.catalogItemId)
    .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  let gross = generator
      ? Math.max(
          0,
          Math.max(generator.basePrice, generator.suggestedPrice) -
            unlinkedGross,
        )
      : 0,
    net = -Number(discount);
  for (const item of items) {
    const reference = Math.max(
      item.unitPrice,
      prices.get(item.catalogItemId || '') || 0,
    );
    gross += item.quantity * reference;
    net +=
      item.quantity *
      item.unitPrice *
      (1 - Number(item.discountPercent || 0) / 100);
  }
  // Compare currency amounts: e.g. 5% of R$ 59.30 rounds to R$ 2.97.
  const reductionCents = Math.round(Math.max(0, gross - net) * 100);
  const allowedCents = Math.round(
    gross * Number(actor.approvalDiscountLimit ?? 0),
  );
  if (reductionCents > allowedCents)
    assertDiscount(actor, gross > 0 ? ((gross - net) / gross) * 100 : 100);
}
