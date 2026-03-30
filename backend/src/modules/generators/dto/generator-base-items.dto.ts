import { ServiceGroup } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class GeneratorBaseItemInputDto {
  @IsUUID()
  catalogItemId!: string;

  @IsEnum(ServiceGroup)
  serviceGroup!: ServiceGroup;

  @IsInt()
  @Min(1)
  @IsOptional()
  quantity?: number;
}

export class UpsertGeneratorBaseItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeneratorBaseItemInputDto)
  items!: GeneratorBaseItemInputDto[];
}
