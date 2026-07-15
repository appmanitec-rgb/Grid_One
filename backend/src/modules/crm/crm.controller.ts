import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CrmService } from './crm.service';
import {
  AddInspectionMediaDto,
  CreateInspectionDto,
  CreateOpportunityDto,
  SetOpportunityStageDto,
  UpdateInspectionDto,
  UpdateOpportunityDto,
} from './dto/crm.dto';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';

@Controller('crm')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('proposals.view')
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Get('opportunities')
  opportunities(@Query('stage') stage?: string) {
    return this.crmService.listOpportunities(stage);
  }

  @Get('opportunities/pipeline')
  pipeline() {
    return this.crmService.opportunityPipeline();
  }

  @Get('opportunities/:id')
  getOpportunity(@Param('id') id: string) {
    return this.crmService.getOpportunity(id);
  }

  @Post('opportunities')
  @RequireAccessPolicy('proposals.create')
  createOpportunity(@Body() dto: CreateOpportunityDto) {
    return this.crmService.createOpportunity(dto);
  }

  @Patch('opportunities/:id')
  @RequireAccessPolicy('proposals.update')
  updateOpportunity(
    @Param('id') id: string,
    @Body() dto: UpdateOpportunityDto,
  ) {
    return this.crmService.updateOpportunity(id, dto);
  }

  @Patch('opportunities/:id/stage')
  @RequireAccessPolicy('proposals.update')
  setOpportunityStage(
    @Param('id') id: string,
    @Body() dto: SetOpportunityStageDto,
  ) {
    return this.crmService.setOpportunityStage(id, dto);
  }

  @Delete('opportunities/:id')
  @RequireAccessPolicy('proposals.cancel')
  removeOpportunity(@Param('id') id: string) {
    return this.crmService.removeOpportunity(id);
  }

  @Get('inspections')
  inspections(@Query('status') status?: string) {
    return this.crmService.listInspections(status);
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
