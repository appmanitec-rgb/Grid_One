import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CatalogActor, CatalogsService } from './catalogs.service';
import { CreateCatalogDto } from './dto/create-catalog.dto';
import { UpdateCatalogDto } from './dto/update-catalog.dto';

@Controller('catalogs')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('catalog.view')
export class CatalogsController {
  constructor(private readonly catalogsService: CatalogsService) {}

  @RequireAccessPolicy('catalog.create')
  @Post()
  create(@Body() createCatalogDto: CreateCatalogDto) {
    return this.catalogsService.create(createCatalogDto);
  }

  @RequireAccessPolicy('catalog.view')
  @Get('lookup')
  lookup(
    @Req() req: Request,
    @Query('q') query?: string,
    @Query('type') type?: string,
    @Query('take') take?: string,
  ) {
    const actor = req['user'] as CatalogActor;
    return this.catalogsService.lookup(query, type, take, actor);
  }

  @RequireAccessPolicy('catalog.view')
  @Get()
  findAll(@Req() req: Request) {
    const actor = req['user'] as CatalogActor;
    return this.catalogsService.findAll(actor);
  }

  @RequireAccessPolicy('catalog.view')
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    const actor = req['user'] as CatalogActor;
    return this.catalogsService.findOne(id, actor);
  }

  @RequireAccessPolicy('catalog.view')
  @Get(':id/movements')
  movements(@Param('id') id: string, @Req() req: Request) {
    const actor = req['user'] as CatalogActor;
    return this.catalogsService.movements(id, actor);
  }

  @RequireAccessPolicy('catalog.view')
  @Get(':id/purchase-orders')
  purchaseOrders(@Param('id') id: string, @Req() req: Request) {
    const actor = req['user'] as CatalogActor;
    return this.catalogsService.purchaseOrders(id, actor);
  }

  @RequireAccessPolicy('catalog.view')
  @Get(':id/orders')
  orders(@Param('id') id: string, @Req() req: Request) {
    const actor = req['user'] as CatalogActor;
    return this.catalogsService.orders(id, actor);
  }

  @RequireAccessPolicy('catalog.view')
  @Get(':id/suppliers')
  suppliers(@Param('id') id: string, @Req() req: Request) {
    const actor = req['user'] as CatalogActor;
    return this.catalogsService.suppliers(id, actor);
  }

  @RequireAccessPolicy('catalog.update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCatalogDto: UpdateCatalogDto,
    @Req() req: Request,
  ) {
    const actor = req['user'] as CatalogActor;
    return this.catalogsService.update(id, updateCatalogDto, actor);
  }

  @RequireAccessPolicy('catalog.delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.catalogsService.remove(id);
  }
}
