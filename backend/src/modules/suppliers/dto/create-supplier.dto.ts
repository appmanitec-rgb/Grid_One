import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class SupplierCatalogItemDto {
  @IsUUID()
  catalogItemId!: string;

  @IsString()
  @IsOptional()
  supplierSku?: string;

  @IsNumber()
  @IsOptional()
  supplierPrice?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  leadTimeDays?: number;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  companyName!: string;

  @IsString()
  @IsOptional()
  tradeName?: string;

  @IsString()
  @IsOptional()
  cnpj?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  stateRegistration?: string;

  @IsString()
  @IsOptional()
  municipalRegistration?: string;

  @IsArray()
  @IsOptional()
  categories?: string[];

  @IsArray()
  @IsOptional()
  representedBrands?: string[];

  @IsString()
  @IsOptional()
  paymentTerm?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  qualityScore?: number;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  punctualityScore?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierCatalogItemDto)
  @IsOptional()
  items?: SupplierCatalogItemDto[];
}
