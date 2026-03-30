import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommissionStatus } from '@prisma/client';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { HrAdminService } from './hr-admin.service';
import {
  AllocateFleetDto,
  AssignHrAssetDto,
  CreateCommissionDto,
  CreateFleetVehicleDto,
  CreateTimeEntryDto,
  ReleaseFleetDto,
  UpdateCommissionStatusDto,
  UpdateHrAssetStatusDto,
} from './dto/hr-admin.dto';

@Controller('hr-admin')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('pages.orders')
export class HrAdminController {
  constructor(private readonly hrAdminService: HrAdminService) {}

  @UseGuards(AuthGuard)
  @Get('collaborators')
  collaborators() {
    return this.hrAdminService.listCollaborators();
  }

  @UseGuards(AuthGuard)
  @Get('time-entries')
  timeEntries(
    @Query('userId') userId?: string,
    @Query('month') month?: string,
  ) {
    return this.hrAdminService.listTimeEntries(userId, month);
  }

  @UseGuards(AuthGuard)
  @Post('time-entries')
  createTimeEntry(@Body() dto: CreateTimeEntryDto) {
    return this.hrAdminService.createTimeEntry(dto);
  }

  @UseGuards(AuthGuard)
  @Get('time-entries/payroll-export')
  payrollExport(@Query('month') month?: string) {
    return this.hrAdminService.payrollExport(month);
  }

  @UseGuards(AuthGuard)
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
  @Post('commissions')
  createCommission(@Body() dto: CreateCommissionDto) {
    return this.hrAdminService.createCommission(dto);
  }

  @UseGuards(AuthGuard)
  @Patch('commissions/:id/status')
  updateCommissionStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCommissionStatusDto,
  ) {
    return this.hrAdminService.updateCommissionStatus(id, dto.status);
  }

  @UseGuards(AuthGuard)
  @Get('assets')
  assets() {
    return this.hrAdminService.listHrAssets();
  }

  @UseGuards(AuthGuard)
  @Post('assets')
  assignAsset(@Body() dto: AssignHrAssetDto) {
    return this.hrAdminService.assignHrAsset(dto);
  }

  @UseGuards(AuthGuard)
  @Patch('assets/:id/status')
  updateAssetStatus(
    @Param('id') id: string,
    @Body() dto: UpdateHrAssetStatusDto,
  ) {
    return this.hrAdminService.updateHrAssetStatus(id, dto.status);
  }

  @UseGuards(AuthGuard)
  @Get('assets/expiring')
  expiringAssets(@Query('days') days?: string) {
    return this.hrAdminService.expiringAssets(days ? Number(days) : 15);
  }

  @UseGuards(AuthGuard)
  @Get('fleet/vehicles')
  vehicles() {
    return this.hrAdminService.listFleetVehicles();
  }

  @UseGuards(AuthGuard)
  @Post('fleet/vehicles')
  createVehicle(@Body() dto: CreateFleetVehicleDto) {
    return this.hrAdminService.createFleetVehicle(dto);
  }

  @UseGuards(AuthGuard)
  @Post('fleet/allocations')
  allocateFleet(@Body() dto: AllocateFleetDto) {
    return this.hrAdminService.allocateVehicle(dto);
  }

  @UseGuards(AuthGuard)
  @Patch('fleet/allocations/:id/release')
  releaseFleet(@Param('id') id: string, @Body() dto: ReleaseFleetDto) {
    return this.hrAdminService.releaseVehicle(id, dto.endKm);
  }
}
