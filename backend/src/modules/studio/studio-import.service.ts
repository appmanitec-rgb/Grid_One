import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditDomain,
  ClientAddressType,
  ClientContactStatus,
  ClientPersonType,
  ClientType,
  Prisma,
  StudioImportBatchStatus,
  StudioImportMode,
  StudioImportRowStatus,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';

type StudioActor = {
  sub?: string;
  role?: string;
  isSystemMaster?: boolean;
  accessPolicy?: Record<string, any>;
};

type ImportIssue = {
  code: string;
  message: string;
  field?: string;
};

type ImportFieldDefinition = {
  key: string;
  label: string;
  aliases: string[];
  required?: boolean;
  normalize?: (value: string) => unknown;
  validate?: (value: unknown, row: Record<string, unknown>) => ImportIssue[];
};

type ImportDefinition = {
  resource: string;
  label: string;
  mode: StudioImportMode;
  resourceCreatePermission: string;
  domain: AuditDomain;
  entityType: string;
  uniqueField: string;
  fields: ImportFieldDefinition[];
  findDuplicates: (
    tx: Prisma.TransactionClient,
    values: string[],
  ) => Promise<Set<string>>;
  createRecord: (
    tx: Prisma.TransactionClient,
    data: Record<string, unknown>,
  ) => Promise<{ id: string }>;
};

type PreviewInput = {
  resource: string;
  originalFileName?: string;
  csv: string;
  mode?: StudioImportMode;
  columnMapping?: Record<string, string>;
};

const SUPPLIER_IMPORT_DEFINITION: ImportDefinition = {
  resource: 'suppliers',
  label: 'Fornecedores',
  mode: StudioImportMode.CREATE_ONLY,
  resourceCreatePermission: 'purchaseOrders.create',
  domain: AuditDomain.PURCHASE_ORDERS,
  entityType: 'Supplier',
  uniqueField: 'cnpj',
  fields: [
    {
      key: 'companyName',
      label: 'Razao Social',
      aliases: ['razao social', 'razão social', 'empresa', 'fornecedor', 'nome'],
      required: true,
      normalize: normalizeText,
    },
    {
      key: 'tradeName',
      label: 'Nome Fantasia',
      aliases: ['nome fantasia', 'fantasia', 'apelido'],
      normalize: normalizeText,
    },
    {
      key: 'cnpj',
      label: 'CNPJ',
      aliases: ['cnpj', 'documento', 'cpf/cnpj'],
      required: true,
      normalize: normalizeDigits,
      validate: (value) => {
        const cnpj = String(value || '');
        if (!isValidCnpj(cnpj)) {
          return [
            {
              code: 'INVALID_CNPJ',
              field: 'cnpj',
              message: 'CNPJ invalido.',
            },
          ];
        }
        return [];
      },
    },
    {
      key: 'email',
      label: 'E-mail',
      aliases: ['email', 'e-mail', 'mail'],
      normalize: (value) => normalizeText(value)?.toLowerCase() ?? null,
      validate: (value) => {
        if (!value) return [];
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))
          ? []
          : [{ code: 'INVALID_EMAIL', field: 'email', message: 'E-mail invalido.' }];
      },
    },
    {
      key: 'phone',
      label: 'Telefone',
      aliases: ['telefone', 'tel', 'celular', 'whatsapp'],
      normalize: normalizeText,
      validate: (value) =>
        value
          ? []
          : [
              {
                code: 'MISSING_PHONE',
                field: 'phone',
                message: 'Telefone ausente.',
              },
            ],
    },
    {
      key: 'city',
      label: 'Cidade',
      aliases: ['cidade', 'municipio', 'município'],
      normalize: normalizeText,
    },
    {
      key: 'state',
      label: 'Estado',
      aliases: ['estado', 'uf'],
      normalize: (value) => normalizeText(value)?.toUpperCase().slice(0, 2) ?? null,
    },
    {
      key: 'paymentTerm',
      label: 'Condicao de Pagamento',
      aliases: ['condicao pagamento', 'condição pagamento', 'pagamento', 'prazo'],
      normalize: normalizeText,
    },
  ],
  findDuplicates: async (tx, values) => {
    const suppliers = await tx.supplier.findMany({
      where: { cnpj: { in: values } },
      select: { cnpj: true },
    });
    return new Set(
      suppliers
        .map((supplier) => supplier.cnpj)
        .filter((cnpj): cnpj is string => Boolean(cnpj)),
    );
  },
  createRecord: (tx, data) =>
    tx.supplier.create({
      data: {
        companyName: String(data.companyName),
        tradeName: nullableString(data.tradeName),
        cnpj: String(data.cnpj),
        email: nullableString(data.email),
        phone: nullableString(data.phone),
        city: nullableString(data.city),
        state: nullableString(data.state),
        paymentTerm: nullableString(data.paymentTerm),
        categories: [],
        representedBrands: [],
      },
      select: { id: true },
    }),
};

