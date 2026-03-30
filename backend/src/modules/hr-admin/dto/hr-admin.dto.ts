import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import {
  CommissionStatus,
  HrAssetStatus,
  HrAssetType,
  TimeEntryStatus,
} from '@prisma/client';

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
