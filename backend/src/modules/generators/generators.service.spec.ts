import {
  MaintenanceIntervalUnit,
  MaintenanceTemplateCategory,
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
      createMany: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
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
        createMany: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
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

  it('lists operational summary with limited relationships', async () => {
    db.generator.findMany.mockResolvedValue([]);

    await service.findAll();

    expect(db.generator.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          client: expect.any(Object),
          model: expect.any(Object),
          currentSite: expect.any(Object),
          orders: expect.objectContaining({ take: 1 }),
          contractSchedules: expect.objectContaining({ take: 1 }),
          contractLinks: expect.objectContaining({ take: 1 }),
          serviceTickets: expect.objectContaining({ take: 3 }),
        }),
      }),
    );
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
});
