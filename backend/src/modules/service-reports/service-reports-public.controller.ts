import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { LoadedFile } from '../file-storage/file-storage.service';
import { ServiceReportsService } from './service-reports.service';

@Controller('public/service-reports')
export class ServiceReportsPublicController {
  constructor(private readonly serviceReportsService: ServiceReportsService) {}

  @Get('verify/:token')
  verify(@Param('token') token: string) {
    return this.serviceReportsService.verifyPublicReport(token);
  }

  @Get('share/:token')
  share(@Param('token') token: string) {
    return this.serviceReportsService.getPublicSharedReport(token);
  }

  @Get('share/:token/download-pdf')
  downloadPdf(@Param('token') token: string, @Res() res: Response) {
    return this.serviceReportsService
      .downloadPublicSharePdf(token)
      .then((file) => this.sendFile(res, file));
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
