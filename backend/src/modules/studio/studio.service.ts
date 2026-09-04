import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditDomain,
  ItemType,
  ManufacturerType,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';

type StudioActor = {
  sub?: string;
  role?: string;
  isSystemMaster?: boolean;
  accessPolicy?: Record<string, any>;
};

type StudioResourceDefinition = {
  entityType: string;
  domain: AuditDomain;
  resourcePermission: string;
  editableFields: Record<string, 'string' | 'number' | 'boolean' | 'enum'>;
  enums?: Record<string, string[]>;
  create?: (
    tx: Prisma.TransactionClient,
    data: Record<string, unknown>,
  ) => Promise<any>;
  findUnique: (tx: Prisma.TransactionClient, id: string) => Promise<any>;
  update: (
    tx: Prisma.TransactionClient,
    id: string,
    data: Record<string, unknown>,
  ) => Promise<any>;
};

const CONTROL_OPTION_TYPES = {
  catalogUnits: {
    group: 'catalog',
    type: 'CATALOG_UNIT',
    domain: AuditDomain.INVENTORY,
    permission: 'catalog.update',
  },
  catalogBrands: {
    group: 'catalog',
    type: 'CATALOG_BRAND',
    domain: AuditDomain.INVENTORY,
    permission: 'catalog.update',
  },
  catalogDocumentCategories: {
    group: 'catalog',
    type: 'CATALOG_DOCUMENT_CATEGORY',
    domain: AuditDomain.INVENTORY,
    permission: 'catalog.update',
  },
  storageLocations: {
    group: 'catalog',
    type: 'STORAGE_LOCATION',
    domain: AuditDomain.INVENTORY,
    permission: 'catalog.update',
  },
  serviceTypes: {
    group: 'operation',
    type: 'SERVICE_TYPE',
    domain: AuditDomain.MAINTENANCE_ORDERS,
    permission: 'orders.update',
  },
  maintenanceTypes: {
    group: 'operation',
    type: 'MAINTENANCE_TYPE',
    domain: AuditDomain.MAINTENANCE_ORDERS,
    permission: 'orders.update',
  },
  maintenanceTemplateCategories: {
    group: 'operation',
    type: 'MAINTENANCE_TEMPLATE_CATEGORY',
    domain: AuditDomain.MAINTENANCE_ORDERS,
    permission: 'equipments.manageModels',
  },
  ticketCategories: {
    group: 'operation',
    type: 'TICKET_CATEGORY',
    domain: AuditDomain.TICKETS,
    permission: 'tickets.update',
  },
  equipmentApplications: {
    group: 'assets',
    type: 'EQUIPMENT_APPLICATION',
    domain: AuditDomain.MAINTENANCE_ORDERS,
    permission: 'equipments.update',
  },
  equipmentOperationModes: {
    group: 'assets',
    type: 'EQUIPMENT_OPERATION_MODE',
    domain: AuditDomain.MAINTENANCE_ORDERS,
    permission: 'equipments.update',
  },
  hrAssetCategories: {
    group: 'people',
    type: 'HR_ASSET_CATEGORY',
    domain: AuditDomain.PEOPLE,
    permission: 'people.update',
  },
  paymentTerms: {
    group: 'finance',
    type: 'PAYMENT_TERM',
    domain: AuditDomain.FINANCE,
    permission: 'finance.update',
  },
  brazilStates: {
    group: 'address',
    type: 'BRAZIL_STATE',
    domain: AuditDomain.USERS,
    permission: 'clients.update',
  },
} as const;

function controlOptionDefinition(
  config: (typeof CONTROL_OPTION_TYPES)[keyof typeof CONTROL_OPTION_TYPES],
): StudioResourceDefinition {
  return {
    entityType: 'ControlOption',
    domain: config.domain,
    resourcePermission: config.permission,
    editableFields: {
      code: 'string',
      name: 'string',
      description: 'string',
      sortOrder: 'number',
      isActive: 'boolean',
      isBlockedForNewClients: 'boolean',
    },
    create: (tx, data) =>
      tx.controlOption.create({
        data: {
          group: config.group,
          type: config.type,
          code: String(data.code || '')
            .trim()
            .toUpperCase(),
          name: String(data.name || '').trim(),
          description:
            typeof data.description === 'string'
              ? data.description.trim() || null
              : null,
          sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
          isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
          isBlockedForNewClients:
            config.type === 'PAYMENT_TERM' &&
            typeof data.isBlockedForNewClients === 'boolean'
              ? data.isBlockedForNewClients
              : false,
        },
      }),
    findUnique: (tx, id) =>
      tx.controlOption.findFirst({ where: { id, type: config.type } }),
    update: (tx, id, data) => {
      const updateData: Prisma.ControlOptionUpdateInput = {
        group: config.group,
        type: config.type,
      };
      if (typeof data.code === 'string') {
        updateData.code = data.code.trim().toUpperCase();
      }
      if (typeof data.name === 'string') {
        updateData.name = data.name.trim();
      }
      if (typeof data.description === 'string' || data.description === null) {
        updateData.description = data.description;
      }
      if (typeof data.sortOrder === 'number') {
        updateData.sortOrder = data.sortOrder;
      }
      if (typeof data.isActive === 'boolean') {
        updateData.isActive = data.isActive;
      }
      if (
        config.type === 'PAYMENT_TERM' &&
        typeof data.isBlockedForNewClients === 'boolean'
      ) {
        updateData.isBlockedForNewClients = data.isBlockedForNewClients;
      }

      return tx.controlOption.update({
        where: { id },
        data: updateData,
      });
    },
  };
}

