import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CatalogsService } from './catalogs.service';
import { CreateCatalogDto } from './dto/create-catalog.dto';
import { UpdateCatalogDto } from './dto/update-catalog.dto';

@Controller('catalogs')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('pages.catalog')
export class CatalogsController {
  constructor(private readonly catalogsService: CatalogsService) {}

  @Post()
  create(@Body() createCatalogDto: CreateCatalogDto) {
    return this.catalogsService.create(createCatalogDto);
  }

  @Get()
  findAll(@Req() req: Request) {
    const actor = req['user'] as any;
    return this.catalogsService.findAll(actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    const actor = req['user'] as any;
    return this.catalogsService.findOne(id, actor);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCatalogDto: UpdateCatalogDto) {
    return this.catalogsService.update(id, updateCatalogDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.catalogsService.remove(id);
  }
}
