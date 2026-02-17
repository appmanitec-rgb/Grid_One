import { IsEmail, IsEnum, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client'; // Importa o Enum que criamos no schema.prisma

export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  name: string;

  @IsEmail({}, { message: 'Forneça um email válido' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'A senha deve ter no mínimo 6 caracteres' })
  password: string;

  @IsEnum(UserRole, { message: 'O cargo deve ser ADMIN, TECHNICIAN, SALES ou CLIENT' })
  role: UserRole;
}