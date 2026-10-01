import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FiscalDocumentKind } from '@prisma/client';
import type { Request } from 'express';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { FiscalDocumentsService } from './fiscal-documents.service';

export class FiscalDraftItemDto {
  @IsString() @MaxLength(500) description!: string;
  @IsNumber() @Min(0.001) @Max(1000000) quantity!: number;
  @IsNumber() @Min(0.01) @Max(100000000) unitAmount!: number;
  @IsOptional() @IsString() @MaxLength(8) ncm?: string;
  @IsOptional() @IsString() @MaxLength(4) cfop?: string;
  @IsOptional() @IsString() @MaxLength(20) serviceCode?: string;
}

export class SaveFiscalDraftDto {
  @IsUUID() receivableId!: string;
  @IsUUID() issuerCompanyId!: string;
  @IsEnum(FiscalDocumentKind) kind!: FiscalDocumentKind;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => FiscalDraftItemDto)
  items!: FiscalDraftItemDto[];
  @IsOptional() @IsString() @MaxLength(2000) fiscalNotes?: string;
}

@Controller('finance/fiscal-documents')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('finance.view')
export class FiscalDocumentsController {
  constructor(private readonly fiscal: FiscalDocumentsService) {}

  @Get('overview')
  overview() {
    return this.fiscal.overview();
  }

  @Post('drafts')
  @RequireAccessPolicy('finance.create')
  create(@Body() dto: SaveFiscalDraftDto, @Req() req: Request) {
    return this.fiscal.createDraft(dto, this.actor(req));
  }

  @Patch('drafts/:id')
  @RequireAccessPolicy('finance.update')
  update(
    @Param('id') id: string,
    @Body() dto: SaveFiscalDraftDto,
    @Req() req: Request,
  ) {
    return this.fiscal.updateDraft(id, dto, this.actor(req));
  }

  private actor(req: Request) {
    return (req['user'] as { sub?: string } | undefined)?.sub;
  }
}
