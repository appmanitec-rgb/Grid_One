import { ServiceGroup } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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

export class CreateGeneratorModelDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModelBaseItemInputDto)
  @IsOptional()
  baseItems?: ModelBaseItemInputDto[];
}

export class UpdateGeneratorModelDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModelBaseItemInputDto)
  @IsOptional()
  baseItems?: ModelBaseItemInputDto[];
}

export class UpsertModelBaseItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModelBaseItemInputDto)
  items!: ModelBaseItemInputDto[];
}
