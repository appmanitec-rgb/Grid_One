import { PartialType } from '@nestjs/mapped-types';
import { CreateProposalDto } from './create-proposal.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { ProposalStatus } from '@prisma/client';

export class UpdateProposalDto extends PartialType(CreateProposalDto) {
  @IsOptional()
  @IsEnum(ProposalStatus)
  status?: ProposalStatus;
}
