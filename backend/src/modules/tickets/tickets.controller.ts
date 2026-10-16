import {
  Body,
  Controller,
  Get,
  ForbiddenException,
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
import {
  AddTicketCommentDto,
  AssignTicketDto,
  ConvertTicketToOrderDto,
  CreateTicketDto,
  ListTicketsQueryDto,
  TicketActionNoteDto,
  UpdateTicketDto,
  TicketWorkspaceQueryDto,
} from './dto/ticket.dto';
import { TicketsService } from './tickets.service';

@Controller('tickets')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('tickets.view')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  findAll(@Query() query: ListTicketsQueryDto) {
    return this.ticketsService.findAll(query);
  }

  @Get('workspace')
  workspace(@Req() req: Request, @Query() query: TicketWorkspaceQueryDto) {
    return this.ticketsService.workspace(query, this.extractUserId(req));
  }

  @Get('create-options')
  @RequireAccessPolicy('tickets.create')
  createOptions(@Query() query: ListTicketsQueryDto) {
    return this.ticketsService.createOptions(query.clientId);
  }

  @Get('assignees')
  assignees() {
    return this.ticketsService.assignees();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ticketsService.findOne(id);
  }

  @Get(':id/equipment-options')
  @RequireAccessPolicy('tickets.convertToOrder')
  equipmentOptions(@Param('id') id: string) {
    return this.ticketsService.equipmentOptions(id);
  }

  @Post()
  @RequireAccessPolicy('tickets.create')
  create(@Req() req: Request, @Body() dto: CreateTicketDto) {
    this.assertAssignmentPermission(req, dto);
    return this.ticketsService.createInternal(
      dto,
      this.extractUserId(req),
      this.extractMetadata(req),
    );
  }

  @Patch(':id')
  @RequireAccessPolicy('tickets.update')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
  ) {
    this.assertAssignmentPermission(req, dto);
    return this.ticketsService.update(
      id,
      dto,
      this.extractUserId(req),
      this.extractMetadata(req),
    );
  }

  @Post(':id/comment')
  @RequireAccessPolicy('tickets.comment')
  comment(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: AddTicketCommentDto,
  ) {
    return this.ticketsService.addInternalComment(
      id,
      dto,
      this.extractUserId(req),
      this.extractMetadata(req),
    );
  }

  @Post(':id/assign')
  @RequireAccessPolicy('tickets.assign')
  assign(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
  ) {
    return this.ticketsService.assign(
      id,
      dto,
      this.extractUserId(req),
      this.extractMetadata(req),
    );
  }

  @Post(':id/convert-to-order')
  @RequireAccessPolicy('tickets.convertToOrder')
  convertToOrder(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ConvertTicketToOrderDto,
  ) {
    return this.ticketsService.convertToOrder(
      id,
      dto,
      this.extractUserId(req),
      this.extractMetadata(req),
    );
  }

  @Post(':id/resolve')
  @RequireAccessPolicy('tickets.resolve')
  resolve(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: TicketActionNoteDto,
  ) {
    return this.ticketsService.resolve(
      id,
      dto,
      this.extractUserId(req),
      this.extractMetadata(req),
    );
  }

  @Post(':id/close')
  @RequireAccessPolicy('tickets.close')
  close(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: TicketActionNoteDto,
  ) {
    return this.ticketsService.close(
      id,
      dto,
      this.extractUserId(req),
      this.extractMetadata(req),
    );
  }

  @Post(':id/cancel')
  @RequireAccessPolicy('tickets.cancel')
  cancel(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: TicketActionNoteDto,
  ) {
    return this.ticketsService.cancel(
      id,
      dto,
      this.extractUserId(req),
      this.extractMetadata(req),
    );
  }

  private assertAssignmentPermission(
    req: Request,
    dto: { assignedToUserId?: string | null; technicianId?: string | null },
  ) {
    if (dto.assignedToUserId === undefined && dto.technicianId === undefined)
      return;
    const user = req['user'] as
      | {
          role?: string;
          isSystemMaster?: boolean;
          accessPolicy?: { tickets?: { assign?: boolean } };
        }
      | undefined;
    if (
      user?.role === 'ADMIN' ||
      user?.isSystemMaster ||
      user?.accessPolicy?.tickets?.assign
    )
      return;
    throw new ForbiddenException(
      'Seu perfil não permite atribuir responsáveis.',
    );
  }

  private extractUserId(req: Request) {
    const authUser = req['user'] as { sub?: string } | undefined;
    return authUser?.sub;
  }

  private extractMetadata(req: Request) {
    return {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };
  }
}
