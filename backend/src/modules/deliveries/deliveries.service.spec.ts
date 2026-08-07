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
        where: { id: 'proposal-1' },
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
