import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ChecklistResult, EvidenceType, ReportStatus } from '@prisma/client';

export class ListServiceReportsQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  maintenanceOrderId?: string;

  @IsOptional()
  @IsUUID()
  generatorId?: string;

  @IsOptional()
  @IsUUID()
  technicianId?: string;

  @IsOptional()
  customerVisible?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class ServiceReportChecklistItemDto {
  @IsString()
  @MaxLength(180)
  label!: string;

  @IsEnum(ChecklistResult)
  result!: ChecklistResult;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateServiceReportDto {
  @IsUUID()
  maintenanceOrderId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsString()
  @MaxLength(8000)
  diagnosis!: string;

  @IsString()
  @MaxLength(8000)
  performedServices!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  recommendations?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  observations?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  safetyNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  customerNotes?: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  finishedAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceReportChecklistItemDto)
  checklistItems?: ServiceReportChecklistItemDto[];
}

export class UpdateServiceReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  diagnosis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  performedServices?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  recommendations?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  observations?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  safetyNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  customerNotes?: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  finishedAt?: string;
}

export class UpdateServiceReportChecklistDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceReportChecklistItemDto)
  items!: ServiceReportChecklistItemDto[];
}

export class AddServiceReportEvidenceDto {
  @IsEnum(EvidenceType)
  type!: EvidenceType;

  @IsString()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  fileUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsBoolean()
  customerVisible?: boolean;
}

export class UploadServiceReportEvidenceDto {
  @IsEnum(EvidenceType)
  type!: EvidenceType;

  @IsString()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Transform(({ value }) => value === true || value === 'true')
  @IsOptional()
  @IsBoolean()
  customerVisible?: boolean;
}

export class CreateServiceReportShareLinkDto {
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @Transform(({ value }) => value === true || value === 'true')
  @IsOptional()
  @IsBoolean()
  allowPdfDownload?: boolean;

  @Transform(({ value }) => value === true || value === 'true')
  @IsOptional()
  @IsBoolean()
  allowEvidenceDownload?: boolean;
}

export class RevokeServiceReportShareLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class SignServiceReportDto {
  @IsString()
  @MaxLength(180)
  signedByName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  signedByDocument?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  signatureData?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  signerRole?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  signerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  acceptanceText?: string;
}

export class CancelServiceReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ReviseReleasedServiceReportDto extends UpdateServiceReportDto {
  @IsString()
  @MinLength(8)
  @MaxLength(1000)
  changeReason!: string;
}

export class RevokeServiceReportDocumentDto {
  @IsString()
  @MinLength(8)
  @MaxLength(1000)
  reason!: string;

  @Transform(({ value }) => value === true || value === 'true')
  @IsOptional()
  @IsBoolean()
  destructive?: boolean;
}

export class ArchiveServiceReportDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class UpdateServiceReportRetentionDto {
  @IsOptional()
  @IsDateString()
  retentionUntil?: string;

  @Transform(({ value }) => value === true || value === 'true')
  @IsOptional()
  @IsBoolean()
  legalHold?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class AcceptServiceReportDto {
  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  acceptanceText!: string;
}
