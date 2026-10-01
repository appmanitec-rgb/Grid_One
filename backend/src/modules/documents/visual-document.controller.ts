import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { VisualDocumentKind } from '@prisma/client';
import type { Request } from 'express';
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
}
