import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { CatalogOfferStatus, PurchaseTaxMode } from '@prisma/client';

export class CreateCatalogOfferDto {
  @IsString()
  supplierId!: string;

  @IsString()
  @IsOptional()
  supplierSku?: string;

  @IsString()
  @IsOptional()
  manufacturerId?: string;

  @IsString()
  @IsOptional()
  offeredPartNumber?: string;

  @IsString()
  @IsOptional()
  offeredDescription?: string;

  @IsString()
  @IsOptional()
  quoteNumber?: string;

  @IsString()
  @IsOptional()
  contactName?: string;

  @IsNumber()
  unitPrice!: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsNumber()
  @IsOptional()
  priceQuantity?: number;

  @IsNumber()
  @IsOptional()
  minPurchaseQty?: number;

  @IsNumber()
  @IsOptional()
  purchaseMultiple?: number;

  @IsString()
  @IsOptional()
  purchaseUnit?: string;

  @IsNumber()
  @IsOptional()
  conversionFactor?: number;

  @IsString()
  @IsOptional()
  availability?: string;

  @IsNumber()
  @IsOptional()
  leadTimeDays?: number;

  @IsString()
  @IsOptional()
  paymentTerm?: string;

  @IsNumber()
  @IsOptional()
  freightAmount?: number;

  @IsNumber()
  @IsOptional()
  insuranceAmount?: number;

  @IsNumber()
  @IsOptional()
  discountAmount?: number;

  @IsNumber()
  @IsOptional()
  additionalCostsAmount?: number;

  @IsEnum(PurchaseTaxMode)
  @IsOptional()
  purchaseTaxMode?: PurchaseTaxMode;

  @IsNumber()
  @IsOptional()
  purchaseTaxPercent?: number;

  @IsNumber()
  @IsOptional()
  purchaseTaxAmount?: number;

  @IsNumber()
  @IsOptional()
  recoverableCreditAmount?: number;

  @IsDateString()
  @IsOptional()
  validFrom?: string;

  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @IsDateString()
  @IsOptional()
  quotedAt?: string;

  @IsString()
  @IsOptional()
  replacesOfferId?: string;

  @IsBoolean()
  @IsOptional()
  isPreferred?: boolean;

  @IsString()
  @IsOptional()
  preferenceReason?: string;

  @IsEnum(CatalogOfferStatus)
  @IsOptional()
  status?: CatalogOfferStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}
