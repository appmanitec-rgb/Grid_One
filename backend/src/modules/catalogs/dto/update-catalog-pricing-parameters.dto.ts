import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateCatalogPricingParametersDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  icmsPercent?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  pisPercent?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  cofinsPercent?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  ipiPercent?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  issPercent?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  irpjPercent?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  csllPercent?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  cppPercent?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  commissionPercent?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  profitMarginPercent?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  operationalCostPercent?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
