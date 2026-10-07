import { IsString, Matches, MinLength } from 'class-validator';

export class ClientActivateDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/i, { message: 'Link de ativacao invalido.' })
  token!: string;

  @IsString()
  @MinLength(12, { message: 'A senha precisa ter pelo menos 12 caracteres.' })
  password!: string;
}
