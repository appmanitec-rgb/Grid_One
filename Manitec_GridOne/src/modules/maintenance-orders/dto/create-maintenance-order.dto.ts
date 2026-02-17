import { IsString, IsNotEmpty, IsOptional, IsUUID, IsUrl } from 'class-validator';

export class CreateMaintenanceOrder {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  auvoId?: string;

  @IsUrl({}, { message: 'O link do Auvo deve ser uma URL válida' })
  @IsOptional()
  auvoLink?: string;

  @IsString()
  @IsOptional()
  priority?: string;

  @IsUUID()
  @IsNotEmpty()
  generatorId: string;

  @IsUUID()
  @IsNotEmpty()
  technicianId: string;
}