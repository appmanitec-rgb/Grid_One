import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { ClientsService } from './clients.service';

describe('ClientsService', () => {
  let service: ClientsService;
  let database: {
    client: {
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    database = {
      client: {
        findUnique: jest.fn(),
      },
    };

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
});
