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
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Controller('clients')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('clients.view')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @RequireAccessPolicy('clients.create')
  @Post()
  create(@Body() createClientDto: CreateClientDto, @Req() req: Request) {
    const userId = (req as any).user?.sub as string | undefined;
    return this.clientsService.create(createClientDto, userId);
  }

  @RequireAccessPolicy(
    'clients.create',
    'pages.equipments',
    'equipments.create',
  )
  @Post('onboarding')
  createWithEquipments(
    @Body() createClientDto: CreateClientDto,
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.sub as string | undefined;
    return this.clientsService.create(createClientDto, userId, true);
  }

  @RequireAccessPolicy('clients.view')
  @Get('lookup')
  lookup(@Query('q') query?: string, @Query('take') take?: string) {
    return this.clientsService.lookup(query, take);
  }

  @RequireAccessPolicy('clients.view')
  @Get()
  findAll() {
    return this.clientsService.findAll();
  }

  @RequireAccessPolicy('clients.view')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(id);
  }

  @RequireAccessPolicy('clients.update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateClientDto: UpdateClientDto,
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.sub as string | undefined;
    return this.clientsService.update(id, updateClientDto, userId);
  }

  @RequireAccessPolicy('clients.delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clientsService.remove(id);
  }
}
