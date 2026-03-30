import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
  IsBoolean,
  IsNumber,
} from 'class-validator';

export enum ClientTypeDto {
  CONTRACT = 'CONTRACT',
  NO_CONTRACT = 'NO_CONTRACT',
}

export enum ClientPersonTypeDto {
  INDIVIDUAL = 'INDIVIDUAL',
  LEGAL_ENTITY = 'LEGAL_ENTITY',
}

export enum ClientContactStatusDto {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  LEFT_COMPANY = 'LEFT_COMPANY',
}

export enum ClientAddressTypeDto {
  BILLING = 'BILLING',
  INSTALLATION = 'INSTALLATION',
  OTHER = 'OTHER',
}

export class CreateClientAddressDto {
  @IsEnum(ClientAddressTypeDto)
  type!: ClientAddressTypeDto;

  @IsString()
  @IsNotEmpty()
  street!: string;

  @IsString()
  @IsOptional()
  number?: string;

  @IsString()
  @IsOptional()
  complement?: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsOptional()
  zipCode?: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(2)
  state!: string;

  @IsString()
  @IsOptional()
  country?: string;
}

export class CreateClientContactDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(ClientContactStatusDto)
  status!: ClientContactStatusDto;

  @IsString()
  @IsOptional()
  role?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  mobile?: string;

  @IsEmail()
  @IsOptional()
  email?: string;
}

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  companyName!: string;

  @IsString()
  @IsOptional()
  tradeName?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(11)
  cnpj!: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  state!: string;

  @IsString()
  @IsOptional()
  stateRegistration?: string;

  @IsString()
  @IsOptional()
  municipalRegistration?: string;

  @IsString()
  @IsOptional()
  cnae?: string;

  @IsString()
  @IsOptional()
  segment?: string;

  @IsString()
  @IsOptional()
  preferences?: string;

  @IsEnum(ClientTypeDto)
  @IsOptional()
  clientType?: ClientTypeDto;

  @IsEnum(ClientPersonTypeDto)
  @IsOptional()
  personType?: ClientPersonTypeDto;

  @IsString()
  @IsOptional()
  paymentTermDefault?: string;

  @IsNumber()
  @IsOptional()
  creditLimit?: number;

  @IsString()
  @IsOptional()
  priceTableCode?: string;

  @IsBoolean()
  @IsOptional()
  isDelinquent?: boolean;

  @IsBoolean()
  @IsOptional()
  withholdsInss?: boolean;

  @IsBoolean()
  @IsOptional()
  withholdsIss?: boolean;

  @IsUUID('4')
  @IsOptional()
  salesOwnerId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateClientAddressDto)
  addresses!: CreateClientAddressDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateClientContactDto)
  contacts?: CreateClientContactDto[];

  @IsUUID('4')
  @IsOptional()
  generatorId?: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  generatorIds?: string[];
}
