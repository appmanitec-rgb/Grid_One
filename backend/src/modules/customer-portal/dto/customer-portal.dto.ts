import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CustomerProposalDecisionDto {
  @IsString()
  @IsOptional()
  note?: string;
}

export class CreateCustomerQuoteRequestDto {
  @IsUUID()
  @IsOptional()
  equipmentId?: string;

  @IsUUID()
  @IsOptional()
  siteId?: string;

  @IsString()
  @MinLength(3)
  serviceType!: string;

  @IsString()
  @MinLength(10)
  description!: string;

  @IsIn(['LOW', 'NORMAL', 'HIGH', 'EMERGENCY'])
  urgency!: 'LOW' | 'NORMAL' | 'HIGH' | 'EMERGENCY';

  @IsString()
  @MinLength(2)
  contactName!: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsString()
  @IsOptional()
  contactEmail?: string;
}
