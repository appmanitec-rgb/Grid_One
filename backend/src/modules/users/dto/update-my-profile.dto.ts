import { PartialType, PickType } from '@nestjs/mapped-types';
import {
  IsByteLength,
  IsNotEmpty,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CreateUserDto } from './create-user.dto';

// Only personal fields are accepted by PATCH /users/me.
export class UpdateMyProfileDto extends PartialType(
  PickType(CreateUserDto, [
    'name',
    'email',
    'department',
    'branch',
    'profilePhotoUrl',
  ] as const),
  { skipNullProperties: false },
) {
  @ValidateIf((dto: UpdateMyProfileDto) => dto.password !== undefined)
  @IsString()
  @MinLength(12, { message: 'A nova senha deve ter no minimo 12 caracteres.' })
  @IsByteLength(12, 72, {
    message: 'A nova senha deve ter no maximo 72 bytes.',
  })
  password?: string;

  @ValidateIf(
    (dto: UpdateMyProfileDto) =>
      dto.password !== undefined || dto.currentPassword !== undefined,
  )
  @IsString()
  @IsNotEmpty({ message: 'Informe a senha atual para alterar sua senha.' })
  @IsByteLength(1, 72)
  currentPassword?: string;

  @ValidateIf(
    (dto: UpdateMyProfileDto) =>
      dto.password !== undefined || dto.confirmPassword !== undefined,
  )
  @IsString()
  @IsNotEmpty({ message: 'Confirme a nova senha.' })
  @IsByteLength(1, 72)
  confirmPassword?: string;
}
