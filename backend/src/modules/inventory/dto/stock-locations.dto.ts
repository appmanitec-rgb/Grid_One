import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class LocationPageDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @IsString() @MaxLength(100) q = '';
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsIn(['ACTIVE', 'INACTIVE', 'ALL']) status = 'ACTIVE';
}
export class LocationDemandDto extends LocationPageDto {
  @IsIn(['SALES', 'WORK', 'PROCUREMENT']) source = 'SALES';
}
export class LocationOptionsDto {
  @IsIn(['ITEMS', 'CLIENTS', 'LOCATIONS', 'SALES_TARGETS']) kind!: string;
  @IsString() @MaxLength(100) q = '';
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsUUID() reservationId?: string;
}
export class LocationOperationDto {
  @IsUUID() requestKey!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
export class CreateLocationDto extends LocationOperationDto {
  @IsUUID() warehouseId!: string;
  @IsString()
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
  code!: string;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(24) aisle?: string;
  @IsOptional() @IsString() @MaxLength(24) shelf?: string;
  @IsOptional() @IsString() @MaxLength(24) level?: string;
  @IsOptional() @IsString() @MaxLength(24) compartment?: string;
}
export class UpdateLocationDto extends LocationOperationDto {
  @Type(() => Number) @IsInt() @Min(1) version!: number;
  @IsString()
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
  code!: string;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(24) aisle?: string;
  @IsOptional() @IsString() @MaxLength(24) shelf?: string;
  @IsOptional() @IsString() @MaxLength(24) level?: string;
  @IsOptional() @IsString() @MaxLength(24) compartment?: string;
  @IsBoolean() isActive!: boolean;
}
export class PlaceLocationItemDto extends LocationOperationDto {
  @IsUUID() catalogItemId!: string;
  @IsString() @MaxLength(64) expectedState!: string;
}
export class LocationBalanceDto extends LocationOperationDto {
  @IsUUID() balanceId!: string;
  @IsString() @MaxLength(64) expectedState!: string;
}
export class CountLocationItemDto extends LocationBalanceDto {
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1000000000)
  countedQty!: number;
}
export class MoveLocationItemDto extends LocationBalanceDto {
  @IsUUID() toLocationId!: string;
}
export class ReserveLocationItemDto extends LocationBalanceDto {
  @IsUUID() clientId!: string;
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(1000000000)
  quantity!: number;
  @IsOptional() @IsISO8601() neededAt?: string;
}
export class ReleaseLocationReservationDto extends LocationOperationDto {
  @IsString() @MaxLength(64) expectedState!: string;
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(1000000000)
  quantity!: number;
}
export class TransferLocationReservationDto extends ReleaseLocationReservationDto {
  @IsUUID() salesOrderItemId!: string;
}
export class LocationLabelsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @IsUUID('all', { each: true })
  locationIds!: string[];
  @IsOptional() @IsString() @MaxLength(250) baseUrl?: string;
}
export class WarehouseQrAccessDto extends LocationOperationDto {
  @IsString() @MaxLength(250) baseUrl!: string;
  @IsString() @MaxLength(250) expectedBaseUrl = '';
}
