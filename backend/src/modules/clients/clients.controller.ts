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
import { ClientPortalAdminService } from './client-portal-admin.service';
import { CreateClientPortalUserDto, UpdateClientPortalDto, UpdateClientPortalUserDto } from './dto/client-portal-admin.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Controller('clients')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('clients.view')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService, private readonly portalAdmin: ClientPortalAdminService) {}

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
  @Get(':id/portal')
  portalOverview(@Param('id') id: string) {
    return this.portalAdmin.overview(id);
  }

  @RequireAccessPolicy('clients.update')
  @Patch(':id/portal')
  updatePortal(@Param('id') id: string, @Body() dto: UpdateClientPortalDto) {
    return this.portalAdmin.updateSettings(id, dto);
  }

  @RequireAccessPolicy('users.manage')
  @Post(':id/portal/users')
  createPortalUser(@Param('id') id: string, @Body() dto: CreateClientPortalUserDto, @Req() req: Request) {
    return this.portalAdmin.createUser(id, dto, (req as any).user?.sub);
  }

  @RequireAccessPolicy('users.manage')
  @Patch(':id/portal/users/:userId')
  updatePortalUser(@Param('id') id: string, @Param('userId') userId: string, @Body() dto: UpdateClientPortalUserDto, @Req() req: Request) {
    return this.portalAdmin.updateUser(id, userId, dto, (req as any).user?.sub);
  }

  @RequireAccessPolicy('users.manage')
  @Post(':id/portal/users/:userId/activation')
  activatePortalUser(@Param('id') id: string, @Param('userId') userId: string, @Req() req: Request) {
    return this.portalAdmin.activateUser(id, userId, (req as any).user?.sub);
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
