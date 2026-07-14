import {
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
import type { Request } from 'express';
import type { Response } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { LoadedFile } from '../file-storage/file-storage.service';
import {
  AddServiceReportEvidenceDto,
  ArchiveServiceReportDocumentDto,
  CancelServiceReportDto,
  CreateServiceReportShareLinkDto,
  CreateServiceReportDto,
  ListServiceReportsQueryDto,
  RevokeServiceReportDocumentDto,
  RevokeServiceReportShareLinkDto,
  ReviseReleasedServiceReportDto,
  SignServiceReportDto,
  UpdateServiceReportRetentionDto,
  UpdateServiceReportChecklistDto,
  UpdateServiceReportDto,
  UploadServiceReportEvidenceDto,
} from './dto/service-report.dto';
import { ServiceReportsService } from './service-reports.service';

type UploadFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

@Controller('service-reports')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('serviceReports.view')
export class ServiceReportsController {
  constructor(private readonly serviceReportsService: ServiceReportsService) {}

  @Get()
  findAll(@Req() req: Request, @Query() query: ListServiceReportsQueryDto) {
    return this.serviceReportsService.findAll(query, this.extractUserId(req));
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    return this.serviceReportsService.findOne(id, this.extractUserId(req));
  }

  @Post()
  @RequireAccessPolicy('serviceReports.create')
  create(@Req() req: Request, @Body() dto: CreateServiceReportDto) {
    return this.serviceReportsService.create(dto, this.extractUserId(req));
  }

  @Patch(':id')
  @RequireAccessPolicy('serviceReports.update')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateServiceReportDto,
  ) {
    return this.serviceReportsService.update(id, dto, this.extractUserId(req));
  }

  @Post(':id/checklist')
  @RequireAccessPolicy('serviceReports.update')
  updateChecklist(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateServiceReportChecklistDto,
  ) {
    return this.serviceReportsService.updateChecklist(
      id,
      dto,
      this.extractUserId(req),
    );
  }

  @Post(':id/evidence')
  @RequireAccessPolicy('serviceReports.addEvidence')
  addEvidence(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: AddServiceReportEvidenceDto,
  ) {
    return this.serviceReportsService.addEvidence(
      id,
      dto,
      this.extractUserId(req),
    );
  }

  @Post(':id/evidence/upload')
  @RequireAccessPolicy('serviceReports.addEvidence')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  uploadEvidence(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UploadServiceReportEvidenceDto,
    @UploadedFile() file?: UploadFile,
  ) {
    return this.serviceReportsService.uploadEvidence(
      id,
      dto,
      file,
      this.extractUserId(req),
    );
  }

  @Get(':id/evidence/:evidenceId/download')
  downloadEvidence(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
    @Res() res: Response,
  ) {
    return this.serviceReportsService
      .downloadEvidence(
        id,
        evidenceId,
        this.extractUserId(req),
        this.extractMetadata(req),
      )
      .then((file) => this.sendFile(res, file));
  }

  @Post(':id/sign')
  @RequireAccessPolicy('serviceReports.sign')
  sign(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: SignServiceReportDto,
  ) {
    return this.serviceReportsService.sign(
      id,
      dto,
      this.extractUserId(req),
      this.extractMetadata(req),
    );
  }

  @Post(':id/approve')
  @RequireAccessPolicy('serviceReports.approve')
  approve(@Req() req: Request, @Param('id') id: string) {
    return this.serviceReportsService.approve(id, this.extractUserId(req));
  }

  @Post(':id/release-to-customer')
  @RequireAccessPolicy('serviceReports.releaseToCustomer')
  releaseToCustomer(@Req() req: Request, @Param('id') id: string) {
    return this.serviceReportsService.releaseToCustomer(
      id,
      this.extractUserId(req),
    );
  }

  @Post(':id/generate-document')
  @RequireAccessPolicy('serviceReports.generateDocument')
  generateDocument(@Req() req: Request, @Param('id') id: string) {
    return this.serviceReportsService.generateDocument(
      id,
      this.extractUserId(req),
    );
  }

  @Post(':id/generate-pdf')
  @RequireAccessPolicy('serviceReports.generateDocument')
  generatePdf(@Req() req: Request, @Param('id') id: string) {
    return this.serviceReportsService.generatePdf(id, this.extractUserId(req));
  }

  @Get(':id/download-pdf')
  downloadPdf(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    return this.serviceReportsService
      .downloadPdf(id, this.extractUserId(req), this.extractMetadata(req))
      .then((file) => this.sendFile(res, file));
  }

  @Post(':id/revise')
  @RequireAccessPolicy('serviceReports.update')
  reviseReleasedReport(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ReviseReleasedServiceReportDto,
  ) {
    return this.serviceReportsService.reviseReleasedReport(
      id,
      dto,
      this.extractUserId(req),
    );
  }

  @Get(':id/print')
  print(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
    return this.serviceReportsService
      .getPrintableHtml(id, this.extractUserId(req))
      .then((html) => res.type('text/html').send(html));
  }

  @Post(':id/share-links')
  @RequireAccessPolicy('serviceReports.manageShareLinks')
  createShareLink(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: CreateServiceReportShareLinkDto,
  ) {
    return this.serviceReportsService.createShareLink(
      id,
      dto,
      this.extractUserId(req),
    );
  }

  @Get(':id/share-links')
  @RequireAccessPolicy('serviceReports.manageShareLinks')
  listShareLinks(@Req() req: Request, @Param('id') id: string) {
    return this.serviceReportsService.listShareLinks(
      id,
      this.extractUserId(req),
    );
  }

  @Post(':id/share-links/:linkId/revoke')
  @RequireAccessPolicy('serviceReports.manageShareLinks')
  revokeShareLink(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('linkId') linkId: string,
    @Body() dto: RevokeServiceReportShareLinkDto,
  ) {
    return this.serviceReportsService.revokeShareLink(
      id,
      linkId,
      dto,
      this.extractUserId(req),
    );
  }

  @Get(':id/access-logs')
  @RequireAccessPolicy('serviceReports.manageDocuments')
  accessLogs(@Req() req: Request, @Param('id') id: string) {
    return this.serviceReportsService.listDocumentAccessLogs(
      id,
      this.extractUserId(req),
    );
  }

  @Post(':id/retention-policy')
  @RequireAccessPolicy('serviceReports.manageDocuments')
  updateRetentionPolicy(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateServiceReportRetentionDto,
  ) {
    return this.serviceReportsService.updateRetentionPolicy(
      id,
      dto,
      this.extractUserId(req),
    );
  }

  @Post(':id/revoke-document')
  @RequireAccessPolicy('serviceReports.manageDocuments')
  revokeDocument(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: RevokeServiceReportDocumentDto,
  ) {
    return this.serviceReportsService.revokeDocument(
      id,
      dto,
      this.extractUserId(req),
      this.extractMetadata(req),
    );
  }

  @Post(':id/archive-document')
  @RequireAccessPolicy('serviceReports.manageDocuments')
  archiveDocument(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ArchiveServiceReportDocumentDto,
  ) {
    return this.serviceReportsService.archiveDocument(
      id,
      dto,
      this.extractUserId(req),
    );
  }

  @Post(':id/cancel')
  @RequireAccessPolicy('serviceReports.cancel')
  cancel(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: CancelServiceReportDto,
  ) {
    return this.serviceReportsService.cancel(id, dto, this.extractUserId(req));
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
