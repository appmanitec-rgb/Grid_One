import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import {
  AddServiceReportEvidenceDto,
  CancelServiceReportDto,
  CreateServiceReportDto,
  ListServiceReportsQueryDto,
  SignServiceReportDto,
  UpdateServiceReportChecklistDto,
  UpdateServiceReportDto,
} from './dto/service-report.dto';
import { ServiceReportsService } from './service-reports.service';

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
}
