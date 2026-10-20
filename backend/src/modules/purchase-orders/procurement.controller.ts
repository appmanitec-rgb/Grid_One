import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { DecideApprovalDto } from '../approvals/dto/decide-approval.dto';
import {
  ProcurementService,
  type PurchasingActor,
} from './procurement.service';
import {
  ApprovalRuleDto,
  InvitationDto,
  ProcurementActionDto,
  ProcurementInvoiceDto,
  ProcurementOfferDto,
  ProcurementQuoteDto,
  ProcurementReceiptDto,
  ProcurementRequestDto,
  ProcurementSettingsDto,
  SelectionDto,
} from './dto/procurement.dto';
type AuthRequest = Request & { user: PurchasingActor };
@Controller('purchasing')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('pages.dashboard')
export class ProcurementController {
  constructor(private readonly service: ProcurementService) {}
  @Get('status') status() {
    return this.service.status();
  }
  @Patch('settings') settings(
    @Body() dto: ProcurementSettingsDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.configure(dto.enabled, req.user);
  }
  @Get('options') options(
    @Query('kind') kind: string,
    @Query('q') q: string = '',
    @Req() req: AuthRequest,
  ) {
    return this.service.options(kind, q, req.user);
  }
  @Get('requests') requests(
    @Query() query: Record<string, string | undefined>,
    @Req() req: AuthRequest,
  ) {
    return this.service.requests(query, req.user);
  }
  @Post('requests') createRequest(
    @Body() dto: ProcurementRequestDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.createRequest(dto, req.user);
  }
  @Get('requests/:id') request(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    return this.service.request(id, req.user);
  }
  @Patch('requests/:id') updateRequest(
    @Param('id') id: string,
    @Body() dto: ProcurementRequestDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.createRequest(dto, req.user, id);
  }
  @Post('requests/:id/actions') requestAction(
    @Param('id') id: string,
    @Body() dto: ProcurementActionDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.requestAction(id, dto, req.user);
  }
  @Get('quotes') quotes(
    @Query() query: Record<string, string | undefined>,
    @Req() req: AuthRequest,
  ) {
    return this.service.quotes(query, req.user);
  }
  @Post('quotes') createQuote(
    @Body() dto: ProcurementQuoteDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.createQuote(dto, req.user);
  }
  @Get('quotes/:id') quote(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.service.quote(id, req.user);
  }
  @Post('quotes/:id/invitations') invitation(
    @Param('id') id: string,
    @Body() dto: InvitationDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.invitation(id, dto, req.user);
  }
  @Post('quotes/:id/offers') offer(
    @Param('id') id: string,
    @Body() dto: ProcurementOfferDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.offer(id, dto, req.user);
  }
  @Post('quotes/:id/selections') selection(
    @Param('id') id: string,
    @Body() dto: SelectionDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.select(id, dto, req.user);
  }
  @Post('quotes/:id/actions') quoteAction(
    @Param('id') id: string,
    @Body() dto: ProcurementActionDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.quoteAction(id, dto, req.user);
  }
  @Get('approvals') approvals(@Req() req: AuthRequest) {
    return this.service.approvals(req.user);
  }
  @Post('approvals/:id/:decision') decide(
    @Param('id') id: string,
    @Param('decision') decision: string,
    @Body() dto: DecideApprovalDto,
    @Req() req: AuthRequest,
  ) {
    const status =
      decision === 'approve'
        ? 'APPROVED'
        : decision === 'reject'
          ? 'REJECTED'
          : decision === 'request-adjustments'
            ? 'ADJUSTMENTS_REQUESTED'
            : null;
    if (!status) throw new BadRequestException('Decisão inválida.');
    return this.service.decide(id, req.user, status, dto.decisionNote);
  }
  @Get('rules') rules(@Req() req: AuthRequest) {
    return this.service.rules(req.user);
  }
  @Post('rules') createRule(
    @Body() dto: ApprovalRuleDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.saveRule(dto, req.user);
  }
  @Patch('rules/:id') updateRule(
    @Param('id') id: string,
    @Body() dto: ApprovalRuleDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.saveRule(dto, req.user, id);
  }
  @Get('orders/:id') order(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.service.order(id, req.user);
  }
  @Post('orders/:id/actions') orderAction(
    @Param('id') id: string,
    @Body() dto: ProcurementActionDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.orderAction(id, dto, req.user);
  }
  @Post('orders/:id/receive') receive(
    @Param('id') id: string,
    @Body() dto: ProcurementReceiptDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.receive(id, dto, req.user);
  }
  @Post('orders/:id/invoices') invoice(
    @Param('id') id: string,
    @Body() dto: ProcurementInvoiceDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.createInvoice(id, dto, req.user);
  }
  @Patch('orders/:id/invoices/:invoiceId')
  updateInvoice(
    @Param('id') id: string,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: ProcurementInvoiceDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.updateInvoice(id, invoiceId, dto, req.user);
  }
  @Post('orders/:id/invoices/:invoiceId/validate') validateInvoice(
    @Param('id') id: string,
    @Param('invoiceId') invoiceId: string,
    @Req() req: AuthRequest,
  ) {
    return this.service.validateInvoice(id, invoiceId, req.user);
  }
  @Post('attachments/:type/:id')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  attach(
    @Param('type') type: string,
    @Param('id') id: string,
    @UploadedFile()
    file: {
      buffer?: Buffer;
      originalname?: string;
      mimetype?: string;
      size?: number;
    },
    @Req() req: AuthRequest,
  ) {
    return this.service.attach(type, id, file, req.user);
  }
  @Get('attachments/:id/download') async download(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    const file = await this.service.download(id, req.user);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Disposition',
      "attachment; filename*=UTF-8''" + encodeURIComponent(file.fileName),
    );
    res.send(file.buffer);
  }
}
