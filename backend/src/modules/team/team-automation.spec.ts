import {
  MaintenanceOrderType,
  Prisma,
  ProposalStatus,
  ProposalType,
} from '@prisma/client';
import { publishOrderCompleted, publishProposalWon } from './team-automation';

describe('team automation', () => {
  it('publishes a commercial win with customer and seller, without price', async () => {
    const tx = {
      proposal: {
        findUnique: jest.fn().mockResolvedValue({
          code: 'PROP-42',
          status: ProposalStatus.WON,
          type: ProposalType.GENERATOR_SALE,
          totalValue: 900000,
          client: { companyName: 'Cliente Solar' },
          user: { name: 'Ana' },
        }),
      },
      teamPost: { upsert: jest.fn() },
    };
    await publishProposalWon(tx as unknown as Prisma.TransactionClient, 'p1');
    const post = tx.teamPost.upsert.mock.calls[0][0];
    expect(post.where.eventKey).toBe('proposal-won:p1');
    expect(post.create.category).toBe('COMMERCIAL');
    expect(post.create.body).toContain('Ana');
    expect(post.create.body).toContain('Cliente Solar');
    expect(post.create.body).not.toContain('900000');
  });

  it('recognizes installation and all participating technicians', async () => {
    const tx = {
      maintenanceOrder: {
        findUnique: jest.fn().mockResolvedValue({
          title: 'Instalação',
          type: MaintenanceOrderType.INSTALLATION,
          status: 'COMPLETED',
          generator: {
            name: 'Gerador X',
            client: { companyName: 'Cliente Solar' },
          },
          technician: { user: { name: 'Ana' } },
          workSessions: [
            { user: { name: 'Ana' } },
            { user: { name: 'Bruno' } },
          ],
        }),
      },
      teamPost: { upsert: jest.fn() },
    };
    await publishOrderCompleted(
      tx as unknown as Prisma.TransactionClient,
      'o1',
    );
    const post = tx.teamPost.upsert.mock.calls[0][0];
    expect(post.where.eventKey).toBe('order-completed:o1');
    expect(post.create.category).toBe('WORKS');
    expect(post.create.body).toContain('Ana, Bruno');
  });
});
