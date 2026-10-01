import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VisualDocumentKind } from '@prisma/client';
import type { Request, Response } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { VisualDocumentService } from './visual-document.service';

@Controller('studio/document-editor')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('studio.access', 'studio.dataView')
export class VisualDocumentController {
  constructor(private readonly documents: VisualDocumentService) {}

  @Get('fields')
  fields(@Query('kind') kind?: VisualDocumentKind) {
    return this.documents.listFields(kind);
  }

  @Get('word-fields')
  wordFields(@Query('kind') kind: VisualDocumentKind) {
    return this.documents
      .wordFields(kind)
      .then((fields) =>
        fields.map(({ label, category }) => ({ label, category })),
      );
  }

  @Get('word-base')
  async wordBase(
    @Query('kind') kind: VisualDocumentKind,
    @Res() res: Response,
  ) {
    const buffer = await this.documents.baseWord(kind);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="modelo-manitec-editavel.docx"',
    );
    res.send(buffer);
  }

  @Post('word-templates')
  @RequireAccessPolicy('studio.access', 'studio.dataEdit')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 16 * 1024 * 1024 } }),
  )
  createWord(
    @Body() body: { kind?: VisualDocumentKind; name?: string },
    @UploadedFile()
    file: { buffer?: Buffer; originalname?: string } | undefined,
    @Req() req: Request,
  ) {
    this.requireDocxName(file);
    return this.documents.createWordTemplate(
      { ...body, file: file?.buffer },
      (req['user'] as { sub?: string } | undefined)?.sub,
    );
  }

  @Post('fields')
  @RequireAccessPolicy('studio.access', 'studio.dataEdit')
  createField(
    @Body() body: Parameters<VisualDocumentService['createField']>[0],
  ) {
    return this.documents.createField(body);
  }

  @Get('templates')
  templates(@Query('kind') kind?: VisualDocumentKind) {
    return this.documents.listTemplates(kind);
  }

  @Get('templates/:id')
  template(@Param('id') id: string) {
    return this.documents.getTemplate(id);
  }

  @Get('templates/:id/word')
  async downloadWord(
    @Param('id') id: string,
    @Query('version') version: string | undefined,
    @Res() res: Response,
  ) {
    const buffer = await this.documents.downloadWord(
      id,
      version ? Number(version) : undefined,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="modelo-manitec.docx"',
    );
    res.send(buffer);
  }

  @Get('templates/:id/word-preview')
  async wordPreview(
    @Param('id') id: string,
    @Query('recordId') recordId: string | undefined,
    @Query('format') format: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const template = await this.documents.getTemplate(id);
    if (recordId && !this.canViewRecords(req, template.kind))
      throw new ForbiddenException(
        'Seu perfil não pode visualizar este cadastro na prévia.',
      );
    const pdf = format === 'pdf';
    const buffer = await this.documents.previewWord(
      id,
      recordId,
      pdf ? 'pdf' : 'docx',
    );
    res.setHeader(
      'Content-Type',
      pdf
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="previa-manitec.${pdf ? 'pdf' : 'docx'}"`,
    );
    res.send(buffer);
  }

  @Post('templates/:id/word')
  @RequireAccessPolicy('studio.access', 'studio.dataEdit')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 16 * 1024 * 1024 } }),
  )
  saveWord(
    @Param('id') id: string,
    @Body() body: { expectedVersion?: string; name?: string },
    @UploadedFile()
    file: { buffer?: Buffer; originalname?: string } | undefined,
    @Req() req: Request,
  ) {
    this.requireDocxName(file);
    return this.documents.saveWordTemplate(
      id,
      {
        file: file?.buffer,
        expectedVersion: Number(body.expectedVersion),
        name: body.name,
      },
      (req['user'] as { sub?: string } | undefined)?.sub,
    );
  }

  @Post('templates')
  @RequireAccessPolicy('studio.access', 'studio.dataEdit')
  create(
    @Body() body: Parameters<VisualDocumentService['createTemplate']>[0],
    @Req() req: Request,
  ) {
    return this.documents.createTemplate(
      body,
      (req['user'] as { sub?: string } | undefined)?.sub,
    );
  }

  @Put('templates/:id')
  @RequireAccessPolicy('studio.access', 'studio.dataEdit')
  save(
    @Param('id') id: string,
    @Body() body: Parameters<VisualDocumentService['saveTemplate']>[1],
    @Req() req: Request,
  ) {
    return this.documents.saveTemplate(
      id,
      body,
      (req['user'] as { sub?: string } | undefined)?.sub,
    );
  }

  @Post('templates/:id/duplicate')
  @RequireAccessPolicy('studio.access', 'studio.dataEdit')
  duplicate(@Param('id') id: string, @Req() req: Request) {
    return this.documents.duplicateTemplate(
      id,
      (req['user'] as { sub?: string } | undefined)?.sub,
    );
  }

  @Post('templates/:id/restore/:version')
  @RequireAccessPolicy('studio.access', 'studio.dataEdit')
  restore(
    @Param('id') id: string,
    @Param('version') version: string,
    @Req() req: Request,
  ) {
    return this.documents.restoreVersion(
      id,
      Number(version),
      (req['user'] as { sub?: string } | undefined)?.sub,
    );
  }

  @Post('templates/:id/publish')
  @RequireAccessPolicy('studio.access', 'studio.dataEdit')
  publish(@Param('id') id: string) {
    return this.documents.publishTemplate(id);
  }

  @Post('templates/:id/deactivate')
  @RequireAccessPolicy('studio.access', 'studio.dataEdit')
  deactivate(@Param('id') id: string) {
    return this.documents.deactivateTemplate(id);
  }

  @Get('sample-records')
  samples(@Query('kind') kind: VisualDocumentKind, @Req() req: Request) {
    if (!this.canViewRecords(req, kind)) return [];
    return this.documents.sampleRecords(kind);
  }

  @Post('preview')
  preview(
    @Body() body: Parameters<VisualDocumentService['preview']>[0],
    @Req() req: Request,
  ) {
    if (body.recordId && !this.canViewRecords(req, body.kind)) {
      throw new ForbiddenException(
        'Seu perfil não pode visualizar este cadastro na prévia.',
      );
    }
    return this.documents.preview(body);
  }

  private canViewRecords(req: Request, kind?: VisualDocumentKind) {
    const actor = req['user'] as
      | {
          role?: string;
          isSystemMaster?: boolean;
          accessPolicy?: Record<string, Record<string, boolean>>;
        }
      | undefined;
    if (actor?.isSystemMaster || actor?.role === 'ADMIN') return true;
    const section =
      kind === VisualDocumentKind.PROPOSAL
        ? 'proposals'
        : kind === VisualDocumentKind.CONTRACT
          ? 'contracts'
          : 'serviceReports';
    return actor?.accessPolicy?.[section]?.view === true;
  }

  private requireDocxName(file?: { originalname?: string }) {
    if (!file?.originalname?.toLowerCase().endsWith('.docx'))
      throw new BadRequestException('Selecione um arquivo .docx do Word.');
  }
}
