import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UserPresencePingDto {
  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsNumber()
  @IsOptional()
  accuracyMeters?: number;

  @IsNumber()
  @IsOptional()
  speedKmh?: number;

  @IsNumber()
  @IsOptional()
  heading?: number;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  batteryLevel?: number;

  @IsString()
  @IsOptional()
  source?: string;
}
