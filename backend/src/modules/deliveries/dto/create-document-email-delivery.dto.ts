import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { DeliveryDocumentType } from '@prisma/client';

export class CreateDocumentEmailDeliveryDto {
  @IsOptional()
  @IsUUID()
  requestKey?: string;
  @IsEnum(DeliveryDocumentType)
  documentType!: DeliveryDocumentType;

  @IsString()
  documentId!: string;

  @IsEmail()
  recipientEmail!: string;

  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays?: number;
}
