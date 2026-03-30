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
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Controller('clients')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('pages.clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  create(@Body() createClientDto: CreateClientDto, @Req() req: Request) {
    const userId = (req as any).user?.sub as string | undefined;
    return this.clientsService.create(createClientDto, userId);
  }

  @Get()
  findAll() {
    return this.clientsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateClientDto: UpdateClientDto,
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.sub as string | undefined;
    return this.clientsService.update(id, updateClientDto, userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clientsService.remove(id);
  }
}