const DEFINITIONS: Record<string, StudioResourceDefinition> = {
  clients: {
    entityType: 'Client',
    domain: AuditDomain.USERS,
    resourcePermission: 'clients.update',
    editableFields: {
      companyName: 'string',
      tradeName: 'string',
      cnpj: 'string',
      email: 'string',
      phone: 'string',
      address: 'string',
      city: 'string',
      state: 'string',
      stateRegistration: 'string',
      municipalRegistration: 'string',
      cnae: 'string',
      segment: 'string',
      preferences: 'string',
      clientType: 'enum',
      personType: 'enum',
      paymentTermDefault: 'string',
      creditLimit: 'number',
      priceTableCode: 'string',
      isDelinquent: 'boolean',
      withholdsInss: 'boolean',
      withholdsIss: 'boolean',
    },
    enums: {
      clientType: ['CONTRACT', 'NO_CONTRACT'],
      personType: ['LEGAL_ENTITY', 'INDIVIDUAL'],
    },
    findUnique: (tx, id) => tx.client.findUnique({ where: { id } }),
    update: (tx, id, data) => tx.client.update({ where: { id }, data }),
  },
  suppliers: {
    entityType: 'Supplier',
    domain: AuditDomain.PURCHASE_ORDERS,
    resourcePermission: 'purchaseOrders.update',
    editableFields: {
      companyName: 'string',
      tradeName: 'string',
      cnpj: 'string',
      email: 'string',
      phone: 'string',
      city: 'string',
      state: 'string',
      paymentTerm: 'string',
    },
    findUnique: (tx, id) => tx.supplier.findUnique({ where: { id } }),
    update: (tx, id, data) => tx.supplier.update({ where: { id }, data }),
  },
  equipments: {
    entityType: 'Generator',
    domain: AuditDomain.MAINTENANCE_ORDERS,
    resourcePermission: 'equipments.update',
    editableFields: {
      name: 'string',
      brand: 'string',
      serialNumber: 'string',
      assetTag: 'string',
      power: 'number',
      hourMeter: 'number',
      criticality: 'enum',
      operationalStatus: 'enum',
      voltage: 'string',
      notes: 'string',
    },
    enums: {
      criticality: ['A', 'B', 'C'],
      operationalStatus: [
        'OPERATING',
        'IN_MAINTENANCE',
        'STOPPED_BY_FAILURE',
        'DEACTIVATED',
      ],
    },
    findUnique: (tx, id) => tx.generator.findUnique({ where: { id } }),
    update: (tx, id, data) => tx.generator.update({ where: { id }, data }),
  },
  models: {
    entityType: 'GeneratorModel',
    domain: AuditDomain.MAINTENANCE_ORDERS,
    resourcePermission: 'equipments.manageModels',
    editableFields: {
      name: 'string',
      brand: 'string',
      category: 'string',
      defaultPowerKva: 'number',
      defaultVoltage: 'string',
      frequencyHz: 'number',
      isActive: 'boolean',
      notes: 'string',
    },
    findUnique: (tx, id) => tx.generatorModel.findUnique({ where: { id } }),
    update: (tx, id, data) => tx.generatorModel.update({ where: { id }, data }),
  },
  manufacturers: {
    entityType: 'Manufacturer',
    domain: AuditDomain.MAINTENANCE_ORDERS,
    resourcePermission: 'equipments.manageModels',
    editableFields: {
      name: 'string',
      type: 'enum',
      country: 'string',
      website: 'string',
      supportPhone: 'string',
      supportEmail: 'string',
      notes: 'string',
      isActive: 'boolean',
    },
    enums: {
      type: [
        'GENERATOR',
        'ENGINE',
        'ALTERNATOR',
        'RADIATOR',
        'TRANSFER_SWITCH',
        'BATTERY',
        'CONTROLLER',
        'OTHER',
      ],
    },
    create: (tx, data) => {
      const name = String(data.name || '').trim();
      if (!name) {
        throw new BadRequestException('Nome do fabricante e obrigatorio.');
      }

      return tx.manufacturer.create({
        data: {
          name,
          type:
            (data.type as ManufacturerType | undefined) ??
            ManufacturerType.OTHER,
          country: typeof data.country === 'string' ? data.country : null,
          website: typeof data.website === 'string' ? data.website : null,
          supportPhone:
            typeof data.supportPhone === 'string' ? data.supportPhone : null,
          supportEmail:
            typeof data.supportEmail === 'string' ? data.supportEmail : null,
          notes: typeof data.notes === 'string' ? data.notes : null,
          isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
        },
      });
    },
    findUnique: (tx, id) => tx.manufacturer.findUnique({ where: { id } }),
    update: (tx, id, data) => tx.manufacturer.update({ where: { id }, data }),
  },
  catalog: {
    entityType: 'CatalogItem',
    domain: AuditDomain.INVENTORY,
    resourcePermission: 'catalog.update',
    editableFields: {
      name: 'string',
      sku: 'string',
      type: 'enum',
      category: 'string',
      unit: 'string',
      brand: 'string',
      basePrice: 'number',
      stockMin: 'number',
      stockMax: 'number',
      storageLocation: 'string',
      isActive: 'boolean',
    },
    enums: {
      type: ['PART', 'SERVICE'],
    },
    findUnique: (tx, id) => tx.catalogItem.findUnique({ where: { id } }),
    update: (tx, id, data) => tx.catalogItem.update({ where: { id }, data }),
  },
  pricingPolicies: {
    entityType: 'CatalogPricingPolicy',
    domain: AuditDomain.INVENTORY,
    resourcePermission: 'catalog.update',
    editableFields: {
      name: 'string',
      itemType: 'enum',
      salesTaxPercent: 'number',
      commissionPercent: 'number',
      profitMarginPercent: 'number',
      operationalCostPercent: 'number',
      serviceCalculationMode: 'enum',
      isDefault: 'boolean',
      isActive: 'boolean',
      notes: 'string',
    },
    enums: {
      itemType: ['PART', 'SERVICE'],
      serviceCalculationMode: [
        'FIXED_PRICE',
        'HOURLY_RATE',
        'SUPPLIER_COST_MARKUP',
      ],
    },
    create: (tx, data) => {
      const name = String(data.name || '').trim();
      if (!name) {
        throw new BadRequestException(
          'Nome da politica de preco e obrigatorio.',
        );
      }

      return tx.catalogPricingPolicy.create({
        data: {
          name,
          itemType: (data.itemType as ItemType | undefined) ?? ItemType.PART,
          salesTaxPercent:
            typeof data.salesTaxPercent === 'number' ? data.salesTaxPercent : 0,
          commissionPercent:
            typeof data.commissionPercent === 'number'
              ? data.commissionPercent
              : 0,
          profitMarginPercent:
            typeof data.profitMarginPercent === 'number'
              ? data.profitMarginPercent
              : 0,
          operationalCostPercent:
            typeof data.operationalCostPercent === 'number'
              ? data.operationalCostPercent
              : 0,
          serviceCalculationMode:
            typeof data.serviceCalculationMode === 'string'
              ? data.serviceCalculationMode
              : 'FIXED_PRICE',
          isDefault:
            typeof data.isDefault === 'boolean' ? data.isDefault : false,
          isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
          notes: typeof data.notes === 'string' ? data.notes : null,
        },
      });
    },
    findUnique: (tx, id) =>
      tx.catalogPricingPolicy.findUnique({ where: { id } }),
    update: (tx, id, data) =>
      tx.catalogPricingPolicy.update({ where: { id }, data }),
  },
  ...Object.fromEntries(
    Object.entries(CONTROL_OPTION_TYPES).map(([key, config]) => [
      key,
      controlOptionDefinition(config),
    ]),
  ),
};

