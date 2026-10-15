import { IsByteLength, IsString, MinLength } from 'class-validator';

export class UpdateClientPortalPasswordDto {
  @IsString()
  @MinLength(12, {
    message: 'A nova senha precisa ter pelo menos 12 caracteres.',
  })
  @IsByteLength(0, 72, { message: 'Senha muito longa. Use menos caracteres.' })
  password: string;

  @IsString()
  @MinLength(12, {
    message: 'Confirme a nova senha com pelo menos 12 caracteres.',
  })
  @IsByteLength(0, 72, { message: 'Senha muito longa. Use menos caracteres.' })
  confirmPassword: string;
}
