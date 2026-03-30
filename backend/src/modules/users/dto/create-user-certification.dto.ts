import { UserCertificationScope } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateUserCertificationDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsEnum(UserCertificationScope)
  @IsOptional()
  scope?: UserCertificationScope;

  @IsString()
  @IsOptional()
  issuer?: string;

  @IsDateString()
  validUntil: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
