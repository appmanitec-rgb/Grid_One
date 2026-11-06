import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditDomain, Prisma, ProposalStatus } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import {
  assertPortfolio,
  assertScreen,
  portfolioForProposal,
  unrestricted,
  type RuleActor,
} from '../auth/rules/access-rules';
import { effectiveAccessPolicy } from '../users/access-policy';
import { composeTechnicalScope } from './technical-scope.engine';
import {
  DEFAULT_SCOPE_FAMILIES,
  DEFAULT_SCOPE_PROCEDURES,
} from './technical-scope.defaults';
import {
  loadTechnicalScopeLibrary,
  resolveTechnicalScopeSource,
  scopeJson,
} from './technical-scope-resolution';
import {
  familyDefinition,
  procedureDefinition,
  technicalCode,
  technicalCodes,
  technicalCompatibility,
} from './technical-scope.validation';
import {
  PreviewTechnicalScopeDto,
  UpsertCatalogTechnicalProfileDto,
  UpsertTechnicalFamilyDto,
  UpsertTechnicalProcedureDto,
} from './technical-scope.dto';

type Actor = RuleActor & { policy: ReturnType<typeof effectiveAccessPolicy> };
@Injectable()
export class TechnicalScopesService {
  constructor(private readonly db: DatabaseService) {}

