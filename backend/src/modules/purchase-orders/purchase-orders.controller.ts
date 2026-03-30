import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PurchaseOrderStatus } from '@prisma/client';
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
@RequireAccessPolicy('pages.catalog')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Post()
  create(@Body() dto: CreatePurchaseOrderDto) {
    return this.purchaseOrdersService.create(dto);
  }

  @Get()
  findAll() {
    return this.purchaseOrdersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.purchaseOrdersService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderStatusDto,
  ) {
    const parsed = dto.status as PurchaseOrderStatus;
    if (!Object.values(PurchaseOrderStatus).includes(parsed)) {
      throw new BadRequestException('Status de pedido invalido.');
    }
    return this.purchaseOrdersService.updateStatus(id, parsed);
  }

  @Post(':id/receive')
  receive(@Param('id') id: string, @Body() dto: ReceivePurchaseOrderDto) {
    return this.purchaseOrdersService.receive(id, dto);
  }
}
