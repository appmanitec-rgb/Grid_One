import { Type } from 'class-transformer';
import { IsObject } from 'class-validator';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PORTFOLIOS } from '../auth/rules/access-rules';

export class CommercialQuery {
  @IsOptional() @IsIn(['all', ...PORTFOLIOS]) portfolio?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1;
  @IsOptional()
  @IsIn(['activities', 'expiring', 'approval', 'idle', 'handoff'])
  kind = 'activities';
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(['true']) publishedOnly?: string;
  @IsOptional()
  @IsIn([
    'EMAIL',
    'NOTICE',
    'REMINDER',
    'SERVICE_SCOPE',
    'PARTS_SCOPE',
    'AUTOMATION',
  ])
  category?: string;
}
export class CommercialItemInput {
  @IsOptional() @IsUUID() catalogItemId?: string;
  @IsString() @MaxLength(100) key!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsNumber() @Min(0.001) @Max(1000000) quantity!: number;
  @IsNumber() @Min(0) @Max(1000000000) revenue!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000000000) unitCost?: number;
}
export class CommercialEstimateInput {
  @IsIn(PORTFOLIOS) portfolio!: (typeof PORTFOLIOS)[number];
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CommercialItemInput)
  items!: CommercialItemInput[];
  @IsNumber() @Min(0) @Max(1000000000) revenue!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000000000) laborCost?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000000000) travelCost?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000000000) freightCost?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000000000) otherCost?: number;
  @IsOptional() @IsInt() @Min(0) version = 0;
  @IsOptional() @IsString() @MaxLength(64) sourceHash?: string;
}
export class CommercialTemplateInput {
  @IsIn(PORTFOLIOS) portfolio!: (typeof PORTFOLIOS)[number];
  @IsIn([
    'EMAIL',
    'NOTICE',
    'REMINDER',
    'SERVICE_SCOPE',
    'PARTS_SCOPE',
    'AUTOMATION',
  ])
  category!: string;
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(300) subject?: string;
  @IsString() @MaxLength(30000) body!: string;
  @IsOptional() @IsUUID() key?: string;
  @IsInt() @Min(0) expectedVersion = 0;
}
export class CommercialRenderInput {
  @IsUUID() proposalId!: string;
}
export class CommercialHandoffInput {
  @IsIn([
    'finance',
    'purchase',
    'separation',
    'planning',
    'contract',
    'postSale',
  ])
  step!: string;
  @IsUUID() ownerId!: string;
  @IsDateString() dueAt!: string;
  @IsInt() @Min(0) version = 0;
}
export class CommercialResponsibilitiesInput {
  @IsString() @MaxLength(64) expectedHash!: string;
  @IsObject() grants!: Record<string, Record<string, boolean>>;
}
