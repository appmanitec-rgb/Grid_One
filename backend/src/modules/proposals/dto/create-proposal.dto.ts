import { ProposalType } from '@prisma/client';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsUUID,
  IsArray,
  IsNumber,
  IsInt,
  IsBoolean,
  IsDateString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ProposalItemDto {
  @IsString()
  @IsNotEmpty()
  catalogItemId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

export class CreateProposalDto {
  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @IsUUID()
  @IsOptional()
  salesOpportunityId?: string;

  @IsString()
  @IsOptional()
  generatorId?: string;

  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsEnum(ProposalType)
  type!: ProposalType;

  // 🔴 NOVOS CAMPOS COMERCIAIS LIBERADOS
  @IsString()
  @IsOptional()
  scope?: string;

  @IsString()
  @IsOptional()
  freight?: string;

  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @IsString()
  @IsOptional()
  paymentTerm?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  deliveryLeadTimeDays?: number;

  @IsString()
  @IsOptional()
  paymentDetails?: string;

  @IsBoolean()
  @IsOptional()
  hasDownPayment?: boolean;

  @IsNumber()
  @Min(0)
  @IsOptional()
  downPaymentAmount?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  installmentCount?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  installmentIntervalDays?: number;

  @IsDateString()
  @IsOptional()
  firstDueDate?: string;

  @IsString()
  @IsOptional()
  internalNotes?: string;

  @IsString()
  @IsOptional()
  externalNotes?: string;

  @IsNumber()
  @IsOptional()
  discount?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProposalItemDto)
  items!: ProposalItemDto[];
}
