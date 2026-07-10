import {
  Body,
  Controller,
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
import {
  AddTicketCommentDto,
  AssignTicketDto,
  ConvertTicketToOrderDto,
  CreateTicketDto,
  ListTicketsQueryDto,
  TicketActionNoteDto,
  UpdateTicketDto,
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ticketsService.findOne(id);
  }

  @Post()
  @RequireAccessPolicy('tickets.create')
  create(@Req() req: Request, @Body() dto: CreateTicketDto) {
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
