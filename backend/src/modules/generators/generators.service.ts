import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ServiceGroup } from '@prisma/client';
import { DatabaseService } from 'src/database/database.service';
import { CreateGeneratorDto } from './dto/create-generator.dto';
import { UpdateGeneratorDto } from './dto/update-generator.dto';
import {
  CreateGeneratorModelDto,
  UpdateGeneratorModelDto,
} from './dto/generator-model.dto';
import { UpsertGeneratorBaseItemsDto } from './dto/generator-base-items.dto';

@Injectable()
export class GeneratorsService {
  constructor(private readonly database: DatabaseService) {}

  async create(data: CreateGeneratorDto, actorUserId?: string) {
    const client = await this.database.client.findUnique({
      where: { id: data.clientId },
    });
    if (!client) {
      throw new NotFoundException(
        'Cliente nao encontrado para vincular este gerador.',
      );
    }

    if (data.modelId) {
      const model = await this.database.generatorModel.findUnique({
        where: { id: data.modelId },
      });
      if (!model) {
        throw new NotFoundException('Modelo nao encontrado.');
      }
    }

    if ((data as any).currentSiteId) {
      const site = await this.database.site.findUnique({
        where: { id: (data as any).currentSiteId },
      });
      if (!site || site.clientId !== data.clientId) {
        throw new BadRequestException(
          'Local/obra invalido para o cliente informado.',
        );
      }
    }

    if (data.serialNumber) {
      const serialExists = await this.database.generator.findUnique({
        where: { serialNumber: data.serialNumber },
      });
      if (serialExists) {
        throw new ConflictException(
          'Ja existe um gerador com este Numero de Serie.',
        );
      }
    }

    return this.database.$transaction(async (tx) => {
      const createData: Prisma.GeneratorUncheckedCreateInput = {
        name: data.name,
        brand: data.brand,
        serialNumber: data.serialNumber,
        power: data.power,
        hourMeter: data.hourMeter,
        condition: data.condition,
        assetTag: (data as any).assetTag,
        qrCode: (data as any).qrCode,
        installationSite: (data as any).installationSite,
        operationalStatus: (data as any).operationalStatus,
        lifecycleStatus: (data as any).lifecycleStatus,
        criticality: (data as any).criticality,
        manufactureYear: (data as any).manufactureYear,
        installationDate: (data as any).installationDate,
        warrantyEndDate: (data as any).warrantyEndDate,
        hasMaintenanceContract: (data as any).hasMaintenanceContract,
        currentSiteId: (data as any).currentSiteId,
        clientId: data.clientId,
        modelId: data.modelId,
        createdByUserId: actorUserId,
      };

      const generator = await tx.generator.create({ data: createData });

      if (data.modelId && data.applyModelBaseItems) {
        await this.copyModelBaseItemsToGenerator(tx, generator.id, true);
      }

      return generator;
    });
  }

  findAll() {
    return this.database.generator.findMany({
      include: { client: true, model: true, currentSite: true },
    });
  }

