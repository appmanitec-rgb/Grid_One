import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SubmitVisitReportDto {
  @IsString()
  @IsNotEmpty()
  report!: string;

  @IsString()
  @IsOptional()
  note?: string;
}

