import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { MaintenanceOrderType, OrderStatus } from '@prisma/client';

class MaintenanceOrderMaterialInputDto {
  @IsUUID()
  catalogItemId!: string;

  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @IsNumber()
  quantity!: number;

  @IsNumber()
  @IsOptional()
  unitCost?: number;
}

export class CreateMaintenanceOrderDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  auvoId?: string;

  @IsUrl({}, { message: 'O link do Auvo deve ser uma URL valida' })
  @IsOptional()
  auvoLink?: string;

  @IsEnum(MaintenanceOrderType)
  @IsOptional()
  type?: MaintenanceOrderType;

  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @IsString()
  @IsOptional()
  priority?: string;

  @IsString()
  @IsOptional()
  customerReport?: string;

  @IsObject()
  @IsOptional()
  checklistData?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  customerSignatureUrl?: string;

  @IsDateString()
  @IsOptional()
  displacementStartedAt?: string;

  @IsDateString()
  @IsOptional()
  startedAt?: string;

  @IsDateString()
  @IsOptional()
  pausedAt?: string;

  @IsDateString()
  @IsOptional()
  finishedAt?: string;

  @IsDateString()
  @IsOptional()
  scheduledTo?: string;

  @IsNumber()
  @IsOptional()
  laborHours?: number;

  @IsInt()
  @IsOptional()
  hourMeterAfter?: number;

  @IsUUID()
  @IsNotEmpty()
  generatorId!: string;

  @IsUUID()
  @IsOptional()
  siteId?: string;

  @IsUUID()
  @IsOptional()
  contractId?: string;

  @IsUUID()
  @IsOptional()
  technicianId?: string;

  @IsString()
  @IsOptional()
  assignmentJustification?: string;

  @IsUUID()
  @IsOptional()
  assignmentOverrideApprovalId?: string;

  @IsString()
  @IsOptional()
  certificationJustification?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaintenanceOrderMaterialInputDto)
  @IsOptional()
  materials?: MaintenanceOrderMaterialInputDto[];
}
