import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import type { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CreateMaintenanceOrderDto } from './dto/create-maintenance-order.dto';
import { ListMaintenanceOrdersQueryDto } from './dto/list-maintenance-orders-query.dto';
import { SubmitVisitReportDto } from './dto/submit-visit-report.dto';
import { UpdateMaintenanceOrderDto } from './dto/update-maintenance-order.dto';
import { MaintenanceOrdersService } from './maintenance-orders.service';

@Controller('maintenance-orders')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('orders.view')
export class MaintenanceOrdersController {
  constructor(
    private readonly maintenanceOrdersService: MaintenanceOrdersService,
  ) {}

  @RequireAccessPolicy('orders.create')
  @Post()
  create(@Req() req: Request, @Body() dto: CreateMaintenanceOrderDto) {
    const actorUserId = this.extractUserId(req);
    return this.maintenanceOrdersService.create(dto, actorUserId);
  }

  @RequireAccessPolicy('orders.view')
  @Get()
  findAll(@Req() req: Request, @Query() query: ListMaintenanceOrdersQueryDto) {
    const actorUserId = this.extractUserId(req);
    return this.maintenanceOrdersService.findAll(actorUserId, query);
  }

  @RequireAccessPolicy('orders.view')
  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const actorUserId = this.extractUserId(req);
    return this.maintenanceOrdersService.findOne(id, actorUserId);
  }

  @RequireAccessPolicy('orders.update')
  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateMaintenanceOrderDto,
  ) {
    this.assertOrderUpdatePermission(req, dto.status);
    const actorUserId = this.extractUserId(req);
    return this.maintenanceOrdersService.update(id, dto, actorUserId);
  }

  @RequireAccessPolicy('orders.finish')
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

  @RequireAccessPolicy('orders.cancel')
  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    const actorUserId = this.extractUserId(req);
    return this.maintenanceOrdersService.remove(id, actorUserId);
  }

  private extractUserId(req: Request) {
    const authUser = req['user'] as any;
    return authUser?.sub as string;
  }

  private assertOrderUpdatePermission(req: Request, status?: OrderStatus) {
    if (!status) return;
    const action =
      status === OrderStatus.COMPLETED
        ? 'finish'
        : status === OrderStatus.CANCELED
          ? 'cancel'
          : 'update';
    if (this.hasOrderPermission(req, action)) return;
    throw new ForbiddenException(
      'Seu perfil nao possui permissao para esta alteracao da OS.',
    );
  }

  private hasOrderPermission(req: Request, action: string) {
    const user = req['user'] as any;
    if (user?.isSystemMaster || user?.role === 'ADMIN') return true;
    return user?.accessPolicy?.orders?.[action] === true;
  }
}
