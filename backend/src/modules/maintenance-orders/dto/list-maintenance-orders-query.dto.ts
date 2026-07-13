import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { MaintenanceOrderType, OrderStatus } from '@prisma/client';

export class ListMaintenanceOrdersQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number;

  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @IsEnum(MaintenanceOrderType)
  @IsOptional()
  type?: MaintenanceOrderType;

  @IsUUID()
  @IsOptional()
  technicianId?: string;

  @IsUUID()
  @IsOptional()
  generatorId?: string;

  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @IsDateString()
  @IsOptional()
  dateTo?: string;
}
