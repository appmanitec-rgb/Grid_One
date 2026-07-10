import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PurchaseOrderStatus } from '@prisma/client';
import type { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import {
  CreatePurchaseOrderDto,
  ReceivePurchaseOrderDto,
  UpdatePurchaseOrderStatusDto,
} from './dto/purchase-orders.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

@Controller('purchase-orders')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('purchaseOrders.view')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @RequireAccessPolicy('purchaseOrders.create')
  @Post()
  create(@Req() req: Request, @Body() dto: CreatePurchaseOrderDto) {
    return this.purchaseOrdersService.create(dto, this.extractUserId(req));
  }

  @RequireAccessPolicy('purchaseOrders.view')
  @Get()
  findAll() {
    return this.purchaseOrdersService.findAll();
  }

  @RequireAccessPolicy('purchaseOrders.view')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.purchaseOrdersService.findOne(id);
  }

  @RequireAccessPolicy('purchaseOrders.view')
  @Patch(':id/status')
  updateStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderStatusDto,
  ) {
    const parsed = dto.status as PurchaseOrderStatus;
    if (!Object.values(PurchaseOrderStatus).includes(parsed)) {
      throw new BadRequestException('Status de pedido invalido.');
    }
    this.assertStatusPermission(req, parsed);
    return this.purchaseOrdersService.updateStatus(
      id,
      parsed,
      this.extractUserId(req),
    );
  }

  @RequireAccessPolicy('purchaseOrders.receive')
  @Post(':id/receive')
  receive(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ReceivePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.receive(id, dto, this.extractUserId(req));
  }

  private assertStatusPermission(req: Request, status: PurchaseOrderStatus) {
    const key =
      status === PurchaseOrderStatus.APPROVED
        ? 'approve'
        : status === PurchaseOrderStatus.CANCELED
          ? 'cancel'
          : 'update';
    if (!this.hasPurchaseOrderPermission(req, key)) {
      throw new ForbiddenException(
        'Seu perfil nao possui permissao para alterar este status do pedido.',
      );
    }
  }

  private hasPurchaseOrderPermission(req: Request, action: string) {
    const user = req['user'] as any;
    if (user?.isSystemMaster || user?.role === 'ADMIN') return true;
    return user?.accessPolicy?.purchaseOrders?.[action] === true;
  }

  private extractUserId(req: Request) {
    const user = req['user'] as any;
    return user?.sub as string | undefined;
  }
}
