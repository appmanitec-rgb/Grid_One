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
  @Post()
  create(@Body() createGeneratorDto: CreateGeneratorDto, @Req() req: Request) {
    const userId = (req as any).user?.sub as string | undefined;
    return this.generatorsService.create(createGeneratorDto, userId);
  }

  @Get()
  findAll() {
    return this.generatorsService.findAll();
  }

  @Get('models')
  findAllModels() {
    return this.generatorsService.findAllModels();
  }

  @UseGuards(AuthGuard)
  @Post('models')
  createModel(@Body() body: CreateGeneratorModelDto) {
    return this.generatorsService.createModel(body);
  }

  @UseGuards(AuthGuard)
  @Patch('models/:id')
  updateModel(@Param('id') id: string, @Body() body: UpdateGeneratorModelDto) {
    return this.generatorsService.updateModel(id, body);
  }

  @UseGuards(AuthGuard)
  @Put('models/:id/base-items')
  upsertModelBaseItems(
    @Param('id') id: string,
    @Body() body: UpsertModelBaseItemsDto,
  ) {
    return this.generatorsService.upsertModelBaseItems(id, body.items);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.generatorsService.findOne(id);
  }

  @Get(':id/base-items')
  getBaseItems(@Param('id') id: string, @Query('group') group?: ServiceGroup) {
    return this.generatorsService.getGeneratorBaseItems(id, group);
  }

  @UseGuards(AuthGuard)
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
  @Put(':id/base-items')
  upsertGeneratorBaseItems(
    @Param('id') id: string,
    @Body() body: UpsertGeneratorBaseItemsDto,
  ) {
    return this.generatorsService.upsertGeneratorBaseItems(id, body);
  }

  @UseGuards(AuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateGeneratorDto: UpdateGeneratorDto,
  ) {
    return this.generatorsService.update(id, updateGeneratorDto);
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.generatorsService.remove(id);
  }
}
