import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: DatabaseService) {}

  async create(dto: CreateSupplierDto) {
    if (dto.cnpj) {
      const exists = await this.prisma.supplier.findUnique({
        where: { cnpj: dto.cnpj },
      });
      if (exists)
        throw new ConflictException('Ja existe fornecedor com este CNPJ.');
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.supplier.create({
        data: {
          companyName: dto.companyName,
          tradeName: dto.tradeName,
          cnpj: dto.cnpj,
          email: dto.email,
          phone: dto.phone,
          address: dto.address,
          city: dto.city,
          state: dto.state,
          stateRegistration: dto.stateRegistration,
          municipalRegistration: dto.municipalRegistration,
          categories: dto.categories ?? [],
          representedBrands: dto.representedBrands ?? [],
          paymentTerm: dto.paymentTerm,
          qualityScore: dto.qualityScore,
          punctualityScore: dto.punctualityScore,
          notes: dto.notes,
        },
      });

      if (dto.items?.length) {
        await tx.supplierCatalogItem.createMany({
          data: dto.items.map((item) => ({
            supplierId: created.id,
            catalogItemId: item.catalogItemId,
            supplierSku: item.supplierSku,
            supplierPrice: item.supplierPrice,
            leadTimeDays: item.leadTimeDays,
            isPrimary: item.isPrimary ?? false,
          })),
        });
      }

      return tx.supplier.findUnique({
        where: { id: created.id },
        include: { items: { include: { catalogItem: true } } },
      });
    });
  }

  findAll() {
    return this.prisma.supplier.findMany({
      where: { isActive: true },
      include: { items: { include: { catalogItem: true } } },
      orderBy: { companyName: 'asc' },
    });
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: { items: { include: { catalogItem: true } } },
    });
    if (!supplier) throw new NotFoundException('Fornecedor nao encontrado.');
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto) {
    await this.findOne(id);

    if (dto.cnpj) {
      const exists = await this.prisma.supplier.findUnique({
        where: { cnpj: dto.cnpj },
      });
      if (exists && exists.id !== id)
        throw new ConflictException('Ja existe fornecedor com este CNPJ.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.supplier.update({
        where: { id },
        data: {
          companyName: dto.companyName,
          tradeName: dto.tradeName,
          cnpj: dto.cnpj,
          email: dto.email,
          phone: dto.phone,
          address: dto.address,
          city: dto.city,
          state: dto.state,
          stateRegistration: dto.stateRegistration,
          municipalRegistration: dto.municipalRegistration,
          categories: dto.categories,
          representedBrands: dto.representedBrands,
          paymentTerm: dto.paymentTerm,
          qualityScore: dto.qualityScore,
          punctualityScore: dto.punctualityScore,
          notes: dto.notes,
        },
      });

      if (dto.items) {
        await tx.supplierCatalogItem.deleteMany({ where: { supplierId: id } });
        if (dto.items.length) {
          await tx.supplierCatalogItem.createMany({
            data: dto.items.map((item) => ({
              supplierId: id,
              catalogItemId: item.catalogItemId,
              supplierSku: item.supplierSku,
              supplierPrice: item.supplierPrice,
              leadTimeDays: item.leadTimeDays,
              isPrimary: item.isPrimary ?? false,
            })),
          });
        }
      }

      return tx.supplier.findUnique({
        where: { id },
        include: { items: { include: { catalogItem: true } } },
      });
    });
  }

  async remove(id: string) {
    const supplier = await this.findOne(id);
    if (!supplier) throw new BadRequestException('Fornecedor nao encontrado.');

    return this.prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
