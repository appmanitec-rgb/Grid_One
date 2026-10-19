import { CommercialScopeGuard } from '../auth/rules/commercial-scope.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CrmService } from './crm.service';
import {
  AddInspectionMediaDto,
  CreateInspectionDto,
  CreateCrmActivityDto,
  CreateOpportunityDto,
  SetOpportunityStageDto,
  UpdateInspectionDto,
  UpdateCrmActivityDto,
  UpdateOpportunityDto,
} from './dto/crm.dto';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';

@Controller('crm')
@UseGuards(AuthGuard, AccessPolicyGuard, CommercialScopeGuard)
@RequireAccessPolicy('proposals.view')
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Get('sellers')
  sellers(
    @Req() req: Request,
    @Query('q') query?: string,
    @Query('take') take?: string,
    @Query('pipeline') pipeline?: string,
  ) {
    return this.crmService.listSellers(
      query,
      take,
      pipeline,
      (req['user'] as { sub: string }).sub,
    );
  }

  @Get('opportunities')
  opportunities(
    @Req() req: Request,
    @Query('stage') stage?: string,
    @Query('pipeline') pipeline?: string,
    @Query('opportunityType') opportunityType?: string,
  ) {
    return this.crmService.listOpportunities(
      stage,
      pipeline,
      opportunityType,
      (req['user'] as { sub: string }).sub,
    );
  }

  @Get('opportunities/pipeline')
  pipeline(@Req() req: Request, @Query('pipeline') pipeline?: string) {
    return this.crmService.opportunityPipeline(
      pipeline,
      (req['user'] as { sub: string }).sub,
    );
  }

  @Get('opportunities/forecast')
  forecast(@Req() req: Request, @Query('pipeline') pipeline?: string) {
    return this.crmService.opportunityForecast(
      pipeline,
      (req['user'] as { sub: string }).sub,
    );
  }

  @Get('activities')
  activities(
    @Req() req: Request,
    @Query('clientId') clientId?: string,
    @Query('opportunityId') opportunityId?: string,
    @Query('skip') skip?: string,
  ) {
    return this.crmService.listActivities(
      clientId,
      opportunityId,
      skip,
      (req['user'] as { sub: string }).sub,
    );
  }

  @Post('activities')
  @RequireAccessPolicy('proposals.create')
  createActivity(@Body() dto: CreateCrmActivityDto, @Req() req: Request) {
    return this.crmService.createActivity(
      dto,
      (req['user'] as { sub: string }).sub,
    );
  }

  @Patch('activities/:id')
  @RequireAccessPolicy('proposals.update')
  updateActivity(@Param('id') id: string, @Body() dto: UpdateCrmActivityDto) {
    return this.crmService.updateActivity(id, dto);
  }

  @Get('opportunities/:id')
  getOpportunity(@Param('id') id: string, @Req() req: Request) {
    return this.crmService.getOpportunity(
      id,
      (req['user'] as { sub: string }).sub,
    );
  }

  @Post('opportunities')
  @RequireAccessPolicy('proposals.create')
  createOpportunity(@Req() req: Request, @Body() dto: CreateOpportunityDto) {
    return this.crmService.createOpportunity(
      dto,
      (req['user'] as { sub: string }).sub,
    );
  }

  @Patch('opportunities/:id')
  @RequireAccessPolicy('proposals.update')
  updateOpportunity(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateOpportunityDto,
  ) {
    return this.crmService.updateOpportunity(
      id,
      dto,
      (req['user'] as { sub: string }).sub,
    );
  }

  @Patch('opportunities/:id/stage')
  @RequireAccessPolicy('proposals.update')
  setOpportunityStage(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: SetOpportunityStageDto,
  ) {
    return this.crmService.setOpportunityStage(
      id,
      dto,
      (req['user'] as { sub: string }).sub,
    );
  }

  @Delete('opportunities/:id')
  @RequireAccessPolicy('proposals.cancel')
  removeOpportunity(@Param('id') id: string) {
    return this.crmService.removeOpportunity(id);
  }

  @Get('inspections')
  inspections(@Req() req: Request, @Query('status') status?: string) {
    return this.crmService.listInspections(
      status,
      (req['user'] as { sub: string }).sub,
    );
  }

  @Post('inspections')
  @RequireAccessPolicy('proposals.create')
  createInspection(@Body() dto: CreateInspectionDto) {
    return this.crmService.createInspection(dto);
  }

  @Patch('inspections/:id')
  @RequireAccessPolicy('proposals.update')
  updateInspection(@Param('id') id: string, @Body() dto: UpdateInspectionDto) {
    return this.crmService.updateInspection(id, dto);
  }

  @Post('inspections/:id/media')
  @RequireAccessPolicy('proposals.update')
  addInspectionMedia(
    @Param('id') id: string,
    @Body() dto: AddInspectionMediaDto,
  ) {
    return this.crmService.addInspectionMedia(id, dto);
  }

  @Delete('inspections/:id')
  @RequireAccessPolicy('proposals.cancel')
  removeInspection(@Param('id') id: string) {
    return this.crmService.removeInspection(id);
  }
}
