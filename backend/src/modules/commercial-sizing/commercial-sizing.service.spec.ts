import { NotFoundException } from '@nestjs/common';
import {
  CommercialGeneratorAvailability,
  CommercialGeneratorConstruction,
  CommercialGeneratorFuel,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { CommercialSizingService } from './commercial-sizing.service';
import {
  CommercialGeneratorApplication,
  CommercialInstallationLocation,
  CommercialLoadType,
  CommercialPhaseConfiguration,
  CommercialPowerUnit,
  CommercialSizingPriority,
  RecommendCommercialGeneratorDto,
} from './dto/commercial-sizing.dto';

describe('CommercialSizingService', () => {
  const policy = {
    id: 'policy-1',
    name: 'Politica padrao',
    version: 1,
    isDefault: true,
    isActive: true,
    defaultPowerFactor: 0.8,
    standardMarginPercent: 20,
    resistiveMarginPercent: 15,
    motorsMarginPercent: 30,
    pumpsMarginPercent: 30,
    airConditioningMarginPercent: 30,
    elevatorsMarginPercent: 35,
    electronicsMarginPercent: 20,
    mixedLoadMarginPercent: 25,
    unknownLoadMarginPercent: 30,
    idealReserveMinPercent: 10,
    idealReserveMaxPercent: 35,
    engineeringReviewAboveKw: 100,
    requireEngineeringSpecialLoads: true,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const baseInput: RecommendCommercialGeneratorDto = {
    power: 20,
    powerUnit: CommercialPowerUnit.KW,
    voltage: '220 V',
    phaseConfiguration: CommercialPhaseConfiguration.TWO_PHASE,
    frequencyHz: 60,
    loadType: CommercialLoadType.MIXED,
    application: CommercialGeneratorApplication.STANDBY,
    installationLocation: CommercialInstallationLocation.OUTDOOR,
  };

  function generator(
    id: string,
    standbyPowerKw: number,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id,
      internalCode: id.toUpperCase(),
      manufacturer: 'Generac',
      line: 'Guardian',
      model: `Modelo ${standbyPowerKw}`,
      shortDescription: null,
      isActive: true,
      standbyPowerKw,
      standbyPowerKva: standbyPowerKw / 0.8,
      primePowerKw: standbyPowerKw,
      primePowerKva: standbyPowerKw / 0.8,
      continuousPowerKw: standbyPowerKw,
      continuousPowerKva: standbyPowerKw / 0.8,
      powerFactor: 0.8,
      frequencyHz: 60,
      availableVoltages: ['220 V'],
      availablePhaseConfigs: ['Bifasico'],
      fuelType: CommercialGeneratorFuel.NATURAL_GAS,
      construction: CommercialGeneratorConstruction.SOUND_ATTENUATED,
      supportsIndoor: true,
      supportsOutdoor: true,
      availability: CommercialGeneratorAvailability.AVAILABLE_TO_ORDER,
      stockQuantity: 0,
      leadTimeDays: 30,
      currency: 'BRL',
      costPrice: 0,
      basePrice: 90000,
      suggestedPrice: 100000,
      minimumPrice: 85000,
      taxPercentage: 0,
      engineDescription: null,
      alternatorDescription: null,
      controllerDescription: null,
      enclosureDescription: null,
      standardAccessories: null,
      commercialNotes: null,
      technicalNotes: null,
      catalogItemId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function setup(
    generators: ReturnType<typeof generator>[],
    policyResult: typeof policy | null = policy,
  ) {
    const prisma = {
      commercialSizingPolicy: {
        findFirst: jest.fn().mockResolvedValue(policyResult),
      },
      commercialGenerator: {
        findMany: jest.fn().mockResolvedValue(generators),
      },
    };
    return {
      service: new CommercialSizingService(
        prisma as unknown as DatabaseService,
      ),
      prisma,
    };
  }

  it('exposes the sale price without leaking cost or minimum price in the catalog', async () => {
    const { service } = setup([generator('g25', 25)]);

    const [result] = await service.listCommercialCatalog();

    expect(result.commercialPrice).toBe(100000);
    expect(result).not.toHaveProperty('costPrice');
    expect(result).not.toHaveProperty('minimumPrice');
  });

  it('normalizes kW, applies the load margin and excludes insufficient power', async () => {
    const { service } = setup([generator('g22', 22), generator('g25', 25)]);

    const result = await service.recommend(baseInput);

    expect(result.calculation).toEqual({
      requestedPowerKw: 20,
      appliedPowerFactor: 0.8,
      marginPercent: 25,
      requiredPowerKw: 25,
    });
    expect(result.recommended?.id).toBe('g25');
    expect(result.recommended?.reservePercent).toBe(25);
    expect(result.excluded).toEqual({ INSUFFICIENT_POWER: 1 });
  });

  it('uses the policy power factor when the request is provided in kVA', async () => {
    const { service } = setup([generator('g25', 25)]);

    const result = await service.recommend({
      ...baseInput,
      power: 25,
      powerUnit: CommercialPowerUnit.KVA,
      loadType: CommercialLoadType.RESISTIVE,
    });

    expect(result.calculation.requestedPowerKw).toBe(20);
    expect(result.calculation.requiredPowerKw).toBe(23);
    expect(result.calculation.appliedPowerFactor).toBe(0.8);
  });

  it('converts watts to kW before applying the configured margin', async () => {
    const { service } = setup([generator('g25', 25)]);

    const result = await service.recommend({
      ...baseInput,
      power: 20000,
      powerUnit: CommercialPowerUnit.W,
    });

    expect(result.calculation.requestedPowerKw).toBe(20);
    expect(result.calculation.requiredPowerKw).toBe(25);
  });

  it('filters incompatible voltage, phases and frequency before ranking', async () => {
    const { service } = setup([
      generator('wrong-voltage', 30, { availableVoltages: ['380 V'] }),
      generator('wrong-phase', 30, { availablePhaseConfigs: ['Trifasico'] }),
      generator('wrong-frequency', 30, { frequencyHz: 50 }),
      generator('compatible', 30),
    ]);

    const result = await service.recommend(baseInput);

    expect(result.candidates.map((item) => item.id)).toEqual(['compatible']);
    expect(result.excluded).toEqual({
      INCOMPATIBLE_VOLTAGE: 1,
      INCOMPATIBLE_PHASES: 1,
      INCOMPATIBLE_FREQUENCY: 1,
    });
  });

  it('flags special loads for engineering review without blocking a recommendation', async () => {
    const { service } = setup([generator('g30', 30)]);

    const result = await service.recommend({
      ...baseInput,
      loadType: CommercialLoadType.MOTORS,
    });

    expect(result.recommended?.id).toBe('g30');
    expect(result.requiresEngineeringReview).toBe(true);
    expect(result.engineeringReviewReasons[0]).toContain('Carga especial');
  });

  it('never recommends a generator marked as commercially unavailable', async () => {
    const { service } = setup([
      generator('unavailable', 25, {
        availability: CommercialGeneratorAvailability.UNAVAILABLE,
      }),
      generator('available', 30),
    ]);

    const result = await service.recommend(baseInput);

    expect(result.recommended?.id).toBe('available');
    expect(result.excluded.COMMERCIALLY_UNAVAILABLE).toBe(1);
  });

  it('changes the ranking when lowest price is the commercial priority', async () => {
    const closeFit = generator('close-fit', 25, { suggestedPrice: 100000 });
    const lowerPrice = generator('lower-price', 30, { suggestedPrice: 80000 });
    const { service } = setup([closeFit, lowerPrice]);

    const sizingResult = await service.recommend({
      ...baseInput,
      priority: CommercialSizingPriority.BEST_SIZING,
    });
    const priceResult = await service.recommend({
      ...baseInput,
      priority: CommercialSizingPriority.LOWEST_PRICE,
    });

    expect(sizingResult.recommended?.id).toBe('close-fit');
    expect(priceResult.recommended?.id).toBe('lower-price');
  });

  it('fails clearly when the Studio has no active sizing policy', async () => {
    const { service } = setup([], null);

    await expect(service.recommend(baseInput)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
