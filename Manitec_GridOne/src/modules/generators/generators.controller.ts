import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { GeneratorsService } from './generators.service';
import { CreateGeneratorDto } from './dto/create-generator.dto';
import { UpdateGeneratorDto } from './dto/update-generator.dto';

@Controller('generators')
export class GeneratorsController {
  constructor(private readonly generatorsService: GeneratorsService) {}

  @Post()
  create(@Body() createGeneratorDto: CreateGeneratorDto) {
    return this.generatorsService.create(createGeneratorDto);
  }

  @Get()
  findAll() {
    return this.generatorsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.generatorsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateGeneratorDto: UpdateGeneratorDto) {
    return this.generatorsService.update(id, updateGeneratorDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.generatorsService.remove(id);
  }
}