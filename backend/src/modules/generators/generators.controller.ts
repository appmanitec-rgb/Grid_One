import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { GeneratorsService } from './generators.service';
import { CreateGeneratorDto } from './dto/create-generator.dto';
import { UpdateGeneratorDto } from './dto/update-generator.dto';
import {
  CreateGeneratorModelDto,
  UpdateGeneratorModelDto,
  UpsertModelBaseItemsDto,
} from './dto/generator-model.dto';
import { UpsertGeneratorBaseItemsDto } from './dto/generator-base-items.dto';
import { ServiceGroup } from '@prisma/client';

@Controller('generators')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('pages.equipments')
export class GeneratorsController {
  constructor(private readonly generatorsService: GeneratorsService) {}

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('pages.equipments', 'equipments.create')
  @Post()
  create(@Body() createGeneratorDto: CreateGeneratorDto, @Req() req: Request) {
    const userId = (req as any).user?.sub as string | undefined;
    return this.generatorsService.create(createGeneratorDto, userId);
  }

  @RequireAccessPolicy('pages.equipments', 'equipments.view')
  @Get()
  findAll() {
    return this.generatorsService.findAll();
  }

  @RequireAccessPolicy('pages.equipments', 'equipments.view')
  @Get('models')
  findAllModels() {
    return this.generatorsService.findAllModels();
  }

  @RequireAccessPolicy('pages.equipments', 'equipments.view')
  @Get('models/:id')
  findModelById(@Param('id') id: string) {
    return this.generatorsService.findModelById(id);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('pages.equipments', 'equipments.manageModels')
  @Post('models')
  createModel(@Body() body: CreateGeneratorModelDto) {
    return this.generatorsService.createModel(body);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('pages.equipments', 'equipments.manageModels')
  @Patch('models/:id')
  updateModel(@Param('id') id: string, @Body() body: UpdateGeneratorModelDto) {
    return this.generatorsService.updateModel(id, body);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('pages.equipments', 'equipments.manageModels')
  @Put('models/:id/base-items')
  upsertModelBaseItems(
    @Param('id') id: string,
    @Body() body: UpsertModelBaseItemsDto,
  ) {
    return this.generatorsService.upsertModelBaseItems(id, body.items);
  }

  @RequireAccessPolicy('pages.equipments', 'equipments.view')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.generatorsService.findOne(id);
  }

  @RequireAccessPolicy('pages.equipments', 'equipments.view')
  @Get(':id/base-items')
  getBaseItems(@Param('id') id: string, @Query('group') group?: ServiceGroup) {
    return this.generatorsService.getGeneratorBaseItems(id, group);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('pages.equipments', 'equipments.update')
  @Post(':id/apply-model-base-items')
  applyModelBaseItems(
    @Param('id') id: string,
    @Body() body?: { overwrite?: boolean },
  ) {
    return this.generatorsService.applyModelBaseItems(
      id,
      body?.overwrite ?? false,
    );
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('pages.equipments', 'equipments.update')
  @Put(':id/base-items')
  upsertGeneratorBaseItems(
    @Param('id') id: string,
    @Body() body: UpsertGeneratorBaseItemsDto,
  ) {
    return this.generatorsService.upsertGeneratorBaseItems(id, body);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('pages.equipments', 'equipments.update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateGeneratorDto: UpdateGeneratorDto,
  ) {
    return this.generatorsService.update(id, updateGeneratorDto);
  }

  @UseGuards(AuthGuard)
  @RequireAccessPolicy('pages.equipments', 'equipments.delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.generatorsService.remove(id);
  }
}
