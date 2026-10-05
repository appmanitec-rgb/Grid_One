import {
  DeliveryDocumentType,
  DeliveryStatus,
  ProposalStatus,
} from '@prisma/client';
import { DeliveriesService } from './deliveries.service';

describe('DeliveriesService', () => {
  let service: DeliveriesService;
  let prisma: {
    $transaction: jest.Mock;
    documentShareToken: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    documentDelivery: { update: jest.Mock };
    proposal: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    proposalMovement: { create: jest.Mock };
    salesOpportunity: { update: jest.Mock };
    generator: { findUnique: jest.Mock };
    proposalItem: { findMany: jest.Mock };
    maintenanceOrder: { upsert: jest.Mock };
  };
  let auditLogsService: { record: jest.Mock };

  const activeProposalShare = {
    id: 'share-token-1',
    documentType: DeliveryDocumentType.PROPOSAL,
    documentId: 'proposal-1',
    clientId: 'client-1',
    recipientEmail: 'cliente@example.test',
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    delivery: {
      id: 'delivery-1',
      status: DeliveryStatus.PENDING,
    },
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((callback: (tx: typeof prisma) => unknown) =>
        callback(prisma),
      ),
      documentShareToken: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      documentDelivery: { update: jest.fn() },
      proposal: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      proposalMovement: { create: jest.fn() },
      salesOpportunity: { update: jest.fn() },
      generator: { findUnique: jest.fn() },
      proposalItem: { findMany: jest.fn() },
      maintenanceOrder: { upsert: jest.fn() },
    };
    auditLogsService = { record: jest.fn() };
    service = new DeliveriesService(
      prisma as never,
      {} as never,
      auditLogsService as never,
    );
  });

  it('aprova proposta em analise do cliente pelo link seguro', async () => {
    prisma.documentShareToken.findUnique.mockResolvedValue(activeProposalShare);
    prisma.proposal.findFirst.mockResolvedValue({
      id: 'proposal-1',
      code: 'PROP-001',
      status: ProposalStatus.CLIENT_REVIEW,
      type: 'SERVICES',
      generatorId: 'generator-1',
      totalValue: 15000,
      validUntil: new Date('2099-01-01T00:00:00.000Z'),
      salesOpportunityId: 'opportunity-1',
      clientId: 'client-1',
      customerDecisionAt: null,
    });
    prisma.proposal.update.mockResolvedValue({
      id: 'proposal-1',
      code: 'PROP-001',
      status: ProposalStatus.WON,
      totalValue: 15000,
      validUntil: new Date('2099-01-01T00:00:00.000Z'),
      customerDecisionAt: new Date('2026-07-29T12:00:00.000Z'),
      customerDecisionSource: 'SHARE_LINK_SIGNATURE',
      customerDecisionNote: 'Aprovado via link seguro.',
    });
    prisma.generator.findUnique.mockResolvedValue({ currentSiteId: 'site-1' });
    prisma.proposalItem.findMany.mockResolvedValue([]);
    prisma.maintenanceOrder.upsert.mockResolvedValue({ id: 'order-1' });

    const result = await service.approveSharedProposal(
      'token-publico',
      {
        signerName: 'Cliente Aprovador',
        signerCpf: '123.456.789-09',
        signatureData: 'Cliente Aprovador',
        note: 'Aprovado para execucao.',
      },
      { ip: '127.0.0.1', userAgent: 'jest' },
    );

    expect(result.message).toBe('Proposta aprovada com aceite assinado.');
    expect(result.proposal.status).toBe(ProposalStatus.WON);
    expect(prisma.proposal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'proposal-1', status: ProposalStatus.CLIENT_REVIEW },
        data: expect.objectContaining({
          status: ProposalStatus.WON,
          customerDecisionSource: 'SHARE_LINK_SIGNATURE',
        }),
      }),
    );
    expect(prisma.proposalMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        proposalId: 'proposal-1',
        action: 'SHARE_LINK_APPROVE_SIGNATURE',
        fromStatus: ProposalStatus.CLIENT_REVIEW,
        toStatus: ProposalStatus.WON,
      }),
    });
    expect(prisma.maintenanceOrder.upsert).toHaveBeenCalledWith({
      where: { sourceProposalId: 'proposal-1' },
      update: {},
      create: expect.objectContaining({
        generatorId: 'generator-1',
        siteId: 'site-1',
      }),
    });
    expect(prisma.salesOpportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'opportunity-1' },
      }),
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SHARE_LINK_APPROVE_SIGNATURE',
        afterPayload: expect.objectContaining({
          signerCpf: '123.***.***-09',
        }),
      }),
      prisma,
    );
  });

  it('bloqueia CPF invalido antes de alterar proposta', async () => {
    prisma.documentShareToken.findUnique.mockResolvedValue(activeProposalShare);

    await expect(
      service.approveSharedProposal(
        'token-publico',
        {
          signerName: 'Cliente',
          signerCpf: '123',
          signatureData: 'Cliente',
        },
        {},
      ),
    ).rejects.toThrow('Informe um CPF com 11 digitos.');
    expect(prisma.proposal.update).not.toHaveBeenCalled();
  });

  it('bloqueia proposta que nao esta em analise do cliente', async () => {
    prisma.documentShareToken.findUnique.mockResolvedValue(activeProposalShare);
    prisma.proposal.findFirst.mockResolvedValue({
      id: 'proposal-1',
      code: 'PROP-001',
      status: ProposalStatus.WON,
      totalValue: 15000,
      validUntil: new Date('2099-01-01T00:00:00.000Z'),
      salesOpportunityId: null,
      clientId: 'client-1',
      customerDecisionAt: new Date('2026-07-29T12:00:00.000Z'),
    });

    await expect(
      service.approveSharedProposal(
        'token-publico',
        {
          signerName: 'Cliente',
          signerCpf: '12345678909',
          signatureData: 'Cliente',
        },
        {},
      ),
    ).rejects.toThrow(
      'A proposta nao esta disponivel para aprovacao do cliente.',
    );
    expect(prisma.proposal.update).not.toHaveBeenCalled();
  });
});
