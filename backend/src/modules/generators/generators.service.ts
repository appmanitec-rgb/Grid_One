import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MaintenanceTemplateCategory,
  Prisma,
  ServiceGroup,
  TicketStatus,
} from '@prisma/client';
import { DatabaseService } from 'src/database/database.service';
import { CreateGeneratorDto } from './dto/create-generator.dto';
import { UpdateGeneratorDto } from './dto/update-generator.dto';
import {
  CreateGeneratorModelDto,
  UpdateGeneratorModelDto,
} from './dto/generator-model.dto';
import { UpsertGeneratorBaseItemsDto } from './dto/generator-base-items.dto';

const generatorTechnicalFields = [
  'application',
  'notes',
  'voltage',
  'ratedCurrent',
  'powerFactor',
  'frequencyHz',
  'operationMode',
  'engineBrand',
  'engineModelName',
  'engineSerialNumber',
  'enginePower',
  'fuelType',
  'engineCylinders',
  'oilRecommendation',
  'oilCapacityLiters',
  'lastOilChangeAt',
  'alternatorBrand',
  'alternatorModelName',
  'alternatorSerialNumber',
  'alternatorVoltage',
  'alternatorFrequencyHz',
  'alternatorInsulationClass',
  'alternatorProtectionDegree',
  'hasTransferSwitch',
  'transferSwitchBrand',
  'transferSwitchModel',
  'transferSwitchSerialNumber',
  'transferSwitchRatedCurrent',
  'transferSwitchCommandVoltage',
  'transferSwitchType',
  'transferSwitchNotes',
  'batteryQuantity',
  'batteryVoltage',
  'batteryCapacityAh',
  'batteryInstallationDate',
  'batteryChargerModel',
  'batteryLastReplacementDate',
] as const;

const generatorTechnicalDateFields = new Set<string>([
  'lastOilChangeAt',
  'batteryInstallationDate',
  'batteryLastReplacementDate',
]);

