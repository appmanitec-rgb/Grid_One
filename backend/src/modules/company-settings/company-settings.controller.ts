import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';
import { CompanySettingsService } from './company-settings.service';

@Controller('company-settings')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('settings.view')
export class CompanySettingsController {
  constructor(
    private readonly companySettingsService: CompanySettingsService,
  ) {}

  @RequireAccessPolicy('settings.view')
  @Get()
  getSettings() {
    return this.companySettingsService.getSettings();
  }

  @RequireAccessPolicy('settings.view')
  @Get('companies')
  listCompanies() {
    return this.companySettingsService.listCompanies();
  }

  @RequireAccessPolicy('settings.admin')
  @Post('companies')
  createCompany(@Req() req: Request, @Body() dto: UpdateCompanySettingsDto) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.companySettingsService.createCompany(userId, dto);
  }

  @RequireAccessPolicy('settings.update')
  @Patch()
  updateSettings(@Req() req: Request, @Body() dto: UpdateCompanySettingsDto) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.companySettingsService.updateSettings(userId, dto);
  }

  @RequireAccessPolicy('settings.update')
  @Patch('companies/:id')
  updateCompany(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateCompanySettingsDto,
  ) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.companySettingsService.updateCompany(id, userId, dto);
  }

  @RequireAccessPolicy('settings.admin')
  @Delete('companies/:id')
  removeCompany(@Param('id') id: string) {
    return this.companySettingsService.removeCompany(id);
  }
}