  async findOne(id: string) {
    const gen = await this.database.generator.findUnique({
      where: { id },
      include: {
        client: true,
        currentSite: true,
        model: {
          include: {
            baseItems: {
              include: { catalogItem: true },
            },
          },
        },
        baseItems: {
          include: { catalogItem: true },
          orderBy: { createdAt: 'asc' },
        },
        proposals: {
          include: { client: true },
          orderBy: { createdAt: 'desc' },
        },
        orders: {
          include: {
            technician: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                  },
                },
              },
            },
          },
          orderBy: { openedAt: 'desc' },
        },
      },
    });

    if (!gen) {
      throw new NotFoundException('Gerador nao encontrado.');
    }

    return gen;
  }

  async update(id: string, updateGeneratorDto: UpdateGeneratorDto) {
    await this.findOne(id);

    if (updateGeneratorDto.modelId) {
      const model = await this.database.generatorModel.findUnique({
        where: { id: updateGeneratorDto.modelId },
      });
      if (!model) {
        throw new NotFoundException('Modelo nao encontrado.');
      }
    }

    if ((updateGeneratorDto as any).currentSiteId !== undefined) {
      if ((updateGeneratorDto as any).currentSiteId === null) {
        // allow clear
      } else {
        const targetClientId =
          updateGeneratorDto.clientId ??
          (
            await this.database.generator.findUnique({
              where: { id },
              select: { clientId: true },
            })
          )?.clientId;
        const site = await this.database.site.findUnique({
          where: { id: (updateGeneratorDto as any).currentSiteId },
        });
        if (!site || site.clientId !== targetClientId) {
          throw new BadRequestException(
            'Local/obra invalido para o cliente do gerador.',
          );
        }
      }
    }

    if (updateGeneratorDto.serialNumber) {
      const serialExists = await this.database.generator.findUnique({
        where: { serialNumber: updateGeneratorDto.serialNumber },
      });
      if (serialExists && serialExists.id !== id) {
        throw new ConflictException(
          'Ja existe um gerador com este Numero de Serie.',
        );
      }
    }

    const updateData: Prisma.GeneratorUncheckedUpdateInput = {};

    if (updateGeneratorDto.name !== undefined)
      updateData.name = updateGeneratorDto.name;
    if (updateGeneratorDto.brand !== undefined)
      updateData.brand = updateGeneratorDto.brand;
    if (updateGeneratorDto.serialNumber !== undefined)
      updateData.serialNumber = updateGeneratorDto.serialNumber;
    if (updateGeneratorDto.power !== undefined)
      updateData.power = updateGeneratorDto.power;
    if (updateGeneratorDto.hourMeter !== undefined)
      updateData.hourMeter = updateGeneratorDto.hourMeter;
    if (updateGeneratorDto.condition !== undefined)
      updateData.condition = updateGeneratorDto.condition;
    if ((updateGeneratorDto as any).assetTag !== undefined)
      updateData.assetTag = (updateGeneratorDto as any).assetTag;
    if ((updateGeneratorDto as any).qrCode !== undefined)
      updateData.qrCode = (updateGeneratorDto as any).qrCode;
    if ((updateGeneratorDto as any).installationSite !== undefined)
      updateData.installationSite = (
        updateGeneratorDto as any
      ).installationSite;
    if ((updateGeneratorDto as any).operationalStatus !== undefined)
      updateData.operationalStatus = (
        updateGeneratorDto as any
      ).operationalStatus;
    if ((updateGeneratorDto as any).lifecycleStatus !== undefined)
      updateData.lifecycleStatus = (updateGeneratorDto as any).lifecycleStatus;
    if ((updateGeneratorDto as any).criticality !== undefined)
      updateData.criticality = (updateGeneratorDto as any).criticality;
    if ((updateGeneratorDto as any).manufactureYear !== undefined)
      updateData.manufactureYear = (updateGeneratorDto as any).manufactureYear;
    if ((updateGeneratorDto as any).installationDate !== undefined)
      updateData.installationDate = (
        updateGeneratorDto as any
      ).installationDate;
    if ((updateGeneratorDto as any).warrantyEndDate !== undefined)
      updateData.warrantyEndDate = (updateGeneratorDto as any).warrantyEndDate;
    if ((updateGeneratorDto as any).hasMaintenanceContract !== undefined)
      updateData.hasMaintenanceContract = (
        updateGeneratorDto as any
      ).hasMaintenanceContract;
    if ((updateGeneratorDto as any).currentSiteId !== undefined)
      updateData.currentSiteId = (updateGeneratorDto as any).currentSiteId;
    if (updateGeneratorDto.clientId !== undefined)
      updateData.clientId = updateGeneratorDto.clientId;
    if (updateGeneratorDto.modelId !== undefined)
      updateData.modelId = updateGeneratorDto.modelId;

    return this.database.generator.update({ where: { id }, data: updateData });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.database.generator.delete({ where: { id } });
  }

  async findAllModels() {
    return this.database.generatorModel.findMany({
      include: {
        baseItems: {
          include: { catalogItem: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ brand: 'asc' }, { name: 'asc' }],
    });
  }

  async createModel(data: CreateGeneratorModelDto) {
    return this.database.$transaction(async (tx) => {
      const model = await tx.generatorModel.create({
        data: {
          name: data.name,
          brand: data.brand,
        },
      });

      if (data.baseItems && data.baseItems.length > 0) {
        await this.ensureCatalogItemsExist(
          data.baseItems.map((item) => item.catalogItemId),
        );
        await tx.modelBaseItem.createMany({
          data: data.baseItems.map((item) => ({
            modelId: model.id,
            catalogItemId: item.catalogItemId,
            serviceGroup: item.serviceGroup,
            defaultQuantity: item.defaultQuantity ?? 1,
          })),
        });
      }

      return tx.generatorModel.findUnique({
        where: { id: model.id },
        include: { baseItems: { include: { catalogItem: true } } },
      });
    });
  }

  async updateModel(id: string, data: UpdateGeneratorModelDto) {
    const existing = await this.database.generatorModel.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Modelo nao encontrado.');
    }

    return this.database.$transaction(async (tx) => {
      await tx.generatorModel.update({
        where: { id },
        data: {
          name: data.name,
          brand: data.brand,
        },
      });

      if (data.baseItems) {
        await this.ensureCatalogItemsExist(
          data.baseItems.map((item) => item.catalogItemId),
        );
        await tx.modelBaseItem.deleteMany({ where: { modelId: id } });
        if (data.baseItems.length > 0) {
          await tx.modelBaseItem.createMany({
            data: data.baseItems.map((item) => ({
              modelId: id,
              catalogItemId: item.catalogItemId,
              serviceGroup: item.serviceGroup,
              defaultQuantity: item.defaultQuantity ?? 1,
            })),
          });
        }
      }

      return tx.generatorModel.findUnique({
        where: { id },
        include: { baseItems: { include: { catalogItem: true } } },
      });
    });
  }

  async upsertModelBaseItems(
    modelId: string,
    items: CreateGeneratorModelDto['baseItems'],
  ) {
    const model = await this.database.generatorModel.findUnique({
      where: { id: modelId },
    });
    if (!model) {
      throw new NotFoundException('Modelo nao encontrado.');
    }

    const normalizedItems = items ?? [];
    await this.ensureCatalogItemsExist(
      normalizedItems.map((item) => item.catalogItemId),
    );

    return this.database.$transaction(async (tx) => {
      await tx.modelBaseItem.deleteMany({ where: { modelId } });
      if (normalizedItems.length > 0) {
        await tx.modelBaseItem.createMany({
          data: normalizedItems.map((item) => ({
            modelId,
            catalogItemId: item.catalogItemId,
            serviceGroup: item.serviceGroup,
            defaultQuantity: item.defaultQuantity ?? 1,
          })),
        });
      }

      return tx.modelBaseItem.findMany({
        where: { modelId },
        include: { catalogItem: true },
        orderBy: { createdAt: 'asc' },
      });
    });
  }

  async applyModelBaseItems(generatorId: string, overwrite = false) {
    return this.database.$transaction(async (tx) => {
      await this.copyModelBaseItemsToGenerator(tx, generatorId, overwrite);
      return tx.generatorBaseItem.findMany({
        where: { generatorId },
        include: { catalogItem: true },
      });
    });
  }

  async getGeneratorBaseItems(generatorId: string, group?: ServiceGroup) {
    await this.findOne(generatorId);

    return this.database.generatorBaseItem.findMany({
      where: {
        generatorId,
        ...(group ? { serviceGroup: group } : {}),
      },
      include: { catalogItem: true },
      orderBy: [{ serviceGroup: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async upsertGeneratorBaseItems(
    generatorId: string,
    data: UpsertGeneratorBaseItemsDto,
  ) {
    await this.findOne(generatorId);
    await this.ensureCatalogItemsExist(
      data.items.map((item) => item.catalogItemId),
    );

    return this.database.$transaction(async (tx) => {
      await tx.generatorBaseItem.deleteMany({ where: { generatorId } });
      if (data.items.length > 0) {
        await tx.generatorBaseItem.createMany({
          data: data.items.map((item) => ({
            generatorId,
            catalogItemId: item.catalogItemId,
            serviceGroup: item.serviceGroup,
            quantity: item.quantity ?? 1,
          })),
        });
      }

      return tx.generatorBaseItem.findMany({
        where: { generatorId },
        include: { catalogItem: true },
      });
    });
  }

  private async ensureCatalogItemsExist(catalogItemIds: string[]) {
    if (catalogItemIds.length === 0) return;

    const distinct = [...new Set(catalogItemIds)];
    const found = await this.database.catalogItem.findMany({
      where: { id: { in: distinct } },
      select: { id: true },
    });

    if (found.length !== distinct.length) {
      throw new BadRequestException(
        'Um ou mais itens de catalogo nao existem.',
      );
    }
  }

  private async copyModelBaseItemsToGenerator(
    tx: Prisma.TransactionClient,
    generatorId: string,
    overwrite: boolean,
  ) {
    const generator = await tx.generator.findUnique({
      where: { id: generatorId },
    });
    if (!generator) throw new NotFoundException('Gerador nao encontrado.');
    if (!generator.modelId) {
      throw new BadRequestException(
        'Este gerador nao possui modelo vinculado.',
      );
    }

    const modelItems = await tx.modelBaseItem.findMany({
      where: { modelId: generator.modelId },
    });

    if (overwrite) {
      await tx.generatorBaseItem.deleteMany({ where: { generatorId } });
    }

    if (modelItems.length === 0) return;

    for (const item of modelItems) {
      await tx.generatorBaseItem.upsert({
        where: {
          generatorId_catalogItemId_serviceGroup: {
            generatorId,
            catalogItemId: item.catalogItemId,
            serviceGroup: item.serviceGroup,
          },
        },
        update: {
          quantity: item.defaultQuantity,
          sourceModelBaseItemId: item.id,
        },
        create: {
          generatorId,
          catalogItemId: item.catalogItemId,
          serviceGroup: item.serviceGroup,
          quantity: item.defaultQuantity,
          sourceModelBaseItemId: item.id,
        },
      });
    }
  }
}
