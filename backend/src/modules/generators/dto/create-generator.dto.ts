import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  GeneratorLifecycleStatus,
  GeneratorCriticality,
  GeneratorOperationalStatus,
} from '@prisma/client';

export class CreateGeneratorDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  brand!: string;

  @IsUUID()
  @IsOptional()
  modelId?: string;

  @IsString()
  @IsOptional()
  serialNumber?: string;

  @IsNumber()
  @IsNotEmpty()
  power!: number;

  @IsUUID()
  @IsNotEmpty()
  clientId!: string;

  @IsInt()
  @IsOptional()
  hourMeter?: number;

  @IsString()
  @IsOptional()
  condition?: string;

  @IsString()
  @IsOptional()
  assetTag?: string;

  @IsString()
  @IsOptional()
  qrCode?: string;

  @IsString()
  @IsOptional()
  installationSite?: string;

  @IsEnum(GeneratorOperationalStatus)
  @IsOptional()
  operationalStatus?: GeneratorOperationalStatus;

  @IsEnum(GeneratorLifecycleStatus)
  @IsOptional()
  lifecycleStatus?: GeneratorLifecycleStatus;

  @IsEnum(GeneratorCriticality)
  @IsOptional()
  criticality?: GeneratorCriticality;

  @IsInt()
  @IsOptional()
  manufactureYear?: number;

  @IsDateString()
  @IsOptional()
  installationDate?: string;

  @IsDateString()
  @IsOptional()
  warrantyEndDate?: string;

  @IsBoolean()
  @IsOptional()
  hasMaintenanceContract?: boolean;

  @IsUUID()
  @IsOptional()
  currentSiteId?: string;

  @IsBoolean()
  @IsOptional()
  applyModelBaseItems?: boolean;
}
