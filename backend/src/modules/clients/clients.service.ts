import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateClientDto, ClientPersonTypeDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class ClientsService {
  constructor(private readonly database: DatabaseService) {}

  private async createAuditLog(
    tx: Pick<Prisma.TransactionClient, 'clientAuditLog'>,
    clientId: string,
    action: string,
    actorUserId?: string,
    details?: string,
    payload?: Prisma.InputJsonValue,
  ) {
    await tx.clientAuditLog.create({
      data: {
        clientId,
        action,
        actorUserId,
        details,
        payload,
      },
    });
  }

  private async attachGenerators(
    tx: Pick<Prisma.TransactionClient, 'generator' | 'clientAuditLog'>,
    clientId: string,
    generatorIds: string[] | undefined,
    actorUserId?: string,
  ) {
    if (!generatorIds || generatorIds.length === 0) return;

    const uniqueIds = [...new Set(generatorIds)];
    const generators = await tx.generator.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, clientId: true, name: true, serialNumber: true },
    });

    if (generators.length !== uniqueIds.length) {
      throw new BadRequestException(
        'Uma ou mais maquinas selecionadas nao foram encontradas.',
      );
    }

    const blocked = generators.filter(
      (generator) => generator.clientId && generator.clientId !== clientId,
    );
    if (blocked.length > 0) {
      const details = blocked
        .map((g) => g.serialNumber || g.name || g.id)
        .join(', ');
      throw new BadRequestException(
        `As seguintes maquinas ja estao vinculadas a outro cliente: ${details}`,
      );
    }

    await tx.generator.updateMany({
      where: { id: { in: uniqueIds } },
      data: { clientId },
    });

    for (const generator of generators) {
      await this.createAuditLog(
        tx,
        clientId,
        'GENERATOR_LINKED',
        actorUserId,
        `Maquina vinculada ao cliente: ${generator.name || generator.serialNumber || generator.id}`,
        {
          generatorId: generator.id,
          generatorName: generator.name,
          serialNumber: generator.serialNumber,
        },
      );
    }
  }

  private normalizeDocument(value: string) {
    return value.replace(/\D/g, '');
  }

  private inferPersonType(document: string): ClientPersonTypeDto {
    const digits = this.normalizeDocument(document);
    return digits.length <= 11
      ? ClientPersonTypeDto.INDIVIDUAL
      : ClientPersonTypeDto.LEGAL_ENTITY;
  }

  async create(
    data: CreateClientDto,
    actorUserId?: string,
    allowGeneratorCreation = false,
  ) {
    if (data.newGenerators?.length && !allowGeneratorCreation) {
      throw new ForbiddenException(
        'Use o fluxo de cadastro completo para incluir novos equipamentos.',
      );
    }

    const normalizedDocument = this.normalizeDocument(data.cnpj);
    const personType =
      data.personType ?? this.inferPersonType(normalizedDocument);

    const clientExists = await this.database.client.findUnique({
      where: { cnpj: normalizedDocument },
    });

    if (clientExists) {
      throw new ConflictException('Ja existe um cliente com este CNPJ.');
    }

    const mainAddress =
      data.addresses.find((addr) => addr.type === 'INSTALLATION') ??
      data.addresses[0];
    const mainContact =
      data.contacts?.find((contact) => contact.status === 'ACTIVE') ??
      data.contacts?.[0];

    return this.database.$transaction(async (tx) => {
      const createdClient = await tx.client.create({
        data: {
          companyName: data.companyName,
          tradeName: data.tradeName,
          cnpj: normalizedDocument,
          personType,
          email: data.email ?? mainContact?.email,
          phone: data.phone ?? mainContact?.mobile ?? mainContact?.phone ?? '-',
          contactName: mainContact?.name,
          address:
            data.address ??
            (mainAddress
              ? `${mainAddress.street}${mainAddress.number ? `, ${mainAddress.number}` : ''}`
              : undefined),
          city: data.city ?? mainAddress?.city ?? '-',
          state: data.state ?? mainAddress?.state ?? '--',
          stateRegistration: data.stateRegistration,
          municipalRegistration: data.municipalRegistration,
          cnae: data.cnae,
          preferences: data.preferences,
          segment: data.segment,
          clientType: data.clientType,
          paymentTermDefault: data.paymentTermDefault,
          creditLimit: data.creditLimit,
          priceTableCode: data.priceTableCode,
          isDelinquent: data.isDelinquent,
          proposalCreationBlocked: data.proposalCreationBlocked,
          proposalBlockReason: data.proposalCreationBlocked
            ? data.proposalBlockReason?.trim() || null
            : null,
          blockedPaymentTerms: this.normalizePaymentTerms(
            data.blockedPaymentTerms,
          ),
          withholdsInss: data.withholdsInss,
          withholdsIss: data.withholdsIss,
          salesOwnerId: data.salesOwnerId,
          addresses: {
            create: data.addresses.map((address) => ({
              type: address.type,
              street: address.street,
              number: address.number,
              complement: address.complement,
              district: address.district,
              zipCode: address.zipCode,
              city: address.city,
              state: address.state,
              country: address.country,
            })),
          },
          contacts: {
            create: (data.contacts ?? []).map((contact) => ({
              name: contact.name,
              status: contact.status,
              role: contact.role,
              phone: contact.phone,
              mobile: contact.mobile,
              email: contact.email,
            })),
          },
        } as any,
        include: {
          addresses: true,
          contacts: true,
        },
      });

      const idsToAttach = [
        ...(data.generatorId ? [data.generatorId] : []),
        ...(data.generatorIds ?? []),
      ];
      if (idsToAttach.length > 0) {
        await this.attachGenerators(
          tx as unknown as Pick<
            Prisma.TransactionClient,
            'generator' | 'clientAuditLog'
          >,
          createdClient.id,
          idsToAttach,
          actorUserId,
        );
      }

      for (const generator of data.newGenerators ?? []) {
        const name = generator.model?.trim()
          ? `${generator.name.trim()} - ${generator.model.trim()}`
          : generator.name.trim();
        const createdGenerator = await tx.generator.create({
          data: {
            name,
            brand: generator.brand.trim(),
            serialNumber: generator.serialNumber?.trim() || undefined,
            power: generator.power,
            clientId: createdClient.id,
            createdByUserId: actorUserId,
          },
        });

        await this.createAuditLog(
          tx,
          createdClient.id,
          'GENERATOR_CREATED',
          actorUserId,
          `Equipamento cadastrado com o cliente: ${name}`,
          {
            generatorId: createdGenerator.id,
            generatorName: name,
            serialNumber: createdGenerator.serialNumber,
          },
        );
      }

      await this.createAuditLog(
        tx,
        createdClient.id,
        'CLIENT_CREATED',
        actorUserId,
        'Cliente cadastrado.',
        {
          companyName: createdClient.companyName,
          cnpj: createdClient.cnpj,
        },
      );

      return createdClient;
    });
  }

  findAll() {
    return this.database.client.findMany({
      include: {
        addresses: true,
        contacts: true,
      },
      orderBy: { companyName: 'asc' },
    });
  }

  lookup(query?: string, take?: string | number) {
    const search = query?.trim();
    const digits = search?.replace(/\D/g, '') ?? '';
    const limit = this.parseLookupLimit(take);

    const where: Prisma.ClientWhereInput = search
      ? {
          OR: [
            {
              companyName: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              tradeName: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              contactName: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              email: {
                contains: search,
                mode: 'insensitive',
              },
            },
            ...(digits
              ? [
                  {
                    cnpj: {
                      contains: digits,
                    },
                  },
                ]
              : []),
          ],
        }
      : {};

    return this.database.client.findMany({
      where,
      select: {
        id: true,
        companyName: true,
        tradeName: true,
        cnpj: true,
        contactName: true,
        city: true,
        state: true,
        paymentTermDefault: true,
        proposalCreationBlocked: true,
        proposalBlockReason: true,
        blockedPaymentTerms: true,
        _count: {
          select: { proposals: true },
        },
      },
      orderBy: { companyName: 'asc' },
      take: limit,
    });
  }

  async findOne(id: string) {
    const client = await this.database.client.findUnique({
      where: { id },
      include: {
        addresses: true,
        contacts: true,
        _count: {
          select: { proposals: true },
        },
        generators: {
          include: {
            createdByUser: {
              select: { id: true, name: true, email: true },
            },
            orders: {
              select: {
                id: true,
                title: true,
                status: true,
                type: true,
                priority: true,
                openedAt: true,
                scheduledTo: true,
                finishedAt: true,
                contract: {
                  select: { id: true, code: true, status: true },
                },
                serviceReport: {
                  select: { id: true, code: true, status: true },
                },
              },
              orderBy: { openedAt: 'desc' },
              take: 5,
            },
          },
        },
        auditLogs: {
          include: {
            actorUser: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
        },
        contracts: {
          include: {
            createdByUser: {
              select: { id: true, name: true, email: true },
            },
            equipments: {
              include: {
                generator: true,
              },
            },
            invoices: {
              orderBy: { dueDate: 'asc' },
              take: 12,
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        proposals: {
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true },
            },
            generatedContract: {
              select: { id: true, code: true, status: true },
            },
            salesOpportunity: {
              select: { id: true, title: true, stage: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        serviceTickets: {
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            priority: true,
            createdAt: true,
            generator: {
              select: { id: true, name: true, serialNumber: true },
            },
            maintenanceOrder: {
              select: { id: true, title: true, status: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 12,
        },
        serviceReports: {
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            createdAt: true,
            maintenanceOrder: {
              select: { id: true, title: true, status: true },
            },
            generator: {
              select: { id: true, name: true, serialNumber: true },
            },
            generatedDocument: {
              select: {
                id: true,
                documentCode: true,
                documentTitle: true,
                status: true,
                createdAt: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 12,
        },
      },
    });

    if (!client) throw new NotFoundException('Cliente nao encontrado');
    return client;
  }

  async update(id: string, data: UpdateClientDto, actorUserId?: string) {
    const existingClient = await this.findOne(id);

    const normalizedDocument = data.cnpj
      ? this.normalizeDocument(data.cnpj)
      : undefined;

    if (normalizedDocument && normalizedDocument !== existingClient.cnpj) {
      const conflict = await this.database.client.findUnique({
        where: { cnpj: normalizedDocument },
      });
      if (conflict) {
        throw new ConflictException('Ja existe um cliente com este CNPJ.');
      }
    }

    const nextAddresses = data.addresses ?? existingClient.addresses;
    const nextContacts = data.contacts ?? existingClient.contacts;

    const mainAddress =
      nextAddresses.find((addr) => addr.type === 'INSTALLATION') ??
      nextAddresses[0];
    const mainContact =
      nextContacts?.find((contact) => contact.status === 'ACTIVE') ??
      nextContacts?.[0];

    const personType =
      data.personType ??
      (normalizedDocument
        ? this.inferPersonType(normalizedDocument)
        : existingClient.personType);

    try {
      await this.database.$transaction(async (tx) => {
        await tx.client.update({
          where: { id },
          data: {
            companyName: data.companyName ?? existingClient.companyName,
            tradeName: data.tradeName,
            cnpj: normalizedDocument ?? existingClient.cnpj,
            personType,
            email: data.email ?? mainContact?.email ?? existingClient.email,
            phone:
              data.phone ??
              mainContact?.mobile ??
              mainContact?.phone ??
              existingClient.phone,
            contactName: mainContact?.name ?? existingClient.contactName,
            address:
              data.address ??
              (mainAddress
                ? `${mainAddress.street}${mainAddress.number ? `, ${mainAddress.number}` : ''}`
                : existingClient.address),
            city: data.city ?? mainAddress?.city ?? existingClient.city,
            state: data.state ?? mainAddress?.state ?? existingClient.state,
            stateRegistration: data.stateRegistration,
            municipalRegistration: data.municipalRegistration,
            cnae: data.cnae,
            preferences: data.preferences,
            segment: data.segment,
            clientType: data.clientType,
            paymentTermDefault: data.paymentTermDefault,
            creditLimit: data.creditLimit,
            priceTableCode: data.priceTableCode,
            isDelinquent: data.isDelinquent,
            proposalCreationBlocked: data.proposalCreationBlocked,
            proposalBlockReason:
              data.proposalCreationBlocked === false
                ? null
                : data.proposalBlockReason !== undefined
                  ? data.proposalBlockReason.trim() || null
                  : undefined,
            blockedPaymentTerms:
              data.blockedPaymentTerms !== undefined
                ? this.normalizePaymentTerms(data.blockedPaymentTerms)
                : undefined,
            withholdsInss: data.withholdsInss,
            withholdsIss: data.withholdsIss,
            salesOwnerId: data.salesOwnerId,
          } as any,
        });

        if (data.addresses) {
          await tx.clientAddress.deleteMany({ where: { clientId: id } });
          if (data.addresses.length > 0) {
            await tx.clientAddress.createMany({
              data: data.addresses.map((address) => ({
                type: address.type,
                street: address.street,
                number: address.number,
                complement: address.complement,
                district: address.district,
                zipCode: address.zipCode,
                city: address.city,
                state: address.state,
                country: address.country,
                clientId: id,
              })),
            });
          }
        }

        if (data.contacts) {
          await tx.clientContact.deleteMany({ where: { clientId: id } });
          if (data.contacts.length > 0) {
            await tx.clientContact.createMany({
              data: data.contacts.map((contact) => ({
                name: contact.name,
                status: contact.status,
                role: contact.role,
                phone: contact.phone,
                mobile: contact.mobile,
                email: contact.email,
                clientId: id,
              })),
            });
          }
        }

        const idsToAttach = [
          ...(data.generatorId ? [data.generatorId] : []),
          ...(data.generatorIds ?? []),
        ];
        if (idsToAttach.length > 0) {
          await this.attachGenerators(
            tx as unknown as Pick<
              Prisma.TransactionClient,
              'generator' | 'clientAuditLog'
            >,
            id,
            idsToAttach,
            actorUserId,
          );
        }

        const changedParts: string[] = [];
        if (data.addresses) changedParts.push('enderecos');
        if (data.contacts) changedParts.push('contatos');
        if (data.segment !== undefined) changedParts.push('segmento');
        if (data.preferences !== undefined) changedParts.push('preferencias');
        if (data.clientType !== undefined) changedParts.push('tipo de cliente');
        if (data.paymentTermDefault !== undefined)
          changedParts.push('condicao de pagamento');
        if (data.creditLimit !== undefined)
          changedParts.push('limite de credito');
        if (data.isDelinquent !== undefined)
          changedParts.push('status de inadimplencia');
        if (data.proposalCreationBlocked !== undefined)
          changedParts.push('bloqueio de novas propostas');
        if (data.proposalBlockReason !== undefined)
          changedParts.push('motivo do bloqueio comercial');
        if (data.blockedPaymentTerms !== undefined)
          changedParts.push('condicoes de pagamento bloqueadas');
        if (data.withholdsInss !== undefined) changedParts.push('INSS');
        if (data.withholdsIss !== undefined) changedParts.push('ISS');
        if (idsToAttach.length > 0) changedParts.push('vinculo de maquinas');

        await this.createAuditLog(
          tx,
          id,
          'CLIENT_UPDATED',
          actorUserId,
          changedParts.length > 0
            ? `Cliente atualizado (${changedParts.join(', ')}).`
            : 'Cliente atualizado.',
          {
            changedParts,
          },
        );
      });
    } catch (error: any) {
      throw new BadRequestException(
        `Falha ao atualizar cliente: ${error?.message ?? 'erro interno'}`,
      );
    }

    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.database.client.delete({ where: { id } });
  }

  private normalizePaymentTerms(values?: string[]) {
    return Array.from(
      new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
    );
  }

  private parseLookupLimit(value?: string | number) {
    const parsed = Number(value ?? 10);
    if (!Number.isFinite(parsed)) return 10;
    return Math.min(Math.max(Math.trunc(parsed), 1), 20);
  }
}
