import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import {
  assertPortfolio,
  portfolioForPipeline,
  portfolioForProposal,
  RuleActor,
  unrestricted,
} from './access-rules';
@Injectable()
export class CommercialScopeGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      user?: RuleActor;
      path?: string;
      url?: string;
      params?: Record<string, string>;
      body?: Record<string, unknown>;
      query?: Record<string, string>;
    }>();
    const actor = request.user;
    if (
      actor?.role === 'CLIENT' &&
      (request.path || request.url || '').includes('/crm')
    )
      throw new ForbiddenException(
        'A carteira interna não está disponível na central do cliente.',
      );
    if (!actor || unrestricted(actor) || actor.role === 'CLIENT') return true;
    const path = request.path || request.url || '';
    const id = request.params?.id;
    const body = request.body || {};
    if (path.includes('/proposals')) {
      if (typeof body.type === 'string')
        assertPortfolio(actor, portfolioForProposal(body.type));
      if (id) {
        const proposal = await this.db.proposal.findUnique({
          where: { id },
          select: { type: true },
        });
        if (proposal)
          assertPortfolio(actor, portfolioForProposal(proposal.type));
      }
    }
    let opportunityId =
      typeof body.salesOpportunityId === 'string'
        ? body.salesOpportunityId
        : typeof body.opportunityId === 'string'
          ? body.opportunityId
          : request.query?.opportunityId;
    if (path.includes('/crm/opportunities') && id) opportunityId = id;
    if (path.includes('/crm/activities') && id) {
      const activity = await this.db.crmActivity.findUnique({
        where: { id },
        select: { opportunityId: true },
      });
      opportunityId = activity?.opportunityId || opportunityId;
    }
    if (path.includes('/crm/inspections') && id) {
      const inspection = await this.db.commercialInspection.findUnique({
        where: { id },
        select: { opportunityId: true },
      });
      opportunityId = inspection?.opportunityId || opportunityId;
    }
    if (opportunityId) {
      const opportunity = await this.db.salesOpportunity.findUnique({
        where: { id: opportunityId },
        select: { pipeline: true },
      });
      if (opportunity)
        assertPortfolio(actor, portfolioForPipeline(opportunity.pipeline));
    }
    const pipeline =
      typeof body.pipeline === 'string'
        ? body.pipeline
        : request.query?.pipeline;
    if (pipeline) assertPortfolio(actor, portfolioForPipeline(pipeline));
    return true;
  }
}
