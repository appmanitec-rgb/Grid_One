import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { AddTicketCommentDto } from '../tickets/dto/ticket.dto';
import {
  TechnicianOrdersQueryDto,
  TechnicianTicketsQueryDto,
  TechnicianWorkPointDto,
} from './dto/technician-work.dto';
import { TechnicianWorkService } from './technician-work.service';

@Controller('technician')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('technicianWork.view')
export class TechnicianWorkController {
  constructor(private readonly technicianWorkService: TechnicianWorkService) {}

  @Get('orders')
  listOrders(@Req() req: Request, @Query() query: TechnicianOrdersQueryDto) {
    return this.technicianWorkService.listOrders(
      this.extractUserId(req),
      query,
    );
  }

  @Get('orders/:id')
  getOrder(@Req() req: Request, @Param('id') id: string) {
    return this.technicianWorkService.getOrder(this.extractUserId(req), id);
  }

  @Get('orders/:id/work-sessions')
  listWorkSessions(@Req() req: Request, @Param('id') id: string) {
    return this.technicianWorkService.listWorkSessions(
      this.extractUserId(req),
      id,
    );
  }

  @Post('orders/:id/check-in')
  @RequireAccessPolicy('technicianWork.checkInOut')
  checkIn(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: TechnicianWorkPointDto,
  ) {
    return this.technicianWorkService.checkIn(
      this.extractUserId(req),
      id,
      dto,
      this.extractMetadata(req),
    );
  }

  @Post('orders/:id/check-out')
  @RequireAccessPolicy('technicianWork.checkInOut')
  checkOut(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: TechnicianWorkPointDto,
  ) {
    return this.technicianWorkService.checkOut(
      this.extractUserId(req),
      id,
      dto,
      this.extractMetadata(req),
    );
  }

  @Get('tickets')
  @RequireAccessPolicy('tickets.viewOwn')
  listTickets(@Req() req: Request, @Query() query: TechnicianTicketsQueryDto) {
    return this.technicianWorkService.listTickets(
      this.extractUserId(req),
      query,
    );
  }

  @Post('tickets/:id/comment')
  @RequireAccessPolicy('tickets.commentOwn')
  commentTicket(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: AddTicketCommentDto,
  ) {
    return this.technicianWorkService.commentTicket(
      this.extractUserId(req),
      id,
      dto,
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
