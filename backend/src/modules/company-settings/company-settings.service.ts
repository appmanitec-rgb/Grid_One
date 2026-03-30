import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from 'src/database/database.service';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';

@Injectable()
export class CompanySettingsService {
  constructor(private readonly prisma: DatabaseService) {}

  private normalizeText(value?: string) {
    if (value === undefined) return undefined;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeEmail(value?: string) {
    const normalized = this.normalizeText(value);
    return typeof normalized === 'string'
      ? normalized.toLowerCase()
      : normalized;
  }

  private normalizeCnpj(value?: string) {
    if (value === undefined) return undefined;

    const digits = value.replace(/\D/g, '');
    return digits.length > 0 ? digits : null;
  }

  private normalizeState(value?: string) {
    const normalized = this.normalizeText(value);
    return typeof normalized === 'string'
      ? normalized.toUpperCase().slice(0, 2)
      : normalized;
  }

  private buildCompanyData(dto: UpdateCompanySettingsDto) {
    return {
      companyName: this.normalizeText(dto.companyName),
      tradeName: this.normalizeText(dto.tradeName),
      cnpj: this.normalizeCnpj(dto.cnpj),
      stateRegistration: this.normalizeText(dto.stateRegistration),
      municipalRegistration: this.normalizeText(dto.municipalRegistration),
      taxRegime: this.normalizeText(dto.taxRegime),
      contactName: this.normalizeText(dto.contactName),
      contactRole: this.normalizeText(dto.contactRole),
      phone: this.normalizeText(dto.phone),
      whatsapp: this.normalizeText(dto.whatsapp),
      email: this.normalizeEmail(dto.email),
      billingEmail: this.normalizeEmail(dto.billingEmail),
      website: this.normalizeText(dto.website),
      address: this.normalizeText(dto.address),
      addressNumber: this.normalizeText(dto.addressNumber),
      addressComplement: this.normalizeText(dto.addressComplement),
      district: this.normalizeText(dto.district),
      city: this.normalizeText(dto.city),
      state: this.normalizeState(dto.state),
      zipCode: this.normalizeText(dto.zipCode),
      country: this.normalizeText(dto.country),
      logoUrl: this.normalizeText(dto.logoUrl),
      primaryColor: this.normalizeText(dto.primaryColor),
      secondaryColor: this.normalizeText(dto.secondaryColor),
      notes: this.normalizeText(dto.notes),
    };
  }

  private async ensureUniqueCnpj(
    cnpj: string | null | undefined,
    currentId?: string,
  ) {
    if (!cnpj) return;

    const existing = await this.prisma.companySettings.findFirst({
      where: { cnpj },
    });

    if (existing && existing.id !== currentId) {
      throw new ConflictException(
        'Ja existe um cadastro de empresa com este CNPJ.',
      );
    }
  }

  private async ensurePrimaryCompany() {
    const primary = await this.prisma.companySettings.findFirst({
      where: { isPrimary: true },
    });

    if (primary) return primary;

    const fallback = await this.prisma.companySettings.findFirst({
      orderBy: [{ createdAt: 'asc' }],
    });

    if (fallback) {
      return this.prisma.companySettings.update({
        where: { id: fallback.id },
        data: { isPrimary: true },
      });
    }

    return this.prisma.companySettings.create({
      data: {
        key: 'default',
        isPrimary: true,
      },
    });
  }

  async getSettings() {
    return this.ensurePrimaryCompany();
  }

  async listCompanies() {
    await this.ensurePrimaryCompany();

    return this.prisma.companySettings.findMany({
      orderBy: [
        { isPrimary: 'desc' },
        { companyName: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }

  async createCompany(
    userId: string | undefined,
    dto: UpdateCompanySettingsDto,
  ) {
    const data = this.buildCompanyData(dto);
    await this.ensureUniqueCnpj(data.cnpj);

    const totalCompanies = await this.prisma.companySettings.count();
    const shouldBePrimary = dto.isPrimary === true || totalCompanies === 0;

    return this.prisma.$transaction(async (tx) => {
      if (shouldBePrimary) {
        await tx.companySettings.updateMany({
          data: { isPrimary: false },
        });
      }

      return tx.companySettings.create({
        data: {
          key: totalCompanies === 0 ? 'default' : `company-${randomUUID()}`,
          ...data,
          isPrimary: shouldBePrimary,
          updatedByUserId: userId,
        },
      });
    });
  }

  async updateCompany(
    id: string,
    userId: string | undefined,
    dto: UpdateCompanySettingsDto,
  ) {
    const existing = await this.prisma.companySettings.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Cadastro de empresa nao encontrado.');
    }

    const data = this.buildCompanyData(dto);
    if (data.cnpj !== undefined) {
      await this.ensureUniqueCnpj(data.cnpj, id);
    }

    const shouldRemainPrimary =
      dto.isPrimary === true ||
      (dto.isPrimary === undefined && existing.isPrimary);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary === true) {
        await tx.companySettings.updateMany({
          where: { id: { not: id } },
          data: { isPrimary: false },
        });
      }

      let updated = await tx.companySettings.update({
        where: { id },
        data: {
          ...data,
          isPrimary: shouldRemainPrimary,
          updatedByUserId: userId,
        },
      });

      const activePrimary = await tx.companySettings.findFirst({
        where: { isPrimary: true },
      });

      if (!activePrimary) {
        updated = await tx.companySettings.update({
          where: { id },
          data: { isPrimary: true },
        });
      }

      return updated;
    });
  }

  async updateSettings(
    userId: string | undefined,
    dto: UpdateCompanySettingsDto,
  ) {
    const primaryCompany = await this.ensurePrimaryCompany();

    return this.updateCompany(primaryCompany.id, userId, {
      ...dto,
      isPrimary: true,
    });
  }

  async removeCompany(id: string) {
    const existing = await this.prisma.companySettings.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Cadastro de empresa nao encontrado.');
    }

    const totalCompanies = await this.prisma.companySettings.count();
    if (totalCompanies <= 1) {
      throw new BadRequestException(
        'Mantenha ao menos um cadastro de empresa ativo.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.companySettings.delete({
        where: { id },
      });

      if (existing.isPrimary) {
        const nextPrimary = await tx.companySettings.findFirst({
          orderBy: [{ companyName: 'asc' }, { createdAt: 'asc' }],
        });

        if (nextPrimary) {
          await tx.companySettings.update({
            where: { id: nextPrimary.id },
            data: { isPrimary: true },
          });
        }
      }

      return { success: true };
    });
  }
}
