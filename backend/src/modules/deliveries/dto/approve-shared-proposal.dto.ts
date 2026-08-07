import { IsOptional, IsString, MinLength } from 'class-validator';

export class ApproveSharedProposalDto {
  @IsString()
  @MinLength(2)
  signerName!: string;

  @IsString()
  @MinLength(11)
  signerCpf!: string;

  @IsString()
  @MinLength(2)
  signatureData!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
