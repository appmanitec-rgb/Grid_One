import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { DocumentsService } from './documents.service';
import { ContractDocumentOptionsDto } from './dto/contract-document-options.dto';

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

  @Post('proposals/:id/generate-document')
  generateProposalDocument(@Req() req: Request, @Param('id') id: string) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.documentsService.generateProposalDocument(id, userId || '');
  }

  @Get('proposals/:id/download-docx')
  async downloadProposalDocx(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    const file = await this.documentsService.downloadProposalDocx(
      id,
      userId || '',
    );
    return this.sendFile(res, file);
  }

  @Get('proposals/:id/download-document-pdf')
  async downloadProposalInstitutionalPdf(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    const file = await this.documentsService.downloadProposalInstitutionalPdf(
      id,
      userId || '',
    );
    return this.sendFile(res, file);
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

  @Post('contracts/:id/generate-document')
  generateContractDocument(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() options: ContractDocumentOptionsDto,
  ) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.documentsService.generateContractDocument(
      id,
      userId || '',
      options,
    );
  }

  @Post('contracts/:id/download-docx')
  async generateAndDownloadContractDocx(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() options: ContractDocumentOptionsDto,
    @Res() res: Response,
  ) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    const file = await this.documentsService.downloadContractDocx(
      id,
      userId || '',
      options,
    );
    return this.sendFile(res, file);
  }

  @Get('contracts/:id/download-docx')
  async downloadContractDocx(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    const file = await this.documentsService.downloadContractDocx(
      id,
      userId || '',
    );
    return this.sendFile(res, file);
  }

  @Get('orders/:id')
  getOrderDocument(@Req() req: Request, @Param('id') id: string) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.documentsService.getOrderDocument(id, userId || '');
  }

  @Post('orders/:id/generate-document')
  generateOrderDocument(@Req() req: Request, @Param('id') id: string) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.documentsService.generateOrderDocument(id, userId || '');
  }

  @Get('orders/:id/download-docx')
  async downloadOrderDocx(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    const file = await this.documentsService.downloadOrderDocx(
      id,
      userId || '',
    );
    return this.sendFile(res, file);
  }

  private sendFile(
    res: Response,
    file: {
      buffer: Buffer;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    },
  ) {
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
