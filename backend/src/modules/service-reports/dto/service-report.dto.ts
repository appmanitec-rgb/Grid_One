import { Type } from 'class-transformer';
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
  ValidateNested,
} from 'class-validator';
import { ChecklistResult, EvidenceType, ReportStatus } from '@prisma/client';

export class ListServiceReportsQueryDto {
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
}

export class CancelServiceReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
