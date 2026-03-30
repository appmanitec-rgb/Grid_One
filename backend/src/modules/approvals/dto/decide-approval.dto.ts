import { IsOptional, IsString } from 'class-validator';

export class DecideApprovalDto {
  @IsString()
  @IsOptional()
  decisionNote?: string;
}
