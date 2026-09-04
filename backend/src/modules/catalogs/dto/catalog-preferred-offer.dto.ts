import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class SetPreferredOfferDto {
  @IsString()
  reason!: string;

  @IsBoolean()
  @IsOptional()
  applyToReplacementCost?: boolean;

  @IsNumber()
  @IsOptional()
  finalSalePrice?: number;
}
