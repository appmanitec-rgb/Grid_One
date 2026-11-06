import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
  IsUUID,
  IsBoolean,
} from 'class-validator';

export class SalesOrderStockDto {
  @IsString() @IsNotEmpty() itemId!: string;
  @IsString() @IsNotEmpty() warehouseId!: string;
  @IsInt() @Min(1) quantity!: number;
}

export class SalesOrderCatalogLinkDto {
  @IsString() @IsNotEmpty() catalogItemId!: string;
}

export class SalesDeliveryDto {
  @IsString() @IsNotEmpty() @MaxLength(160) receivedByName!: string;
  @IsOptional() @IsString() @MaxLength(160) shippingReference?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesOrderStockDto)
  items!: SalesOrderStockDto[];
}

export class CloseSalesOrderDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}

export class SalesReturnDto {
  @IsUUID() requestId!: string;
  @IsString() @IsNotEmpty() salesDeliveryItemId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
  @IsBoolean() restockApproved!: boolean;
}
