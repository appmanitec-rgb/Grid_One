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
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import {
  CloseSalesOrderDto,
  SalesDeliveryDto,
  SalesOrderCatalogLinkDto,
  SalesOrderStockDto,
  SalesReturnDto,
} from './dto/sales-order.dto';
import { SalesOrdersService } from './sales-orders.service';

@Controller('sales-orders')
@UseGuards(AuthGuard)
export class SalesOrdersController {
  constructor(private readonly service: SalesOrdersService) {}

  @Get()
  list(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('q') query?: string,
    @Query('proposalId') proposalId?: string,
    @Query('orderId') orderId?: string,
  ) {
    return this.service.list(req['user'], {
      status,
      query,
      proposalId,
      orderId,
    });
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.service.get(id, req['user']);
  }

  @Post('sync-approved')
  syncApproved(@Req() req: Request) {
    return this.service.syncApproved(req['user']);
  }

  @Patch(':id/items/:itemId/catalog')
  linkCatalog(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: SalesOrderCatalogLinkDto,
  ) {
    return this.service.linkCatalog(
      id,
      itemId,
      body.catalogItemId,
      req['user'],
    );
  }

  @Post(':id/reserve')
  reserve(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: SalesOrderStockDto,
  ) {
    return this.service.reserve(id, body, req['user']);
  }

  @Post(':id/pick')
  pick(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: SalesOrderStockDto,
  ) {
    return this.service.pick(id, body, req['user']);
  }

  @Post(':id/release')
  release(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: SalesOrderStockDto,
  ) {
    return this.service.release(id, body, req['user']);
  }

  @Post(':id/deliveries')
  deliver(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: SalesDeliveryDto,
  ) {
    return this.service.deliver(id, body, req['user']);
  }

  @Post(':id/close')
  close(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: CloseSalesOrderDto,
  ) {
    return this.service.close(id, body.reason, req['user']);
  }

  @Post(':id/returns')
  receiveReturn(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: SalesReturnDto,
  ) {
    return this.service.receiveReturn(id, body, req['user']);
  }
}
