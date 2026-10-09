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

describe('StudioService payment profile issuer', () => {
  const actor = { sub: 'user-1', role: 'ADMIN' };

  function createContext() {
    const tx = {
      companySettings: { findUnique: jest.fn() },
      proposalPaymentProfile: { create: jest.fn() },
      systemAuditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };
    tx.proposalPaymentProfile.create.mockImplementation(({ data }) => ({
      id: 'profile-1',
      ...data,
    }));
    const service = new StudioService(prisma as unknown as DatabaseService);
    const profile = {
      name: 'PIX servicos',
      purpose: 'SERVICES',
      method: 'PIX',
      beneficiary: 'Empresa teste',
      beneficiaryDocument: '12.345.678/0001-90',
      issuerCompanyId: 'issuer-1',
      pixKey: 'chave-teste',
      pixCopyPaste: 'codigo-teste',
      isActive: true,
    };
    return { tx, service, profile };
  }

  it('rejects an active account with a different beneficiary CNPJ', async () => {
    const { tx, service, profile } = createContext();
    tx.companySettings.findUnique.mockResolvedValue({
      cnpj: '98.765.432/0001-10',
    });

    await expect(
      service.createRecord('proposalPaymentProfiles', profile, actor),
    ).rejects.toThrow('O CNPJ do favorecido deve ser igual');
    expect(tx.proposalPaymentProfile.create).not.toHaveBeenCalled();
  });

  it('requires an issuer before activating an account', async () => {
    const { tx, service, profile } = createContext();

    await expect(
      service.createRecord(
        'proposalPaymentProfiles',
        {
          ...profile,
          issuerCompanyId: '',
        },
        actor,
      ),
    ).rejects.toThrow('Selecione o CNPJ emitente');
    expect(tx.proposalPaymentProfile.create).not.toHaveBeenCalled();
  });

  it('saves a matching issuer and beneficiary', async () => {
    const { tx, service, profile } = createContext();
    tx.companySettings.findUnique.mockResolvedValue({ cnpj: '12345678000190' });

    const created = await service.createRecord(
      'proposalPaymentProfiles',
      profile,
      actor,
    );

    expect(created.issuerCompanyId).toBe('issuer-1');
    expect(tx.proposalPaymentProfile.create).toHaveBeenCalled();
    expect(tx.systemAuditLog.create).toHaveBeenCalled();
  });

  it('uses the issuer CNPJ as the beneficiary document and PIX key without requiring QR Code data', async () => {
    const { tx, service, profile } = createContext();
    tx.companySettings.findUnique.mockResolvedValue({
      companyName: 'Manitec Energia Equipamentos Ltda',
      cnpj: '39.315.244/0001-07',
    });

    const created = await service.createRecord(
      'proposalPaymentProfiles',
      { ...profile, beneficiary: '', beneficiaryDocument: '', pixKey: '', pixCopyPaste: '' },
      actor,
    );

    expect(created.beneficiary).toBe('Manitec Energia Equipamentos Ltda');
    expect(created.beneficiaryDocument).toBe('39315244000107');
    expect(created.pixKey).toBe('39315244000107');
    expect(created.pixCopyPaste).toBeNull();
  });
});
