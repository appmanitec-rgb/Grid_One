import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('purchaseOrders.view')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @RequireAccessPolicy('purchaseOrders.create')
  @Post()
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @RequireAccessPolicy('purchaseOrders.view')
  @Get()
  findAll() {
    return this.suppliersService.findAll();
  }

  @RequireAccessPolicy('purchaseOrders.view')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @RequireAccessPolicy('purchaseOrders.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(id, dto);
  }

  @RequireAccessPolicy('purchaseOrders.cancel')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.suppliersService.remove(id);
  }
}