const generatorModelInclude = {
  baseItems: {
    include: { catalogItem: true },
    orderBy: { createdAt: 'asc' as const },
  },
  maintenanceTemplates: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.GeneratorModelInclude;

const buildGeneratorListSelect = (today: Date) =>
  ({
    id: true,
    code: true,
    legacyCode: true,
    name: true,
    brand: true,
    serialNumber: true,
    power: true,
    hourMeter: true,
    assetTag: true,
    installationSite: true,
    operationalStatus: true,
    criticality: true,
    voltage: true,
    engineModelName: true,
    notes: true,
    clientId: true,
    client: { select: { id: true, companyName: true } },
    model: { select: { id: true, name: true } },
    currentSite: { select: { id: true, name: true } },
    orders: {
      orderBy: { updatedAt: 'desc' as const },
      take: 1,
      select: {
        id: true,
        title: true,
        status: true,
        finishedAt: true,
        updatedAt: true,
      },
    },
    contractSchedules: {
      where: {
        scheduledDate: { gte: today },
        status: 'PLANNED' as const,
      },
      orderBy: { scheduledDate: 'asc' as const },
      take: 1,
      select: {
        scheduledDate: true,
        contract: { select: { id: true, code: true, status: true } },
      },
    },
    contractLinks: {
      orderBy: { createdAt: 'desc' as const },
      take: 1,
      select: {
        contract: { select: { id: true, code: true, status: true } },
      },
    },
    serviceTickets: {
      where: {
        status: {
          in: [
            TicketStatus.OPEN,
            TicketStatus.TRIAGE,
            TicketStatus.WAITING_CUSTOMER,
            TicketStatus.WAITING_INTERNAL,
            TicketStatus.SCHEDULED,
            TicketStatus.IN_PROGRESS,
            TicketStatus.CONVERTING_TO_ORDER,
          ],
        },
      },
      orderBy: { updatedAt: 'desc' as const },
      take: 3,
      select: {
        id: true,
        title: true,
        status: true,
      },
    },
  }) satisfies Prisma.GeneratorSelect;

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
        legacyCode: data.legacyCode?.trim() || undefined,
        name: data.name,
        brand: data.brand,
        serialNumber: data.serialNumber,
        power: data.power,
        hourMeter: data.hourMeter,
        condition: data.condition,
        assetTag: (data as any).assetTag,
        qrCode: (data as any).qrCode,
        installationSite: (data as any).installationSite,
        ...this.pickGeneratorTechnicalFields(data),
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
        await this.copyModelBaseItemsToGenerator(tx, generator.id);
      }

      return generator;
    });
  }

  findAll() {
    const today = new Date();
    return this.database.generator.findMany({
      orderBy: [{ criticality: 'asc' }, { name: 'asc' }],
      select: buildGeneratorListSelect(today),
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
          include: { catalogItem: true, sourceModelBaseItem: true },
          orderBy: { createdAt: 'asc' },
        },
        proposals: {
          include: { client: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
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
            serviceReport: {
              select: {
                id: true,
                code: true,
                status: true,
              },
            },
            contract: {
              select: {
                id: true,
                code: true,
                status: true,
              },
            },
            materials: {
              where: { appliedAt: { not: null } },
              take: 8,
              orderBy: { appliedAt: 'desc' },
              select: {
                id: true,
                quantity: true,
                appliedAt: true,
                catalogItem: {
                  select: {
                    id: true,
                    name: true,
                    sku: true,
                  },
                },
              },
            },
          },
          orderBy: { openedAt: 'desc' },
          take: 8,
        },
        contractLinks: {
          include: {
            contract: {
              select: {
                id: true,
                code: true,
                title: true,
                status: true,
                startDate: true,
                endDate: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        contractSchedules: {
          orderBy: { scheduledDate: 'asc' },
          take: 8,
          select: {
            id: true,
            scheduledDate: true,
            status: true,
            contract: {
              select: {
                id: true,
                code: true,
                status: true,
              },
            },
            generatedOrder: {
              select: {
                id: true,
                title: true,
                status: true,
              },
            },
          },
        },
        serviceTickets: {
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            priority: true,
            createdAt: true,
            maintenanceOrder: {
              select: {
                id: true,
                title: true,
                status: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 8,
        },
        serviceReports: {
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            createdAt: true,
            documentHash: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 8,
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
    Object.assign(
      updateData,
      this.pickGeneratorTechnicalFields(updateGeneratorDto),
    );
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
      include: generatorModelInclude,
      orderBy: [{ brand: 'asc' }, { name: 'asc' }],
    });
  }

  async findModelById(id: string) {
    const model = await this.database.generatorModel.findUnique({
      where: { id },
      include: generatorModelInclude,
    });
    if (!model) {
      throw new NotFoundException('Modelo nao encontrado.');
    }
    return model;
  }

  async createModel(data: CreateGeneratorModelDto) {
    const name = this.normalizeRequiredText(data.name, 'Nome do modelo');
    await this.ensureModelNameAvailable(name);
    this.assertUniqueBaseItems(data.baseItems ?? []);

    return this.database.$transaction(async (tx) => {
      const model = await tx.generatorModel.create({
        data: this.buildGeneratorModelData({
          ...data,
          name,
        }) as Prisma.GeneratorModelUncheckedCreateInput,
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

      if (data.maintenanceTemplates?.length) {
        await this.applyMaintenanceTemplates(
          tx,
          model.id,
          data.maintenanceTemplates,
        );
      }

      return tx.generatorModel.findUnique({
        where: { id: model.id },
        include: generatorModelInclude,
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
    const nextName =
      data.name !== undefined
        ? this.normalizeRequiredText(data.name, 'Nome do modelo')
        : undefined;
    if (nextName) {
      await this.ensureModelNameAvailable(nextName, id);
    }

    return this.database.$transaction(async (tx) => {
      await tx.generatorModel.update({
        where: { id },
        data: this.buildGeneratorModelData({
          ...data,
          name: nextName,
        }) as Prisma.GeneratorModelUncheckedUpdateInput,
      });

      if (data.baseItems) {
        await this.ensureCatalogItemsExist(
          data.baseItems.map((item) => item.catalogItemId),
        );
        await this.syncModelBaseItems(tx, id, data.baseItems);
      }

      if (data.maintenanceTemplates) {
        await this.applyMaintenanceTemplates(tx, id, data.maintenanceTemplates);
      }

      return tx.generatorModel.findUnique({
        where: { id },
        include: generatorModelInclude,
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
    this.assertUniqueBaseItems(normalizedItems);
    await this.ensureCatalogItemsExist(
      normalizedItems.map((item) => item.catalogItemId),
    );

    return this.database.$transaction(async (tx) => {
      await this.syncModelBaseItems(tx, modelId, normalizedItems);

      return tx.modelBaseItem.findMany({
        where: { modelId },
        include: { catalogItem: true },
        orderBy: { createdAt: 'asc' },
      });
    });
  }

  async applyModelBaseItems(
    generatorId: string,
    overwrite = false,
    detailed = false,
  ) {
    // Mantido apenas por compatibilidade com clientes antigos. A sincronizacao
    // atual nunca apaga itens manuais ou personalizados.
    void overwrite;
    return this.database.$transaction(async (tx) => {
      const summary = await this.copyModelBaseItemsToGenerator(tx, generatorId);
      const items = await tx.generatorBaseItem.findMany({
        where: { generatorId },
        include: { catalogItem: true, sourceModelBaseItem: true },
        orderBy: [{ serviceGroup: 'asc' }, { createdAt: 'asc' }],
      });
      return detailed ? { items, summary } : items;
    });
  }

  async getGeneratorBaseItems(generatorId: string, group?: ServiceGroup) {
    await this.findOne(generatorId);

    return this.database.generatorBaseItem.findMany({
      where: {
        generatorId,
        ...(group ? { serviceGroup: group } : {}),
      },
      include: { catalogItem: true, sourceModelBaseItem: true },
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
    this.assertUniqueBaseItems(data.items);

    return this.database.$transaction(async (tx) => {
      const existingItems = await tx.generatorBaseItem.findMany({
        where: { generatorId },
      });
      const desiredKeys = new Set(
        data.items.map((item) =>
          this.baseItemKey(item.catalogItemId, item.serviceGroup),
        ),
      );

      for (const existingItem of existingItems) {
        const key = this.baseItemKey(
          existingItem.catalogItemId,
          existingItem.serviceGroup,
        );
        if (!desiredKeys.has(key)) {
          await tx.generatorBaseItem.delete({ where: { id: existingItem.id } });
        }
      }

      for (const item of data.items) {
        const quantity = item.quantity ?? 1;
        const existingItem = existingItems.find(
          (candidate) =>
            this.baseItemKey(
              candidate.catalogItemId,
              candidate.serviceGroup,
            ) === this.baseItemKey(item.catalogItemId, item.serviceGroup),
        );
        if (existingItem) {
          await tx.generatorBaseItem.update({
            where: { id: existingItem.id },
            data: {
              quantity,
              isCustomized: existingItem.sourceModelBaseItemId
                ? quantity !== existingItem.sourceModelDefaultQuantity
                : false,
            },
          });
          continue;
        }

        await tx.generatorBaseItem.create({
          data: {
            generatorId,
            catalogItemId: item.catalogItemId,
            serviceGroup: item.serviceGroup,
            quantity,
            isCustomized: false,
          },
        });
      }

      return tx.generatorBaseItem.findMany({
        where: { generatorId },
        include: { catalogItem: true, sourceModelBaseItem: true },
        orderBy: [{ serviceGroup: 'asc' }, { createdAt: 'asc' }],
      });
    });
  }

  private async ensureModelNameAvailable(name: string, excludeId?: string) {
    const existing = await this.database.generatorModel.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Ja existe um modelo com este nome.');
    }
  }

  private baseItemKey(catalogItemId: string, serviceGroup: ServiceGroup) {
    return `${catalogItemId}:${serviceGroup}`;
  }

  private assertUniqueBaseItems(
    items: Array<{ catalogItemId: string; serviceGroup: ServiceGroup }>,
  ) {
    const keys = items.map((item) =>
      this.baseItemKey(item.catalogItemId, item.serviceGroup),
    );
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException(
        'O mesmo item de catalogo nao pode ser repetido no mesmo tipo de manutencao.',
      );
    }
  }

  private async syncModelBaseItems(
    tx: Prisma.TransactionClient,
    modelId: string,
    items: NonNullable<CreateGeneratorModelDto['baseItems']>,
  ) {
    this.assertUniqueBaseItems(items);
    const existingItems = await tx.modelBaseItem.findMany({
      where: { modelId },
    });
    const desiredKeys = new Set(
      items.map((item) =>
        this.baseItemKey(item.catalogItemId, item.serviceGroup),
      ),
    );

    for (const existingItem of existingItems) {
      const key = this.baseItemKey(
        existingItem.catalogItemId,
        existingItem.serviceGroup,
      );
      if (!desiredKeys.has(key)) {
        await tx.modelBaseItem.delete({ where: { id: existingItem.id } });
      }
    }

    for (const item of items) {
      const existingItem = existingItems.find(
        (candidate) =>
          this.baseItemKey(candidate.catalogItemId, candidate.serviceGroup) ===
          this.baseItemKey(item.catalogItemId, item.serviceGroup),
      );
      if (existingItem) {
        await tx.modelBaseItem.update({
          where: { id: existingItem.id },
          data: { defaultQuantity: item.defaultQuantity ?? 1 },
        });
        continue;
      }
      await tx.modelBaseItem.create({
        data: {
          modelId,
          catalogItemId: item.catalogItemId,
          serviceGroup: item.serviceGroup,
          defaultQuantity: item.defaultQuantity ?? 1,
        },
      });
    }
  }

  private buildGeneratorModelData(
    data: Partial<CreateGeneratorModelDto & UpdateGeneratorModelDto>,
  ) {
    const source = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    if (data.name !== undefined) result.name = data.name;
    if (data.isActive !== undefined) result.isActive = data.isActive;

    for (const field of [
      'brand',
      'category',
      'defaultVoltage',
      'controllerType',
      'engineModel',
      'alternatorModel',
      'defaultFuelConsumption',
      'defaultTankCapacity',
      'description',
      'notes',
    ]) {
      if (source[field] !== undefined) {
        result[field] = this.normalizeOptionalText(source[field]);
      }
    }

    for (const field of ['defaultPowerKva', 'defaultPowerKw', 'frequencyHz']) {
      if (source[field] !== undefined) {
        result[field] = this.normalizeOptionalNumber(source[field], field);
      }
    }

    return result;
  }

  private async applyMaintenanceTemplates(
    tx: Prisma.TransactionClient,
    modelId: string,
    templates: CreateGeneratorModelDto['maintenanceTemplates'],
  ) {
    const seenIds = new Set<string>();

    for (const [index, item] of (templates ?? []).entries()) {
      const data = {
        name: this.normalizeRequiredText(
          item.name,
          `Item de manutencao ${index + 1}`,
        ),
        description: this.normalizeOptionalText(item.description),
        category: item.category ?? MaintenanceTemplateCategory.OTHER,
        intervalValue: item.intervalValue ?? null,
        intervalUnit: item.intervalUnit ?? null,
        hourMeterInterval: item.hourMeterInterval ?? null,
        required: item.required ?? true,
        active: item.active ?? true,
        sortOrder: item.sortOrder ?? index,
        notes: this.normalizeOptionalText(item.notes),
      };

      if (!item.id) {
        await tx.generatorModelMaintenanceTemplate.create({
          data: { ...data, generatorModelId: modelId },
        });
        continue;
      }

      if (seenIds.has(item.id)) {
        throw new BadRequestException(
          'Item de manutencao repetido na mesma edicao.',
        );
      }
      seenIds.add(item.id);

      const existing = await tx.generatorModelMaintenanceTemplate.findUnique({
        where: { id: item.id },
        select: { id: true, generatorModelId: true },
      });
      if (!existing) {
        throw new NotFoundException('Item de manutencao nao encontrado.');
      }
      if (existing.generatorModelId !== modelId) {
        throw new BadRequestException(
          'Item de manutencao nao pertence a este modelo.',
        );
      }

      await tx.generatorModelMaintenanceTemplate.update({
        where: { id: item.id },
        data,
      });
    }
  }

  private normalizeRequiredText(value: unknown, label: string) {
    const normalized = this.normalizeOptionalText(value);
    if (!normalized) {
      throw new BadRequestException(`${label} e obrigatorio.`);
    }
    return normalized;
  }

  private normalizeOptionalText(value: unknown) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new BadRequestException('Valor textual invalido.');
    }
    const text = String(value).trim();
    return text || null;
  }

  private normalizeOptionalNumber(value: unknown, label: string) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      throw new BadRequestException(`${label} invalido.`);
    }
    return number;
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

  private pickGeneratorTechnicalFields(
    data: CreateGeneratorDto | UpdateGeneratorDto,
  ): Partial<Prisma.GeneratorUncheckedCreateInput> {
    const source = data as Record<string, unknown>;
    const picked: Record<string, unknown> = {};

    for (const field of generatorTechnicalFields) {
      if (source[field] === undefined) continue;
      const value = source[field];
      if (
        value &&
        generatorTechnicalDateFields.has(field) &&
        (typeof value === 'string' || value instanceof Date)
      ) {
        picked[field] = new Date(value);
        continue;
      }
      picked[field] = value;
    }

    return picked as Partial<Prisma.GeneratorUncheckedCreateInput>;
  }

  private async copyModelBaseItemsToGenerator(
    tx: Prisma.TransactionClient,
    generatorId: string,
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

    const generatorItems = await tx.generatorBaseItem.findMany({
      where: { generatorId },
    });
    const summary = { added: 0, updated: 0, preserved: 0, conflicts: 0 };

    if (modelItems.length === 0) return summary;

    for (const item of modelItems) {
      const linkedItem = generatorItems.find(
        (candidate) => candidate.sourceModelBaseItemId === item.id,
      );
      if (linkedItem) {
        if (linkedItem.isCustomized) {
          summary.preserved += 1;
          continue;
        }
        await tx.generatorBaseItem.update({
          where: { id: linkedItem.id },
          data: {
            quantity: item.defaultQuantity,
            sourceModelDefaultQuantity: item.defaultQuantity,
            lastSyncedAt: new Date(),
          },
        });
        summary.updated += 1;
        continue;
      }

      const matchingItem = generatorItems.find(
        (candidate) =>
          candidate.catalogItemId === item.catalogItemId &&
          candidate.serviceGroup === item.serviceGroup,
      );
      if (matchingItem) {
        summary.conflicts += 1;
        continue;
      }

      await tx.generatorBaseItem.create({
        data: {
          generatorId,
          catalogItemId: item.catalogItemId,
          serviceGroup: item.serviceGroup,
          quantity: item.defaultQuantity,
          sourceModelBaseItemId: item.id,
          sourceModelDefaultQuantity: item.defaultQuantity,
          isCustomized: false,
          lastSyncedAt: new Date(),
        },
      });
      summary.added += 1;
    }

    return summary;
  }
}
