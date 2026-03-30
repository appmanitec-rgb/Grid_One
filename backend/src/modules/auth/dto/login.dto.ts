import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Forneca um e-mail valido.' })
  @IsNotEmpty({ message: 'O e-mail e obrigatorio.' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'A senha e obrigatoria.' })
  password!: string;

  @IsString()
  @IsOptional()
  mfaCode?: string;

  @IsString()
  @IsOptional()
  deviceId?: string;

  @IsString()
  @IsOptional()
  deviceName?: string;
}
