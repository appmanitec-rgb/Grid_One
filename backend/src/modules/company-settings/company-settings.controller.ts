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
@RequireAccessPolicy('users.manage')
export class CompanySettingsController {
  constructor(
    private readonly companySettingsService: CompanySettingsService,
  ) {}

  @Get()
  getSettings() {
    return this.companySettingsService.getSettings();
  }

  @Get('companies')
  listCompanies() {
    return this.companySettingsService.listCompanies();
  }

  @Post('companies')
  createCompany(@Req() req: Request, @Body() dto: UpdateCompanySettingsDto) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.companySettingsService.createCompany(userId, dto);
  }

  @Patch()
  updateSettings(@Req() req: Request, @Body() dto: UpdateCompanySettingsDto) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.companySettingsService.updateSettings(userId, dto);
  }

  @Patch('companies/:id')
  updateCompany(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateCompanySettingsDto,
  ) {
    const userId = (req['user'] as any)?.sub as string | undefined;
    return this.companySettingsService.updateCompany(id, userId, dto);
  }

  @Delete('companies/:id')
  removeCompany(@Param('id') id: string) {
    return this.companySettingsService.removeCompany(id);
  }
}
