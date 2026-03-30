import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateTechnicianDto } from './dto/create-technician.dto';
import { UpdateTechnicianDto } from './dto/update-technician.dto';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class TechniciansService {
  constructor(private readonly database: DatabaseService) {}

  async create(data: CreateTechnicianDto) {
    const user = await this.database.user.findUnique({
      where: { id: data.userId },
    });
    if (!user) throw new NotFoundException('Usuario nao encontrado.');

    const existing = await this.database.technician.findUnique({
      where: { userId: data.userId },
    });
    if (existing) {
      throw new ConflictException('Perfil de tecnico ja existe.');
    }

    return this.database.technician.create({
      data: {
        userId: data.userId,
        cpf: data.cpf,
        phone: data.phone,
        skills: data.skills,
        latitude: data.latitude,
        longitude: data.longitude,
      },
      include: this.technicianInclude(),
    });
  }

  async findAll() {
    return this.database.technician.findMany({
      include: this.technicianInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const technician = await this.database.technician.findUnique({
      where: { id },
      include: this.technicianInclude(),
    });

    if (!technician) {
      throw new NotFoundException('Tecnico nao encontrado.');
    }

    return technician;
  }

  async update(id: string, data: UpdateTechnicianDto) {
    const current = await this.database.technician.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!current) {
      throw new NotFoundException('Tecnico nao encontrado.');
    }

    if (data.userId && data.userId !== current.userId) {
      throw new BadRequestException(
        'Nao e permitido trocar o usuario principal do tecnico.',
      );
    }

    return this.database.technician.update({
      where: { id },
      data: {
        cpf: data.cpf,
        phone: data.phone,
        skills: data.skills,
        latitude: data.latitude,
        longitude: data.longitude,
      },
      include: this.technicianInclude(),
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.database.technician.delete({ where: { id } });
  }

  private technicianInclude() {
    return {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          department: true,
          branch: true,
          hourCost: true,
        },
      },
      orders: {
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          scheduledTo: true,
        },
        orderBy: { openedAt: 'desc' as const },
      },
      certifications: {
        orderBy: { validUntil: 'asc' as const },
      },
    };
  }
}
