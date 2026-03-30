import {
  BillingAdjustmentIndex,
  ContractStatus,
  PartsCoverageType,
  PreventiveRecurrence,
} from '@prisma/client';
import {
  IsBoolean,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ContractEquipmentDto {
  @IsUUID()
  generatorId!: string;

  @IsNumber()
  @IsOptional()
  coverageAmount?: number;
}

export class CreateContractDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsUUID()
  clientId!: string;

  @IsEnum(ContractStatus)
  @IsOptional()
  status?: ContractStatus;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsInt()
  @Min(15)
  @Max(120)
  @IsOptional()
  alertDays?: number;

  @IsEnum(PreventiveRecurrence)
  preventiveRecurrence!: PreventiveRecurrence;

  @IsInt()
  @Min(1)
  @Max(168)
  @IsOptional()
  responseTimeHours?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  correctiveVisitAllowance?: number;

  @IsEnum(PartsCoverageType)
  @IsOptional()
  partsCoverage?: PartsCoverageType;

  @IsNumber()
  recurringAmount!: number;

  @IsInt()
  @Min(1)
  @Max(31)
  dueDay!: number;

  @IsEnum(BillingAdjustmentIndex)
  @IsOptional()
  adjustmentIndex?: BillingAdjustmentIndex;

  @IsInt()
  @Min(1)
  @Max(12)
  @IsOptional()
  adjustmentBaseMonth?: number;

  @IsBoolean()
  @IsOptional()
  includesFuelManagement?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractEquipmentDto)
  equipments!: ContractEquipmentDto[];
}