const CLIENT_IMPORT_DEFINITION: ImportDefinition = {
  resource: 'clients',
  label: 'Clientes',
  mode: StudioImportMode.CREATE_ONLY,
  resourceCreatePermission: 'clients.create',
  domain: AuditDomain.USERS,
  entityType: 'Client',
  uniqueField: 'cnpj',
  fields: [
    {
      key: 'companyName',
      label: 'Razao Social',
      aliases: ['razao social', 'razÃ£o social', 'empresa', 'cliente', 'nome'],
      required: true,
      normalize: normalizeText,
    },
    {
      key: 'tradeName',
      label: 'Nome Fantasia',
      aliases: ['nome fantasia', 'fantasia', 'apelido'],
      normalize: normalizeText,
    },
    {
      key: 'cnpj',
      label: 'CNPJ/CPF',
      aliases: ['cnpj', 'cpf', 'documento', 'cpf/cnpj'],
      required: true,
      normalize: normalizeDigits,
      validate: (value) => {
        const document = String(value || '');
        if (!isValidBrazilDocument(document)) {
          return [
            {
              code: 'INVALID_DOCUMENT',
              field: 'cnpj',
              message: 'CNPJ/CPF invalido ou incompleto.',
            },
          ];
        }
        return [];
      },
    },
    {
      key: 'email',
      label: 'E-mail',
      aliases: ['email', 'e-mail', 'mail'],
      normalize: (value) => normalizeText(value)?.toLowerCase() ?? null,
      validate: validateOptionalEmail('email'),
    },
    {
      key: 'phone',
      label: 'Telefone',
      aliases: ['telefone', 'tel', 'celular', 'whatsapp'],
      normalize: normalizeText,
      validate: (value, row) =>
        value || row.contact01Phone || row.contact01Mobile
          ? []
          : [
              {
                code: 'MISSING_PHONE',
                field: 'phone',
                message: 'Telefone ausente. O cadastro sera criado com telefone padrao.',
              },
            ],
    },
    {
      key: 'address',
      label: 'Endereco resumido',
      aliases: ['endereco', 'endereÃ§o', 'endereco completo', 'endereÃ§o completo'],
      normalize: normalizeText,
    },
    {
      key: 'city',
      label: 'Cidade',
      aliases: ['cidade', 'municipio', 'municÃ­pio'],
      normalize: normalizeText,
      validate: (value, row) =>
        value || row.billingCity || row.installationCity
          ? []
          : [{ code: 'MISSING_CITY', field: 'city', message: 'Cidade obrigatoria.' }],
    },
    {
      key: 'state',
      label: 'UF',
      aliases: ['estado', 'uf'],
      normalize: normalizeUf,
      validate: (value, row) =>
        value || row.billingState || row.installationState
          ? []
          : [{ code: 'MISSING_STATE', field: 'state', message: 'UF obrigatoria.' }],
    },
    {
      key: 'stateRegistration',
      label: 'Inscricao Estadual',
      aliases: ['inscricao estadual', 'inscriÃ§Ã£o estadual', 'ie'],
      normalize: normalizeText,
    },
    {
      key: 'municipalRegistration',
      label: 'Inscricao Municipal',
      aliases: ['inscricao municipal', 'inscriÃ§Ã£o municipal', 'im'],
      normalize: normalizeText,
    },
    { key: 'cnae', label: 'CNAE', aliases: ['cnae'], normalize: normalizeText },
    {
      key: 'segment',
      label: 'Segmento',
      aliases: ['segmento', 'ramo', 'atividade'],
      normalize: normalizeText,
    },
    {
      key: 'preferences',
      label: 'Preferencias',
      aliases: ['preferencias', 'preferÃªncias', 'observacoes', 'observaÃ§Ãµes'],
      normalize: normalizeText,
    },
    {
      key: 'clientType',
      label: 'Tipo',
      aliases: ['tipo', 'tipo cliente', 'contrato'],
      normalize: normalizeClientType,
    },
    {
      key: 'personType',
      label: 'Pessoa',
      aliases: ['pessoa', 'tipo pessoa', 'fisica juridica', 'fÃ­sica jurÃ­dica'],
      normalize: normalizePersonType,
    },
    {
      key: 'paymentTermDefault',
      label: 'Condicao Padrao',
      aliases: ['condicao pagamento', 'condiÃ§Ã£o pagamento', 'pagamento', 'prazo'],
      normalize: normalizeText,
    },
    {
      key: 'creditLimit',
      label: 'Limite Credito',
      aliases: ['limite credito', 'limite crÃ©dito', 'credito', 'crÃ©dito'],
      normalize: normalizeNumberInput,
    },
    {
      key: 'priceTableCode',
      label: 'Tabela Preco',
      aliases: ['tabela preco', 'tabela preÃ§o', 'tabela'],
      normalize: normalizeText,
    },
    {
      key: 'isDelinquent',
      label: 'Inadimplente',
      aliases: ['inadimplente'],
      normalize: normalizeBooleanInput,
    },
    {
      key: 'withholdsInss',
      label: 'Retem INSS',
      aliases: ['retem inss', 'retÃ©m inss', 'inss'],
      normalize: normalizeBooleanInput,
    },
    {
      key: 'withholdsIss',
      label: 'Retem ISS',
      aliases: ['retem iss', 'retÃ©m iss', 'iss'],
      normalize: normalizeBooleanInput,
    },
    ...clientAddressFields('billing', 'Cobranca', 'cobranca'),
    ...clientAddressFields('installation', 'Instalacao', 'instalacao'),
    ...clientContactFields(1),
    ...clientContactFields(2),
    ...clientContactFields(3),
  ],
  findDuplicates: async (tx, values) => {
    const clients = await tx.client.findMany({
      where: { cnpj: { in: values } },
      select: { cnpj: true },
    });
    return new Set(clients.map((client) => client.cnpj));
  },
  createRecord: (tx, data) => {
    const city = String(
      data.city || data.billingCity || data.installationCity || '',
    ).trim();
    const state = String(
      data.state || data.billingState || data.installationState || '',
    )
      .trim()
      .toUpperCase()
      .slice(0, 2);
    const phone =
      nullableString(data.phone) ||
      nullableString(data.contact01Phone) ||
      nullableString(data.contact01Mobile) ||
      '-';
    const addresses = [
      buildClientAddress(data, 'billing', ClientAddressType.BILLING, city, state),
      buildClientAddress(
        data,
        'installation',
        ClientAddressType.INSTALLATION,
        city,
        state,
      ),
    ].filter((address): address is NonNullable<typeof address> => Boolean(address));
    const contacts = [1, 2, 3]
      .map((index) => buildClientContact(data, index))
      .filter((contact): contact is NonNullable<typeof contact> => Boolean(contact));

    return tx.client.create({
      data: {
        companyName: String(data.companyName),
        tradeName: nullableString(data.tradeName),
        cnpj: String(data.cnpj),
        email: nullableString(data.email),
        phone,
        address: nullableString(data.address) || addresses[0]?.street,
        city,
        state,
        stateRegistration: nullableString(data.stateRegistration),
        municipalRegistration: nullableString(data.municipalRegistration),
        cnae: nullableString(data.cnae),
        segment: nullableString(data.segment),
        preferences: nullableString(data.preferences),
        clientType: (data.clientType as ClientType | undefined) ?? ClientType.NO_CONTRACT,
        personType:
          (data.personType as ClientPersonType | undefined) ??
          ClientPersonType.LEGAL_ENTITY,
        paymentTermDefault: nullableString(data.paymentTermDefault),
        creditLimit:
          typeof data.creditLimit === 'number' ? data.creditLimit : undefined,
        priceTableCode: nullableString(data.priceTableCode),
        isDelinquent: Boolean(data.isDelinquent),
        withholdsInss: Boolean(data.withholdsInss),
        withholdsIss: Boolean(data.withholdsIss),
        ...(addresses.length > 0 ? { addresses: { create: addresses } } : {}),
        ...(contacts.length > 0 ? { contacts: { create: contacts } } : {}),
      },
      select: { id: true },
    });
  },
};

