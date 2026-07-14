import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { LoadedFile } from '../file-storage/file-storage.service';
import { TicketsService } from '../tickets/tickets.service';
import { ServiceReportsService } from '../service-reports/service-reports.service';
import {
  AcceptServiceReportDto,
  ListServiceReportsQueryDto,
} from '../service-reports/dto/service-report.dto';
import {
  CreateCustomerTicketDto,
  CustomerTicketCommentDto,
  ListTicketsQueryDto,
  TicketActionNoteDto,
} from '../tickets/dto/ticket.dto';
import { CustomerPortalService } from './customer-portal.service';
import {
  CreateCustomerQuoteRequestDto,
  CustomerProposalDecisionDto,
} from './dto/customer-portal.dto';

type AuthenticatedRequest = Request & {
  user?: {
    sub?: string;
  };
};

@Controller('customer-portal')
@UseGuards(AuthGuard)
export class CustomerPortalController {
  constructor(
    private readonly customerPortalService: CustomerPortalService,
    private readonly ticketsService: TicketsService,
    private readonly serviceReportsService: ServiceReportsService,
  ) {}

  @Get('me')
  me(@Req() req: AuthenticatedRequest) {
    return this.customerPortalService.me(this.extractUserId(req));
  }

  @Get('dashboard')
  dashboard(@Req() req: AuthenticatedRequest) {
    return this.customerPortalService.dashboard(this.extractUserId(req));
  }

  @Get('equipment')
  equipment(@Req() req: AuthenticatedRequest) {
    return this.customerPortalService.listEquipment(this.extractUserId(req));
  }

  @Get('equipment/:id')
  equipmentDetail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.customerPortalService.getEquipment(this.extractUserId(req), id);
  }

  @Get('proposals')
  proposals(@Req() req: AuthenticatedRequest) {
    return this.customerPortalService.listProposals(this.extractUserId(req));
  }

  @Get('proposals/:id')
  proposalDetail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.customerPortalService.getProposal(this.extractUserId(req), id);
  }

  @Post('proposals/:id/approve')
  approveProposal(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CustomerProposalDecisionDto,
  ) {
    return this.customerPortalService.approveProposal(
      this.extractUserId(req),
      id,
      dto,
      this.extractMetadata(req),
    );
  }

  @Post('proposals/:id/reject')
  rejectProposal(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CustomerProposalDecisionDto,
  ) {
    return this.customerPortalService.rejectProposal(
      this.extractUserId(req),
      id,
      dto,
      this.extractMetadata(req),
    );
  }

  @Get('quote-requests')
  quoteRequests(@Req() req: AuthenticatedRequest) {
    return this.customerPortalService.listQuoteRequests(
      this.extractUserId(req),
    );
  }

  @Post('quote-requests')
  createQuoteRequest(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCustomerQuoteRequestDto,
  ) {
    return this.customerPortalService.createQuoteRequest(
      this.extractUserId(req),
      dto,
      this.extractMetadata(req),
    );
  }

  @Get('orders')
  orders(@Req() req: AuthenticatedRequest) {
    return this.customerPortalService.listOrders(this.extractUserId(req));
  }

  @Get('orders/:id')
  orderDetail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.customerPortalService.getOrder(this.extractUserId(req), id);
  }

  @Get('orders/:id/report')
  orderReport(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.serviceReportsService.getCustomerOrderReport(
      this.extractUserId(req),
      id,
    );
  }

  @Get('equipment/:id/reports')
  equipmentReports(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: ListServiceReportsQueryDto,
  ) {
    return this.serviceReportsService.listCustomerEquipmentReports(
      this.extractUserId(req),
      id,
      query,
    );
  }

  @Get('service-reports')
  serviceReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListServiceReportsQueryDto,
  ) {
    return this.serviceReportsService.listCustomerReports(
      this.extractUserId(req),
      query,
    );
  }

  @Get('service-reports/:id/print')
  serviceReportPrint(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    return this.serviceReportsService
      .getCustomerPrintableHtml(this.extractUserId(req), id)
      .then((html) => res.type('text/html').send(html));
  }

  @Get('service-reports/:id/download-pdf')
  serviceReportPdfDownload(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    return this.serviceReportsService
      .downloadCustomerPdf(
        this.extractUserId(req),
        id,
        this.extractMetadata(req),
      )
      .then((file) => this.sendFile(res, file));
  }

  @Get('service-reports/:id/evidence/:evidenceId/download')
  serviceReportEvidenceDownload(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
    @Res() res: Response,
  ) {
    return this.serviceReportsService
      .downloadCustomerEvidence(
        this.extractUserId(req),
        id,
        evidenceId,
        this.extractMetadata(req),
      )
      .then((file) => this.sendFile(res, file));
  }

  @Get('service-reports/:id')
  serviceReportDetail(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.serviceReportsService.getCustomerReport(
      this.extractUserId(req),
      id,
    );
  }

  @Post('service-reports/:id/acceptance')
  acceptServiceReport(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: AcceptServiceReportDto,
  ) {
    return this.serviceReportsService.acceptCustomerReport(
      this.extractUserId(req),
      id,
      dto,
      this.extractMetadata(req),
    );
  }

  @Get('tickets')
  tickets(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListTicketsQueryDto,
  ) {
    return this.ticketsService.listCustomerTickets(
      this.extractUserId(req),
      query,
    );
  }

  @Get('tickets/:id')
  ticketDetail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.ticketsService.getCustomerTicket(this.extractUserId(req), id);
  }

  @Post('tickets')
  createTicket(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCustomerTicketDto,
  ) {
    return this.ticketsService.createCustomerTicket(
      this.extractUserId(req),
      dto,
      this.extractMetadata(req),
    );
  }

  @Post('tickets/:id/comment')
  commentTicket(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CustomerTicketCommentDto,
  ) {
    return this.ticketsService.addCustomerComment(
      this.extractUserId(req),
      id,
      dto,
      this.extractMetadata(req),
    );
  }

  @Post('tickets/:id/cancel')
  cancelTicket(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: TicketActionNoteDto,
  ) {
    return this.ticketsService.cancelCustomerTicket(
      this.extractUserId(req),
      id,
      dto,
      this.extractMetadata(req),
    );
  }

  @Get('documents')
  documents(@Req() req: AuthenticatedRequest) {
    return this.customerPortalService.listDocuments(this.extractUserId(req));
  }

  @Get('financial')
  financial(@Req() req: AuthenticatedRequest) {
    return this.customerPortalService.listFinancial(this.extractUserId(req));
  }

  private extractUserId(req: AuthenticatedRequest) {
    return req.user?.sub;
  }

  private extractMetadata(req: Request) {
    return {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };
  }

  private sendFile(res: Response, file: LoadedFile) {
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.buffer.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    );
    return res.send(file.buffer);
  }
}
