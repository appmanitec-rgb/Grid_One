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
@RequireAccessPolicy('pages.catalog')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Get()
  findAll() {
    return this.suppliersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.suppliersService.remove(id);
  }
}
