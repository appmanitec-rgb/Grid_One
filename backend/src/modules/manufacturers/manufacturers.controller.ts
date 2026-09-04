import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CreateManufacturerDto } from './dto/create-manufacturer.dto';
import { UpdateManufacturerDto } from './dto/update-manufacturer.dto';
import { ManufacturersService } from './manufacturers.service';

@Controller('manufacturers')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('pages.equipments')
export class ManufacturersController {
  constructor(private readonly manufacturersService: ManufacturersService) {}

  @RequireAccessPolicy('pages.equipments', 'equipments.manageModels')
  @Post()
  create(@Body() dto: CreateManufacturerDto) {
    return this.manufacturersService.create(dto);
  }

  @RequireAccessPolicy('pages.equipments', 'equipments.view')
  @Get()
  findAll() {
    return this.manufacturersService.findAll();
  }

  @RequireAccessPolicy('pages.equipments', 'equipments.view')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.manufacturersService.findOne(id);
  }

  @RequireAccessPolicy('pages.equipments', 'equipments.manageModels')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateManufacturerDto) {
    return this.manufacturersService.update(id, dto);
  }

  @RequireAccessPolicy('pages.equipments', 'equipments.manageModels')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.manufacturersService.remove(id);
  }
}
