import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Injectable()
export class SitesService {
  constructor(private readonly prisma: DatabaseService) {}

  async create(dto: CreateSiteDto) {
    return this.prisma.site.create({
      data: dto,
      include: {
        client: { select: { id: true, companyName: true } },
      },
    });
  }

  findAll() {
    return this.prisma.site.findMany({
      include: {
        client: { select: { id: true, companyName: true } },
      },
      orderBy: [{ clientId: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const site = await this.prisma.site.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, companyName: true } },
        generators: { select: { id: true, name: true, serialNumber: true } },
      },
    });

    if (!site) throw new NotFoundException('Local/obra nao encontrado.');
    return site;
  }

  async update(id: string, dto: UpdateSiteDto) {
    await this.findOne(id);
    return this.prisma.site.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.site.delete({ where: { id } });
  }
}
