import {
  ProposalHourType,
  ProposalItemKind,
  ProposalTechnicianType,
  ProposalType,
} from '@prisma/client';
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
  @IsOptional()
  catalogItemId?: string;

  @IsEnum(ProposalItemKind)
  @IsOptional()
  kind?: ProposalItemKind;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  quantity?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  hours?: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discountPercent?: number;

  @IsEnum(ProposalHourType)
  @IsOptional()
  hourType?: ProposalHourType;

  @IsEnum(ProposalTechnicianType)
  @IsOptional()
  technicianType?: ProposalTechnicianType;
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
  @IsOptional()
  userId?: string;

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

export class QuickProposalGeneratorDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  assetTag?: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsString()
  @IsOptional()
  modelName?: string;

  @IsString()
  @IsOptional()
  serialNumber?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  power?: number;

  @IsString()
  @IsOptional()
  voltage?: string;

  @IsString()
  @IsOptional()
  installationSite?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsUUID()
  @IsNotEmpty()
  clientId!: string;

  @IsUUID()
  @IsOptional()
  currentSiteId?: string;
}