@Injectable()
export class StudioService {
  constructor(private readonly prisma: DatabaseService) {}

  async listControlOptions(type: string) {
    const config = Object.values(CONTROL_OPTION_TYPES).find(
      (item) => item.type === type,
    );
    if (!config) {
      throw new NotFoundException('Tabela de controle nao encontrada.');
    }

    return this.prisma.controlOption.findMany({
      where: { type: config.type },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createRecord(
    resource: string,
    patch: Record<string, unknown>,
    actor: StudioActor,
  ) {
    const definition = DEFINITIONS[resource];
    if (!definition?.create) {
      throw new NotFoundException('Recurso nao permite criacao pelo Studio.');
    }

    this.assertCanEditResource(actor, definition.resourcePermission);
    const data = this.normalizePatch(definition, patch);

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nenhum campo editavel foi informado.');
    }
    this.assertRequiredControlOptionFields(resource, data, true);

    return this.prisma.$transaction(async (tx) => {
      const after = await definition.create!(tx, data);

      await tx.systemAuditLog.create({
        data: {
          domain: definition.domain,
          entityType: definition.entityType,
          entityId: after.id,
          action: 'CREATE',
          actorUserId: actor.sub,
          beforePayload: {
            source: 'MANITEC_STUDIO',
            resource,
          } as any,
          afterPayload: {
            source: 'MANITEC_STUDIO',
            resource,
            recordId: after.id,
            value: after,
          } as any,
          reason: `Criacao pelo Manitec Studio em ${resource}.`,
        },
      });

      return after;
    });
  }

  async updateRecord(
    resource: string,
    id: string,
    patch: Record<string, unknown>,
    actor: StudioActor,
  ) {
    const definition = DEFINITIONS[resource];
    if (!definition) {
      throw new NotFoundException('Recurso nao encontrado no Manitec Studio.');
    }

    this.assertCanEditResource(actor, definition.resourcePermission);
    const data = this.normalizePatch(definition, patch);

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nenhum campo editavel foi informado.');
    }
    this.assertRequiredControlOptionFields(resource, data, false);

    return this.prisma.$transaction(async (tx) => {
      const before = await definition.findUnique(tx, id);
      if (!before) {
        throw new NotFoundException('Registro nao encontrado.');
      }

      const after = await definition.update(tx, id, data);

      await tx.systemAuditLog.create({
        data: {
          domain: definition.domain,
          entityType: definition.entityType,
          entityId: id,
          action: 'UPDATE',
          actorUserId: actor.sub,
          beforePayload: {
            source: 'MANITEC_STUDIO',
            resource,
            recordId: id,
            value: this.pickChangedFields(before, data),
          } as any,
          afterPayload: {
            source: 'MANITEC_STUDIO',
            resource,
            recordId: id,
            patch: data,
            value: this.pickChangedFields(after, data),
          } as any,
          reason: `Alteracao pelo Manitec Studio em ${resource}.`,
        },
      });

      return after;
    });
  }

  private assertCanEditResource(actor: StudioActor, permission: string) {
    if (actor.isSystemMaster || actor.role === 'ADMIN') return;
    if (!this.hasPermission(actor.accessPolicy, 'studio.dataEdit')) {
      throw new ForbiddenException(
        'Seu perfil nao possui permissao para editar pelo Studio.',
      );
    }
    if (!this.hasPermission(actor.accessPolicy, permission)) {
      throw new ForbiddenException(
        'Seu perfil nao possui permissao para editar este recurso.',
      );
    }
  }

  private hasPermission(
    accessPolicy: Record<string, any> | undefined,
    permission: string,
  ) {
    const [sectionKey, actionKey] = permission.split('.');
    return accessPolicy?.[sectionKey]?.[actionKey] === true;
  }

  private normalizePatch(
    definition: StudioResourceDefinition,
    patch: Record<string, unknown>,
  ) {
    const data: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(patch ?? {})) {
      const type = definition.editableFields[key];
      if (!type) continue;

      if (value === undefined) continue;
      if (type === 'string') {
        data[key] = typeof value === 'string' ? value.trim() || null : value;
        continue;
      }
      if (type === 'number') {
        if (value === null || value === '') {
          data[key] = null;
          continue;
        }
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue)) {
          throw new BadRequestException(`Campo numerico invalido: ${key}.`);
        }
        data[key] = numberValue;
        continue;
      }
      if (type === 'boolean') {
        data[key] = Boolean(value);
        continue;
      }
      if (type === 'enum') {
        const allowed = definition.enums?.[key] ?? [];
        if (value === null || value === '') {
          data[key] = null;
          continue;
        }
        if (!allowed.includes(String(value))) {
          throw new BadRequestException(`Valor invalido para ${key}.`);
        }
        data[key] = String(value);
      }
    }

    return data;
  }

  private assertRequiredControlOptionFields(
    resource: string,
    data: Record<string, unknown>,
    requireAll: boolean,
  ) {
    if (!(resource in CONTROL_OPTION_TYPES)) return;
    if ((requireAll || 'code' in data) && !String(data.code || '').trim()) {
      throw new BadRequestException('Codigo e obrigatorio.');
    }
    if ((requireAll || 'name' in data) && !String(data.name || '').trim()) {
      throw new BadRequestException('Nome e obrigatorio.');
    }
  }

  private pickChangedFields(
    record: Record<string, unknown>,
    patch: Record<string, unknown>,
  ) {
    const picked: Record<string, unknown> = {};
    for (const key of Object.keys(patch)) {
      picked[key] = record?.[key];
    }
    return picked;
  }
}
