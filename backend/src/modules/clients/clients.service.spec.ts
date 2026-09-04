import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { ClientsService } from './clients.service';

describe('ClientsService', () => {
  let service: ClientsService;
  let database: {
    client: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    generator: {
      findMany: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
    };
    clientAuditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    database = {
      client: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      generator: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      clientAuditLog: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    database.$transaction.mockImplementation(
      async (callback: (tx: typeof database) => Promise<unknown>) =>
        callback(database),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: DatabaseService, useValue: database },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates client and new equipments in the same transaction', async () => {
    database.client.findUnique.mockResolvedValue(null);
    database.client.create.mockResolvedValue({
      id: 'client-1',
      companyName: 'Cliente Integrado',
      cnpj: '12345678000199',
      addresses: [],
      contacts: [],
    });
    database.generator.create.mockResolvedValue({
      id: 'generator-1',
      serialNumber: 'SERIE-001',
    });

    const result = await service.create(
      {
        companyName: 'Cliente Integrado',
        cnpj: '12.345.678/0001-99',
        phone: '11999999999',
        city: 'Indaiatuba',
        state: 'SP',
        addresses: [
          {
            type: 'INSTALLATION' as any,
            street: 'Rua Teste',
            city: 'Indaiatuba',
            state: 'SP',
          },
        ],
        newGenerators: [
          {
            name: 'Gerador principal',
            brand: 'Cummins',
            model: 'C150D6',
            serialNumber: 'SERIE-001',
            power: 150,
          },
        ],
      },
      'actor-1',
      true,
    );

    expect(database.$transaction).toHaveBeenCalledTimes(1);
    expect(database.generator.create).toHaveBeenCalledWith({
      data: {
        name: 'Gerador principal - C150D6',
        brand: 'Cummins',
        serialNumber: 'SERIE-001',
        power: 150,
        clientId: 'client-1',
        createdByUserId: 'actor-1',
      },
    });
    expect(database.clientAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'GENERATOR_CREATED',
          clientId: 'client-1',
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: 'client-1' }));
  });

  it('rejects nested equipment creation outside the protected onboarding flow', async () => {
    await expect(
      service.create({
        companyName: 'Cliente sem permissao',
        cnpj: '12345678000198',
        phone: '11999999999',
        city: 'Indaiatuba',
        state: 'SP',
        addresses: [],
        newGenerators: [
          {
            name: 'Gerador',
            brand: 'Cummins',
            power: 100,
          },
        ],
      }),
    ).rejects.toThrow('fluxo de cadastro completo');

    expect(database.client.create).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('busca referencias operacionais do cliente sem campos sensiveis', async () => {
    database.client.findUnique.mockResolvedValue({
      id: 'client-1',
      companyName: 'Cliente Teste',
    });

    await service.findOne('client-1');

    expect(database.client.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'client-1' },
        include: expect.objectContaining({
          generators: expect.objectContaining({
            include: expect.objectContaining({
              orders: expect.objectContaining({
                take: 5,
                select: expect.objectContaining({
                  id: true,
                  title: true,
                  status: true,
                  serviceReport: expect.objectContaining({
                    select: { id: true, code: true, status: true },
                  }),
                }),
              }),
            }),
          }),
          serviceTickets: expect.objectContaining({
            take: 12,
            select: expect.not.objectContaining({
              internalNotes: true,
            }),
          }),
          serviceReports: expect.objectContaining({
            take: 12,
            select: expect.objectContaining({
              generatedDocument: expect.objectContaining({
                select: expect.not.objectContaining({
                  fileStorageKey: true,
                }),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('busca clientes para lookup com limite e campos minimos', async () => {
    database.client.findMany.mockResolvedValue([]);

    await service.lookup('energia 12.345', '100');

    expect(database.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              companyName: expect.objectContaining({
                contains: 'energia 12.345',
                mode: 'insensitive',
              }),
            }),
            expect.objectContaining({
              cnpj: expect.objectContaining({ contains: '12345' }),
            }),
          ]),
        }),
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
        take: 20,
      }),
    );
  });
});
