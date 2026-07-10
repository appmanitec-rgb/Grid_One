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
import { CreateTechnicianDto } from './dto/create-technician.dto';
import { UpdateTechnicianDto } from './dto/update-technician.dto';
import { TechniciansService } from './technicians.service';

@Controller('technicians')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('technicians.view')
export class TechniciansController {
  constructor(private readonly techniciansService: TechniciansService) {}

  @RequireAccessPolicy('people.create')
  @Post()
  create(@Body() createTechnicianDto: CreateTechnicianDto) {
    return this.techniciansService.create(createTechnicianDto);
  }

  @RequireAccessPolicy('technicians.view')
  @Get()
  findAll() {
    return this.techniciansService.findAll();
  }

  @RequireAccessPolicy('technicians.view')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.techniciansService.findOne(id);
  }

  @RequireAccessPolicy('people.update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateTechnicianDto: UpdateTechnicianDto,
  ) {
    return this.techniciansService.update(id, updateTechnicianDto);
  }

  @RequireAccessPolicy('people.delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.techniciansService.remove(id);
  }
}
