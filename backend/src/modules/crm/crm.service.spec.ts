import { BadRequestException } from '@nestjs/common';
import {
  SalesOpportunityPipeline,
  SalesOpportunityStage,
  SalesOpportunityType,
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
});
