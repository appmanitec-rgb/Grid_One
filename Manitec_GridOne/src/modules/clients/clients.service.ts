import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class ClientsService {
  constructor(private readonly database: DatabaseService) {}

  async create(data: CreateClientDto) {
    const clientExists = await this.database.client.findUnique({
      where: { cnpj: data.cnpj },
    });

    if (clientExists) {
      throw new ConflictException('Já existe um cliente com este CNPJ.');
    }

    return this.database.client.create({ data });
  }

  findAll() {
    return this.database.client.findMany({
      orderBy: { companyName: 'asc' }
    });
  }

  async findOne(id: string) { // <--- AQUI ESTÁ A CORREÇÃO (String)
    const client = await this.database.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException('Cliente não encontrado');
    return client;
  }

  async update(id: string, data: UpdateClientDto) { // <--- String
    await this.findOne(id);
    return this.database.client.update({ where: { id }, data });
  }

  async remove(id: string) { // <--- String
    await this.findOne(id);
    return this.database.client.delete({ where: { id } });
  }
}