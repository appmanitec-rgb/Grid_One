import { ProposalEditorService } from './proposal-editor.service';
import { DatabaseService } from '../../database/database.service';

jest.mock('./proposal-conference', () => ({
  ...jest.requireActual<typeof import('./proposal-conference')>(
    './proposal-conference',
  ),
  conferenceActor: jest.fn().mockResolvedValue({
    id: 'owner',
    sub: 'owner',
    role: 'ADMIN',
    isActive: true,
  }),
}));

describe('rascunho de edição depois de concluir a proposta', () => {
  const previousFlag = process.env.PROPOSAL_CONFERENCE_PHASE1;
  beforeAll(() => {
    process.env.PROPOSAL_CONFERENCE_PHASE1 = 'true';
  });
  afterAll(() => {
    process.env.PROPOSAL_CONFERENCE_PHASE1 = previousFlag;
  });

  function fixture(status = 'WON') {
    const row = {
      id: 'draft',
      ownerUserId: 'owner',
      proposalId: 'proposal',
      revision: 2,
      formData: { proposalFormType: 'PARTS_AND_SERVICES' },
    };
    const db = {
      proposalEditingDraft: {
        findFirst: jest.fn().mockResolvedValue(row),
        findUnique: jest.fn().mockResolvedValue(row),
        upsert: jest.fn(),
      },
      proposal: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ type: 'PARTS_AND_SERVICES', status }),
      },
      $executeRawUnsafe: jest.fn(),
      $transaction: jest.fn(),
    };
    db.$transaction.mockImplementation(
      (fn: (tx: DatabaseService) => Promise<unknown>) =>
        fn(db as unknown as DatabaseService),
    );
    return {
      db,
      service: new ProposalEditorService(db as unknown as DatabaseService),
    };
  }

  it('não reabre como editável um rascunho cuja proposta saiu de DRAFT', async () => {
    const { service } = fixture();
    await expect(service.get('draft', 'owner')).rejects.toThrow(
      'saiu do rascunho',
    );
  });

  it('não grava rascunho concluído quando a requisição omite proposalId', async () => {
    const { db, service } = fixture();
    await expect(
      service.save(
        'draft',
        {
          revision: 2,
          requestKey: 'request',
          formData: { proposalFormType: 'PARTS_AND_SERVICES' },
        },
        'owner',
      ),
    ).rejects.toThrow('saiu do rascunho');
    expect(db.proposalEditingDraft.upsert).not.toHaveBeenCalled();
  });

  it('não transfere o rascunho para outra proposta para contornar o vínculo', async () => {
    const { db, service } = fixture('DRAFT');
    await expect(
      service.save(
        'draft',
        {
          revision: 2,
          requestKey: 'request',
          proposalId: 'other-proposal',
          formData: { proposalFormType: 'PARTS_AND_SERVICES' },
        },
        'owner',
      ),
    ).rejects.toThrow('vinculado a outra proposta');
    expect(db.proposalEditingDraft.upsert).not.toHaveBeenCalled();
  });
});