  private async actor(id: string): Promise<Actor> {
    if (!id) throw new UnauthorizedException('Autenticacao obrigatoria.');
    const user = await this.db.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        isActive: true,
        isSystemMaster: true,
        accessPolicy: true,
        accessRules: true,
      },
    });
    if (!user?.isActive)
      throw new UnauthorizedException('Usuario indisponivel.');
    if (user.role === 'CLIENT')
      throw new ForbiddenException(
        'A biblioteca tecnica e o preview de rascunho pertencem ao time interno.',
      );
    return {
      sub: user.id,
      role: user.role,
      isSystemMaster: user.isSystemMaster,
      accessRules: user.accessRules,
      policy: effectiveAccessPolicy(user.role, user.accessPolicy),
    };
  }
  private access(
    actor: Actor,
    section: 'catalog' | 'proposals',
    action: 'view' | 'create' | 'update',
  ) {
    if (unrestricted(actor)) return;
    assertScreen(actor, section, action === 'view' ? undefined : action);
    const permissions = actor.policy[section] as unknown as Record<
      string,
      boolean
    >;
    if (
      !actor.policy.pages[section] ||
      !permissions.view ||
      !permissions[action]
    )
      throw new ForbiddenException(
        'Seu perfil nao possui permissao para esta acao.',
      );
  }
  private async libraryAccess(id: string, write = false) {
    const actor = await this.actor(id);
    this.access(actor, 'catalog', write ? 'update' : 'view');
    return actor;
  }

  async library(actorUserId: string) {
    await this.libraryAccess(actorUserId);
    const [families, procedures, profiles] = await Promise.all([
      this.db.technicalScopeFamily.findMany({ orderBy: { code: 'asc' } }),
      this.db.technicalScopeProcedure.findMany({ orderBy: { code: 'asc' } }),
      this.db.catalogTechnicalProfile.findMany({
        include: {
          catalogItem: {
            select: {
              id: true,
              name: true,
              sku: true,
              type: true,
              isActive: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    return { families, procedures, profiles };
  }

  async seed(actorUserId: string) {
    await this.libraryAccess(actorUserId, true);
    return this.db.$transaction(async (tx) => {
      const families = await tx.technicalScopeFamily.createMany({
        data: DEFAULT_SCOPE_FAMILIES.map((row) => ({
          code: row.code,
          name: row.name,
          kind: row.definitionJson.kind,
          definitionJson: scopeJson(row.definitionJson),
          isActive: row.isActive !== false,
          version: row.version || 1,
        })),
        skipDuplicates: true,
      });
      const procedures = await tx.technicalScopeProcedure.createMany({
        data: DEFAULT_SCOPE_PROCEDURES.map((row) => ({
          code: row.code,
          name: row.name,
          category: row.definitionJson.category || null,
          definitionJson: scopeJson(row.definitionJson),
          isActive: row.isActive !== false,
          version: row.version || 1,
        })),
        skipDuplicates: true,
      });
      if (families.count || procedures.count)
        await this.audit(
          tx,
          'SEED_DEFAULTS',
          'library',
          actorUserId,
          undefined,
          { families: families.count, procedures: procedures.count },
        );
      return {
        families: families.count,
        procedures: procedures.count,
        profiles: 0,
      };
    });
  }

  async upsertFamily(
    code: string,
    dto: UpsertTechnicalFamilyDto,
    actorUserId: string,
  ) {
    await this.libraryAccess(actorUserId, true);
    technicalCode(code);
    const definition = familyDefinition(dto.definitionJson, dto.kind);
    return this.db.$transaction(async (tx) => {
      await this.assertReferences(tx, [], definition.procedureCodes || []);
      const before = await tx.technicalScopeFamily.findUnique({
        where: { code },
      });
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Informe o nome da familia.');
      const row = await tx.technicalScopeFamily.upsert({
        where: { code },
        create: {
          code,
          name,
          kind: dto.kind,
          definitionJson: scopeJson(definition),
          isActive: dto.isActive ?? true,
        },
        update: {
          name,
          kind: dto.kind,
          definitionJson: scopeJson(definition),
          isActive: dto.isActive ?? before?.isActive ?? true,
          version: { increment: 1 },
        },
      });
      await this.audit(
        tx,
        before ? 'UPDATE_FAMILY' : 'CREATE_FAMILY',
        row.id,
        actorUserId,
        before,
        row,
      );
      return row;
    });
  }

  async upsertProcedure(
    code: string,
    dto: UpsertTechnicalProcedureDto,
    actorUserId: string,
  ) {
    await this.libraryAccess(actorUserId, true);
    technicalCode(code);
    const definition = procedureDefinition(dto.definitionJson);
    if (dto.category !== undefined)
      definition.category = dto.category.trim() || undefined;
    return this.db.$transaction(async (tx) => {
      await this.assertReferences(
        tx,
        [
          ...(definition.requiredMaterialFamilyCodes || []),
          ...(definition.requiredServiceFamilyCodes || []),
        ],
        (definition.dependsOnCodes || []).filter((value) => value !== code),
      );
      const before = await tx.technicalScopeProcedure.findUnique({
        where: { code },
      });
      const name = dto.name.trim();
      if (!name)
        throw new BadRequestException('Informe o nome do procedimento.');
      const row = await tx.technicalScopeProcedure.upsert({
        where: { code },
        create: {
          code,
          name,
          category: definition.category || null,
          definitionJson: scopeJson(definition),
          isActive: dto.isActive ?? true,
        },
        update: {
          name,
          category: definition.category || null,
          definitionJson: scopeJson(definition),
          isActive: dto.isActive ?? before?.isActive ?? true,
          version: { increment: 1 },
        },
      });
      await this.audit(
        tx,
        before ? 'UPDATE_PROCEDURE' : 'CREATE_PROCEDURE',
        row.id,
        actorUserId,
        before,
        row,
      );
      return row;
    });
  }

  async upsertProfile(
    catalogItemId: string,
    dto: UpsertCatalogTechnicalProfileDto,
    actorUserId: string,
  ) {
    await this.libraryAccess(actorUserId, true);
    const familyCodes = technicalCodes(dto.familyCodes, 'familias');
    const procedureCodes = technicalCodes(dto.procedureCodes, 'procedimentos');
    const includedProcedureCodes = technicalCodes(
      dto.includedProcedureCodes,
      'procedimentos incluidos',
    );
    const compatibility = technicalCompatibility(dto.compatibility);
    return this.db.$transaction(async (tx) => {
      const product = await tx.catalogItem.findUnique({
        where: { id: catalogItemId },
        select: { id: true, type: true, isActive: true },
      });
      if (!product || (!product.isActive && dto.isActive !== false))
        throw new BadRequestException('Selecione um item ativo do catalogo.');
      await this.assertReferences(tx, familyCodes, [
        ...procedureCodes,
        ...includedProcedureCodes,
      ]);
      const families = await tx.technicalScopeFamily.findMany({
        where: { code: { in: familyCodes } },
        select: { kind: true },
      });
      if (
        families.some(
          (family) =>
            family.kind !==
            (product.type === 'SERVICE' ? 'SERVICE' : 'MATERIAL'),
        )
      )
        throw new BadRequestException(
          'A familia tecnica deve corresponder ao tipo material ou servico do item.',
        );
      if (includedProcedureCodes.length && product.type !== 'SERVICE')
        throw new BadRequestException(
          'Somente servicos podem contratar procedimentos incluidos.',
        );
      const before = await tx.catalogTechnicalProfile.findUnique({
        where: { catalogItemId },
      });
      const data = {
        familyCodes,
        procedureCodes,
        includedProcedureCodes,
        compatibility: compatibility
          ? scopeJson(compatibility)
          : Prisma.JsonNull,
        isActive: dto.isActive ?? before?.isActive ?? true,
      };
      const row = await tx.catalogTechnicalProfile.upsert({
        where: { catalogItemId },
        create: { catalogItemId, ...data },
        update: { ...data, version: { increment: 1 } },
      });
      await this.audit(
        tx,
        before ? 'UPDATE_PROFILE' : 'CREATE_PROFILE',
        row.id,
        actorUserId,
        before,
        row,
      );
      return row;
    });
  }

  async preview(dto: PreviewTechnicalScopeDto, actorUserId: string) {
    const actor = await this.actor(actorUserId);
    this.access(actor, 'proposals', dto.proposalId ? 'update' : 'create');
    assertPortfolio(actor, portfolioForProposal(dto.type));
    const existing = dto.proposalId
      ? await this.db.proposal.findUnique({
          where: { id: dto.proposalId },
          select: {
            id: true,
            clientId: true,
            generatorId: true,
            type: true,
            status: true,
          },
        })
      : null;
    if (dto.proposalId && !existing)
      throw new NotFoundException('Proposta nao encontrada.');
    if (existing) {
      assertPortfolio(actor, portfolioForProposal(existing.type));
      if (existing.status !== ProposalStatus.DRAFT)
        throw new BadRequestException(
          'Gere uma revisao em rascunho para alterar o escopo.',
        );
    }
    const clientId = dto.clientId || existing?.clientId;
    const generatorId = dto.generatorId || existing?.generatorId;
    if (
      clientId &&
      !(await this.db.client.findUnique({
        where: { id: clientId },
        select: { id: true },
      }))
    )
      throw new BadRequestException('Cliente nao encontrado.');
    const source = await resolveTechnicalScopeSource(this.db, {
      ...dto,
      clientId,
      generatorId,
    });
    const library = await loadTechnicalScopeLibrary(
      this.db,
      source.items.flatMap((item) =>
        item.catalogItemId ? [item.catalogItemId] : [],
      ),
    );
    return {
      ...composeTechnicalScope({ ...source, ...library }),
      procedureOptions: library.procedures
        .filter((procedure) => procedure.isActive !== false)
        .map((procedure) => ({ code: procedure.code, name: procedure.name })),
      canClassify: true,
    };
  }

  async history(proposalId: string, actorUserId: string) {
    const actor = await this.actor(actorUserId);
    this.access(actor, 'proposals', 'view');
    const proposal = await this.db.proposal.findUnique({
      where: { id: proposalId },
      select: { id: true, type: true },
    });
    if (!proposal) throw new NotFoundException('Proposta nao encontrada.');
    assertPortfolio(actor, portfolioForProposal(proposal.type));
    return this.db.proposalTechnicalScopeVersion.findMany({
      where: { proposalId },
      orderBy: { version: 'desc' },
      take: 100,
    });
  }

  private async assertReferences(
    tx: Prisma.TransactionClient,
    familyCodes: string[],
    procedureCodes: string[],
  ) {
    const [families, procedures] = await Promise.all([
      familyCodes.length
        ? tx.technicalScopeFamily.findMany({
            where: { code: { in: [...new Set(familyCodes)] } },
            select: { code: true },
          })
        : Promise.resolve([]),
      procedureCodes.length
        ? tx.technicalScopeProcedure.findMany({
            where: { code: { in: [...new Set(procedureCodes)] } },
            select: { code: true },
          })
        : Promise.resolve([]),
    ]);
    if (
      families.length !== new Set(familyCodes).size ||
      procedures.length !== new Set(procedureCodes).size
    )
      throw new BadRequestException(
        'Uma familia ou procedimento referenciado nao existe na biblioteca.',
      );
  }
  private async audit(
    tx: Prisma.TransactionClient,
    action: string,
    entityId: string,
    actorUserId: string,
    before: unknown,
    after: unknown,
  ) {
    await tx.systemAuditLog.create({
      data: {
        domain: AuditDomain.INVENTORY,
        entityType: 'TECHNICAL_SCOPE_LIBRARY',
        entityId,
        action,
        actorUserId,
        ...(before ? { beforePayload: scopeJson(before) } : {}),
        afterPayload: scopeJson(after),
      },
    });
  }
}
