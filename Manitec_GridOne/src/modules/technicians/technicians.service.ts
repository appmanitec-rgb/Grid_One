import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { CreateTechnicianDto } from './dto/create-technician.dto';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class TechniciansService {
  constructor(private readonly database: DatabaseService) {}

  async create(data: CreateTechnicianDto) {
    const user = await this.database.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const existing = await this.database.technician.findUnique({ where: { userId: data.userId } });
    if (existing) throw new ConflictException('Perfil de técnico já existe.');

    return this.database.technician.create({
      data: {
        userId: data.userId,
        cpf: data.cpf,
        phone: data.phone,
        skills: data.skills,
      },
    });
  }

  async findAll() {
    return this.database.technician.findMany({ include: { user: true } });
  }

  async findOne(id: string) {
    return this.database.technician.findUnique({ where: { id }, include: { user: true } });
  }

  async update(id: string, data: any) {
    return this.database.technician.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.database.technician.delete({ where: { id } });
  }
}