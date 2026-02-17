import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateMaintenanceOrder } from './dto/create-maintenance-order.dto';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class MaintenanceOrdersService {
  constructor(private readonly database: DatabaseService) {}

  async create(data: CreateMaintenanceOrder) {
    // 1. Validar se o Gerador existe
    const generator = await this.database.generator.findUnique({ where: { id: data.generatorId } });
    if (!generator) throw new NotFoundException('Gerador não encontrado.');

    // 2. Validar se o Técnico existe
    const tech = await this.database.technician.findUnique({ where: { id: data.technicianId } });
    if (!tech) throw new NotFoundException('Técnico não encontrado.');

    // 3. Criar a O.S.
    return this.database.maintenanceOrder.create({ data });
  }

  findAll() {
    return this.database.maintenanceOrder.findMany({
      include: {
        generator: { include: { client: true } },
        technician: { include: { user: true } }
      }
    });
  }

  async findOne(id: string) {
    const order = await this.database.maintenanceOrder.findUnique({
      where: { id },
      include: { generator: true, technician: true }
    });
    if (!order) throw new NotFoundException('Ordem de serviço não encontrada.');
    return order;
  }
}