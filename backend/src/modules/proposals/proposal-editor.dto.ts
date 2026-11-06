import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

export class SaveProposalEditingDraftDto {
  @IsInt() @Min(0) revision: number;
  @IsUUID() requestKey: string;
  @IsOptional() @IsUUID() proposalId?: string;
  @IsObject() formData: Record<string, unknown>;
  @IsOptional() @IsInt() @Min(0) @Max(100000) clicks?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100000) edits?: number;
}
export class ProposalConferenceDto {
  @IsObject() data: Record<string, unknown>;
  @IsOptional() @IsUUID() proposalId?: string;
}
export class ProposalIssueAcknowledgementDto {
  @IsString() @MaxLength(100) code: string;
  @IsString() @MaxLength(100) signature: string;
  @IsString() @MaxLength(2000) reason: string;
}
