import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ManufacturerType, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { CreateManufacturerDto } from './dto/create-manufacturer.dto';
import { UpdateManufacturerDto } from './dto/update-manufacturer.dto';

@Injectable()
export class ManufacturersService {
  constructor(private readonly prisma: DatabaseService) {}

  async create(dto: CreateManufacturerDto) {
    const data = this.normalizeInput(dto, true);
    await this.assertUnique(data.name as string, data.type as ManufacturerType);

    return this.prisma.manufacturer.create({
      data: data as Prisma.ManufacturerUncheckedCreateInput,
    });
  }

  findAll() {
    return this.prisma.manufacturer.findMany({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const manufacturer = await this.prisma.manufacturer.findUnique({ where: { id } });
    if (!manufacturer) throw new NotFoundException('Fabricante nao encontrado.');
    return manufacturer;
  }

  async update(id: string, dto: UpdateManufacturerDto) {
    const current = await this.findOne(id);
    const data = this.normalizeInput(dto, false);
    const nextName = (data.name as string | undefined) ?? current.name;
    const nextType = (data.type as ManufacturerType | undefined) ?? current.type;

    await this.assertUnique(nextName, nextType, id);

    return this.prisma.manufacturer.update({
      where: { id },
      data: data as Prisma.ManufacturerUncheckedUpdateInput,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.manufacturer.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async assertUnique(name: string, type: ManufacturerType, ignoredId?: string) {
    if (!name) throw new BadRequestException('Nome do fabricante e obrigatorio.');

    const exists = await this.prisma.manufacturer.findUnique({
      where: { type_name: { type, name } },
      select: { id: true },
    });

    if (exists && exists.id !== ignoredId) {
      throw new ConflictException('Ja existe fabricante com este nome e tipo.');
    }
  }

  private normalizeInput(
    dto: CreateManufacturerDto | UpdateManufacturerDto,
    requireName: boolean,
  ): Prisma.ManufacturerUncheckedCreateInput | Prisma.ManufacturerUncheckedUpdateInput {
    const name = dto.name?.trim();
    if (requireName && !name) throw new BadRequestException('Nome do fabricante e obrigatorio.');

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = name || null;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.country !== undefined) data.country = dto.country?.trim() || null;
    if (dto.website !== undefined) data.website = dto.website?.trim() || null;
    if (dto.supportPhone !== undefined) data.supportPhone = dto.supportPhone?.trim() || null;
    if (dto.supportEmail !== undefined) data.supportEmail = dto.supportEmail?.trim() || null;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (requireName && data.type === undefined) data.type = ManufacturerType.OTHER;

    return data as Prisma.ManufacturerUncheckedCreateInput | Prisma.ManufacturerUncheckedUpdateInput;
  }
}
