import { PartialType } from '@nestjs/mapped-types';
import { CreateUserSpecialtyDto } from './create-user-specialty.dto';

export class UpdateUserSpecialtyDto extends PartialType(
  CreateUserSpecialtyDto,
) {}
