import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  TicketCategory,
  TicketOrigin,
  TicketPriority,
  TicketStatus,
} from '@prisma/client';

export class ListTicketsQueryDto {
  @IsEnum(TicketStatus)
  @IsOptional()
  status?: TicketStatus;

  @IsEnum(TicketPriority)
  @IsOptional()
  priority?: TicketPriority;

  @IsEnum(TicketOrigin)
  @IsOptional()
  origin?: TicketOrigin;

  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsUUID()
  @IsOptional()
  generatorId?: string;

  @IsUUID()
  @IsOptional()
  assignedToUserId?: string;

  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;

  @IsString()
  @IsOptional()
  overdue?: string;
}

export class CreateTicketDto {
  @IsUUID()
  @IsNotEmpty()
  clientId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsEnum(TicketCategory)
  category!: TicketCategory;

  @IsEnum(TicketPriority)
  @IsOptional()
  priority?: TicketPriority;

  @IsEnum(TicketOrigin)
  @IsOptional()
  origin?: TicketOrigin;

  @IsUUID()
  @IsOptional()
  assignedToUserId?: string;

  @IsUUID()
  @IsOptional()
  technicianId?: string;

  @IsUUID()
  @IsOptional()
  generatorId?: string;

  @IsUUID()
  @IsOptional()
  siteId?: string;

  @IsUUID()
  @IsOptional()
  contractId?: string;

  @IsUUID()
  @IsOptional()
  maintenanceOrderId?: string;

  @IsString()
  @IsOptional()
  contactName?: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsEmail()
  @IsOptional()
  contactEmail?: string;

  @IsString()
  @IsOptional()
  internalNotes?: string;
}

export class UpdateTicketDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(TicketCategory)
  @IsOptional()
  category?: TicketCategory;

  @IsEnum(TicketPriority)
  @IsOptional()
  priority?: TicketPriority;

  @IsEnum(TicketStatus)
  @IsOptional()
  status?: TicketStatus;

  @IsUUID()
  @IsOptional()
  assignedToUserId?: string;

  @IsUUID()
  @IsOptional()
  technicianId?: string;

  @IsUUID()
  @IsOptional()
  generatorId?: string;

  @IsUUID()
  @IsOptional()
  siteId?: string;

  @IsUUID()
  @IsOptional()
  contractId?: string;

  @IsString()
  @IsOptional()
  contactName?: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsEmail()
  @IsOptional()
  contactEmail?: string;

  @IsString()
  @IsOptional()
  internalNotes?: string;
}

export class AddTicketCommentDto {
  @IsString()
  @IsNotEmpty()
  message!: string;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  customerVisible?: boolean;
}

export class AssignTicketDto {
  @IsUUID()
  @IsOptional()
  assignedToUserId?: string;

  @IsUUID()
  @IsOptional()
  technicianId?: string;
}

export class ConvertTicketToOrderDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsOptional()
  generatorId?: string;

  @IsUUID()
  @IsOptional()
  siteId?: string;

  @IsUUID()
  @IsOptional()
  contractId?: string;

  @IsUUID()
  @IsOptional()
  technicianId?: string;

  @IsDateString()
  @IsOptional()
  scheduledTo?: string;
}

export class TicketActionNoteDto {
  @IsString()
  @IsOptional()
  note?: string;
}

export class CreateCustomerTicketDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsEnum(TicketCategory)
  category!: TicketCategory;

  @IsEnum(TicketPriority)
  @IsOptional()
  priority?: TicketPriority;

  @IsUUID()
  @IsOptional()
  generatorId?: string;

  @IsUUID()
  @IsOptional()
  siteId?: string;

  @IsUUID()
  @IsOptional()
  contractId?: string;

  @IsString()
  @IsOptional()
  contactName?: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsEmail()
  @IsOptional()
  contactEmail?: string;
}

export class CustomerTicketCommentDto {
  @IsString()
  @IsNotEmpty()
  message!: string;
}
