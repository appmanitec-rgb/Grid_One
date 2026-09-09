import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class ConvertGeneratorPostSaleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  serialNumber?: string;

  @IsUUID()
  @IsOptional()
  currentSiteId?: string;

  @IsString()
  @IsOptional()
  installationSite?: string;

  @IsString()
  @IsOptional()
  assetTag?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  powerKw?: number;

  @IsString()
  @IsOptional()
  voltage?: string;
}
