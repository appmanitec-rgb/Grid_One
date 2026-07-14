import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { Request } from 'express';
import type { Response } from 'express';
import { LoadedFile } from '../file-storage/file-storage.service';
import { ServiceReportsService } from './service-reports.service';

@Controller('public/service-reports')
export class ServiceReportsPublicController {
  constructor(private readonly serviceReportsService: ServiceReportsService) {}

  @Get('verify/:token')
  verify(@Req() req: Request, @Param('token') token: string) {
    return this.serviceReportsService.verifyPublicReport(
      token,
      this.extractMetadata(req),
    );
  }

  @Get('share/:token')
  share(@Req() req: Request, @Param('token') token: string) {
    return this.serviceReportsService.getPublicSharedReport(
      token,
      this.extractMetadata(req),
    );
  }

  @Get('share/:token/download-pdf')
  downloadPdf(
    @Req() req: Request,
    @Param('token') token: string,
    @Res() res: Response,
  ) {
    return this.serviceReportsService
      .downloadPublicSharePdf(token, this.extractMetadata(req))
      .then((file) => this.sendFile(res, file));
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
