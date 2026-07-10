import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { DeliveryDocumentType } from '@prisma/client';

export class CreateDocumentEmailDeliveryDto {
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
