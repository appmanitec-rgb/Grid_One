import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditDomain,
  CommercialGeneratorAvailability,
  CommercialGeneratorConstruction,
  CommercialGeneratorFuel,
  ItemType,
  ManufacturerType,
  OperationalExpenseType,
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
  editableFields: Record<
    string,
    'string' | 'stringList' | 'number' | 'boolean' | 'enum'
  >;
  enums?: Record<string, string[]>;
  list?: (tx: Prisma.TransactionClient) => Promise<any[]>;
  validate?: (data: Record<string, unknown>, creating: boolean) => void;
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
          code: studioString(data.code).trim().toUpperCase(),
          name: studioString(data.name).trim(),
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
      legacyCode: 'string',
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
      notes: 'string',
      isActive: 'boolean',
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
      legacyCode: 'string',
      companyName: 'string',
      tradeName: 'string',
      cnpj: 'string',
      email: 'string',
      phone: 'string',
      city: 'string',
      state: 'string',
      paymentTerm: 'string',
      address: 'string',
      stateRegistration: 'string',
      municipalRegistration: 'string',
      notes: 'string',
      isActive: 'boolean',
    },
    findUnique: (tx, id) => tx.supplier.findUnique({ where: { id } }),
    update: (tx, id, data) => tx.supplier.update({ where: { id }, data }),
  },
  equipments: {
    entityType: 'Generator',
    domain: AuditDomain.MAINTENANCE_ORDERS,
    resourcePermission: 'equipments.update',
    editableFields: {
      legacyCode: 'string',
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
      const name = studioString(data.name).trim();
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
      ncm: 'string',
      type: 'enum',
      itemClassification: 'string',
      category: 'string',
      subcategory: 'string',
      unit: 'string',
      acquisitionOrigin: 'string',
      brand: 'string',
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
      icmsPercent: 'number',
      pisPercent: 'number',
      cofinsPercent: 'number',
      ipiPercent: 'number',
      issPercent: 'number',
      irpjPercent: 'number',
      csllPercent: 'number',
      cppPercent: 'number',
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
    validate: (data) => {
      const percentFields = [
        'salesTaxPercent',
        'icmsPercent',
        'pisPercent',
        'cofinsPercent',
        'ipiPercent',
        'issPercent',
        'irpjPercent',
        'csllPercent',
        'cppPercent',
        'commissionPercent',
        'profitMarginPercent',
        'operationalCostPercent',
      ];
      if (percentFields.some((key) => key in data && Number(data[key]) < 0)) {
        throw new BadRequestException(
          'Percentuais da politica de preco nao podem ser negativos.',
        );
      }
    },
    create: async (tx, data) => {
      const name = studioString(data.name).trim();
      if (!name) {
        throw new BadRequestException(
          'Nome da politica de preco e obrigatorio.',
        );
      }

      const componentTaxPercent = [
        data.icmsPercent,
        data.pisPercent,
        data.cofinsPercent,
        data.ipiPercent,
        data.issPercent,
        data.irpjPercent,
        data.csllPercent,
        data.cppPercent,
      ].reduce<number>(
        (total, value) => total + (typeof value === 'number' ? value : 0),
        0,
      );

      const itemType = (data.itemType as ItemType | undefined) ?? ItemType.PART;
      if (data.isDefault === true) {
        await tx.catalogPricingPolicy.updateMany({
          where: { itemType, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.catalogPricingPolicy.create({
        data: {
          name,
          itemType,
          salesTaxPercent:
            componentTaxPercent > 0
              ? componentTaxPercent
              : typeof data.salesTaxPercent === 'number'
                ? data.salesTaxPercent
                : 0,
          icmsPercent:
            typeof data.icmsPercent === 'number' ? data.icmsPercent : 0,
          pisPercent: typeof data.pisPercent === 'number' ? data.pisPercent : 0,
          cofinsPercent:
            typeof data.cofinsPercent === 'number' ? data.cofinsPercent : 0,
          ipiPercent: typeof data.ipiPercent === 'number' ? data.ipiPercent : 0,
          issPercent: typeof data.issPercent === 'number' ? data.issPercent : 0,
          irpjPercent:
            typeof data.irpjPercent === 'number' ? data.irpjPercent : 0,
          csllPercent:
            typeof data.csllPercent === 'number' ? data.csllPercent : 0,
          cppPercent: typeof data.cppPercent === 'number' ? data.cppPercent : 0,
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
    update: async (tx, id, data) => {
      const current = await tx.catalogPricingPolicy.findUnique({
        where: { id },
      });
      if (current && data.isDefault === true) {
        await tx.catalogPricingPolicy.updateMany({
          where: {
            itemType:
              (data.itemType as ItemType | undefined) ?? current.itemType,
            isDefault: true,
            id: { not: id },
          },
          data: { isDefault: false },
        });
      }
      const componentKeys = [
        'icmsPercent',
        'pisPercent',
        'cofinsPercent',
        'ipiPercent',
        'issPercent',
        'irpjPercent',
        'csllPercent',
        'cppPercent',
      ];
      if (componentKeys.some((key) => key in data)) {
        if (current) {
          data.salesTaxPercent = componentKeys.reduce(
            (total, key) =>
              total +
              Number(data[key] ?? current[key as keyof typeof current] ?? 0),
            0,
          );
        }
      }
      return tx.catalogPricingPolicy.update({ where: { id }, data });
    },
  },
  operationalExpenseRates: {
    entityType: 'OperationalExpenseRate',
    domain: AuditDomain.PROPOSALS,
    resourcePermission: 'finance.update',
    editableFields: {
      expenseType: 'enum',
      label: 'string',
      unitLabel: 'string',
      unitPrice: 'number',
      isActive: 'boolean',
      sortOrder: 'number',
      notes: 'string',
    },
    enums: {
      expenseType: Object.values(OperationalExpenseType),
    },
    list: (tx) =>
      tx.operationalExpenseRate.findMany({
        orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      }),
    validate: (data) => {
      if ('unitPrice' in data && Number(data.unitPrice) < 0) {
        throw new BadRequestException(
          'O valor unitario da despesa nao pode ser negativo.',
        );
      }
      if ('label' in data && !studioString(data.label).trim()) {
        throw new BadRequestException('Informe o nome da despesa.');
      }
      if ('unitLabel' in data && !studioString(data.unitLabel).trim()) {
        throw new BadRequestException('Informe a unidade da despesa.');
      }
    },
    create: (tx, data) =>
      tx.operationalExpenseRate.create({
        data: {
          expenseType:
            (data.expenseType as OperationalExpenseType | undefined) ??
            OperationalExpenseType.DISPLACEMENT,
          label: studioString(data.label).trim(),
          unitLabel: studioString(data.unitLabel).trim(),
          unitPrice: Number(data.unitPrice ?? 0),
          isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
          sortOrder: Number(data.sortOrder ?? 0),
          notes: typeof data.notes === 'string' ? data.notes : null,
        },
      }),
    findUnique: (tx, id) =>
      tx.operationalExpenseRate.findUnique({ where: { id } }),
    update: (tx, id, data) =>
      tx.operationalExpenseRate.update({ where: { id }, data }),
  },
  commercialGenerators: {
    entityType: 'CommercialGenerator',
    domain: AuditDomain.OPPORTUNITIES,
    resourcePermission: 'catalog.update',
    editableFields: {
      internalCode: 'string',
      line: 'string',
      model: 'string',
      shortDescription: 'string',
      isActive: 'boolean',
      standbyPowerKw: 'number',
      standbyPowerKva: 'number',
      primePowerKw: 'number',
      primePowerKva: 'number',
      continuousPowerKw: 'number',
      continuousPowerKva: 'number',
      powerFactor: 'number',
      frequencyHz: 'number',
      availableVoltages: 'stringList',
      availablePhaseConfigs: 'stringList',
      fuelType: 'enum',
      construction: 'enum',
      supportsIndoor: 'boolean',
      supportsOutdoor: 'boolean',
      availability: 'enum',
      stockQuantity: 'number',
      leadTimeDays: 'number',
      currency: 'string',
      costPrice: 'number',
      basePrice: 'number',
      suggestedPrice: 'number',
      minimumPrice: 'number',
      taxPercentage: 'number',
      engineDescription: 'string',
      alternatorDescription: 'string',
      controllerDescription: 'string',
      enclosureDescription: 'string',
      standardAccessories: 'string',
      commercialNotes: 'string',
      technicalNotes: 'string',
    },
    enums: {
      fuelType: Object.values(CommercialGeneratorFuel),
      construction: Object.values(CommercialGeneratorConstruction),
      availability: Object.values(CommercialGeneratorAvailability),
    },
    list: (tx) =>
      tx.commercialGenerator.findMany({
        orderBy: [
          { isActive: 'desc' },
          { standbyPowerKw: 'asc' },
          { model: 'asc' },
        ],
      }),
    validate: validateCommercialGenerator,
    create: (tx, data) =>
      tx.commercialGenerator.create({
        data: {
          ...data,
          internalCode: String(data.internalCode).toUpperCase(),
          manufacturer: 'Generac',
        } as Prisma.CommercialGeneratorUncheckedCreateInput,
      }),
    findUnique: (tx, id) =>
      tx.commercialGenerator.findUnique({ where: { id } }),
    update: (tx, id, data) =>
      tx.commercialGenerator.update({
        where: { id },
        data: {
          ...data,
          ...('internalCode' in data
            ? { internalCode: String(data.internalCode).toUpperCase() }
            : {}),
          manufacturer: 'Generac',
        } as Prisma.CommercialGeneratorUncheckedUpdateInput,
      }),
  },
  commercialSizingPolicies: {
    entityType: 'CommercialSizingPolicy',
    domain: AuditDomain.OPPORTUNITIES,
    resourcePermission: 'catalog.update',
    editableFields: {
      name: 'string',
      version: 'number',
      isDefault: 'boolean',
      isActive: 'boolean',
      defaultPowerFactor: 'number',
      standardMarginPercent: 'number',
      resistiveMarginPercent: 'number',
      motorsMarginPercent: 'number',
      pumpsMarginPercent: 'number',
      airConditioningMarginPercent: 'number',
      elevatorsMarginPercent: 'number',
      electronicsMarginPercent: 'number',
      mixedLoadMarginPercent: 'number',
      unknownLoadMarginPercent: 'number',
      idealReserveMinPercent: 'number',
      idealReserveMaxPercent: 'number',
      engineeringReviewAboveKw: 'number',
      requireEngineeringSpecialLoads: 'boolean',
      notes: 'string',
    },
    list: (tx) =>
      tx.commercialSizingPolicy.findMany({
        orderBy: [
          { isActive: 'desc' },
          { isDefault: 'desc' },
          { name: 'asc' },
          { version: 'desc' },
        ],
      }),
    validate: validateCommercialSizingPolicy,
    create: async (tx, data) => {
      if (data.isDefault === true && data.isActive !== false) {
        await tx.commercialSizingPolicy.updateMany({
          where: { isDefault: true, isActive: true },
          data: { isDefault: false },
        });
      }
      return tx.commercialSizingPolicy.create({
        data: data as Prisma.CommercialSizingPolicyUncheckedCreateInput,
      });
    },
    findUnique: (tx, id) =>
      tx.commercialSizingPolicy.findUnique({ where: { id } }),
    update: async (tx, id, data) => {
      if (data.isDefault === true && data.isActive !== false) {
        await tx.commercialSizingPolicy.updateMany({
          where: { id: { not: id }, isDefault: true, isActive: true },
          data: { isDefault: false },
        });
      }
      return tx.commercialSizingPolicy.update({ where: { id }, data });
    },
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

  async listRecords(resource: string) {
    const definition = DEFINITIONS[resource];
    if (!definition?.list) {
      throw new NotFoundException('Recurso nao possui listagem pelo Studio.');
    }
    return this.prisma.$transaction((tx) => definition.list!(tx));
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
    definition.validate?.(data, true);

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
    definition.validate?.(data, false);

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
      if (type === 'stringList') {
        if (Array.isArray(value)) {
          data[key] = value
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean);
          continue;
        }
        if (typeof value !== 'string' && value !== null) {
          throw new BadRequestException(`Lista invalida: ${key}.`);
        }
        data[key] = (value ?? '')
          .split(/[;,]/)
          .map((item) => item.trim())
          .filter(Boolean);
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
        const enumValue = studioString(value);
        if (!allowed.includes(enumValue)) {
          throw new BadRequestException(`Valor invalido para ${key}.`);
        }
        data[key] = enumValue;
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
    if ((requireAll || 'code' in data) && !studioString(data.code).trim()) {
      throw new BadRequestException('Codigo e obrigatorio.');
    }
    if ((requireAll || 'name' in data) && !studioString(data.name).trim()) {
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

function studioString(value: unknown) {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
}

function validateCommercialGenerator(
  data: Record<string, unknown>,
  creating: boolean,
) {
  const internalCode =
    typeof data.internalCode === 'string' ? data.internalCode : '';
  const model = typeof data.model === 'string' ? data.model : '';
  if ((creating || 'internalCode' in data) && !internalCode.trim()) {
    throw new BadRequestException('Codigo interno e obrigatorio.');
  }
  if ((creating || 'model' in data) && !model.trim()) {
    throw new BadRequestException('Modelo Generac e obrigatorio.');
  }
  if (creating && !data.fuelType) {
    throw new BadRequestException('Combustivel e obrigatorio.');
  }
  if (creating && !data.construction) {
    throw new BadRequestException('Construcao e obrigatoria.');
  }

  const isActive = data.isActive !== false;
  const hasStandbyPower =
    Number(data.standbyPowerKw || 0) > 0 ||
    Number(data.standbyPowerKva || 0) > 0;
  if (creating && isActive && !hasStandbyPower) {
    throw new BadRequestException(
      'Informe a potencia stand-by em kW ou kVA para ativar o gerador.',
    );
  }

  const nonNegativeFields = [
    'standbyPowerKw',
    'standbyPowerKva',
    'primePowerKw',
    'primePowerKva',
    'continuousPowerKw',
    'continuousPowerKva',
    'stockQuantity',
    'leadTimeDays',
    'costPrice',
    'basePrice',
    'suggestedPrice',
    'minimumPrice',
    'taxPercentage',
  ];
  for (const field of nonNegativeFields) {
    if (
      data[field] !== null &&
      data[field] !== undefined &&
      Number(data[field]) < 0
    ) {
      throw new BadRequestException(`${field} nao pode ser negativo.`);
    }
  }
  if (
    'powerFactor' in data &&
    (Number(data.powerFactor) <= 0 || Number(data.powerFactor) > 1)
  ) {
    throw new BadRequestException(
      'Fator de potencia deve ser maior que 0 e menor ou igual a 1.',
    );
  }
  if ('taxPercentage' in data && Number(data.taxPercentage) > 100) {
    throw new BadRequestException('Imposto deve ficar entre 0 e 100%.');
  }
  for (const field of ['frequencyHz', 'stockQuantity', 'leadTimeDays']) {
    if (
      data[field] !== null &&
      data[field] !== undefined &&
      !Number.isInteger(Number(data[field]))
    ) {
      throw new BadRequestException(`${field} deve ser um numero inteiro.`);
    }
  }
}

function validateCommercialSizingPolicy(
  data: Record<string, unknown>,
  creating: boolean,
) {
  const name = typeof data.name === 'string' ? data.name : '';
  if ((creating || 'name' in data) && !name.trim()) {
    throw new BadRequestException('Nome da politica e obrigatorio.');
  }
  if (
    'version' in data &&
    (!Number.isInteger(Number(data.version)) || Number(data.version) < 1)
  ) {
    throw new BadRequestException('Versao deve ser maior ou igual a 1.');
  }
  if (
    'defaultPowerFactor' in data &&
    (Number(data.defaultPowerFactor) <= 0 ||
      Number(data.defaultPowerFactor) > 1)
  ) {
    throw new BadRequestException(
      'Fator de potencia padrao deve ser maior que 0 e menor ou igual a 1.',
    );
  }
  for (const [field, value] of Object.entries(data)) {
    if (
      (field.endsWith('Percent') || field === 'engineeringReviewAboveKw') &&
      value !== null &&
      Number(value) < 0
    ) {
      throw new BadRequestException(`${field} nao pode ser negativo.`);
    }
  }
  const min = data.idealReserveMinPercent;
  const max = data.idealReserveMaxPercent;
  if (min !== undefined && max !== undefined && Number(max) < Number(min)) {
    throw new BadRequestException(
      'Reserva maxima nao pode ser menor que a reserva minima.',
    );
  }
}
