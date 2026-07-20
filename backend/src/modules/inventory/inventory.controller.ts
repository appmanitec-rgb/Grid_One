import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import {
  StockAdjustmentDto,
  StockReservationDto,
  StockTransferDto,
} from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('inventory.view')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @RequireAccessPolicy('inventory.view')
  @Get('warehouses')
  warehouses() {
    return this.inventoryService.warehouses();
  }

  @RequireAccessPolicy('inventory.view')
  @Get('summary')
  summary(
    @Query('warehouseId') warehouseId: string | undefined,
    @Req() req: Request,
  ) {
    const actor = req['user'] as any;
    return this.inventoryService.summary(warehouseId, actor);
  }

  @RequireAccessPolicy('inventory.view')
  @Get('replenishment-drafts')
  replenishmentDrafts(
    @Query('warehouseId') warehouseId: string | undefined,
    @Req() req: Request,
  ) {
    const actor = req['user'] as any;
    return this.inventoryService.replenishmentDrafts(warehouseId, actor);
  }

  @RequireAccessPolicy('inventory.adjust')
  @Post('adjust')
  adjust(@Body() dto: StockAdjustmentDto) {
    return this.inventoryService.adjustStock(dto);
  }

  @RequireAccessPolicy('inventory.update')
  @Post('transfer')
  transfer(@Body() dto: StockTransferDto) {
    return this.inventoryService.transfer(dto);
  }

  @RequireAccessPolicy('inventory.reserve')
  @Post('reserve')
  reserve(@Body() dto: StockReservationDto) {
    return this.inventoryService.reserve(dto);
  }

  @RequireAccessPolicy('inventory.reserve')
  @Post('release')
  release(@Body() dto: StockReservationDto) {
    return this.inventoryService.release(dto);
  }
}
