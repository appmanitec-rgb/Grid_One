import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CreateMaintenanceOrderDto } from './dto/create-maintenance-order.dto';
import { SubmitVisitReportDto } from './dto/submit-visit-report.dto';
import { UpdateMaintenanceOrderDto } from './dto/update-maintenance-order.dto';
import { MaintenanceOrdersService } from './maintenance-orders.service';

@Controller('maintenance-orders')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('pages.orders')
export class MaintenanceOrdersController {
  constructor(
    private readonly maintenanceOrdersService: MaintenanceOrdersService,
  ) {}

  @Post()
  create(@Req() req: Request, @Body() dto: CreateMaintenanceOrderDto) {
    const actorUserId = this.extractUserId(req);
    return this.maintenanceOrdersService.create(dto, actorUserId);
  }

  @Get()
  findAll() {
    return this.maintenanceOrdersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.maintenanceOrdersService.findOne(id);
  }

  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateMaintenanceOrderDto,
  ) {
    const actorUserId = this.extractUserId(req);
    return this.maintenanceOrdersService.update(id, dto, actorUserId);
  }

  @RequireAccessPolicy('maintenanceOrders.submitVisitReport')
  @Post(':id/visit-report/submit')
  submitVisitReport(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: SubmitVisitReportDto,
  ) {
    const actorUserId = this.extractUserId(req);
    return this.maintenanceOrdersService.submitVisitReport(
      id,
      actorUserId,
      dto.report,
      dto.note,
    );
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    const actorUserId = this.extractUserId(req);
    return this.maintenanceOrdersService.remove(id, actorUserId);
  }

  private extractUserId(req: Request) {
    const authUser = req['user'] as any;
    return authUser?.sub as string;
  }
}