const IMPORT_DEFINITIONS: Record<string, ImportDefinition> = {
  clients: CLIENT_IMPORT_DEFINITION,
  suppliers: SUPPLIER_IMPORT_DEFINITION,
};

@Injectable()
export class StudioImportService {
  constructor(private readonly prisma: DatabaseService) {}

  async preview(input: PreviewInput, actor: StudioActor) {
    const definition = this.getDefinition(input.resource);
    this.assertCanImport(actor, definition);

    if (input.mode && input.mode !== StudioImportMode.CREATE_ONLY) {
      throw new BadRequestException('Nesta versao, use somente CREATE_ONLY.');
    }

    const parsedRows = parseCsv(input.csv);
    const analyzed = await this.analyzeRows(definition, parsedRows, input.columnMapping);
    const summary = summarizeRows(analyzed);

    const batch = await this.prisma.$transaction(async (tx) => {
      const createdBatch = await tx.studioImportBatch.create({
        data: {
          resource: definition.resource,
          originalFileName: input.originalFileName,
          mode: StudioImportMode.CREATE_ONLY,
          status: StudioImportBatchStatus.PREVIEW,
          totalRows: summary.total,
          validRows: summary.valid,
          warningRows: summary.warnings,
          invalidRows: summary.invalid,
          duplicateRows: summary.duplicates,
          skippedRows: summary.duplicates,
          summary: summary as any,
          createdById: actor.sub,
        },
      });

      if (analyzed.length > 0) {
        await tx.studioImportRow.createMany({
          data: analyzed.map((row) => ({
            batchId: createdBatch.id,
            rowNumber: row.rowNumber,
            rawData: row.rawData as any,
            normalizedData: row.normalizedData as any,
            status: row.status,
            errors: row.errors as any,
            warnings: row.warnings as any,
          })),
        });
      }

      return createdBatch;
    });

    return {
      batchId: batch.id,
      resource: definition.resource,
      mode: batch.mode,
      status: batch.status,
      summary,
      rows: analyzed.slice(0, 100),
    };
  }

