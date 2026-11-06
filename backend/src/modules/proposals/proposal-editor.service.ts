import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditDomain, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import {
  assertPortfolio,
  portfolioForProposal,
  unrestricted,
} from '../auth/rules/access-rules';
import {
  conferenceActor,
  conferenceForm,
  expenseConferenceRules,
  object,
  phase1Enabled,
  phase1Type,
} from './proposal-conference';
import { SaveProposalEditingDraftDto } from './proposal-editor.dto';

const fields = new Set([
  'selectedClientId',
  'selectedEquipmentId',
  'selectedSellerId',
  'clientSearch',
  'equipmentSearch',
  'sellerSearch',
  'proposalFormType',
  'parts',
  'labor',
  'hourlyServices',
  'otherItems',
  'operationalExpenses',
  'scope',
  'technicalScopeReview',
  'technicalScopeClassifications',
  'technicalScopeSnapshot',
  'freight',
  'validUntil',
  'paymentTerm',
  'deliveryLeadTimeDays',
  'partsPaymentProfileId',
  'servicesPaymentProfileId',
  'paymentPlan',
  'hasDownPayment',
  'downPaymentAmount',
  'installmentCount',
  'installmentIntervalDays',
  'firstDueDate',
  'internalNotes',
  'externalNotes',
  'discountType',
  'discountInput',
  'discount',
  'allowOperationalExpenseDiscount',
  'reviewAcknowledgements',
  'step',
  'linkedOpportunityId',
  'editingProposalId',
  'editingProposalCode',
  'expectedUpdatedAt',
  'assistanceReviews',
  'assistanceReasons',
  'selectedParts',
  'selectedServices',
  'selectedClients',
  'selectedGenerators',
  'selectedSellers',
]);
@Injectable()
export class ProposalEditorService {
  constructor(private readonly db: DatabaseService) {}
  private enabled() {
    if (!phase1Enabled())
      throw new ForbiddenException('A fase 1 está desativada neste ambiente.');
  }
  async context(actorId: string) {
    const actor = await conferenceActor(this.db, actorId);
    return {
      enabled: phase1Enabled(),
      unrestricted: unrestricted(actor),
      discountLimit: actor.approvalDiscountLimit || 0,
      expenseRules: phase1Enabled()
        ? await expenseConferenceRules(this.db)
        : [],
    };
  }
  async review(
    data: Record<string, unknown>,
    actorId: string,
    proposalId?: string,
  ) {
    this.enabled();
    if (Buffer.byteLength(JSON.stringify(data)) > 131072)
      throw new BadRequestException(
        'O formulário excedeu o limite de tamanho.',
      );
    const report = await conferenceForm(this.db, data, actorId, proposalId);
    return {
      issues: report.issues,
      pending: report.pending,
      resolved: report.resolved,
      totals: report.totals,
      errors: report.errors,
      warnings: report.warnings,
      readyForApproval: report.blocks('submit').length === 0,
    };
  }
  async list(actorId: string) {
    this.enabled();
    const actor = await conferenceActor(this.db, actorId);
    const rows = await this.db.proposalEditingDraft.findMany({
      where: {
        ownerUserId: actorId,
        OR: [{ proposalId: null }, { proposal: { status: 'DRAFT' } }],
      },
      select: {
        id: true,
        proposalId: true,
        revision: true,
        updatedAt: true,
        formData: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });
    return rows
      .filter((row) => {
        try {
          assertPortfolio(
            actor,
            portfolioForProposal(
              typeof object(row.formData).proposalFormType === 'string'
                ? (object(row.formData).proposalFormType as string)
                : 'PARTS_AND_SERVICES',
            ),
          );
          return true;
        } catch {
          return false;
        }
      })
      .map((row) => ({
        id: row.id,
        proposalId: row.proposalId,
        revision: row.revision,
        updatedAt: row.updatedAt,
        label: String(
          object(row.formData).clientSearch || 'Rascunho sem cliente',
        ).slice(0, 180),
        step: Number(object(row.formData).step || 0),
      }));
  }
  async get(id: string, actorId: string) {
    this.enabled();
    const actor = await conferenceActor(this.db, actorId);
    const row = await this.db.proposalEditingDraft.findFirst({
      where: { id, ownerUserId: actorId },
    });
    if (!row) throw new NotFoundException('Rascunho de edição não encontrado.');
    assertPortfolio(
      actor,
      portfolioForProposal(
        typeof object(row.formData).proposalFormType === 'string'
          ? (object(row.formData).proposalFormType as string)
          : 'PARTS_AND_SERVICES',
      ),
    );
    if (row.proposalId) {
      const linked = await this.db.proposal.findUnique({
        where: { id: row.proposalId },
        select: { status: true },
      });
      if (linked && linked.status !== 'DRAFT')
        throw new ConflictException(
          'A proposta saiu do rascunho. Gere uma revisão para continuar.',
        );
    }
    return row;
  }
  async save(id: string, dto: SaveProposalEditingDraftDto, actorId: string) {
    this.enabled();
    const actor = await conferenceActor(
      this.db,
      actorId,
      dto.proposalId ? 'update' : 'create',
    );
    const formData = Object.fromEntries(
      Object.entries(dto.formData).filter(([key]) => fields.has(key)),
    );
    const formType =
      typeof formData.proposalFormType === 'string'
        ? formData.proposalFormType
        : 'PARTS_AND_SERVICES';
    if (!phase1Type(formType))
      throw new BadRequestException(
        'Use o fluxo próprio para este tipo de proposta.',
      );
    if (Buffer.byteLength(JSON.stringify(formData)) > 131072)
      throw new BadRequestException(
        'O formulário excedeu o limite de tamanho.',
      );
    assertPortfolio(actor, portfolioForProposal(formType));
    const requestHash = createHash('sha256')
      .update(JSON.stringify(formData))
      .digest('hex');
    return this.db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        'proposal-editor:' + id,
      );
      const current = await tx.proposalEditingDraft.findUnique({
        where: { id },
      });
      if (current && current.ownerUserId !== actorId)
        throw new NotFoundException('Rascunho de edição não encontrado.');
      if (
        current?.proposalId &&
        dto.proposalId &&
        current.proposalId !== dto.proposalId
      )
        throw new ConflictException(
          'Este rascunho já está vinculado a outra proposta.',
        );
      const linkedId = current?.proposalId || dto.proposalId;
      if (linkedId) {
        await tx.$executeRawUnsafe(
          'SELECT pg_advisory_xact_lock(hashtext($1))',
          'proposal-write:' + linkedId,
        );
        const editor = await conferenceActor(tx, actorId, 'update');
        const proposal = await tx.proposal.findUnique({
          where: { id: linkedId },
          select: { type: true, status: true },
        });
        if (!proposal) throw new NotFoundException('Proposta não encontrada.');
        assertPortfolio(editor, portfolioForProposal(proposal.type));
        if (proposal.status !== 'DRAFT')
          throw new ConflictException(
            'A proposta saiu do rascunho. Gere uma revisão para continuar.',
          );
      }
      if (current?.lastRequestKey === dto.requestKey) {
        if (current.lastRequestHash !== requestHash)
          throw new ConflictException(
            'A chave de gravação já foi usada com outro conteúdo.',
          );
        return current;
      }
      if ((current?.revision || 0) !== dto.revision)
        throw new ConflictException({
          message:
            'Este rascunho foi atualizado em outra aba. Seu conteúdo atual continua na tela; reabra a versão salva antes de substituir.',
          revision: current?.revision || 0,
        });
      const row = await tx.proposalEditingDraft.upsert({
        where: { id },
        create: {
          id,
          ownerUserId: actorId,
          proposalId: dto.proposalId,
          formData: formData as Prisma.InputJsonValue,
          lastRequestKey: dto.requestKey,
          lastRequestHash: requestHash,
          clicks: dto.clicks || 0,
          edits: dto.edits || 0,
        },
        update: {
          formData: formData as Prisma.InputJsonValue,
          proposalId: dto.proposalId || current?.proposalId,
          revision: { increment: 1 },
          lastRequestKey: dto.requestKey,
          lastRequestHash: requestHash,
          clicks: Math.max(current?.clicks || 0, dto.clicks || 0),
          edits: Math.max(current?.edits || 0, dto.edits || 0),
        },
      });
      await tx.systemAuditLog.create({
        data: {
          domain: AuditDomain.PROPOSALS,
          entityType: 'PROPOSAL_EDITOR_METRICS',
          entityId: id,
          action: current ? 'SAVE_EDITING_DRAFT' : 'START_EDITING_DRAFT',
          actorUserId: actorId,
          afterPayload: {
            revision: row.revision,
            clicks: row.clicks,
            edits: row.edits,
            proposalType: formType,
            profile: actor.role,
            elapsedMs: Date.now() - row.createdAt.getTime(),
          },
        },
      });
      return row;
    });
  }
}
