import { PartialType } from '@nestjs/mapped-types';
import {
  CommercialInspectionStatus,
  CrmActivityStatus,
  CrmActivityType,
  OpportunityLossReason,
  OpportunityTemperature,
  SalesOpportunityPipeline,
  SalesOpportunityStage,
  SalesOpportunityType,
} from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Max,
} from 'class-validator';

export class CreateOpportunityDto {
  @IsString()
  title!: string;

  @IsUUID()
  clientId!: string;

  @IsUUID()
  @IsOptional()
  siteId?: string;

  @IsUUID()
  @IsOptional()
  clientAddressId?: string;

  @IsUUID()
  @IsOptional()
  primaryContactId?: string;

  @IsUUID()
  @IsOptional()
  assignedSellerId?: string;

  @IsEnum(SalesOpportunityPipeline)
  @IsOptional()
  pipeline?: SalesOpportunityPipeline;

  @IsEnum(SalesOpportunityType)
  @IsOptional()
  opportunityType?: SalesOpportunityType;

  @IsEnum(SalesOpportunityStage)
  @IsOptional()
  stage?: SalesOpportunityStage;

  @IsEnum(OpportunityTemperature)
  @IsOptional()
  temperature?: OpportunityTemperature;

  @IsNumber()
  @Min(0)
  @IsOptional()
  estimatedValue?: number;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  probabilityPercent?: number | null;

  @IsDateString()
  @IsOptional()
  expectedCloseDate?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsEnum(OpportunityLossReason)
  @IsOptional()
  lossReason?: OpportunityLossReason;

  @IsString()
  @IsOptional()
  lossReasonDetail?: string;
}

export class UpdateOpportunityDto extends PartialType(CreateOpportunityDto) {}

export class SetOpportunityStageDto {
  @IsEnum(SalesOpportunityStage)
  stage!: SalesOpportunityStage;

  @IsEnum(OpportunityLossReason)
  @IsOptional()
  lossReason?: OpportunityLossReason;

  @IsString()
  @IsOptional()
  lossReasonDetail?: string;
}

export class CreateCrmActivityDto {
  @IsUUID()
  clientId!: string;

  @IsUUID()
  @IsOptional()
  opportunityId?: string;

  @IsEnum(CrmActivityType)
  type!: CrmActivityType;

  @IsEnum(CrmActivityStatus)
  @IsOptional()
  status?: CrmActivityStatus;

  @IsString()
  subject!: string;

  @IsString()
  @IsOptional()
  details?: string;

  @IsDateString()
  @IsOptional()
  occurredAt?: string;

  @IsDateString()
  @IsOptional()
  dueAt?: string;
}

export class UpdateCrmActivityDto {
  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsOptional()
  details?: string;

  @IsDateString()
  @IsOptional()
  dueAt?: string;

  @IsEnum(CrmActivityStatus)
  @IsOptional()
  status?: CrmActivityStatus;
}

export class CreateInspectionDto {
  @IsUUID()
  opportunityId!: string;

  @IsUUID()
  @IsOptional()
  siteId?: string;

  @IsUUID()
  @IsOptional()
  clientAddressId?: string;

  @IsUUID()
  @IsOptional()
  primaryContactId?: string;

  @IsUUID()
  @IsOptional()
  inspectorUserId?: string;

  @IsEnum(CommercialInspectionStatus)
  @IsOptional()
  status?: CommercialInspectionStatus;

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @IsDateString()
  @IsOptional()
  startedAt?: string;

  @IsDateString()
  @IsOptional()
  finishedAt?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  requiredPowerKva?: number;

  @IsString()
  @IsOptional()
  voltage?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  qtaDistanceMeters?: number;

  @IsBoolean()
  @IsOptional()
  needsMunck?: boolean;

  @IsString()
  @IsOptional()
  accessNotes?: string;

  @IsObject()
  @IsOptional()
  checklistData?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  technicalNotes?: string;
}

export class UpdateInspectionDto extends PartialType(CreateInspectionDto) {}

export class AddInspectionMediaDto {
  @IsString()
  fileUrl!: string;

  @IsString()
  @IsOptional()
  fileName?: string;

  @IsString()
  @IsOptional()
  mimeType?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  fileSizeBytes?: number;

  @IsDateString()
  @IsOptional()
  capturedAt?: string;
}
