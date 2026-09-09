import { BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { StudioService } from './studio.service';

describe('StudioService commercial delivery 01', () => {
  const actor = { sub: 'user-1', role: 'ADMIN' };

  function createContext() {
    const tx = {
      commercialGenerator: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      commercialSizingPolicy: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      systemAuditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };
    return {
      tx,
      service: new StudioService(prisma as unknown as DatabaseService),
    };
  }

  it('creates only a Generac commercial generator and normalizes list fields', async () => {
    const { service, tx } = createContext();
    tx.commercialGenerator.create.mockImplementation(({ data }) => ({
      id: 'commercial-generator-1',
      ...data,
    }));

    const created = await service.createRecord(
      'commercialGenerators',
      {
        internalCode: ' G007 ',
        model: ' Guardian 22 kW ',
        fuelType: 'NATURAL_GAS',
        construction: 'SOUND_ATTENUATED',
        standbyPowerKw: 22,
        availableVoltages: '220 V, 380 V; 440 V',
        availablePhaseConfigs: 'MONOPHASE, THREE_PHASE',
        basePrice: 85000,
      },
      actor,
    );

    expect(created.manufacturer).toBe('Generac');
    expect(tx.commercialGenerator.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        internalCode: 'G007',
        model: 'Guardian 22 kW',
        manufacturer: 'Generac',
        availableVoltages: ['220 V', '380 V', '440 V'],
        availablePhaseConfigs: ['MONOPHASE', 'THREE_PHASE'],
      }),
    });
    expect(tx.systemAuditLog.create).toHaveBeenCalled();
  });

  it('rejects negative commercial prices', async () => {
    const { service } = createContext();

    await expect(
      service.createRecord(
        'commercialGenerators',
        {
          internalCode: 'G008',
          model: 'Guardian',
          fuelType: 'NATURAL_GAS',
          construction: 'SOUND_ATTENUATED',
          standbyPowerKw: 22,
          minimumPrice: -1,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps only one active default sizing policy', async () => {
    const { service, tx } = createContext();
    tx.commercialSizingPolicy.create.mockImplementation(({ data }) => ({
      id: 'policy-2',
      ...data,
    }));

    await service.createRecord(
      'commercialSizingPolicies',
      {
        name: 'Politica revisada',
        version: 2,
        isDefault: true,
        isActive: true,
        standardMarginPercent: 20,
        idealReserveMinPercent: 10,
        idealReserveMaxPercent: 35,
      },
      actor,
    );

    expect(tx.commercialSizingPolicy.updateMany).toHaveBeenCalledWith({
      where: { isDefault: true, isActive: true },
      data: { isDefault: false },
    });
  });
});
