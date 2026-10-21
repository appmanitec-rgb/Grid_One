import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
export class ProductValidityDto {
  @IsUUID() catalogItemId!: string;
  @IsString() @MinLength(1) @MaxLength(120) lotCode!: string;
  @IsDateString({ strict: true }) expiresAt!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
