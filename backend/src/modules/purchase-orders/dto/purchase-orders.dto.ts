import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

class PurchaseOrderItemInputDto {
  @IsUUID()
  catalogItemId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  taxAmount?: number;
}

export class CreatePurchaseOrderDto {
  @IsUUID()
  supplierId!: string;

  @IsDateString()
  @IsOptional()
  expectedDate?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  freightAmount?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  taxAmount?: number;

  @IsString()
  @IsOptional()
  paymentTerm?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemInputDto)
  items!: PurchaseOrderItemInputDto[];
}

export class UpdatePurchaseOrderStatusDto {
  @IsString()
  status!: string;
}

class ReceivePurchaseOrderItemDto {
  @IsUUID()
  purchaseOrderItemId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  unitCost?: number;
}

export class ReceivePurchaseOrderDto {
  @IsUUID()
  warehouseId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseOrderItemDto)
  items!: ReceivePurchaseOrderItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}
