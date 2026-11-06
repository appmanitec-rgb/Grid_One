import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import {
  StockLocationsService,
  type StockLocationActor,
} from './stock-locations.service';
import {
  CountLocationItemDto,
  CreateLocationDto,
  LocationBalanceDto,
  LocationDemandDto,
  LocationLabelsDto,
  LocationOptionsDto,
  LocationPageDto,
  MoveLocationItemDto,
  PlaceLocationItemDto,
  ReleaseLocationReservationDto,
  ReserveLocationItemDto,
  TransferLocationReservationDto,
  UpdateLocationDto,
  WarehouseQrAccessDto,
} from './dto/stock-locations.dto';
type StockRequest = Request & { user: StockLocationActor };

@Controller('inventory/locations')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('inventory.view')
export class StockLocationsController {
  constructor(private readonly service: StockLocationsService) {}
  @Get() list(@Query() query: LocationPageDto, @Req() req: StockRequest) {
    return this.service.list(query, req.user);
  }
  @Get('options') options(
    @Query() query: LocationOptionsDto,
    @Req() req: StockRequest,
  ) {
    return this.service.options(query, req.user);
  }
  @Post('labels') labels(
    @Body() dto: LocationLabelsDto,
    @Req() req: StockRequest,
  ) {
    return this.service.labels(dto, req.user);
  }
  @Post() @RequireAccessPolicy('inventory.create') create(
    @Body() dto: CreateLocationDto,
    @Req() req: StockRequest,
  ) {
    return this.service.create(dto, req.user);
  }
  @Get(':id') detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: StockRequest,
  ) {
    return this.service.detail(id, req.user);
  }
  @Get(':id/items') items(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: LocationPageDto,
    @Req() req: StockRequest,
  ) {
    return this.service.items(id, query, req.user);
  }
  @Get(':id/reservations') reservations(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: LocationPageDto,
    @Req() req: StockRequest,
  ) {
    return this.service.reservations(id, query, req.user);
  }
  @Get(':id/demands') demands(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: LocationDemandDto,
    @Req() req: StockRequest,
  ) {
    return this.service.demands(id, query, req.user);
  }
  @Get(':id/history') history(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: LocationPageDto,
    @Req() req: StockRequest,
  ) {
    return this.service.history(id, query, req.user);
  }
  @Patch(':id') @RequireAccessPolicy('inventory.update') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
    @Req() req: StockRequest,
  ) {
    return this.service.update(id, dto, req.user);
  }
  @Post(':id/items') @RequireAccessPolicy('inventory.update') place(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlaceLocationItemDto,
    @Req() req: StockRequest,
  ) {
    return this.service.place(id, dto, req.user);
  }
  @Post(':id/count') @RequireAccessPolicy('inventory.adjust') count(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CountLocationItemDto,
    @Req() req: StockRequest,
  ) {
    return this.service.count(id, dto, req.user);
  }
  @Post(':id/move') @RequireAccessPolicy('inventory.update') move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveLocationItemDto,
    @Req() req: StockRequest,
  ) {
    return this.service.move(id, dto, req.user);
  }
  @Post(':id/unplace') @RequireAccessPolicy('inventory.update') unplace(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LocationBalanceDto,
    @Req() req: StockRequest,
  ) {
    return this.service.unplace(id, dto, req.user);
  }
  @Post(':id/reservations') @RequireAccessPolicy('inventory.reserve') reserve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReserveLocationItemDto,
    @Req() req: StockRequest,
  ) {
    return this.service.reserve(id, dto, req.user);
  }
  @Post(':id/reservations/:reservationId/release')
  @RequireAccessPolicy('inventory.reserve')
  release(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Body() dto: ReleaseLocationReservationDto,
    @Req() req: StockRequest,
  ) {
    return this.service.release(id, reservationId, dto, req.user);
  }
  @Post(':id/reservations/:reservationId/transfer')
  @RequireAccessPolicy('inventory.reserve')
  transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Body() dto: TransferLocationReservationDto,
    @Req() req: StockRequest,
  ) {
    return this.service.transferReservation(id, reservationId, dto, req.user);
  }
  @Patch(':id/qr-access') @RequireAccessPolicy('inventory.update') qrAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WarehouseQrAccessDto,
    @Req() req: StockRequest,
  ) {
    return this.service.qrAccess(id, dto, req.user);
  }
}
