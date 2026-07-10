import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MinLength,
} from 'class-validator';
import { SkillLevel, UserAvailabilityStatus, UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome e obrigatorio' })
  name: string;

  @IsEmail({}, { message: 'Forneca um email valido' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'A senha deve ter no minimo 6 caracteres' })
  password: string;

  @IsEnum(UserRole, {
    message: 'O cargo deve ser um UserRole valido.',
  })
  role: UserRole;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  department?: string;

  @IsString()
  @IsOptional()
  branch?: string;

  @IsNumber()
  @IsOptional()
  approvalDiscountLimit?: number;

  @IsNumber()
  @IsOptional()
  hourCost?: number;

  @IsObject()
  @IsOptional()
  accessPolicy?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  functionalId?: string;

  @IsString()
  @IsOptional()
  documentId?: string;

  @IsUrl()
  @IsOptional()
  profilePhotoUrl?: string;

  @IsUUID()
  @IsOptional()
  managerId?: string;

  @IsUUID()
  @IsOptional()
  linkedClientId?: string;

  @IsEnum(UserAvailabilityStatus)
  @IsOptional()
  availabilityStatus?: UserAvailabilityStatus;

  @IsEnum(SkillLevel)
  @IsOptional()
  skillLevel?: SkillLevel;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  regionTags?: string[];

  @IsUrl()
  @IsOptional()
  digitalSignatureUrl?: string;

  @IsNumber()
  @IsOptional()
  salesTargetMonthly?: number;

  @IsObject()
  @IsOptional()
  kpiTargetJson?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  mfaEnabled?: boolean;
}
