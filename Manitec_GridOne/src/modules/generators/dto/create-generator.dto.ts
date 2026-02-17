import { IsString, IsNotEmpty, IsNumber, IsUUID } from 'class-validator';

export class CreateGeneratorDto {
  @IsString()
  @IsNotEmpty()
  name: string; // Ex: "Gerador Principal"

  @IsString()
  @IsNotEmpty()
  brand: string; // Ex: "Caterpillar"

  @IsString()
  @IsNotEmpty()
  model: string; // Ex: "C18"

  @IsString()
  @IsNotEmpty()
  serialNumber: string; // Chassi único

  @IsNumber()
  @IsNotEmpty()
  power: number; // Em kVA (pode ser decimal)

  @IsUUID()
  @IsNotEmpty()
  clientId: string; // O ID do dono da máquina
}