import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class StockAdjustmentItemDto {
  @IsUUID()
  catalogItemId!: string;

  @IsNumber()
  delta!: number;

  @IsNumber()
  @IsOptional()
  unitCost?: number;
}

export class StockAdjustmentDto {
  @IsUUID()
  warehouseId!: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockAdjustmentItemDto)
  items!: StockAdjustmentItemDto[];
}

export class StockTransferDto {
  @IsUUID()
  fromWarehouseId!: string;

  @IsUUID()
  toWarehouseId!: string;

  @IsUUID()
  catalogItemId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsString()
  @IsOptional()
  reason?: string;
}

export class StockReservationDto {
  @IsUUID()
  catalogItemId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsString()
  @IsOptional()
  referenceType?: string;

  @IsString()
  @IsOptional()
  referenceId?: string;
}
