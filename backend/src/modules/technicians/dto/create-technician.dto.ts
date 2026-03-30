import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsNumber,
  IsUUID,
} from 'class-validator';

export class CreateTechnicianDto {
  @IsUUID(4, { message: 'O ID do usuário deve ser um UUID válido' })
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty({ message: 'CPF é obrigatório' })
  cpf: string;

  @IsString()
  @IsNotEmpty({ message: 'Telefone é obrigatório' })
  phone: string;

  @IsArray()
  @IsString({ each: true }) // Garante que cada item do array é texto
  skills: string[];

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;
}
