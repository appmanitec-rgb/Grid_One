import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  CommissionRuleTrigger,
  CommissionStatus,
  HrAssetStatus,
  HrAssetType,
  TimeEntryStatus,
  UserRole,
} from '@prisma/client';
import { PartialType } from '@nestjs/mapped-types';

export class CreateTimeEntryDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  @IsOptional()
  maintenanceOrderId?: string;

  @IsEnum(TimeEntryStatus)
  status!: TimeEntryStatus;

  @IsDateString()
  startedAt!: string;

  @IsDateString()
  @IsOptional()
  endedAt?: string;

  @IsInt()
  @IsOptional()
  transitMinutes?: number;

  @IsInt()
  @IsOptional()
  workMinutes?: number;

  @IsInt()
  @IsOptional()
  extraMinutes?: number;

  @IsInt()
  @IsOptional()
  nightMinutes?: number;
}

export class CreateCommissionDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  @IsOptional()
  receivableId?: string;

  @IsUUID()
  @IsOptional()
  maintenanceOrderId?: string;

  @IsUUID()
  @IsOptional()
  contractId?: string;

  @IsNumber()
  @Min(0)
  baseAmount!: number;

  @IsNumber()
  @Min(0)
  percent!: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateCommissionStatusDto {
  @IsEnum(CommissionStatus)
  status!: CommissionStatus;
}

export class CreateCommissionRuleDto {
  @IsString()
  name!: string;

  @IsUUID()
  @IsOptional()
  sellerId?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsNumber()
  @Min(0)
  @Max(100)
  percentage!: number;

  @IsEnum(CommissionRuleTrigger)
  trigger!: CommissionRuleTrigger;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsDateString()
  @IsOptional()
  validFrom?: string;

  @IsDateString()
  @IsOptional()
  validUntil?: string;
}

export class UpdateCommissionRuleDto extends PartialType(
  CreateCommissionRuleDto,
) {}

export class AssignHrAssetDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  @IsOptional()
  catalogItemId?: string;

  @IsEnum(HrAssetType)
  assetType!: HrAssetType;

  @IsString()
  title!: string;

  @IsString()
  @IsOptional()
  caCode?: string;

  @IsDateString()
  deliveredAt!: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @IsString()
  @IsOptional()
  signedTermUrl?: string;
}

export class UpdateHrAssetStatusDto {
  @IsEnum(HrAssetStatus)
  status!: HrAssetStatus;

  @IsString()
  @IsOptional()
  reason?: string;
}

export class CreateFleetVehicleDto {
  @IsString()
  plate!: string;

  @IsString()
  @IsOptional()
  renavam?: string;

  @IsString()
  model!: string;

  @IsInt()
  @IsOptional()
  currentKm?: number;

  @IsInt()
  @IsOptional()
  nextOilChangeKm?: number;
}

export class AllocateFleetDto {
  @IsUUID()
  vehicleId!: string;

  @IsUUID()
  userId!: string;

  @IsUUID()
  @IsOptional()
  maintenanceOrderId?: string;

  @IsInt()
  @IsOptional()
  startKm?: number;
}

export class ReleaseFleetDto {
  @IsInt()
  endKm!: number;
}
