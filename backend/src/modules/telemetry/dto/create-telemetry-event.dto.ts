import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { TelemetryAlarmType } from '@prisma/client';

export class CreateTelemetryEventDto {
  @IsUUID()
  @IsOptional()
  generatorId?: string;

  @IsString()
  @IsOptional()
  serialNumber?: string;

  @IsEnum(TelemetryAlarmType)
  @IsOptional()
  alarmType?: TelemetryAlarmType;

  @IsNumber()
  @IsOptional()
  fuelLevelPercent?: number;

  @IsNumber()
  @IsOptional()
  batteryVoltage?: number;

  @IsNumber()
  @IsOptional()
  coolantTemperature?: number;

  @IsNumber()
  @IsOptional()
  oilPressure?: number;

  @IsBoolean()
  @IsOptional()
  gridOnline?: boolean;

  @IsObject()
  @IsOptional()
  payload?: Record<string, unknown>;
}
