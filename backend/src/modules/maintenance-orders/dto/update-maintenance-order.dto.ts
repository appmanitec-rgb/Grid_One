import { PartialType } from '@nestjs/mapped-types';
import { CreateMaintenanceOrderDto } from './create-maintenance-order.dto';

export class UpdateMaintenanceOrderDto extends PartialType(
  CreateMaintenanceOrderDto,
) {}
