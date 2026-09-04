import {
  ContractRenewalStatus,
  PartsCoverageType,
} from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateContractRenewalDto {
  @IsOptional()
  @IsDateString()
  proposedStartDate?: string;

  @IsOptional()
  @IsDateString()
  proposedEndDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  proposedRecurringAmount?: number;

  @IsOptional()
  @IsEnum(PartsCoverageType)
  proposedPartsCoverage?: PartsCoverageType;

  @IsOptional()
  @IsNumber()
  adjustmentPercent?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  partsNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  customerNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNotes?: string;
}

export class UpdateContractRenewalDto extends CreateContractRenewalDto {}

export class UpdateContractRenewalStatusDto {
  @IsEnum(ContractRenewalStatus)
  status!: ContractRenewalStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
