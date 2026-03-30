import { SkillLevel } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateUserSpecialtyDto {
  @IsString()
  @IsNotEmpty()
  manufacturer: string;

  @IsEnum(SkillLevel)
  level: SkillLevel;

  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
