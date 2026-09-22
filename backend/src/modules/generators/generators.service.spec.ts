import {
  MaintenanceIntervalUnit,
  MaintenanceTemplateCategory,
  ServiceGroup,
} from '@prisma/client';
import { GeneratorsService } from './generators.service';

describe('GeneratorsService', () => {
  let service: GeneratorsService;
  let db: {
    $transaction: jest.Mock;
    catalogItem: { findMany: jest.Mock };
    client: { findUnique: jest.Mock };
    generatorModel: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    generatorModelMaintenanceTemplate: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    modelBaseItem: {
      create: jest.Mock;
      createMany: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    generatorBaseItem: {
      create: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    site: { findUnique: jest.Mock };
    generator: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    db = {
      $transaction: jest.fn((callback: (tx: typeof db) => unknown) =>
        callback(db),
      ),
      catalogItem: { findMany: jest.fn() },
      client: { findUnique: jest.fn() },
      generatorModel: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      generatorModelMaintenanceTemplate: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      modelBaseItem: {
        create: jest.fn(),
        createMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      generatorBaseItem: {
        create: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      site: { findUnique: jest.fn() },
      generator: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    service = new GeneratorsService(db as never);
  });

  it('creates a generator with optional technical master data', async () => {
    db.client.findUnique.mockResolvedValue({ id: 'client-1' });
    db.generatorModel.findUnique.mockResolvedValue({ id: 'model-1' });
    db.site.findUnique.mockResolvedValue({
      id: 'site-1',
      clientId: 'client-1',
    });
    db.generator.findUnique.mockResolvedValue(null);
    db.generator.create.mockResolvedValue({ id: 'generator-1' });

    await service.create(
      {
        clientId: 'client-1',
        currentSiteId: 'site-1',
        modelId: 'model-1',
        name: 'GMG Principal',
        brand: 'Cummins',
        serialNumber: 'SN-123',
        power: 500,
        voltage: '380/220 V',
        frequencyHz: 60,
        engineBrand: 'Cummins',
        engineModelName: 'QSB6.7',
        alternatorBrand: 'Stamford',
        hasTransferSwitch: true,
        batteryQuantity: 2,
        batteryInstallationDate: '2026-07-01',
      },
      'user-1',
    );

    expect(db.generator.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'GMG Principal',
        clientId: 'client-1',
        currentSiteId: 'site-1',
        voltage: '380/220 V',
        frequencyHz: 60,
        engineBrand: 'Cummins',
        engineModelName: 'QSB6.7',
        alternatorBrand: 'Stamford',
        hasTransferSwitch: true,
        batteryQuantity: 2,
        batteryInstallationDate: new Date('2026-07-01'),
      }),
    });
  });

  it('updates technical fields without requiring existing generators to have them', async () => {
    db.generator.findUnique
      .mockResolvedValueOnce({
        id: 'generator-1',
        clientId: 'client-1',
        name: 'GMG Antigo',
      })
      .mockResolvedValueOnce({ id: 'generator-1', clientId: 'client-1' });
    db.generator.update.mockResolvedValue({ id: 'generator-1' });

    await service.update('generator-1', {
      name: 'GMG Revisado',
      voltage: '440 V',
      engineCylinders: 6,
      lastOilChangeAt: '2026-07-10',
      hasTransferSwitch: false,
    });

    expect(db.generator.update).toHaveBeenCalledWith({
      where: { id: 'generator-1' },
      data: expect.objectContaining({
        name: 'GMG Revisado',
        voltage: '440 V',
        engineCylinders: 6,
        lastOilChangeAt: new Date('2026-07-10'),
        hasTransferSwitch: false,
      }),
    });
  });

  it('lists a compact operational summary without legacy technical data', async () => {
    db.generator.findMany.mockResolvedValue([]);

    await service.findAll();

    const query = db.generator.findMany.mock.calls[0][0];
    expect(query).not.toHaveProperty('include');
    expect(query.select).toEqual(
      expect.objectContaining({
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
        orders: expect.objectContaining({
          take: 1,
          select: {
            id: true,
            title: true,
            status: true,
            finishedAt: true,
            updatedAt: true,
          },
        }),
        contractSchedules: expect.objectContaining({ take: 1 }),
        contractLinks: expect.objectContaining({ take: 1 }),
        serviceTickets: expect.objectContaining({
          take: 3,
          select: { id: true, title: true, status: true },
        }),
      }),
    );
    expect(query.select).not.toHaveProperty('legacyTechnicalData');
    expect(query.select).not.toHaveProperty('engineSerialNumber');
  });

  it('loads an old generator model even when it has no maintenance plan', async () => {
    db.generatorModel.findUnique.mockResolvedValue({
      id: 'model-legacy',
      name: 'Legacy 180',
      maintenanceTemplates: [],
      baseItems: [],
    });

    await expect(service.findModelById('model-legacy')).resolves.toEqual(
      expect.objectContaining({
        id: 'model-legacy',
        maintenanceTemplates: [],
      }),
    );
  });

  it('updates generator model fields and maintenance template items', async () => {
    db.generatorModel.findUnique
      .mockResolvedValueOnce({ id: 'model-1', name: 'ST 180' })
      .mockResolvedValueOnce({
        id: 'model-1',
        name: 'ST 180 Revisado',
        maintenanceTemplates: [],
        baseItems: [],
      });
    db.generatorModel.findFirst.mockResolvedValue(null);
    db.generatorModel.update.mockResolvedValue({ id: 'model-1' });
    db.generatorModelMaintenanceTemplate.findUnique.mockResolvedValue({
      id: 'maintenance-1',
      generatorModelId: 'model-1',
    });

    await service.updateModel('model-1', {
      name: 'ST 180 Revisado',
      brand: 'STEMAC',
      defaultPowerKva: 180,
      defaultVoltage: '380/220 V',
      frequencyHz: 60,
      isActive: true,
      maintenanceTemplates: [
        {
          name: 'Troca de oleo',
          category: MaintenanceTemplateCategory.OIL,
          intervalValue: 6,
          intervalUnit: MaintenanceIntervalUnit.MONTHS,
          hourMeterInterval: 250,
          required: true,
          active: true,
          sortOrder: 1,
          notes: 'Utilizar oleo recomendado pelo fabricante.',
        },
        {
          id: 'maintenance-1',
          name: 'Teste com carga',
          category: MaintenanceTemplateCategory.TEST,
          required: false,
          active: false,
          sortOrder: 2,
        },
      ],
    });

    expect(db.generatorModel.update).toHaveBeenCalledWith({
      where: { id: 'model-1' },
      data: expect.objectContaining({
        name: 'ST 180 Revisado',
        brand: 'STEMAC',
        defaultPowerKva: 180,
        defaultVoltage: '380/220 V',
        frequencyHz: 60,
        isActive: true,
      }),
    });
    expect(db.generatorModelMaintenanceTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        generatorModelId: 'model-1',
        name: 'Troca de oleo',
        category: 'OIL',
        intervalValue: 6,
        intervalUnit: 'MONTHS',
        hourMeterInterval: 250,
      }),
    });
    expect(db.generatorModelMaintenanceTemplate.update).toHaveBeenCalledWith({
      where: { id: 'maintenance-1' },
      data: expect.objectContaining({
        name: 'Teste com carga',
        active: false,
      }),
    });
  });

  it('does not allow editing a maintenance template item from another model', async () => {
    db.generatorModel.findUnique.mockResolvedValue({ id: 'model-1' });
    db.generatorModel.findFirst.mockResolvedValue(null);
    db.generatorModel.update.mockResolvedValue({ id: 'model-1' });
    db.generatorModelMaintenanceTemplate.findUnique.mockResolvedValue({
      id: 'maintenance-other',
      generatorModelId: 'model-2',
    });

    await expect(
      service.updateModel('model-1', {
        maintenanceTemplates: [
          {
            id: 'maintenance-other',
            name: 'Filtro de oleo',
            category: MaintenanceTemplateCategory.FILTER,
          },
        ],
      }),
    ).rejects.toThrow('Item de manutencao nao pertence a este modelo.');
  });

  it('rejects duplicate generator model names before editing', async () => {
    db.generatorModel.findUnique.mockResolvedValue({ id: 'model-1' });
    db.generatorModel.findFirst.mockResolvedValue({ id: 'model-2' });

    await expect(
      service.updateModel('model-1', { name: 'Modelo duplicado' }),
    ).rejects.toThrow('Ja existe um modelo com este nome.');
    expect(db.generatorModel.update).not.toHaveBeenCalled();
  });

  it('updates model base items without recreating stable records', async () => {
    db.generatorModel.findUnique.mockResolvedValue({ id: 'model-1' });
    db.catalogItem.findMany.mockResolvedValue([{ id: 'catalog-1' }]);
    db.modelBaseItem.findMany
      .mockResolvedValueOnce([
        {
          id: 'base-1',
          modelId: 'model-1',
          catalogItemId: 'catalog-1',
          serviceGroup: ServiceGroup.TOF,
          defaultQuantity: 1,
        },
      ])
      .mockResolvedValueOnce([]);

    await service.upsertModelBaseItems('model-1', [
      {
        catalogItemId: 'catalog-1',
        serviceGroup: ServiceGroup.TOF,
        defaultQuantity: 2,
      },
    ]);

    expect(db.modelBaseItem.update).toHaveBeenCalledWith({
      where: { id: 'base-1' },
      data: { defaultQuantity: 2 },
    });
    expect(db.modelBaseItem.deleteMany).not.toHaveBeenCalled();
    expect(db.modelBaseItem.create).not.toHaveBeenCalled();
  });

  it('synchronizes new model items while preserving machine customizations', async () => {
    db.generator.findUnique.mockResolvedValue({
      id: 'generator-1',
      modelId: 'model-1',
    });
    db.modelBaseItem.findMany.mockResolvedValue([
      {
        id: 'model-item-custom',
        catalogItemId: 'catalog-custom',
        serviceGroup: ServiceGroup.TOF,
        defaultQuantity: 1,
      },
      {
        id: 'model-item-conflict',
        catalogItemId: 'catalog-manual',
        serviceGroup: ServiceGroup.TOF,
        defaultQuantity: 1,
      },
      {
        id: 'model-item-new',
        catalogItemId: 'catalog-new',
        serviceGroup: ServiceGroup.TBC,
        defaultQuantity: 2,
      },
    ]);
    db.generatorBaseItem.findMany
      .mockResolvedValueOnce([
        {
          id: 'machine-custom',
          generatorId: 'generator-1',
          catalogItemId: 'catalog-custom',
          serviceGroup: ServiceGroup.TOF,
          quantity: 4,
          sourceModelBaseItemId: 'model-item-custom',
          sourceModelDefaultQuantity: 1,
          isCustomized: true,
        },
        {
          id: 'machine-manual',
          generatorId: 'generator-1',
          catalogItemId: 'catalog-manual',
          serviceGroup: ServiceGroup.TOF,
          quantity: 3,
          sourceModelBaseItemId: null,
          sourceModelDefaultQuantity: null,
          isCustomized: false,
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await service.applyModelBaseItems(
      'generator-1',
      false,
      true,
    );

    expect(result).toEqual(
      expect.objectContaining({
        summary: {
          added: 1,
          updated: 0,
          preserved: 1,
          conflicts: 1,
        },
      }),
    );
    expect(db.generatorBaseItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        generatorId: 'generator-1',
        catalogItemId: 'catalog-new',
        serviceGroup: ServiceGroup.TBC,
        quantity: 2,
        sourceModelBaseItemId: 'model-item-new',
      }),
    });
    expect(db.generatorBaseItem.delete).not.toHaveBeenCalled();
  });
});
