import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CommissionStatus, UserRole } from '@prisma/client';
import type { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { AccessActor, HrAdminService } from './hr-admin.service';
import {
  AllocateFleetDto,
  AssignHrAssetDto,
  CreateCommissionDto,
  CreateCommissionRuleDto,
  CreateFleetVehicleDto,
  CreateTimeEntryDto,
  UpdateCommissionRuleDto,
  ReleaseFleetDto,
  UpdateCommissionStatusDto,
  UpdateHrAssetStatusDto,
} from './dto/hr-admin.dto';

@Controller('hr-admin')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('people.view')
export class HrAdminController {
  constructor(private readonly hrAdminService: HrAdminService) {}

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('people.view')
  @Get('agents')
  agents(@Req() req: Request) {
    return this.hrAdminService.listAgentsOverview(this.extractActor(req));
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('people.view')
  @Get('collaborators')
  collaborators(@Req() req: Request) {
    return this.hrAdminService.listCollaborators(this.extractActor(req));
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('people.view')
  @Get('time-entries')
  timeEntries(
    @Req() req: Request,
    @Query('userId') userId?: string,
    @Query('month') month?: string,
  ) {
    return this.hrAdminService.listTimeEntries(
      userId,
      month,
      this.extractActor(req),
    );
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('people.create')
  @Post('time-entries')
  createTimeEntry(@Body() dto: CreateTimeEntryDto) {
    return this.hrAdminService.createTimeEntry(dto);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('people.view')
  @Get('time-entries/payroll-export')
  payrollExport(@Query('month') month?: string) {
    return this.hrAdminService.payrollExport(month);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('people.view')
  @Get('commissions')
  commissions(@Query('status') status?: string) {
    const normalizedStatus =
      status &&
      Object.values(CommissionStatus).includes(status as CommissionStatus)
        ? (status as CommissionStatus)
        : undefined;
    return this.hrAdminService.listCommissions(normalizedStatus);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('people.create')
  @Post('commissions')
  createCommission(@Req() req: Request, @Body() dto: CreateCommissionDto) {
    return this.hrAdminService.createCommission(dto, this.extractUserId(req));
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('people.update')
  @Patch('commissions/:id/status')
  updateCommissionStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateCommissionStatusDto,
  ) {
    return this.hrAdminService.updateCommissionStatus(
      id,
      dto.status,
      this.extractUserId(req),
    );
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('people.view')
  @Get('commission-rules')
  commissionRules() {
    return this.hrAdminService.listCommissionRules();
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('people.create')
  @Post('commission-rules')
  createCommissionRule(
    @Req() req: Request,
    @Body() dto: CreateCommissionRuleDto,
  ) {
    return this.hrAdminService.createCommissionRule(
      dto,
      this.extractUserId(req),
    );
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('people.update')
  @Patch('commission-rules/:id')
  updateCommissionRule(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateCommissionRuleDto,
  ) {
    return this.hrAdminService.updateCommissionRule(
      id,
      dto,
      this.extractUserId(req),
    );
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('people.view')
  @Get('assets')
  assets() {
    return this.hrAdminService.listHrAssets();
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('people.create')
  @Post('assets')
  assignAsset(@Body() dto: AssignHrAssetDto) {
    return this.hrAdminService.assignHrAsset(dto);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('people.update')
  @Patch('assets/:id/status')
  updateAssetStatus(
    @Param('id') id: string,
    @Body() dto: UpdateHrAssetStatusDto,
  ) {
    return this.hrAdminService.updateHrAssetStatus(id, dto.status);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('people.view')
  @Get('assets/expiring')
  expiringAssets(@Query('days') days?: string) {
    return this.hrAdminService.expiringAssets(days ? Number(days) : 15);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('people.view')
  @Get('fleet/vehicles')
  vehicles() {
    return this.hrAdminService.listFleetVehicles();
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('people.create')
  @Post('fleet/vehicles')
  createVehicle(@Body() dto: CreateFleetVehicleDto) {
    return this.hrAdminService.createFleetVehicle(dto);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('people.update')
  @Post('fleet/allocations')
  allocateFleet(@Body() dto: AllocateFleetDto) {
    return this.hrAdminService.allocateVehicle(dto);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('people.update')
  @Patch('fleet/allocations/:id/release')
  releaseFleet(@Param('id') id: string, @Body() dto: ReleaseFleetDto) {
    return this.hrAdminService.releaseVehicle(id, dto.endKm);
  }

  private extractUserId(req: Request) {
    const authUser = req.user as { sub?: string } | undefined;
    return authUser?.sub;
  }

  private extractActor(req: Request): AccessActor {
    const authUser = req.user as
      | {
          role?: UserRole;
          isSystemMaster?: boolean;
          accessPolicy?: AccessActor['accessPolicy'];
        }
      | undefined;

    return {
      role: authUser?.role,
      isSystemMaster: authUser?.isSystemMaster,
      accessPolicy: authUser?.accessPolicy,
    };
  }
}
