import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import type { RuleActor } from '../auth/rules/access-rules';
import { CommercialService } from './commercial.service';
import { CommercialResponsibilitiesInput } from './commercial.dto';
import {
  CommercialEstimateInput,
  CommercialHandoffInput,
  CommercialQuery,
  CommercialRenderInput,
  CommercialTemplateInput,
} from './commercial.dto';
type CommercialRequest = Request & { user: RuleActor };
@Controller('commercial')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('proposals.view')
export class CommercialController {
  constructor(private readonly service: CommercialService) {}
  @Get('responsibilities/:id')
  @RequireAccessPolicy('users.manageSecurity')
  responsibilities(@Req() req: CommercialRequest, @Param('id') id: string) {
    return this.service.responsibilities(req.user, id);
  }
  @Post('responsibilities/:id')
  @RequireAccessPolicy('users.manageSecurity')
  saveResponsibilities(
    @Req() req: CommercialRequest,
    @Param('id') id: string,
    @Body() input: CommercialResponsibilitiesInput,
  ) {
    return this.service.saveResponsibilities(req.user, id, input);
  }
  @Get('capabilities') capabilities(@Req() req: CommercialRequest) {
    return this.service.capabilities(req.user);
  }
  @Get('agenda') agenda(
    @Req() req: CommercialRequest,
    @Query() query: CommercialQuery,
  ) {
    return this.service.agenda(req.user, query);
  }
  @Get('analytics') analytics(
    @Req() req: CommercialRequest,
    @Query() query: CommercialQuery,
  ) {
    return this.service.analytics(req.user, query);
  }
  @Post('availability') availability(
    @Req() req: CommercialRequest,
    @Body() input: CommercialEstimateInput,
  ) {
    return this.service.availability(req.user, input);
  }
  @Post('estimate') estimate(
    @Req() req: CommercialRequest,
    @Body() input: CommercialEstimateInput,
  ) {
    return this.service.estimate(req.user, input);
  }
  @Get('proposals/:id/context') context(
    @Req() req: CommercialRequest,
    @Param('id') id: string,
  ) {
    return this.service.context(req.user, id);
  }
  @Get('proposals/:id/insights') insights(
    @Req() req: CommercialRequest,
    @Param('id') id: string,
  ) {
    return this.service.insights(req.user, id);
  }
  @Post('proposals/:id/estimate') saveEstimate(
    @Req() req: CommercialRequest,
    @Param('id') id: string,
    @Body() input: CommercialEstimateInput,
  ) {
    return this.service.saveEstimate(req.user, id, input);
  }
  @Get('proposals/:id/owners') owners(
    @Req() req: CommercialRequest,
    @Param('id') id: string,
    @Query('q') q?: string,
  ) {
    return this.service.handoffOwners(req.user, id, q);
  }
  @Post('proposals/:id/handoff') handoff(
    @Req() req: CommercialRequest,
    @Param('id') id: string,
    @Body() input: CommercialHandoffInput,
  ) {
    return this.service.assignHandoff(req.user, id, input);
  }
  @Get('templates') templates(
    @Req() req: CommercialRequest,
    @Query() query: CommercialQuery,
  ) {
    return this.service.templates(req.user, query);
  }
  @Get('library/templates/:key/versions')
  @RequireAccessPolicy('studio.access', 'studio.dataView')
  templateHistory(
    @Req() req: CommercialRequest,
    @Param('key') key: string,
    @Query() query: CommercialQuery,
  ) {
    return this.service.templateHistory(req.user, key, query);
  }
  @Post('library/templates')
  @RequireAccessPolicy('studio.access', 'studio.dataEdit')
  saveTemplate(
    @Req() req: CommercialRequest,
    @Body() input: CommercialTemplateInput,
  ) {
    return this.service.saveTemplate(req.user, input);
  }
  @Post('library/templates/:id/publish')
  @RequireAccessPolicy('studio.access', 'studio.dataEdit')
  publishTemplate(@Req() req: CommercialRequest, @Param('id') id: string) {
    return this.service.publishTemplate(req.user, id);
  }
  @Post('templates/:id/render') render(
    @Req() req: CommercialRequest,
    @Param('id') id: string,
    @Body() input: CommercialRenderInput,
  ) {
    return this.service.render(req.user, id, input.proposalId);
  }
}
