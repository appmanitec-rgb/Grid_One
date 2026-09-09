import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export enum CommercialPowerUnit {
  W = 'W',
  KW = 'KW',
  KVA = 'KVA',
}

export enum CommercialLoadType {
  RESISTIVE = 'RESISTIVE',
  MOTORS = 'MOTORS',
  PUMPS = 'PUMPS',
  AIR_CONDITIONING = 'AIR_CONDITIONING',
  ELEVATORS = 'ELEVATORS',
  IT_ELECTRONICS = 'IT_ELECTRONICS',
  MIXED = 'MIXED',
  UNKNOWN = 'UNKNOWN',
}

export enum CommercialGeneratorApplication {
  STANDBY = 'STANDBY',
  PRIME = 'PRIME',
  CONTINUOUS = 'CONTINUOUS',
}

export enum CommercialPhaseConfiguration {
  MONOPHASE = 'MONOPHASE',
  TWO_PHASE = 'TWO_PHASE',
  THREE_PHASE = 'THREE_PHASE',
}

export enum CommercialFuelPreference {
  ANY = 'ANY',
  DIESEL = 'DIESEL',
  NATURAL_GAS = 'NATURAL_GAS',
  LPG = 'LPG',
}

export enum CommercialConstructionPreference {
  ANY = 'ANY',
  OPEN = 'OPEN',
  CANOPIED = 'CANOPIED',
  SOUND_ATTENUATED = 'SOUND_ATTENUATED',
}

export enum CommercialInstallationLocation {
  INDOOR = 'INDOOR',
  OUTDOOR = 'OUTDOOR',
}

export enum CommercialSizingPriority {
  BEST_SIZING = 'BEST_SIZING',
  LOWEST_PRICE = 'LOWEST_PRICE',
  SHORTEST_LEAD_TIME = 'SHORTEST_LEAD_TIME',
  AVAILABILITY = 'AVAILABILITY',
  HIGHEST_POWER_RESERVE = 'HIGHEST_POWER_RESERVE',
}

export class RecommendCommercialGeneratorDto {
  @IsNumber()
  @Min(0.001)
  power!: number;

  @IsEnum(CommercialPowerUnit)
  powerUnit!: CommercialPowerUnit;

  @IsString()
  @IsNotEmpty()
  voltage!: string;

  @IsEnum(CommercialPhaseConfiguration)
  phaseConfiguration!: CommercialPhaseConfiguration;

  @IsInt()
  @Min(1)
  @Max(400)
  frequencyHz!: number;

  @IsEnum(CommercialLoadType)
  loadType!: CommercialLoadType;

  @IsEnum(CommercialGeneratorApplication)
  application!: CommercialGeneratorApplication;

  @IsEnum(CommercialInstallationLocation)
  installationLocation!: CommercialInstallationLocation;

  @IsEnum(CommercialFuelPreference)
  @IsOptional()
  fuelPreference?: CommercialFuelPreference;

  @IsEnum(CommercialConstructionPreference)
  @IsOptional()
  constructionPreference?: CommercialConstructionPreference;

  @IsEnum(CommercialSizingPriority)
  @IsOptional()
  priority?: CommercialSizingPriority;

  @IsNumber()
  @Min(0.01)
  @Max(1)
  @IsOptional()
  powerFactor?: number;

  @IsUUID()
  @IsOptional()
  policyId?: string;

  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  maxResults?: number;
}
