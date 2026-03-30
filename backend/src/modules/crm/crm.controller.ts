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
@RequireAccessPolicy('pages.proposals')
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
  createOpportunity(@Body() dto: CreateOpportunityDto) {
    return this.crmService.createOpportunity(dto);
  }

  @Patch('opportunities/:id')
  updateOpportunity(
    @Param('id') id: string,
    @Body() dto: UpdateOpportunityDto,
  ) {
    return this.crmService.updateOpportunity(id, dto);
  }

  @Patch('opportunities/:id/stage')
  setOpportunityStage(
    @Param('id') id: string,
    @Body() dto: SetOpportunityStageDto,
  ) {
    return this.crmService.setOpportunityStage(id, dto);
  }

  @Delete('opportunities/:id')
  removeOpportunity(@Param('id') id: string) {
    return this.crmService.removeOpportunity(id);
  }

  @Get('inspections')
  inspections(@Query('status') status?: string) {
    return this.crmService.listInspections(status);
  }

  @Post('inspections')
  createInspection(@Body() dto: CreateInspectionDto) {
    return this.crmService.createInspection(dto);
  }

  @Patch('inspections/:id')
  updateInspection(@Param('id') id: string, @Body() dto: UpdateInspectionDto) {
    return this.crmService.updateInspection(id, dto);
  }

  @Post('inspections/:id/media')
  addInspectionMedia(
    @Param('id') id: string,
    @Body() dto: AddInspectionMediaDto,
  ) {
    return this.crmService.addInspectionMedia(id, dto);
  }

  @Delete('inspections/:id')
  removeInspection(@Param('id') id: string) {
    return this.crmService.removeInspection(id);
  }
}
