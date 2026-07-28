import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  MaintenanceIntervalUnit,
  MaintenanceTemplateCategory,
  ServiceGroup,
} from '@prisma/client';

class ModelBaseItemInputDto {
  @IsUUID()
  catalogItemId!: string;

  @IsEnum(ServiceGroup)
  serviceGroup!: ServiceGroup;

  @IsInt()
  @Min(1)
  @IsOptional()
  defaultQuantity?: number;
}

class MaintenanceTemplateInputDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(MaintenanceTemplateCategory)
  @IsOptional()
  category?: MaintenanceTemplateCategory;

  @IsInt()
  @Min(1)
  @IsOptional()
  intervalValue?: number;

  @IsEnum(MaintenanceIntervalUnit)
  @IsOptional()
  intervalUnit?: MaintenanceIntervalUnit;

  @IsInt()
  @Min(1)
  @IsOptional()
  hourMeterInterval?: number;

  @IsBoolean()
  @IsOptional()
  required?: boolean;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateGeneratorModelDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsNumber()
  @IsOptional()
  defaultPowerKva?: number;

  @IsNumber()
  @IsOptional()
  defaultPowerKw?: number;

  @IsString()
  @IsOptional()
  defaultVoltage?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  frequencyHz?: number;

  @IsString()
  @IsOptional()
  controllerType?: string;

  @IsString()
  @IsOptional()
  engineModel?: string;

  @IsString()
  @IsOptional()
  alternatorModel?: string;

  @IsString()
  @IsOptional()
  defaultFuelConsumption?: string;

  @IsString()
  @IsOptional()
  defaultTankCapacity?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModelBaseItemInputDto)
  @IsOptional()
  baseItems?: ModelBaseItemInputDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaintenanceTemplateInputDto)
  @IsOptional()
  maintenanceTemplates?: MaintenanceTemplateInputDto[];
}

export class UpdateGeneratorModelDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsNumber()
  @IsOptional()
  defaultPowerKva?: number;

  @IsNumber()
  @IsOptional()
  defaultPowerKw?: number;

  @IsString()
  @IsOptional()
  defaultVoltage?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  frequencyHz?: number;

  @IsString()
  @IsOptional()
  controllerType?: string;

  @IsString()
  @IsOptional()
  engineModel?: string;

  @IsString()
  @IsOptional()
  alternatorModel?: string;

  @IsString()
  @IsOptional()
  defaultFuelConsumption?: string;

  @IsString()
  @IsOptional()
  defaultTankCapacity?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModelBaseItemInputDto)
  @IsOptional()
  baseItems?: ModelBaseItemInputDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaintenanceTemplateInputDto)
  @IsOptional()
  maintenanceTemplates?: MaintenanceTemplateInputDto[];
}

export class UpsertModelBaseItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModelBaseItemInputDto)
  items!: ModelBaseItemInputDto[];
}