  async execute(batchId: string, actor: StudioActor) {
    const batch = await this.prisma.studioImportBatch.findUnique({
      where: { id: batchId },
      include: { rows: { orderBy: { rowNumber: 'asc' } } },
    });
    if (!batch) throw new NotFoundException('Importacao nao encontrada.');
    if (batch.status !== StudioImportBatchStatus.PREVIEW) {
      throw new BadRequestException('Esta importacao nao esta pronta para executar.');
    }

    const definition = this.getDefinition(batch.resource);
    this.assertCanImport(actor, definition);

    const analyzed = await this.analyzeRows(
      definition,
      batch.rows.map((row) => ({
        rowNumber: row.rowNumber,
        rawData: row.rawData as Record<string, string>,
      })),
    );
    const executable = analyzed.filter(
      (row) =>
        row.status === StudioImportRowStatus.VALID ||
        row.status === StudioImportRowStatus.WARNING,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.studioImportBatch.update({
        where: { id: batchId },
        data: {
          status: StudioImportBatchStatus.PROCESSING,
          startedAt: new Date(),
        },
      });

      let createdRows = 0;
      let failedRows = 0;
      let skippedRows = analyzed.filter(
        (row) =>
          row.status === StudioImportRowStatus.DUPLICATE ||
          row.status === StudioImportRowStatus.INVALID,
      ).length;

      for (const row of executable) {
        try {
          const created = await definition.createRecord(tx, row.normalizedData);
          createdRows += 1;
          await tx.studioImportRow.updateMany({
            where: { batchId, rowNumber: row.rowNumber },
            data: {
              status: StudioImportRowStatus.CREATED,
              normalizedData: row.normalizedData as any,
              errors: [],
              warnings: row.warnings as any,
              recordId: created.id,
            },
          });
          await tx.systemAuditLog.create({
            data: {
              domain: definition.domain,
              entityType: definition.entityType,
              entityId: created.id,
              action: 'IMPORT_CREATE',
              actorUserId: actor.sub,
              afterPayload: {
                source: 'MANITEC_STUDIO',
                importBatchId: batchId,
                resource: definition.resource,
                rowNumber: row.rowNumber,
                value: row.normalizedData,
              } as any,
              reason: `Registro criado pela importacao ${batchId}.`,
            },
          });
        } catch (error: unknown) {
          failedRows += 1;
          await tx.studioImportRow.updateMany({
            where: { batchId, rowNumber: row.rowNumber },
            data: {
              status: StudioImportRowStatus.FAILED,
              errors: [
                {
                  code: 'CREATE_FAILED',
                  message:
                    error instanceof Error
                      ? error.message
                      : 'Falha ao criar registro.',
                },
              ] as any,
            },
          });
        }
      }

      const finalStatus =
        failedRows > 0 || skippedRows > 0
          ? StudioImportBatchStatus.COMPLETED_WITH_ERRORS
          : StudioImportBatchStatus.COMPLETED;

      const updatedBatch = await tx.studioImportBatch.update({
        where: { id: batchId },
        data: {
          status: finalStatus,
          totalRows: analyzed.length,
          validRows: analyzed.filter((row) => row.status === StudioImportRowStatus.VALID)
            .length,
          warningRows: analyzed.filter(
            (row) => row.status === StudioImportRowStatus.WARNING,
          ).length,
          invalidRows: analyzed.filter(
            (row) => row.status === StudioImportRowStatus.INVALID,
          ).length,
          duplicateRows: analyzed.filter(
            (row) => row.status === StudioImportRowStatus.DUPLICATE,
          ).length,
          createdRows,
          skippedRows,
          failedRows,
          completedAt: new Date(),
          summary: {
            ...summarizeRows(analyzed),
            created: createdRows,
            skipped: skippedRows,
            failed: failedRows,
          } as any,
        },
      });

      return updatedBatch;
    });

