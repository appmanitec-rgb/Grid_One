import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class TechnicalAuthorizationDto {
  @IsString() @MaxLength(160) conditionCode: string;
  @IsIn(['PENDING', 'AUTHORIZED', 'NOT_AUTHORIZED']) status:
    | 'PENDING'
    | 'AUTHORIZED'
    | 'NOT_AUTHORIZED';
  @IsOptional() @IsString() @MaxLength(200) responsibleName?: string;
  @IsOptional() @IsString() @MaxLength(3000) note?: string;
  @IsOptional() @IsIn(['INSTALLATION', 'LOAD_BANK']) loadMode?:
    | 'INSTALLATION'
    | 'LOAD_BANK';
}
