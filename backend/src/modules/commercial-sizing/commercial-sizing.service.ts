import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CommercialGenerator,
  CommercialGeneratorAvailability,
  CommercialSizingPolicy,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import {
  CommercialConstructionPreference,
  CommercialFuelPreference,
  CommercialGeneratorApplication,
  CommercialInstallationLocation,
  CommercialLoadType,
  CommercialPowerUnit,
  CommercialSizingPriority,
  RecommendCommercialGeneratorDto,
} from './dto/commercial-sizing.dto';

type RankedCandidate = {
  id: string;
  internalCode: string;
  manufacturer: string;
  line: string | null;
  model: string;
  description: string | null;
  fuelType: string;
  construction: string;
  capacityKw: number;
  capacityKva: number | null;
  reservePercent: number;
  availability: CommercialGeneratorAvailability;
  stockQuantity: number;
  leadTimeDays: number | null;
  currency: string;
  commercialPrice: number;
  score: number;
  reasons: string[];
  warnings: string[];
};

@Injectable()
export class CommercialSizingService {
  constructor(private readonly prisma: DatabaseService) {}

  async listCommercialCatalog(query?: string) {
    const search = query?.trim();
    const generators = await this.prisma.commercialGenerator.findMany({
      where: {
        isActive: true,
        availability: { not: CommercialGeneratorAvailability.UNAVAILABLE },
        ...(search
          ? {
              OR: [
                { internalCode: { contains: search, mode: 'insensitive' } },
                { model: { contains: search, mode: 'insensitive' } },
                { line: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ standbyPowerKw: 'asc' }, { model: 'asc' }],
      take: 100,
    });

    return generators.map((generator) => ({
      id: generator.id,
      internalCode: generator.internalCode,
      manufacturer: generator.manufacturer,
      line: generator.line,
      model: generator.model,
      description: generator.shortDescription,
      standbyPowerKw: generator.standbyPowerKw,
      standbyPowerKva: generator.standbyPowerKva,
      primePowerKw: generator.primePowerKw,
      primePowerKva: generator.primePowerKva,
      frequencyHz: generator.frequencyHz,
      availableVoltages: generator.availableVoltages,
      availablePhaseConfigs: generator.availablePhaseConfigs,
      fuelType: generator.fuelType,
      construction: generator.construction,
      availability: generator.availability,
      stockQuantity: generator.stockQuantity,
      leadTimeDays: generator.leadTimeDays,
      currency: generator.currency,
      commercialPrice:
        generator.suggestedPrice > 0
          ? generator.suggestedPrice
          : generator.basePrice,
    }));
  }

  async recommend(dto: RecommendCommercialGeneratorDto) {
    const policy = await this.resolvePolicy(dto.policyId);
    const powerFactor = dto.powerFactor ?? policy.defaultPowerFactor;
    const requestedPowerKw = this.normalizePower(
      dto.power,
      dto.powerUnit,
      powerFactor,
    );
    const marginPercent = this.marginForLoad(policy, dto.loadType);
    const requiredPowerKw = requestedPowerKw * (1 + marginPercent / 100);
    const generators = await this.prisma.commercialGenerator.findMany({
      where: { isActive: true },
      orderBy: [{ standbyPowerKw: 'asc' }, { model: 'asc' }],
    });

    const excluded: Record<string, number> = {};
    const candidates = generators
      .map((generator) =>
        this.evaluateGenerator(
          generator,
          dto,
          requestedPowerKw,
          requiredPowerKw,
          policy,
          excluded,
        ),
      )
      .filter((candidate): candidate is RankedCandidate => Boolean(candidate));

    this.applyPriorityScores(
      candidates,
      dto.priority ?? CommercialSizingPriority.BEST_SIZING,
      policy,
    );
    candidates.sort(
      (a, b) =>
        b.score - a.score ||
        a.commercialPrice - b.commercialPrice ||
        a.capacityKw - b.capacityKw ||
        a.model.localeCompare(b.model),
    );

    const engineeringReasons = this.engineeringReviewReasons(
      dto,
      requestedPowerKw,
      policy,
    );
    const limitedCandidates = candidates
      .slice(0, dto.maxResults ?? 5)
      .map((candidate, index) => ({
        ...candidate,
        rank: index + 1,
        classification: index === 0 ? 'RECOMMENDED' : 'ALTERNATIVE',
        score: round(candidate.score, 2),
        capacityKw: round(candidate.capacityKw, 3),
        capacityKva:
          candidate.capacityKva === null
            ? null
            : round(candidate.capacityKva, 3),
        reservePercent: round(candidate.reservePercent, 2),
      }));

    return {
      disclaimer:
        'Pre-dimensionamento comercial. A recomendacao nao substitui calculo definitivo de engenharia.',
      requiresEngineeringReview: engineeringReasons.length > 0,
      engineeringReviewReasons: engineeringReasons,
      input: {
        ...dto,
        fuelPreference: dto.fuelPreference ?? CommercialFuelPreference.ANY,
        constructionPreference:
          dto.constructionPreference ?? CommercialConstructionPreference.ANY,
        priority: dto.priority ?? CommercialSizingPriority.BEST_SIZING,
      },
      calculation: {
        requestedPowerKw: round(requestedPowerKw, 3),
        appliedPowerFactor: powerFactor,
        marginPercent,
        requiredPowerKw: round(requiredPowerKw, 3),
      },
      policy: {
        id: policy.id,
        name: policy.name,
        version: policy.version,
      },
      recommended: limitedCandidates[0] ?? null,
      candidates: limitedCandidates,
      excluded,
    };
  }

  private async resolvePolicy(policyId?: string) {
    const policy = policyId
      ? await this.prisma.commercialSizingPolicy.findFirst({
          where: { id: policyId, isActive: true },
        })
      : await this.prisma.commercialSizingPolicy.findFirst({
          where: { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        });

    if (!policy) {
      throw new NotFoundException(
        policyId
          ? 'Politica de pre-dimensionamento nao encontrada ou inativa.'
          : 'Nenhuma politica ativa de pre-dimensionamento foi configurada no Manitec Studio.',
      );
    }
    return policy;
  }

  private normalizePower(
    power: number,
    unit: CommercialPowerUnit,
    powerFactor: number,
  ) {
    if (!Number.isFinite(power) || power <= 0) {
      throw new BadRequestException(
        'Potencia informada deve ser maior que zero.',
      );
    }
    if (!Number.isFinite(powerFactor) || powerFactor <= 0 || powerFactor > 1) {
      throw new BadRequestException('Fator de potencia invalido.');
    }
    if (unit === CommercialPowerUnit.W) return power / 1000;
    if (unit === CommercialPowerUnit.KVA) return power * powerFactor;
    return power;
  }

  private marginForLoad(
    policy: CommercialSizingPolicy,
    loadType: CommercialLoadType,
  ) {
    const margins: Record<CommercialLoadType, number> = {
      [CommercialLoadType.RESISTIVE]: policy.resistiveMarginPercent,
      [CommercialLoadType.MOTORS]: policy.motorsMarginPercent,
      [CommercialLoadType.PUMPS]: policy.pumpsMarginPercent,
      [CommercialLoadType.AIR_CONDITIONING]:
        policy.airConditioningMarginPercent,
      [CommercialLoadType.ELEVATORS]: policy.elevatorsMarginPercent,
      [CommercialLoadType.IT_ELECTRONICS]: policy.electronicsMarginPercent,
      [CommercialLoadType.MIXED]: policy.mixedLoadMarginPercent,
      [CommercialLoadType.UNKNOWN]: policy.unknownLoadMarginPercent,
    };
    return margins[loadType] ?? policy.standardMarginPercent;
  }

  private evaluateGenerator(
    generator: CommercialGenerator,
    dto: RecommendCommercialGeneratorDto,
    requestedPowerKw: number,
    requiredPowerKw: number,
    policy: CommercialSizingPolicy,
    excluded: Record<string, number>,
  ): RankedCandidate | null {
    const exclude = (reason: string) => {
      excluded[reason] = (excluded[reason] ?? 0) + 1;
      return null;
    };
    const capacity = this.capacityForApplication(generator, dto.application);
    if (!capacity || capacity.kw < requiredPowerKw)
      return exclude('INSUFFICIENT_POWER');
    if (
      generator.availability === CommercialGeneratorAvailability.UNAVAILABLE
    ) {
      return exclude('COMMERCIALLY_UNAVAILABLE');
    }
    if (!this.matchesVoltage(generator.availableVoltages, dto.voltage)) {
      return exclude('INCOMPATIBLE_VOLTAGE');
    }
    if (
      !this.matchesPhase(
        generator.availablePhaseConfigs,
        dto.phaseConfiguration,
      )
    ) {
      return exclude('INCOMPATIBLE_PHASES');
    }
    if (generator.frequencyHz !== dto.frequencyHz)
      return exclude('INCOMPATIBLE_FREQUENCY');
    if (
      dto.fuelPreference &&
      dto.fuelPreference !== CommercialFuelPreference.ANY &&
      generator.fuelType !== dto.fuelPreference
    ) {
      return exclude('INCOMPATIBLE_FUEL');
    }
    if (
      dto.constructionPreference &&
      dto.constructionPreference !== CommercialConstructionPreference.ANY &&
      generator.construction !== dto.constructionPreference
    ) {
      return exclude('INCOMPATIBLE_CONSTRUCTION');
    }
    if (
      dto.installationLocation === CommercialInstallationLocation.INDOOR &&
      !generator.supportsIndoor
    ) {
      return exclude('INCOMPATIBLE_INSTALLATION_LOCATION');
    }
    if (
      dto.installationLocation === CommercialInstallationLocation.OUTDOOR &&
      !generator.supportsOutdoor
    ) {
      return exclude('INCOMPATIBLE_INSTALLATION_LOCATION');
    }

    const reservePercent = (capacity.kw / requestedPowerKw - 1) * 100;
    const reasons = [
      `Atende ${round(requiredPowerKw, 2)} kW requeridos para a margem configurada.`,
      `Compativel com ${dto.voltage} e ${dto.phaseConfiguration}.`,
      `Compativel com aplicacao ${dto.application}.`,
    ];
    const warnings: string[] = [];
    if (generator.availability === CommercialGeneratorAvailability.IN_STOCK) {
      reasons.push(`Disponivel em estoque (${generator.stockQuantity}).`);
    } else if (generator.leadTimeDays === null) {
      warnings.push('Prazo de entrega sob consulta.');
    }
    const commercialPrice =
      generator.suggestedPrice > 0
        ? generator.suggestedPrice
        : generator.basePrice;
    if (commercialPrice <= 0) {
      warnings.push('Preco comercial sob consulta.');
    }
    if (
      reservePercent >= policy.idealReserveMinPercent &&
      reservePercent <= policy.idealReserveMaxPercent
    ) {
      reasons.push('Reserva de potencia dentro da faixa ideal configurada.');
    } else if (reservePercent > policy.idealReserveMaxPercent) {
      warnings.push('Reserva acima da faixa ideal configurada.');
    }

    return {
      id: generator.id,
      internalCode: generator.internalCode,
      manufacturer: generator.manufacturer,
      line: generator.line,
      model: generator.model,
      description: generator.shortDescription,
      fuelType: generator.fuelType,
      construction: generator.construction,
      capacityKw: capacity.kw,
      capacityKva: capacity.kva,
      reservePercent,
      availability: generator.availability,
      stockQuantity: generator.stockQuantity,
      leadTimeDays: generator.leadTimeDays,
      currency: generator.currency,
      commercialPrice,
      score: 50,
      reasons,
      warnings,
    };
  }

  private capacityForApplication(
    generator: CommercialGenerator,
    application: CommercialGeneratorApplication,
  ) {
    const values =
      application === CommercialGeneratorApplication.PRIME
        ? [generator.primePowerKw, generator.primePowerKva]
        : application === CommercialGeneratorApplication.CONTINUOUS
          ? [generator.continuousPowerKw, generator.continuousPowerKva]
          : [generator.standbyPowerKw, generator.standbyPowerKva];
    const kw =
      Number(values[0] || 0) || Number(values[1] || 0) * generator.powerFactor;
    if (kw <= 0) return null;
    return { kw, kva: values[1] === null ? null : Number(values[1]) };
  }

  private matchesVoltage(voltages: string[], requested: string) {
    const normalized = normalizeVoltage(requested);
    return voltages.some((voltage) => normalizeVoltage(voltage) === normalized);
  }

  private matchesPhase(phases: string[], requested: string) {
    const normalized = normalizePhase(requested);
    return phases.some((phase) => normalizePhase(phase) === normalized);
  }

  private applyPriorityScores(
    candidates: RankedCandidate[],
    priority: CommercialSizingPriority,
    policy: CommercialSizingPolicy,
  ) {
    if (candidates.length === 0) return;
    const prices = candidates
      .filter((item) => item.commercialPrice > 0)
      .map((item) => item.commercialPrice);
    const leads = candidates
      .filter((item) => item.leadTimeDays !== null)
      .map((item) => item.leadTimeDays as number);
    const reserves = candidates.map((item) => item.reservePercent);
    const idealMidpoint =
      (policy.idealReserveMinPercent + policy.idealReserveMaxPercent) / 2;
    const reserveDistances = candidates.map((item) =>
      Math.abs(item.reservePercent - idealMidpoint),
    );

    for (const candidate of candidates) {
      candidate.score +=
        25 *
        lowerIsBetter(
          Math.abs(candidate.reservePercent - idealMidpoint),
          reserveDistances,
        );
      candidate.score += availabilityScore(candidate.availability) * 0.15;
      if (candidate.leadTimeDays !== null) {
        candidate.score += 10 * lowerIsBetter(candidate.leadTimeDays, leads);
      }
      if (candidate.commercialPrice > 0) {
        candidate.score +=
          10 * lowerIsBetter(candidate.commercialPrice, prices);
      }

      if (priority === CommercialSizingPriority.BEST_SIZING) {
        candidate.score +=
          35 *
          lowerIsBetter(
            Math.abs(candidate.reservePercent - idealMidpoint),
            reserveDistances,
          );
      } else if (priority === CommercialSizingPriority.LOWEST_PRICE) {
        candidate.score +=
          candidate.commercialPrice > 0
            ? 35 * lowerIsBetter(candidate.commercialPrice, prices)
            : -20;
      } else if (priority === CommercialSizingPriority.SHORTEST_LEAD_TIME) {
        candidate.score +=
          candidate.leadTimeDays !== null
            ? 35 * lowerIsBetter(candidate.leadTimeDays, leads)
            : -20;
      } else if (priority === CommercialSizingPriority.AVAILABILITY) {
        candidate.score += availabilityScore(candidate.availability) * 0.35;
      } else if (priority === CommercialSizingPriority.HIGHEST_POWER_RESERVE) {
        candidate.score +=
          35 * higherIsBetter(candidate.reservePercent, reserves);
      }
    }
  }

  private engineeringReviewReasons(
    dto: RecommendCommercialGeneratorDto,
    requestedPowerKw: number,
    policy: CommercialSizingPolicy,
  ) {
    const reasons: string[] = [];
    const specialLoads = [
      CommercialLoadType.MOTORS,
      CommercialLoadType.PUMPS,
      CommercialLoadType.AIR_CONDITIONING,
      CommercialLoadType.ELEVATORS,
    ];
    if (
      policy.requireEngineeringSpecialLoads &&
      specialLoads.includes(dto.loadType)
    ) {
      reasons.push(
        'Carga especial sujeita a corrente de partida e simultaneidade.',
      );
    }
    if (dto.loadType === CommercialLoadType.UNKNOWN) {
      reasons.push('Tipo de carga nao informado.');
    }
    if (
      policy.engineeringReviewAboveKw !== null &&
      requestedPowerKw >= policy.engineeringReviewAboveKw
    ) {
      reasons.push(
        `Potencia igual ou superior ao limite de ${policy.engineeringReviewAboveKw} kW configurado.`,
      );
    }
    return reasons;
  }
}

function normalizeVoltage(value: string) {
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/V$/, '');
}

function normalizePhase(value: string) {
  const normalized = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, '');
  if (['1', '1F', 'MONOFASICO', 'MONOPHASE'].includes(normalized))
    return 'MONOPHASE';
  if (['2', '2F', 'BIFASICO', 'TWOPHASE'].includes(normalized))
    return 'TWOPHASE';
  if (['3', '3F', 'TRIFASICO', 'THREEPHASE'].includes(normalized))
    return 'THREEPHASE';
  return normalized;
}

function availabilityScore(availability: CommercialGeneratorAvailability) {
  if (availability === CommercialGeneratorAvailability.IN_STOCK) return 100;
  if (availability === CommercialGeneratorAvailability.AVAILABLE_TO_ORDER)
    return 70;
  if (availability === CommercialGeneratorAvailability.ON_REQUEST) return 35;
  return 0;
}

function lowerIsBetter(value: number, values: number[]) {
  if (values.length === 0) return 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return max === min ? 1 : 1 - (value - min) / (max - min);
}

function higherIsBetter(value: number, values: number[]) {
  if (values.length === 0) return 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return max === min ? 1 : (value - min) / (max - min);
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