    return this.findOne(result.id);
  }

  async findAll() {
    return this.prisma.studioImportBatch.findMany({
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(id: string) {
    const batch = await this.prisma.studioImportBatch.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        rows: { orderBy: { rowNumber: 'asc' }, take: 500 },
      },
    });
    if (!batch) throw new NotFoundException('Importacao nao encontrada.');
    return batch;
  }

  private async analyzeRows(
    definition: ImportDefinition,
    parsedRows: Array<{ rowNumber: number; rawData: Record<string, string> }>,
    columnMapping?: Record<string, string>,
  ) {
    const normalizedRows = parsedRows
      .filter((row) => !isEmptyRow(row.rawData))
      .map((row) => {
        const normalizedData = normalizeRow(definition, row.rawData, columnMapping);
        const errors = validateRequired(definition, normalizedData);
        const warnings: ImportIssue[] = [];

        for (const field of definition.fields) {
          const value = normalizedData[field.key];
          const issues = field.validate?.(value, normalizedData) ?? [];
          for (const issue of issues) {
            if (issue.code === 'MISSING_PHONE') warnings.push(issue);
            else errors.push(issue);
          }
        }

        return {
          rowNumber: row.rowNumber,
          rawData: row.rawData,
          normalizedData,
          errors,
          warnings,
          status: StudioImportRowStatus.VALID,
        };
      });

    const seen = new Set<string>();
    const uniqueValues = normalizedRows
      .map((row) => String(row.normalizedData[definition.uniqueField] || ''))
      .filter(Boolean);
    const existing = await this.prisma.$transaction((tx) =>
      definition.findDuplicates(tx, uniqueValues),
    );

    return normalizedRows.map((row) => {
      const uniqueValue = String(row.normalizedData[definition.uniqueField] || '');
      const errors = [...row.errors];
      const warnings = [...row.warnings];

      if (uniqueValue) {
        if (seen.has(uniqueValue) || existing.has(uniqueValue)) {
          errors.push({
            code: 'DUPLICATE_RECORD',
            field: definition.uniqueField,
            message: 'Registro duplicado pela chave de importacao.',
          });
        }
        seen.add(uniqueValue);
      }

      const status =
        errors.some((issue) => issue.code === 'DUPLICATE_RECORD')
          ? StudioImportRowStatus.DUPLICATE
          : errors.length > 0
            ? StudioImportRowStatus.INVALID
            : warnings.length > 0
              ? StudioImportRowStatus.WARNING
              : StudioImportRowStatus.VALID;

      return { ...row, errors, warnings, status };
    });
  }

  private getDefinition(resource: string) {
    const definition = IMPORT_DEFINITIONS[resource];
    if (!definition) {
      throw new NotFoundException('Importador nao registrado para este recurso.');
    }
    return definition;
  }

  private assertCanImport(actor: StudioActor, definition: ImportDefinition) {
    if (actor.isSystemMaster || actor.role === 'ADMIN') return;
    if (!hasPermission(actor.accessPolicy, 'studio.dataImport')) {
      throw new ForbiddenException(
        'Seu perfil nao possui permissao para importar pelo Studio.',
      );
    }
    if (!hasPermission(actor.accessPolicy, definition.resourceCreatePermission)) {
      throw new ForbiddenException(
        'Seu perfil nao possui permissao para criar registros deste recurso.',
      );
    }
  }
}

