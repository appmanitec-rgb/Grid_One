import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateCatalogPricingDto {
  @IsString()
  supplierId!: string;

  @IsString()
  @IsOptional()
  supplierSku?: string;

  @IsNumber()
  @IsOptional()
  leadTimeDays?: number;

  @IsString()
  @IsOptional()
  purchasePaymentTerm?: string;

  @IsNumber()
  purchaseInvoiceValue!: number;

  @IsString()
  @IsOptional()
  purchaseTaxMode?: 'AMOUNT' | 'PERCENT';

  @IsNumber()
  @IsOptional()
  purchaseTaxPercent?: number;

  @IsNumber()
  @IsOptional()
  purchaseTaxAmount?: number;

  @IsNumber()
  @IsOptional()
  freightAmount?: number;

  @IsNumber()
  @IsOptional()
  otherPurchaseCosts?: number;

  @IsNumber()
  @IsOptional()
  salesTaxPercent?: number;

  @IsNumber()
  @IsOptional()
  commissionPercent?: number;

  @IsNumber()
  @IsOptional()
  profitMarginPercent?: number;

  @IsNumber()
  @IsOptional()
  operationalCostPercent?: number;

  @IsNumber()
  @IsOptional()
  finalSalePrice?: number;

  @IsDateString()
  @IsOptional()
  validFrom?: string;

  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsBoolean()
  @IsOptional()
  setAsPrimary?: boolean;
}
