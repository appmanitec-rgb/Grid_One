import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProposalItemKind, ProposalType } from '@prisma/client';

export class TechnicalScopePreviewItemDto {
  @IsString() @IsNotEmpty() @MaxLength(160) key!: string;
  @IsEnum(ProposalItemKind) kind!: ProposalItemKind;
  @IsOptional() @IsUUID() catalogItemId?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsNumber() @Min(0.0001) @Max(1000000) quantity!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000000) hours?: number;
}
export class TechnicalServiceClassificationDto {
  @IsOptional() @IsString() @Matches(/^[a-f0-9]{64}$/) sourceFacts?: string;
  @IsString() @MaxLength(200) sourceKey!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[A-Z0-9][A-Z0-9_-]{0,79}$/, { each: true })
  procedureCodes?: string[];
  @IsOptional() @IsString() @MaxLength(2000) manualDescription?: string;
}
export class PreviewTechnicalScopeDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TechnicalServiceClassificationDto)
  technicalScopeClassifications?: TechnicalServiceClassificationDto[];
  @IsOptional() @IsUUID() proposalId?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() generatorId?: string;
  @IsEnum(ProposalType) type!: ProposalType;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TechnicalScopePreviewItemDto)
  items!: TechnicalScopePreviewItemDto[];
}
export class TechnicalScopeReviewDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/i) sourceHash!: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/i) libraryHash!: string;
  @IsBoolean() reviewed!: boolean;
}
export class UpsertTechnicalFamilyDto {
  @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
  @IsIn(['MATERIAL', 'SERVICE']) kind!: 'MATERIAL' | 'SERVICE';
  @IsOptional() @IsObject() definitionJson?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpsertTechnicalProcedureDto {
  @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(160) category?: string;
  @IsObject() definitionJson!: Record<string, unknown>;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpsertCatalogTechnicalProfileDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[A-Z0-9][A-Z0-9_-]{0,79}$/, { each: true })
  familyCodes!: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[A-Z0-9][A-Z0-9_-]{0,79}$/, { each: true })
  procedureCodes?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[A-Z0-9][A-Z0-9_-]{0,79}$/, { each: true })
  includedProcedureCodes?: string[];
  @IsOptional() @IsObject() compatibility?: Record<string, string[]>;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
