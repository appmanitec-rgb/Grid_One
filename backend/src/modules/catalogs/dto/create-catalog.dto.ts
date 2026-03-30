import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { ItemType, ProductOrigin } from '@prisma/client';

export class CreateCatalogDto {
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(ItemType, { message: 'O tipo deve ser PART ou SERVICE validos' })
  @IsNotEmpty()
  type!: ItemType;

  @IsString()
  @IsOptional()
  commercialDescription?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  subcategory?: string;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsString()
  @IsOptional()
  manufacturerPartNumber?: string;

  @IsString()
  @IsOptional()
  supplier?: string;

  @IsObject()
  @IsOptional()
  technicalSpecs?: Record<string, any>;

  @IsString()
  @IsOptional()
  applicationNotes?: string;

  @IsString()
  @IsOptional()
  ncm?: string;

  @IsString()
  @IsOptional()
  cest?: string;

  @IsEnum(ProductOrigin)
  @IsOptional()
  origin?: ProductOrigin;

  @IsNumber()
  @IsOptional()
  costPrice?: number;

  @IsNumber()
  @IsOptional()
  averageCost?: number;

  @IsNumber()
  @IsOptional()
  lastCost?: number;

  @IsNumber()
  @IsOptional()
  taxPercentage?: number;

  @IsNumber()
  @IsOptional()
  profitMargin?: number;

  @IsNumber()
  @IsNotEmpty()
  basePrice!: number;

  @IsNumber()
  @IsOptional()
  stockCurrent?: number;

  @IsNumber()
  @IsOptional()
  stockMin?: number;

  @IsNumber()
  @IsOptional()
  stockMax?: number;

  @IsString()
  @IsOptional()
  storageLocation?: string;

  @IsNumber()
  @IsOptional()
  grossWeight?: number;

  @IsNumber()
  @IsOptional()
  netWeight?: number;

  @IsObject()
  @IsOptional()
  taxProfile?: Record<string, any>;
}
