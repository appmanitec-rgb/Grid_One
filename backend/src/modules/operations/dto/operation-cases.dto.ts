import {
  DowntimeStatus,
  OperationAttachmentKind,
  TicketPriority,
  WarrantyOwner,
  WarrantyStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListCasesQueryDto {
  @IsString()
  @IsOptional()
  q?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsUUID()
  @IsOptional()
  generatorId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number;
}

export class CreateDowntimeDto {
  @IsUUID()
  generatorId!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(4000)
  symptom!: string;

  @IsDateString()
  failureStartedAt!: string;

  @IsEnum(TicketPriority)
  @IsOptional()
  priority?: TicketPriority;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  operationalImpact?: string;

  @IsString()
  @MaxLength(160)
  @IsOptional()
  failureCategory?: string;

  @IsUUID()
  @IsOptional()
  assignedUserId?: string;

  @IsUUID()
  @IsOptional()
  maintenanceOrderId?: string;

  @IsUUID()
  @IsOptional()
  ticketId?: string;

  @IsDateString()
  @IsOptional()
  responseDueAt?: string;

  @IsDateString()
  @IsOptional()
  targetRestoreAt?: string;
}

export class UpdateDowntimeDto {
  @IsEnum(DowntimeStatus)
  @IsOptional()
  status?: DowntimeStatus;

  @IsString()
  @MaxLength(4000)
  @IsOptional()
  note?: string;

  @IsEnum(TicketPriority)
  @IsOptional()
  priority?: TicketPriority;

  @IsString()
  @MaxLength(4000)
  @IsOptional()
  diagnosis?: string | null;

  @IsString()
  @MaxLength(4000)
  @IsOptional()
  temporarySolution?: string | null;

  @IsString()
  @MaxLength(4000)
  @IsOptional()
  rootCause?: string | null;

  @IsString()
  @MaxLength(4000)
  @IsOptional()
  resolution?: string | null;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  operationalImpact?: string | null;

  @IsUUID()
  @IsOptional()
  assignedUserId?: string | null;

  @IsUUID()
  @IsOptional()
  maintenanceOrderId?: string | null;

  @IsUUID()
  @IsOptional()
  ticketId?: string | null;

  @IsDateString()
  @IsOptional()
  responseDueAt?: string | null;

  @IsDateString()
  @IsOptional()
  targetRestoreAt?: string | null;
}

export class CreateWarrantyDto {
  @IsUUID()
  generatorId!: string;

  @IsEnum(WarrantyOwner)
  owner!: WarrantyOwner;

  @IsString()
  @MinLength(4)
  @MaxLength(180)
  title!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(4000)
  defectDescription!: string;

  @IsString()
  @MaxLength(180)
  @IsOptional()
  component?: string;

  @IsString()
  @MaxLength(180)
  @IsOptional()
  partNumber?: string;

  @IsString()
  @MaxLength(180)
  @IsOptional()
  serialNumber?: string;

  @IsUUID()
  @IsOptional()
  downtimeId?: string;

  @IsUUID()
  @IsOptional()
  maintenanceOrderId?: string;

  @IsUUID()
  @IsOptional()
  supplierId?: string;

  @IsUUID()
  @IsOptional()
  manufacturerId?: string;

  @IsUUID()
  @IsOptional()
  assignedUserId?: string;

  @IsDateString()
  @IsOptional()
  responseDueAt?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  claimAmount?: number;
}

export class UpdateWarrantyDto {
  @IsEnum(WarrantyStatus)
  @IsOptional()
  status?: WarrantyStatus;

  @IsEnum(WarrantyOwner)
  @IsOptional()
  owner?: WarrantyOwner;

  @IsString()
  @MaxLength(4000)
  @IsOptional()
  note?: string;

  @IsString()
  @MaxLength(4000)
  @IsOptional()
  diagnosis?: string | null;

  @IsString()
  @MaxLength(4000)
  @IsOptional()
  coverageDecision?: string | null;

  @IsString()
  @MaxLength(4000)
  @IsOptional()
  resolution?: string | null;

  @IsString()
  @MaxLength(180)
  @IsOptional()
  externalProtocol?: string | null;

  @IsString()
  @MaxLength(180)
  @IsOptional()
  supplierProtocol?: string | null;

  @IsUUID()
  @IsOptional()
  downtimeId?: string | null;

  @IsUUID()
  @IsOptional()
  maintenanceOrderId?: string | null;

  @IsUUID()
  @IsOptional()
  supplierId?: string | null;

  @IsUUID()
  @IsOptional()
  manufacturerId?: string | null;

  @IsUUID()
  @IsOptional()
  assignedUserId?: string | null;

  @IsDateString()
  @IsOptional()
  responseDueAt?: string | null;

  @IsNumber()
  @Min(0)
  @IsOptional()
  claimAmount?: number | null;

  @IsNumber()
  @Min(0)
  @IsOptional()
  approvedAmount?: number | null;
}

export class AddCaseNoteDto {
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  note!: string;
}

export class AddOperationAttachmentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  name!: string;

  @Matches(/^(https?:\/\/|\/(?!\/))/i, {
    message: 'Informe um link HTTP(S) ou caminho interno valido.',
  })
  @MaxLength(2000)
  url!: string;

  @IsEnum(OperationAttachmentKind)
  @IsOptional()
  kind?: OperationAttachmentKind;
}
