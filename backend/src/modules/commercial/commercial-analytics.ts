import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import {
  Portfolio,
  RuleActor,
  allowedPortfolios,
} from '../auth/rules/access-rules';
import {
  managedOpportunityScope,
  managedProposalScope,
  managementAllowed,
} from '../auth/rules/commercial-management';
import { CommercialQuery } from './commercial.dto';
import { proposalSourceHash } from './commercial.domain';
import { comparisonSelect } from './commercial-record';
const round = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export async function commercialAnalytics(
  db: DatabaseService,
  actor: RuleActor,
  query: CommercialQuery,
  portfolio?: Portfolio,
) {
  const portfolios = (
    portfolio ? [portfolio] : allowedPortfolios(actor)
  ).filter((value) => managementAllowed(actor, value, 'team'));
  if (!portfolios.length)
    throw new ForbiddenException(
      'Indicadores da equipe exigem liberação do administrador responsável.',
    );
  const now = new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = query.to ? new Date(query.to) : now;
  if (
    from > to ||
    !Number.isFinite(+from) ||
    !Number.isFinite(+to) ||
    +to - +from > 366 * 86400000
  )
    throw new BadRequestException('Selecione um período válido de até um ano.');
  const result = await Promise.all(
    portfolios.map(async (current) => {
      const pipeline =
        current === 'generators'
          ? 'COMMERCIAL_01_GENERATORS'
          : current === 'contracts'
            ? 'COMMERCIAL_02_CONTRACTS'
            : 'COMMERCIAL_03_PARTS_SERVICES';
      const types =
        current === 'generators'
          ? ['GENERATOR_SALE']
          : current === 'contracts'
            ? ['CONTRACT']
            : ['PARTS', 'SERVICES', 'PARTS_AND_SERVICES'];
      const opportunityWhere: Prisma.SalesOpportunityWhereInput = {
        AND: [managedOpportunityScope(actor)],
        pipeline,
        createdAt: { gte: from, lte: to },
      };
      const proposalWhere: Prisma.ProposalWhereInput = {
        AND: [managedProposalScope(actor)],
        type: { in: types as Prisma.EnumProposalTypeFilter['in'] },
        createdAt: { gte: from, lte: to },
        revisions: { none: {} },
      };
      const [
        stages,
        losses,
        proposals,
        receivables,
        discounts,
        stageTimes,
        estimates,
      ] = await Promise.all([
        db.salesOpportunity.groupBy({
          by: ['stage'],
          where: opportunityWhere,
          _count: { _all: true },
          _sum: { estimatedValue: true },
        }),
        db.salesOpportunity.groupBy({
          by: ['lossReason'],
          where: { ...opportunityWhere, stage: 'LOST' },
          _count: { _all: true },
        }),
        db.proposal.groupBy({
          by: ['status'],
          where: proposalWhere,
          _count: { _all: true },
          _sum: { totalValue: true, discount: true },
        }),
        db.accountsReceivable.aggregate({
          where: { sourceProposal: proposalWhere, status: { not: 'CANCELED' } },
          _sum: { netAmount: true, paidAmount: true },
        }),
        db.$queryRaw<Array<{ amount: number }>>(Prisma.sql`
        SELECT COALESCE(SUM(COALESCE(i.hours, i.quantity)::numeric * i."unitPrice"::numeric * COALESCE(i."discountPercent",0)::numeric / 100), 0)::float8 AS amount
        FROM proposal_items i JOIN proposals p ON p.id = i."proposalId"
        WHERE p.type::text IN (${Prisma.join(types)}) AND p.status::text = 'WON'
          AND p."createdAt" >= ${from} AND p."createdAt" <= ${to}
          AND NOT EXISTS (SELECT 1 FROM proposals child WHERE child."parentProposalId" = p.id)`),
        db.$queryRaw<
          Array<{ stage: string; tracked: number; meanHours: number }>
        >(Prisma.sql`
        SELECT s.stage::text AS stage, COUNT(*)::integer AS tracked,
          AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - event."createdAt")) / 3600)::float8 AS "meanHours"
        FROM sales_opportunities s
        JOIN LATERAL (SELECT a."createdAt", a."afterPayload" ->> 'stage' AS stage
          FROM system_audit_logs a WHERE a.domain::text = 'OPPORTUNITIES' AND a."entityType" = 'SALES_OPPORTUNITY' AND a."entityId" = s.id
            AND a.action = 'OPPORTUNITY_STAGE_CHANGED' ORDER BY a."createdAt" DESC LIMIT 1) event ON event.stage = s.stage::text
        WHERE s.pipeline::text = ${pipeline} AND s."createdAt" >= ${from} AND s."createdAt" <= ${to}
          AND s.stage::text NOT IN ('WON', 'LOST') GROUP BY s.stage`),
        managementAllowed(actor, current, 'margins')
          ? db.commercialProposalEstimate.findMany({
              where: { proposal: { ...proposalWhere, status: 'WON' } },
              select: {
                sourceHash: true,
                snapshot: true,
                proposal: { select: comparisonSelect },
              },
              orderBy: { updatedAt: 'desc' },
              take: 1001,
            })
          : null,
      ]);
      const won = proposals.find((row) => row.status === 'WON');
      const lostCount = proposals
        .filter((row) => row.status === 'LOST' || row.status === 'REJECTED')
        .reduce((sum, row) => sum + row._count._all, 0);
      const wonCount = won?._count._all ?? 0;
      let profitability:
        | {
            reviewedSales: number;
            totalSales: number;
            marginPercent: number | null;
            contribution: number | null;
            limited: boolean;
          }
        | undefined;
      if (estimates) {
        const valid =
          estimates.length > 1000
            ? []
            : estimates.filter(
                (row) =>
                  (row.snapshot as { complete?: boolean }).complete === true &&
                  row.sourceHash === proposalSourceHash(row.proposal),
              );
        const revenue = valid.reduce(
          (sum, row) =>
            sum + Number((row.snapshot as { revenue: number }).revenue || 0),
          0,
        );
        const contribution = valid.reduce(
          (sum, row) =>
            sum +
            Number(
              (row.snapshot as { contribution: number }).contribution || 0,
            ),
          0,
        );
        profitability = {
          reviewedSales: valid.length,
          totalSales: wonCount,
          marginPercent:
            revenue > 0 ? round((contribution / revenue) * 100) : null,
          contribution: valid.length ? round(contribution) : null,
          limited: estimates.length > 1000,
        };
      }
      return {
        portfolio: current,
        stages,
        losses,
        proposals,
        stageTimes,
        acceptedSales: Number(won?._sum.totalValue || 0),
        wonCount,
        lostCount,
        conversionPercent:
          wonCount + lostCount > 0
            ? round((wonCount / (wonCount + lostCount)) * 100)
            : null,
        grantedDiscounts: round(
          Number(won?._sum.discount || 0) + Number(discounts[0]?.amount || 0),
        ),
        receivablesCreated: Number(receivables._sum.netAmount || 0),
        receivedFromCohort: Number(receivables._sum.paidAmount || 0),
        ...(profitability ? { profitability } : {}),
      };
    }),
  );
  return {
    from,
    to,
    portfolios: result,
    basis:
      'Registros criados no período. Somente a revisão mais recente de cada proposta. Oportunidades e propostas são medidas separadas e não são somadas. Recebido representa os títulos vinculados a essas propostas; não equivale ao caixa do período nem à emissão fiscal. Tempo em etapa cobre apenas movimentações rastreadas; o histórico anterior sem evento não recebe duração presumida. Margens cobrem somente vendas com estimativa completa e vigente.',
  };
}
