import { Transform } from 'class-transformer';
import { PartsCoverageType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class ContractDocumentOptionsDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  documentTitle?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  recurringAmount?: number;

  @IsOptional()
  @IsEnum(PartsCoverageType)
  partsCoverage?: PartsCoverageType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  billingPeriod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  paymentDetails?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  billingIssueRule?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  maintenanceWindow?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  emergencyChannel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  renewalNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancellationRule?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  extraCallPolicy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  contractorObligations?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  clientObligations?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  exclusions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  additionalClauses?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  legalVenue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  signaturePlace?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  companySigner?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  clientSigner?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includePreventiveChecklist?: boolean;
}
