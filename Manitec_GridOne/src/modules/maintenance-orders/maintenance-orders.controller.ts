import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { MaintenanceOrdersService } from './maintenance-orders.service';
import { CreateMaintenanceOrder } from './dto/create-maintenance-order.dto';

@Controller('maintenance-orders')
export class MaintenanceOrdersController {
  constructor(private readonly maintenanceOrdersService: MaintenanceOrdersService) {}

  @Post()
  create(@Body() createMaintenanceOrder: CreateMaintenanceOrder) {
    return this.maintenanceOrdersService.create(createMaintenanceOrder);
  }

  @Get()
  findAll() {
    return this.maintenanceOrdersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.maintenanceOrdersService.findOne(id);
  }
}