import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { CreateGeneratorDto } from './dto/create-generator.dto';
import { UpdateGeneratorDto } from './dto/update-generator.dto';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class GeneratorsService {
  constructor(private readonly database: DatabaseService) {}

  async create(data: CreateGeneratorDto) {
    // 1. Verifica se o Cliente existe
    const client = await this.database.client.findUnique({
      where: { id: data.clientId },
    });
    if (!client) {
      throw new NotFoundException('Cliente não encontrado para vincular este gerador.');
    }

    // 2. Verifica se o Serial Number já existe
    const serialExists = await this.database.generator.findUnique({
      where: { serialNumber: data.serialNumber },
    });
    if (serialExists) {
      throw new ConflictException('Já existe um gerador com este Número de Série.');
    }

    // 3. Cria a Máquina
    return this.database.generator.create({ data });
  }

  findAll() {
    return this.database.generator.findMany({
      include: { client: true }, // Traz os dados do dono junto
    });
  }

  async findOne(id: string) {
    const gen = await this.database.generator.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!gen) throw new NotFoundException('Gerador não encontrado.');
    return gen;
  }

  async update(id: string, updateGeneratorDto: UpdateGeneratorDto) {
    await this.findOne(id);
    return this.database.generator.update({
      where: { id },
      data: updateGeneratorDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.database.generator.delete({ where: { id } });
  }
}