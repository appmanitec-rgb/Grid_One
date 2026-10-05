import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { RequireAccessPolicy } from '../auth/access-policy.decorator';
import { AccessPolicyGuard } from '../auth/access-policy.guard';
import { AuthGuard } from '../auth/auth.guard';
import { BankCollectionService } from './bank-collection.service';

class SaveAgreementDto {
  @IsUUID() bankAccountId!: string;
  @IsUUID() issuerCompanyId!: string;
  @IsString() @MaxLength(15) transmissionCode!: string;
  @IsString() @MaxLength(30) beneficiaryName!: string;
  @IsString() @MaxLength(18) beneficiaryDocument!: string;
  @IsString() @MaxLength(4) agency!: string;
  @IsString() @MaxLength(1) agencyDigit!: string;
  @IsString() @MaxLength(9) accountNumber!: string;
  @IsString() @MaxLength(1) accountDigit!: string;
  @IsOptional() @IsString() walletCode?: string;
  @IsOptional() @IsString() documentType?: string;
}

class RegisterHomologationDto {
  @IsUUID() batchId!: string;
  @IsString() @MaxLength(160) bankTestReference!: string;
}

class PrepareTitleDto {
  @IsUUID() receivableId!: string;
  @IsUUID() bankAccountId!: string;
  @IsOptional() @IsString() @MaxLength(15) documentNumber?: string;
  @IsOptional() @IsString() speciesCode?: string;
}

class SaveInvoiceDto {
  @IsOptional() @IsString() @MaxLength(60) number?: string;
  @IsOptional() @IsDateString() issuedAt?: string;
  @IsOptional() @IsString() @MaxLength(80) accessKey?: string;
  @IsOptional() @IsString() @MaxLength(500) url?: string;
}

class GenerateBatchDto {
  @IsUUID() bankAccountId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(9999)
  @IsUUID('4', { each: true })
  titleIds!: string[];
}

@Controller('finance/collections')
@UseGuards(AuthGuard, AccessPolicyGuard)
@RequireAccessPolicy('finance.view')
export class BankCollectionController {
  constructor(private readonly collections: BankCollectionService) {}

  @Get('overview')
  overview() {
    return this.collections.overview();
  }

  @Post('agreement')
  @RequireAccessPolicy('finance.update')
  saveAgreement(@Body() dto: SaveAgreementDto, @Req() req: Request) {
    return this.collections.saveAgreement(dto, this.actor(req));
  }

  @Post('agreements/:id/homologation')
  @RequireAccessPolicy('finance.reconcile')
  registerHomologation(
    @Param('id') id: string,
    @Body() dto: RegisterHomologationDto,
    @Req() req: Request,
  ) {
    return this.collections.registerHomologation(id, dto, this.actor(req));
  }

  @Post('titles')
  @RequireAccessPolicy('finance.create')
  prepareTitle(@Body() dto: PrepareTitleDto, @Req() req: Request) {
    return this.collections.prepareTitle(dto, this.actor(req));
  }

  @Patch('titles/:id/invoice')
  @RequireAccessPolicy('finance.update')
  saveInvoice(
    @Param('id') id: string,
    @Body() dto: SaveInvoiceDto,
    @Req() req: Request,
  ) {
    return this.collections.saveInvoice(id, dto, this.actor(req));
  }

  @Post('batches')
  @RequireAccessPolicy('finance.create')
  generateBatch(@Body() dto: GenerateBatchDto, @Req() req: Request) {
    return this.collections.generateBatch(dto, this.actor(req));
  }

  @Get('batches/:id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const batch = await this.collections.downloadBatch(id);
    res.setHeader('Content-Type', 'text/plain; charset=iso-8859-1');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${batch.fileName}"`,
    );
    res.send(batch.content);
  }

  @Post('batches/:id/sent')
  @RequireAccessPolicy('finance.update')
  sent(@Param('id') id: string, @Req() req: Request) {
    return this.collections.markBatchSent(id, this.actor(req));
  }

  @Post('returns/import')
  @RequireAccessPolicy('finance.reconcile')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  importReturn(
    @Body('bankAccountId') bankAccountId: string,
    @UploadedFile()
    file: { buffer?: Buffer; originalname?: string } | undefined,
    @Req() req: Request,
  ) {
    if (!bankAccountId || !file?.buffer || !file.originalname)
      throw new BadRequestException(
        'Selecione a conta e o arquivo de retorno Santander.',
      );
    return this.collections.importReturn(
      { bankAccountId, fileName: file.originalname, content: file.buffer },
      this.actor(req),
    );
  }

  @Post('returns/preview')
  @RequireAccessPolicy('finance.reconcile')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  previewReturn(
    @Body('bankAccountId') bankAccountId: string,
    @UploadedFile() file: { buffer?: Buffer } | undefined,
  ) {
    if (!bankAccountId || !file?.buffer)
      throw new BadRequestException(
        'Selecione a conta e o arquivo de retorno Santander.',
      );
    return this.collections.previewReturn({
      bankAccountId,
      content: file.buffer,
    });
  }

  @Post('events/:id/apply')
  @RequireAccessPolicy('finance.pay')
  applySettlement(@Param('id') id: string, @Req() req: Request) {
    return this.collections.applySettlement(id, this.actor(req));
  }

  private actor(req: Request) {
    return (req['user'] as { sub?: string } | undefined)?.sub;
  }
}
