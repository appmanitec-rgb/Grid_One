import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateSiteDto {
  @IsUUID()
  clientId!: string;

  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsString()
  @IsOptional()
  accessRestrictions?: string;

  @IsString()
  @IsOptional()
  baseContactName?: string;

  @IsString()
  @IsOptional()
  baseContactPhone?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
