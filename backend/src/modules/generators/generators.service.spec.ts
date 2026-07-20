import { GeneratorsService } from './generators.service';

describe('GeneratorsService', () => {
  let service: GeneratorsService;
  let db: {
    $transaction: jest.Mock;
    client: { findUnique: jest.Mock };
    generatorModel: { findUnique: jest.Mock };
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
      client: { findUnique: jest.fn() },
      generatorModel: { findUnique: jest.fn() },
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
});