function hasPermission(accessPolicy: Record<string, any> | undefined, permission: string) {
  const [sectionKey, actionKey] = permission.split('.');
  return accessPolicy?.[sectionKey]?.[actionKey] === true;
}

function normalizeRow(
  definition: ImportDefinition,
  rawData: Record<string, string>,
  columnMapping?: Record<string, string>,
) {
  const normalized: Record<string, unknown> = {};
  const normalizedHeaders = Object.keys(rawData).map((header) => ({
    original: header,
    comparable: comparableHeader(header),
  }));

  for (const field of definition.fields) {
    const explicitHeader = Object.entries(columnMapping ?? {}).find(
      ([, fieldKey]) => fieldKey === field.key,
    )?.[0];
    const header =
      explicitHeader ||
      normalizedHeaders.find((candidate) =>
        [field.key, field.label, ...field.aliases]
          .map(comparableHeader)
          .includes(candidate.comparable),
      )?.original;
    const rawValue = header ? rawData[header] ?? '' : '';
    normalized[field.key] = field.normalize
      ? field.normalize(rawValue)
      : normalizeText(rawValue);
  }

  return normalized;
}

function validateRequired(definition: ImportDefinition, row: Record<string, unknown>) {
  const errors: ImportIssue[] = [];
  for (const field of definition.fields) {
    if (!field.required) continue;
    const value = row[field.key];
    if (value === null || value === undefined || String(value).trim() === '') {
      errors.push({
        code: 'REQUIRED_FIELD',
        field: field.key,
        message: `${field.label} e obrigatorio.`,
      });
    }
  }
  return errors;
}

function summarizeRows(
  rows: Array<{
    status: StudioImportRowStatus;
    errors: ImportIssue[];
    warnings: ImportIssue[];
  }>,
) {
  return {
    total: rows.length,
    valid: rows.filter((row) => row.status === StudioImportRowStatus.VALID).length,
    warnings: rows.filter((row) => row.status === StudioImportRowStatus.WARNING)
      .length,
    invalid: rows.filter((row) => row.status === StudioImportRowStatus.INVALID)
      .length,
    duplicates: rows.filter((row) => row.status === StudioImportRowStatus.DUPLICATE)
      .length,
  };
}

