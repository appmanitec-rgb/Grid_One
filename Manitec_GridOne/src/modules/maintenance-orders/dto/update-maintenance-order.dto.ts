import { PartialType } from '@nestjs/mapped-types';
import { CreateMaintenanceOrder } from './create-maintenance-order.dto'; // <-- Ajustado aqui

export class UpdateMaintenanceOrderDto extends PartialType(CreateMaintenanceOrder) {} // <-- E aqui