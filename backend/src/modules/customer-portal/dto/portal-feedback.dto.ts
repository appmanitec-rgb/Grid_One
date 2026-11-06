import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePortalFeedbackDto {
  @IsIn(['OBSERVATION', 'FEEDBACK']) kind: 'OBSERVATION' | 'FEEDBACK';
  @IsString() @IsNotEmpty() @MaxLength(2000) message: string;
}
