import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateClientPortalDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() logoDataUrl?: string | null;
}

export class CreateClientPortalUserDto {
  @IsString() @MaxLength(120) name: string;
  @IsEmail() email: string;
  @IsArray() @IsString({ each: true }) permissions: string[];
}

export class UpdateClientPortalUserDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[];
}
