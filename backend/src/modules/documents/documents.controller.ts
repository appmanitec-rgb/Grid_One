import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { DocumentsService } from './documents.service';

@Controller('documents')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('pages.dashboard')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('hub')
  getHub(@Req() req: Request) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.documentsService.getHub(userId || '');
  }

  @Get('proposals/:id')
  getProposalDocument(@Req() req: Request, @Param('id') id: string) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.documentsService.getProposalDocument(id, userId || '');
  }

  @Get('proposals/:id/download-pdf')
  async downloadProposalPdf(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    const file = await this.documentsService.downloadProposalPdf(
      id,
      userId || '',
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(file.buffer.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    return res.send(file.buffer);
  }

  @Get('proposals/:id/preview-html')
  async previewProposalPdfHtml(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    const preview = await this.documentsService.previewProposalPdfHtml(
      id,
      userId || '',
    );
    res.setHeader('X-Document-Template', preview.templateKey);
    res.setHeader('X-Document-Template-Version', preview.templateVersion);
    return res.type('text/html').send(preview.html);
  }

  @Get('contracts/:id')
  getContractDocument(@Req() req: Request, @Param('id') id: string) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.documentsService.getContractDocument(id, userId || '');
  }

  @Get('orders/:id')
  getOrderDocument(@Req() req: Request, @Param('id') id: string) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.documentsService.getOrderDocument(id, userId || '');
  }
}
