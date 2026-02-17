import { IsString, IsNotEmpty, IsOptional, Length } from 'class-validator';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome da empresa é obrigatório' })
  companyName: string;

  @IsString()
  @IsNotEmpty()
  @Length(14, 18) // Garante que cabe um CNPJ
  cnpj: string;  // <--- O ERRO ESTAVA AQUI (Faltava essa linha ou estava diferente)

  @IsString()
  @IsOptional()
  contactName?: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 2)
  state: string;

  @IsString()
  @IsOptional()
  address?: string;
}