function parseCsv(text: string) {
  const clean = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!clean) throw new BadRequestException('CSV vazio.');
  const lines = clean.split(/\r?\n/).filter((line) => line.trim());
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map((header) => header.trim());
  if (headers.length === 0) throw new BadRequestException('Cabecalho do CSV ausente.');

  return lines.slice(1).map((line, index) => {
    const values = splitCsvLine(line, delimiter);
    const rawData = headers.reduce<Record<string, string>>((row, header, headerIndex) => {
      row[header] = values[headerIndex]?.trim() ?? '';
      return row;
    }, {});
    return { rowNumber: index + 2, rawData };
  });
}

function detectDelimiter(headerLine: string) {
  const semicolonCount = (headerLine.match(/;/g) || []).length;
  const commaCount = (headerLine.match(/,/g) || []).length;
  return semicolonCount >= commaCount ? ';' : ',';
}

function splitCsvLine(line: string, delimiter: string) {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      values.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

function isEmptyRow(row: Record<string, string>) {
  return Object.values(row).every((value) => !String(value || '').trim());
}

function comparableHeader(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeText(value: string) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeDigits(value: string) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeUf(value: string) {
  return normalizeText(value)?.toUpperCase().slice(0, 2) ?? null;
}

function normalizeNumberInput(value: string) {
  const text = String(value || '').trim();
  if (!text) return null;
  const normalized = text.replace(/\./g, '').replace(',', '.');
  const numberValue = Number(normalized);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeBooleanInput(value: string) {
  const comparable = comparableHeader(value);
  return ['1', 'sim', 's', 'true', 'yes', 'y'].includes(comparable);
}

function normalizeClientType(value: string) {
  const comparable = comparableHeader(value);
  if (!comparable) return ClientType.NO_CONTRACT;
  if (
    comparable.includes('sem contrato') ||
    comparable.includes('no contract') ||
    comparable === 'no_contract'
  ) {
    return ClientType.NO_CONTRACT;
  }
  if (
    comparable.includes('com contrato') ||
    comparable.includes('contract') ||
    comparable === 'contrato'
  ) {
    return ClientType.CONTRACT;
  }
  return ClientType.NO_CONTRACT;
}

function normalizePersonType(value: string) {
  const comparable = comparableHeader(value);
  if (
    comparable.includes('fisica') ||
    comparable.includes('cpf') ||
    comparable.includes('individual')
  ) {
    return ClientPersonType.INDIVIDUAL;
  }
  return ClientPersonType.LEGAL_ENTITY;
}

function validateOptionalEmail(field: string) {
  return (value: unknown) => {
    if (!value) return [];
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))
      ? []
      : [{ code: 'INVALID_EMAIL', field, message: 'E-mail invalido.' }];
  };
}

function clientAddressFields(
  prefix: 'billing' | 'installation',
  label: string,
  aliasPrefix: string,
): ImportFieldDefinition[] {
  return [
    {
      key: `${prefix}Street`,
      label: `Rua ${label}`,
      aliases: [
        `rua ${aliasPrefix}`,
        `logradouro ${aliasPrefix}`,
        `${aliasPrefix} rua`,
        `${aliasPrefix} logradouro`,
      ],
      normalize: normalizeText,
    },
    {
      key: `${prefix}Number`,
      label: `Numero ${label}`,
      aliases: [`numero ${aliasPrefix}`, `n ${aliasPrefix}`, `${aliasPrefix} numero`],
      normalize: normalizeText,
    },
    {
      key: `${prefix}Complement`,
      label: `Complemento ${label}`,
      aliases: [`complemento ${aliasPrefix}`, `${aliasPrefix} complemento`],
      normalize: normalizeText,
    },
    {
      key: `${prefix}District`,
      label: `Bairro ${label}`,
      aliases: [`bairro ${aliasPrefix}`, `${aliasPrefix} bairro`, `lote ${aliasPrefix}`],
      normalize: normalizeText,
    },
    {
      key: `${prefix}ZipCode`,
      label: `CEP ${label}`,
      aliases: [`cep ${aliasPrefix}`, `${aliasPrefix} cep`],
      normalize: normalizeText,
    },
    {
      key: `${prefix}City`,
      label: `Cidade ${label}`,
      aliases: [`cidade ${aliasPrefix}`, `${aliasPrefix} cidade`],
      normalize: normalizeText,
    },
    {
      key: `${prefix}State`,
      label: `UF ${label}`,
      aliases: [`uf ${aliasPrefix}`, `estado ${aliasPrefix}`, `${aliasPrefix} uf`],
      normalize: normalizeUf,
    },
  ];
}

function clientContactFields(index: 1 | 2 | 3): ImportFieldDefinition[] {
  const padded = String(index).padStart(2, '0');
  return [
    {
      key: `contact${padded}Name`,
      label: `Contato ${padded}`,
      aliases: [`contato ${padded}`, `nome contato ${padded}`, `contato ${index}`],
      normalize: normalizeText,
    },
    {
      key: `contact${padded}Role`,
      label: `Cargo ${padded}`,
      aliases: [`cargo ${padded}`, `funcao ${padded}`, `funÃ§Ã£o ${padded}`],
      normalize: normalizeText,
    },
    {
      key: `contact${padded}Phone`,
      label: `Telefone ${padded}`,
      aliases: [`telefone ${padded}`, `tel ${padded}`, `telefone contato ${padded}`],
      normalize: normalizeText,
    },
    {
      key: `contact${padded}Mobile`,
      label: `Celular ${padded}`,
      aliases: [`celular ${padded}`, `whatsapp ${padded}`, `mobile ${padded}`],
      normalize: normalizeText,
    },
    {
      key: `contact${padded}Email`,
      label: `E-mail ${padded}`,
      aliases: [`email ${padded}`, `e-mail ${padded}`, `email contato ${padded}`],
      normalize: (value) => normalizeText(value)?.toLowerCase() ?? null,
      validate: validateOptionalEmail(`contact${padded}Email`),
    },
  ];
}

function buildClientAddress(
  data: Record<string, unknown>,
  prefix: 'billing' | 'installation',
  type: ClientAddressType,
  fallbackCity: string,
  fallbackState: string,
) {
  const street =
    nullableString(data[`${prefix}Street`]) ||
    (prefix === 'billing' ? nullableString(data.address) : undefined);
  if (!street) return null;
  return {
    type,
    street,
    number: nullableString(data[`${prefix}Number`]),
    complement: nullableString(data[`${prefix}Complement`]),
    district: nullableString(data[`${prefix}District`]),
    zipCode: nullableString(data[`${prefix}ZipCode`]),
    city: nullableString(data[`${prefix}City`]) || fallbackCity,
    state: nullableString(data[`${prefix}State`]) || fallbackState,
    country: 'BR',
  };
}

function buildClientContact(data: Record<string, unknown>, index: number) {
  const padded = String(index).padStart(2, '0');
  const name = nullableString(data[`contact${padded}Name`]);
  if (!name) return null;
  return {
    name,
    status: ClientContactStatus.ACTIVE,
    role: nullableString(data[`contact${padded}Role`]),
    phone: nullableString(data[`contact${padded}Phone`]),
    mobile: nullableString(data[`contact${padded}Mobile`]),
    email: nullableString(data[`contact${padded}Email`]),
  };
}

function nullableString(value: unknown) {
  const text = String(value ?? '').trim();
  return text || undefined;
}

function isValidBrazilDocument(value: string) {
  const digits = normalizeDigits(value);
  return (digits.length === 11 || digits.length === 14) && !/^(\d)\1+$/.test(digits);
}

function isValidCnpj(value: string) {
  const cnpj = normalizeDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;

  const calculateDigit = (base: string, factors: number[]) => {
    const sum = factors.reduce(
      (acc, factor, index) => acc + Number(base[index]) * factor,
      0,
    );
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const first = calculateDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calculateDigit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(cnpj[12]) && second === Number(cnpj[13]);
}
