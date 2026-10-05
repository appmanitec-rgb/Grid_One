import { BadRequestException } from '@nestjs/common';
import {
  SalesOpportunityPipeline,
  SalesOpportunityStage,
  SalesOpportunityType,
  CrmActivityType,
  CrmActivityStatus,
  UserRole,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { CrmService } from './crm.service';

describe('CrmService', () => {
  let service: CrmService;
  let database: {
    user: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    salesOpportunity: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    client: { findUnique: jest.Mock };
    crmActivity: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(() => {
    database = {
      user: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      salesOpportunity: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      client: { findUnique: jest.fn() },
      crmActivity: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
      },
    };

    service = new CrmService(database as unknown as DatabaseService);
  });

  it('lista apenas vendedores comerciais ativos no lookup', async () => {
    database.user.findMany.mockResolvedValue([]);

    await service.listSellers(
      'contrato',
      '50',
      SalesOpportunityPipeline.COMMERCIAL_02_CONTRACTS,
    );

    expect(database.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: UserRole.SALES,
          isActive: true,
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { name: { contains: 'contrato', mode: 'insensitive' } },
                { email: { contains: 'contrato', mode: 'insensitive' } },
                { department: { contains: 'contrato', mode: 'insensitive' } },
              ]),
            }),
            expect.objectContaining({
              OR: expect.arrayContaining([
                { department: null },
                {
                  department: {
                    equals: 'Comercial',
                    mode: 'insensitive',
                  },
                },
                {
                  department: {
                    contains: 'Contrato',
                    mode: 'insensitive',
                  },
                },
              ]),
            }),
          ]),
        }),
        select: {
          id: true,
          name: true,
          email: true,
          department: true,
        },
        orderBy: { name: 'asc' },
        take: 20,
      }),
    );
  });

  it('rejeita oportunidade com vendedor que nao e comercial ativo', async () => {
    database.user.findFirst.mockResolvedValue(null);

    await expect(
      service.createOpportunity({
        title: 'Teste',
        clientId: '550e8400-e29b-41d4-a716-446655440000',
        assignedSellerId: '550e8400-e29b-41d4-a716-446655440001',
        pipeline: SalesOpportunityPipeline.COMMERCIAL_03_PARTS_SERVICES,
        opportunityType: SalesOpportunityType.PARTS_SALE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(database.salesOpportunity.create).not.toHaveBeenCalled();
  });

  it('cria oportunidade quando o vendedor e comercial ativo', async () => {
    database.user.findFirst.mockResolvedValue({ id: 'seller-1' });
    database.salesOpportunity.create.mockResolvedValue({ id: 'opp-1' });

    await service.createOpportunity({
      title: 'Teste',
      clientId: '550e8400-e29b-41d4-a716-446655440000',
      assignedSellerId: '550e8400-e29b-41d4-a716-446655440001',
      pipeline: SalesOpportunityPipeline.COMMERCIAL_02_CONTRACTS,
      opportunityType: SalesOpportunityType.MAINTENANCE_CONTRACT,
    });

    expect(database.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: '550e8400-e29b-41d4-a716-446655440001',
          role: UserRole.SALES,
          isActive: true,
          AND: expect.any(Array),
        }),
        select: { id: true },
      }),
    );
    expect(database.salesOpportunity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Teste',
          stage: SalesOpportunityStage.PROSPECTION,
          pipeline: SalesOpportunityPipeline.COMMERCIAL_02_CONTRACTS,
          opportunityType: SalesOpportunityType.MAINTENANCE_CONTRACT,
          assignedSellerId: '550e8400-e29b-41d4-a716-446655440001',
        }),
      }),
    );
  });

  it('rejeita tipo de oportunidade incompativel com pipeline', async () => {
    await expect(
      service.createOpportunity({
        title: 'Teste',
        clientId: '550e8400-e29b-41d4-a716-446655440000',
        pipeline: SalesOpportunityPipeline.COMMERCIAL_01_GENERATORS,
        opportunityType: SalesOpportunityType.PARTS_SALE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(database.user.findFirst).not.toHaveBeenCalled();
    expect(database.salesOpportunity.create).not.toHaveBeenCalled();
  });

  it('filtra oportunidades por etapa, pipeline e tipo', async () => {
    database.salesOpportunity.findMany.mockResolvedValue([]);

    await service.listOpportunities(
      SalesOpportunityStage.PROSPECTION,
      SalesOpportunityPipeline.COMMERCIAL_01_GENERATORS,
      SalesOpportunityType.GENERATOR_SALE,
    );

    expect(database.salesOpportunity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          stage: SalesOpportunityStage.PROSPECTION,
          pipeline: SalesOpportunityPipeline.COMMERCIAL_01_GENERATORS,
          opportunityType: SalesOpportunityType.GENERATOR_SALE,
        },
      }),
    );
  });

  it('impede vincular atividade a oportunidade de outro cliente', async () => {
    database.salesOpportunity.findUnique.mockResolvedValue({
      clientId: 'outro-cliente',
      assignedSellerId: null,
    });
    await expect(
      service.createActivity(
        {
          clientId: 'cliente-1',
          opportunityId: 'oportunidade-1',
          type: CrmActivityType.CALL,
          subject: 'Ligação',
        },
        'usuario-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.crmActivity.create).not.toHaveBeenCalled();
  });

  it('preserva o cliente do historico ao editar uma oportunidade', async () => {
    database.salesOpportunity.findUnique.mockResolvedValue({
      id: 'oportunidade-1',
      clientId: 'cliente-1',
    });
    database.crmActivity.count.mockResolvedValue(1);
    await expect(
      service.updateOpportunity('oportunidade-1', { clientId: 'cliente-2' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.crmActivity.count).toHaveBeenCalledWith({
      where: { opportunityId: 'oportunidade-1' },
    });
  });

  it('exige prazo para tarefas e preserva o responsável comercial', async () => {
    database.salesOpportunity.findUnique.mockResolvedValue({
      clientId: 'cliente-1',
      assignedSellerId: 'vendedor-1',
    });
    await expect(
      service.createActivity(
        {
          clientId: 'cliente-1',
          opportunityId: 'oportunidade-1',
          type: CrmActivityType.TASK,
          subject: 'Retornar',
        },
        'usuario-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.createActivity(
      {
        clientId: 'cliente-1',
        opportunityId: 'oportunidade-1',
        type: CrmActivityType.TASK,
        subject: 'Retornar',
        dueAt: '2026-10-10T15:00:00.000Z',
      },
      'usuario-1',
    );
    expect(database.crmActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: CrmActivityStatus.PLANNED,
          ownerId: 'vendedor-1',
          createdById: 'usuario-1',
        }),
      }),
    );
  });

  it('calcula previsão mensal ponderada sem misturar oportunidades ganhas', async () => {
    database.salesOpportunity.findMany.mockResolvedValue([
      {
        id: '1',
        stage: SalesOpportunityStage.PROSPECTION,
        estimatedValue: 1000,
        probabilityPercent: null,
        expectedCloseDate: new Date('2027-01-15T12:00:00Z'),
      },
      {
        id: '2',
        stage: SalesOpportunityStage.NEGOTIATION,
        estimatedValue: 2000,
        probabilityPercent: 60,
        expectedCloseDate: new Date('2027-01-20T12:00:00Z'),
      },
      {
        id: '3',
        stage: SalesOpportunityStage.PROPOSAL_SENT,
        estimatedValue: 500,
        probabilityPercent: null,
        expectedCloseDate: null,
      },
    ]);
    const forecast = await service.opportunityForecast();
    expect(database.salesOpportunity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          stage: {
            notIn: [SalesOpportunityStage.WON, SalesOpportunityStage.LOST],
          },
        },
      }),
    );
    expect(forecast).toEqual(
      expect.objectContaining({
        count: 3,
        amount: 3500,
        weightedAmount: 1550,
        unscheduled: 1,
        months: [
          { month: '2027-01', count: 2, amount: 3000, weightedAmount: 1300 },
        ],
      }),
    );
  });
});
