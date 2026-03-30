import { PartialType } from '@nestjs/mapped-types';
import { CreateUserCertificationDto } from './create-user-certification.dto';

export class UpdateUserCertificationDto extends PartialType(
  CreateUserCertificationDto,
) {}
