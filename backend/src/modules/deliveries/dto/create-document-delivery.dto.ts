import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DeliveryChannel, DeliveryDocumentType } from '@prisma/client';

export class CreateDocumentDeliveryDto {
  @IsEnum(DeliveryChannel)
  channel!: DeliveryChannel;

  @IsEnum(DeliveryDocumentType)
  documentType!: DeliveryDocumentType;

  @IsString()
  documentId!: string;

  @IsString()
  recipientTarget!: string;

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
