import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { CreateCatalogDto } from './dto/create-catalog.dto';
import { UpdateCatalogDto } from './dto/update-catalog.dto';

@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: DatabaseService) {}

  async create(createCatalogDto: CreateCatalogDto) {
    if (createCatalogDto.type === 'PART' && !createCatalogDto.sku) {
      throw new BadRequestException(
        'Pecas fisicas necessitam de um codigo SKU.',
      );
    }

    if (createCatalogDto.sku) {
      const existingItem = await this.prisma.catalogItem.findUnique({
        where: { sku: createCatalogDto.sku },
      });
      if (existingItem) {
        throw new ConflictException(
          `O SKU ${createCatalogDto.sku} ja esta registrado.`,
        );
      }
    }

    return this.prisma.catalogItem.create({ data: createCatalogDto });
  }

  async findAll(actor?: any) {
    const canViewCosts = this.canViewCostData(actor);

    const items = await this.prisma.catalogItem.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    return items.map((item) => this.maskCatalogValues(item, canViewCosts));
  }

  async findOne(id: string, actor?: any) {
    const item = await this.prisma.catalogItem.findUnique({
      where: { id },
      include: {
        supplierItems: {
          include: {
            supplier: {
              select: {
                id: true,
                companyName: true,
                cnpj: true,
              },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!item) {
      throw new NotFoundException('Item do catalogo nao encontrado.');
    }

    return this.maskCatalogValues(item, this.canViewCostData(actor));
  }

  async update(id: string, updateCatalogDto: UpdateCatalogDto) {
    await this.findOne(id);

    if (updateCatalogDto.sku) {
      const existingSku = await this.prisma.catalogItem.findUnique({
        where: { sku: updateCatalogDto.sku },
      });
      if (existingSku && existingSku.id !== id) {
        throw new ConflictException(
          `O SKU ${updateCatalogDto.sku} ja pertence a outro item.`,
        );
      }
    }

    return this.prisma.catalogItem.update({
      where: { id },
      data: updateCatalogDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.catalogItem.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private canViewCostData(actor?: any) {
    if (!actor) return false;
    if (actor.role === UserRole.ADMIN) return true;
    return actor?.accessPolicy?.catalog?.viewCosts === true;
  }

  private maskCatalogValues(item: any, canViewCosts: boolean) {
    if (canViewCosts) return item;

    return {
      ...item,
      costPrice: null,
      taxPercentage: null,
      profitMargin: null,
    };
  }
}
