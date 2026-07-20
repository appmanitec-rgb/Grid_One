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

  @IsString()
  @IsOptional()
  application?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  voltage?: string;

  @IsString()
  @IsOptional()
  ratedCurrent?: string;

  @IsNumber()
  @IsOptional()
  powerFactor?: number;

  @IsNumber()
  @IsOptional()
  frequencyHz?: number;

  @IsString()
  @IsOptional()
  operationMode?: string;

  @IsString()
  @IsOptional()
  engineBrand?: string;

  @IsString()
  @IsOptional()
  engineModelName?: string;

  @IsString()
  @IsOptional()
  engineSerialNumber?: string;

  @IsString()
  @IsOptional()
  enginePower?: string;

  @IsString()
  @IsOptional()
  fuelType?: string;

  @IsInt()
  @IsOptional()
  engineCylinders?: number;

  @IsString()
  @IsOptional()
  oilRecommendation?: string;

  @IsNumber()
  @IsOptional()
  oilCapacityLiters?: number;

  @IsDateString()
  @IsOptional()
  lastOilChangeAt?: string;

  @IsString()
  @IsOptional()
  alternatorBrand?: string;

  @IsString()
  @IsOptional()
  alternatorModelName?: string;

  @IsString()
  @IsOptional()
  alternatorSerialNumber?: string;

  @IsString()
  @IsOptional()
  alternatorVoltage?: string;

  @IsNumber()
  @IsOptional()
  alternatorFrequencyHz?: number;

  @IsString()
  @IsOptional()
  alternatorInsulationClass?: string;

  @IsString()
  @IsOptional()
  alternatorProtectionDegree?: string;

  @IsBoolean()
  @IsOptional()
  hasTransferSwitch?: boolean;

  @IsString()
  @IsOptional()
  transferSwitchBrand?: string;

  @IsString()
  @IsOptional()
  transferSwitchModel?: string;

  @IsString()
  @IsOptional()
  transferSwitchSerialNumber?: string;

  @IsString()
  @IsOptional()
  transferSwitchRatedCurrent?: string;

  @IsString()
  @IsOptional()
  transferSwitchCommandVoltage?: string;

  @IsString()
  @IsOptional()
  transferSwitchType?: string;

  @IsString()
  @IsOptional()
  transferSwitchNotes?: string;

  @IsInt()
  @IsOptional()
  batteryQuantity?: number;

  @IsString()
  @IsOptional()
  batteryVoltage?: string;

  @IsNumber()
  @IsOptional()
  batteryCapacityAh?: number;

  @IsDateString()
  @IsOptional()
  batteryInstallationDate?: string;

  @IsString()
  @IsOptional()
  batteryChargerModel?: string;

  @IsDateString()
  @IsOptional()
  batteryLastReplacementDate?: string;

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
