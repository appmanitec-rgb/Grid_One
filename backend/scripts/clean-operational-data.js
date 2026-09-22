const fs = require('fs');
const path = require('path');
const { Prisma, PrismaClient } = require('@prisma/client');

const CONFIRMATION_TOKEN = 'APAGAR_DADOS_OPERACIONAIS';
const MAX_BACKUP_AGE_HOURS = 24;

// These are the only roots this tool is allowed to clean. The complete list
// below is the reviewed dependency closure of these roots in schema.prisma.
const CLEANUP_ROOT_MODELS = [
  'Client',
  'Supplier',
  'CatalogItem',
  'Generator',
  'StudioImportBatch',
  'ApprovalRequest',
  'SystemAuditLog',
  'DocumentShareToken',
  'DocumentDelivery',
  'DocumentAccessLog',
  'AutomationRun',
  'UserPresence',
  'UserSessionActivity',
  'BankMovement',
  'BankStatementImport',
  'BankStatementEntry',
  'BankReconciliationIssue',
  'BankReconciliationClosing',
  'FinancialAuditLog',
  'CostCenterEntry',
  'FinancialPeriodClosing',
  'TimeEntry',
  'CommissionEntry',
  'HrAssetAssignment',
  'FleetAllocation',
];

const REVIEWED_CLEANUP_MODELS = [
  'AccountsPayable',
  'AccountsPayablePayment',
  'AccountsReceivable',
  'AccountsReceivablePayment',
  'ApprovalRequest',
  'AutomationRun',
  'BankMovement',
  'BankReconciliationClosing',
  'BankReconciliationIssue',
  'BankStatementEntry',
  'BankStatementImport',
  'CatalogItem',
  'CatalogItemDocument',
  'CatalogItemIdentifier',
  'CatalogPriceRevision',
  'CatalogSupplierOffer',
  'Client',
  'ClientAddress',
  'ClientAuditLog',
  'ClientContact',
  'CommercialInspection',
  'CommercialInspectionMedia',
  'CommissionEntry',
  'ContractEquipment',
  'ContractInvoice',
  'ContractPreventiveSchedule',
  'ContractRenewal',
  'CostCenterEntry',
  'DocumentAccessLog',
  'DocumentDelivery',
  'DocumentShareToken',
  'FinancialAuditLog',
  'FinancialPeriodClosing',
  'FleetAllocation',
  'Generator',
  'GeneratorBaseItem',
  'HrAssetAssignment',
  'InventoryBalance',
  'InventoryMovement',
  'MaintenanceOrder',
  'MaintenanceOrderMaterial',
  'ModelBaseItem',
  'Proposal',
  'ProposalItem',
  'ProposalMovement',
  'PurchaseOrder',
  'PurchaseOrderItem',
  'PurchaseOrderReceipt',
  'SalesOpportunity',
  'ServiceContract',
  'ServiceReport',
  'ServiceReportChecklistItem',
  'ServiceReportEvidence',
  'ServiceReportShareLink',
  'ServiceReportVersion',
  'ServiceTicket',
  'ServiceTicketComment',
  'Site',
  'StudioImportBatch',
  'StudioImportRow',
  'Supplier',
  'SupplierCatalogItem',
  'SystemAuditLog',
  'TechnicianWorkSession',
  'TelemetryEvent',
  'TimeEntry',
  'UserPresence',
  'UserSessionActivity',
];

// A schema change must never make this script start deleting one of these
// records implicitly. Access policy is stored on User, hence it is protected
// together with authentication/session data.
const CRITICAL_PROTECTED_MODELS = [
  'User',
  'AuthSession',
  'CompanySettings',
  'Technician',
  'UserCertification',
  'UserManufacturerSpecialty',
  'CatalogPricingPolicy',
  'CatalogSkuArea',
  'CatalogSkuFamily',
  'CatalogSkuApplication',
  'CatalogSkuRule',
  'ControlOption',
  'CommercialSizingPolicy',
  'GeneratorModel',
  'GeneratorModelMaintenanceTemplate',
  'Manufacturer',
  'ProposalScopeTemplate',
  'ServiceReportTemplate',
  'Warehouse',
  'BankAccount',
  'BankImportProfile',
  'CommissionRule',
];

function loadEnvFile() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed
      .slice(eqIndex + 1)
      .trim()
      .replace(/^"|"$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

function printHelp() {
  console.log(`
Uso:
  node scripts/clean-operational-data.js
  node scripts/clean-operational-data.js --dry-run
  node scripts/clean-operational-data.js --execute \\
    --confirm=${CONFIRMATION_TOKEN} \\
    --backup=C:\\caminho\\backup.dump

Comportamento:
  - Sem --execute, somente conta e exibe o plano; nenhuma linha e alterada.
  - --execute exige o token exato e um backup local, nao vazio, com no maximo
    ${MAX_BACKUP_AGE_HOURS} horas.
  - A execucao usa uma unica transacao, bloqueios NOWAIT e validacao final.
  - Usuarios, autenticacao, permissoes e configuracoes nao sao apagados.
`);
}

function parseArgs(argv) {
  const options = {
    execute: false,
    dryRun: false,
    help: false,
    confirm: null,
    backup: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--execute') options.execute = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--confirm=')) options.confirm = arg.slice(10);
    else if (arg === '--confirm') options.confirm = argv[++index] || null;
    else if (arg.startsWith('--backup=')) options.backup = arg.slice(9);
    else if (arg === '--backup') options.backup = argv[++index] || null;
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }

  if (options.execute && options.dryRun) {
    throw new Error('Use --execute ou --dry-run, nunca os dois juntos.');
  }

  return options;
}

function assertExecutionGuards(options) {
  if (!options.execute) return null;

  if (options.confirm !== CONFIRMATION_TOKEN) {
    throw new Error(
      `Execucao recusada. Informe --confirm=${CONFIRMATION_TOKEN}.`,
    );
  }

  if (!options.backup) {
    throw new Error('Execucao recusada. Informe --backup=<arquivo.dump>.');
  }

  const backupPath = path.resolve(options.backup);
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup nao encontrado: ${backupPath}`);
  }

  const stat = fs.statSync(backupPath);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`Backup invalido ou vazio: ${backupPath}`);
  }

  const descriptor = fs.openSync(backupPath, 'r');
  const header = Buffer.alloc(Math.min(stat.size, 64 * 1024));
  try {
    fs.readSync(descriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  const isCustomPgDump = header.subarray(0, 5).toString('ascii') === 'PGDMP';
  const isPlainPgDump = header
    .toString('utf8')
    .includes('PostgreSQL database dump');
  if (!isCustomPgDump && !isPlainPgDump) {
    throw new Error(
      `O arquivo informado nao parece ser um dump PostgreSQL restauravel: ${backupPath}`,
    );
  }

  const ageHours = (Date.now() - stat.mtimeMs) / (60 * 60 * 1000);
  if (ageHours > MAX_BACKUP_AGE_HOURS) {
    throw new Error(
      `Backup tem ${ageHours.toFixed(1)} horas. Gere um backup com no maximo ${MAX_BACKUP_AGE_HOURS} horas.`,
    );
  }

  return { path: backupPath, size: stat.size, ageHours };
}

function readSchemaSource() {
  const schemaPath = path.resolve(__dirname, '..', 'prisma', 'schema.prisma');
  return fs.readFileSync(schemaPath, 'utf8').replace(/\r\n/g, '\n').trim();
}

function assertGeneratedClientMatchesSchema(models) {
  const schemaSource = readSchemaSource();
  const generatedSchemaPath = path.resolve(
    __dirname,
    '..',
    'node_modules',
    '.prisma',
    'client',
    'schema.prisma',
  );
  if (!fs.existsSync(generatedSchemaPath)) {
    throw new Error(
      'Prisma Client local nao encontrado. Execute npm run prisma:generate:local antes de continuar.',
    );
  }
  const generatedSource = fs
    .readFileSync(generatedSchemaPath, 'utf8')
    .replace(/\r\n/g, '\n')
    .trim();
  if (schemaSource !== generatedSource) {
    throw new Error(
      'O Prisma Client esta desatualizado em relacao ao schema.prisma. Execute npm run prisma:generate:local antes de continuar.',
    );
  }

  const schemaNames = [...schemaSource.matchAll(/^model\s+(\w+)\s*\{/gm)]
    .map((match) => match[1])
    .sort();
  const clientNames = models.map((model) => model.name).sort();
  if (schemaNames.join('\n') !== clientNames.join('\n')) {
    throw new Error(
      'O Prisma Client esta desatualizado em relacao ao schema.prisma. Execute npm run prisma:generate:local antes de continuar.',
    );
  }
}

function effectiveOnDelete(field) {
  if (field.relationOnDelete) return field.relationOnDelete;
  return field.isRequired ? 'Restrict' : 'SetNull';
}

function relationFields(model) {
  return model.fields.filter(
    (field) => field.kind === 'object' && field.relationFromFields?.length,
  );
}

function deriveRequiredDependencyClosure(models) {
  const selected = new Set(CLEANUP_ROOT_MODELS);
  let changed = true;

  while (changed) {
    changed = false;
    for (const model of models) {
      for (const field of relationFields(model)) {
        const parentWillBeDeleted = selected.has(field.type);
        const childWillBePreserved = !selected.has(model.name);
        if (
          parentWillBeDeleted &&
          childWillBePreserved &&
          effectiveOnDelete(field) !== 'SetNull'
        ) {
          selected.add(model.name);
          changed = true;
        }
      }
    }
  }

  return selected;
}

function setDifference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort();
}

function assertReviewedScope(models) {
  const modelNames = new Set(models.map((model) => model.name));
  const missingRoots = CLEANUP_ROOT_MODELS.filter(
    (modelName) => !modelNames.has(modelName),
  );
  if (missingRoots.length > 0) {
    throw new Error(`Modelos raiz inexistentes: ${missingRoots.join(', ')}.`);
  }

  const reviewed = new Set(REVIEWED_CLEANUP_MODELS);
  const derived = deriveRequiredDependencyClosure(models);
  const missingFromReview = setDifference(derived, reviewed);
  const noLongerRequired = setDifference(reviewed, derived);
  if (missingFromReview.length > 0 || noLongerRequired.length > 0) {
    throw new Error(
      [
        'As relacoes do Prisma mudaram; limpeza recusada ate nova revisao.',
        `Novos dependentes: ${missingFromReview.join(', ') || 'nenhum'}.`,
        `Itens que sairam do fechamento: ${noLongerRequired.join(', ') || 'nenhum'}.`,
      ].join(' '),
    );
  }

  const accidentallyProtected = CRITICAL_PROTECTED_MODELS.filter((name) =>
    reviewed.has(name),
  );
  if (accidentallyProtected.length > 0) {
    throw new Error(
      `Escopo contem modelos protegidos: ${accidentallyProtected.join(', ')}.`,
    );
  }

  return reviewed;
}

function buildDeletionOrder(models, cleanupModels) {
  const outgoing = new Map(
    [...cleanupModels].map((modelName) => [modelName, new Set()]),
  );
  const indegree = new Map(
    [...cleanupModels].map((modelName) => [modelName, 0]),
  );

  for (const model of models) {
    if (!cleanupModels.has(model.name)) continue;
    for (const field of relationFields(model)) {
      if (
        field.type === model.name ||
        !cleanupModels.has(field.type) ||
        effectiveOnDelete(field) === 'SetNull' ||
        outgoing.get(model.name).has(field.type)
      ) {
        continue;
      }

      // child -> parent produces a leaf-first deletion order.
      outgoing.get(model.name).add(field.type);
      indegree.set(field.type, indegree.get(field.type) + 1);
    }
  }

  const ready = [...cleanupModels]
    .filter((modelName) => indegree.get(modelName) === 0)
    .sort();
  const ordered = [];

  while (ready.length > 0) {
    const modelName = ready.shift();
    ordered.push(modelName);
    for (const parentName of [...outgoing.get(modelName)].sort()) {
      indegree.set(parentName, indegree.get(parentName) - 1);
      if (indegree.get(parentName) === 0) {
        ready.push(parentName);
        ready.sort();
      }
    }
  }

  if (ordered.length !== cleanupModels.size) {
    const cyclic = [...cleanupModels]
      .filter((modelName) => !ordered.includes(modelName))
      .sort();
    throw new Error(
      `Ciclo obrigatorio inesperado entre modelos: ${cyclic.join(', ')}.`,
    );
  }

  return ordered;
}

function lowerFirst(value) {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function modelMetadata(models) {
  return new Map(
    models.map((model) => [
      model.name,
      {
        model: model.name,
        table: model.dbName || model.name,
        delegate: lowerFirst(model.name),
      },
    ]),
  );
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function countModels(client, modelNames, metadata) {
  const selects = modelNames.map((modelName) => {
    const table = metadata.get(modelName).table;
    return `SELECT '${modelName.replace(/'/g, "''")}' AS model, COUNT(*)::text AS count FROM ${quoteIdentifier(table)}`;
  });
  if (selects.length === 0) return new Map();

  const rows = await client.$queryRawUnsafe(selects.join('\nUNION ALL\n'));
  return new Map(rows.map((row) => [row.model, BigInt(row.count)]));
}

function sumCounts(counts) {
  return [...counts.values()].reduce((sum, count) => sum + count, 0n);
}

function formatCount(value) {
  return value.toLocaleString('pt-BR');
}

function printModelCounts(title, modelNames, counts, metadata) {
  console.log(`\n${title}`);
  for (const modelName of modelNames) {
    const { table } = metadata.get(modelName);
    console.log(
      `  ${table.padEnd(40)} ${formatCount(counts.get(modelName) || 0n)}`,
    );
  }
  console.log(`  ${'TOTAL'.padEnd(40)} ${formatCount(sumCounts(counts))}`);
}

function getSetNullReferences(models, cleanupModels, metadata) {
  const references = [];
  for (const model of models) {
    if (cleanupModels.has(model.name)) continue;
    for (const field of relationFields(model)) {
      if (
        cleanupModels.has(field.type) &&
        effectiveOnDelete(field) === 'SetNull'
      ) {
        references.push({
          childTable: metadata.get(model.name).table,
          columns: field.relationFromFields,
          parentTable: metadata.get(field.type).table,
        });
      }
    }
  }
  return references.sort((left, right) =>
    `${left.childTable}.${left.columns}`.localeCompare(
      `${right.childTable}.${right.columns}`,
    ),
  );
}

function parseDatabaseIdentity(databaseUrl) {
  const parsed = new URL(databaseUrl);
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    database: parsed.pathname.replace(/^\//, ''),
    schema: parsed.searchParams.get('schema') || 'public',
  };
}

function readLocalMigrationNames() {
  const migrationsDir = path.resolve(__dirname, '..', 'prisma', 'migrations');
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function assertMigrationsApplied(prisma) {
  const appliedRows = await prisma.$queryRawUnsafe(`
    SELECT migration_name
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL
      AND rolled_back_at IS NULL
    ORDER BY migration_name ASC
  `);
  const applied = new Set(appliedRows.map((row) => row.migration_name));
  const pending = readLocalMigrationNames().filter(
    (name) => !applied.has(name),
  );
  if (pending.length > 0) {
    throw new Error(
      `Ha migracoes pendentes: ${pending.join(', ')}. Aplique-as antes da limpeza.`,
    );
  }
}

async function lockCleanupTables(transaction, deletionOrder, metadata) {
  const tables = deletionOrder
    .map((modelName) => quoteIdentifier(metadata.get(modelName).table))
    .join(', ');
  await transaction.$executeRawUnsafe(
    `LOCK TABLE ${tables} IN ACCESS EXCLUSIVE MODE NOWAIT`,
  );
}

function assertProtectedCountsUnchanged(before, after, protectedModels) {
  const changed = protectedModels.filter(
    (modelName) => before.get(modelName) !== after.get(modelName),
  );
  if (changed.length > 0) {
    throw new Error(
      `A transacao alteraria a quantidade de modelos preservados: ${changed.join(', ')}. Rollback acionado.`,
    );
  }
}

async function executeCleanup(
  prisma,
  deletionOrder,
  cleanupModels,
  protectedModels,
  metadata,
) {
  return prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext('manitec-clean-operational-data'))::text AS "lock"`,
      );
      await lockCleanupTables(transaction, deletionOrder, metadata);

      const beforeCleanup = await countModels(
        transaction,
        deletionOrder,
        metadata,
      );
      const beforeProtected = await countModels(
        transaction,
        protectedModels,
        metadata,
      );
      const deleted = new Map();

      for (const modelName of deletionOrder) {
        const delegate = metadata.get(modelName).delegate;
        if (!transaction[delegate]?.deleteMany) {
          throw new Error(`Delegate Prisma indisponivel: ${delegate}.`);
        }
        const result = await transaction[delegate].deleteMany({});
        deleted.set(modelName, BigInt(result.count));
      }

      const unexpectedDeleteCounts = deletionOrder.filter(
        (modelName) => beforeCleanup.get(modelName) !== deleted.get(modelName),
      );
      if (unexpectedDeleteCounts.length > 0) {
        throw new Error(
          `Contagens de exclusao inesperadas em: ${unexpectedDeleteCounts.join(', ')}. Rollback acionado.`,
        );
      }

      const afterCleanup = await countModels(
        transaction,
        deletionOrder,
        metadata,
      );
      const remaining = [...afterCleanup].filter(([, count]) => count !== 0n);
      if (remaining.length > 0) {
        throw new Error(
          `Restaram linhas operacionais: ${remaining.map(([name, count]) => `${name}=${count}`).join(', ')}. Rollback acionado.`,
        );
      }

      const afterProtected = await countModels(
        transaction,
        protectedModels,
        metadata,
      );
      assertProtectedCountsUnchanged(
        beforeProtected,
        afterProtected,
        protectedModels,
      );

      return { beforeCleanup, afterCleanup, deleted };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 120_000,
    },
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  loadEnvFile();
  const backup = assertExecutionGuards(options);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL nao esta configurada.');

  const identity = parseDatabaseIdentity(databaseUrl);
  const expectedDatabase = process.env.DB_NAME || process.env.EXPECTED_DB_NAME;
  if (expectedDatabase && identity.database !== expectedDatabase) {
    throw new Error(
      `Banco conectado "${identity.database}" difere do esperado "${expectedDatabase}".`,
    );
  }

  const models = Prisma.dmmf.datamodel.models;
  assertGeneratedClientMatchesSchema(models);
  const cleanupModels = assertReviewedScope(models);
  const metadata = modelMetadata(models);
  const deletionOrder = buildDeletionOrder(models, cleanupModels);
  const protectedModels = models
    .map((model) => model.name)
    .filter((modelName) => !cleanupModels.has(modelName))
    .sort();

  const missingCritical = CRITICAL_PROTECTED_MODELS.filter(
    (modelName) => !protectedModels.includes(modelName),
  );
  if (missingCritical.length > 0) {
    throw new Error(
      `Protecoes criticas ausentes: ${missingCritical.join(', ')}.`,
    );
  }

  console.log(
    `[clean-operational-data] banco=${identity.database}; host=${identity.host}:${identity.port}; schema=${identity.schema}`,
  );
  console.log(
    `[clean-operational-data] modo=${options.execute ? 'EXECUCAO' : 'SIMULACAO'}`,
  );
  if (backup) {
    console.log(
      `[clean-operational-data] backup=${backup.path}; bytes=${backup.size}; idade_horas=${backup.ageHours.toFixed(2)}`,
    );
  }

  const prisma = new PrismaClient();
  try {
    await assertMigrationsApplied(prisma);
    const cleanupCounts = await countModels(prisma, deletionOrder, metadata);
    const protectedCounts = await countModels(
      prisma,
      protectedModels,
      metadata,
    );

    printModelCounts(
      'Tabelas que serao esvaziadas (ordem segura):',
      deletionOrder,
      cleanupCounts,
      metadata,
    );
    printModelCounts(
      'Tabelas preservadas:',
      protectedModels,
      protectedCounts,
      metadata,
    );

    const setNullReferences = getSetNullReferences(
      models,
      cleanupModels,
      metadata,
    );
    console.log('\nReferencias opcionais preservadas que serao desvinculadas:');
    for (const reference of setNullReferences) {
      console.log(
        `  ${reference.childTable}.${reference.columns.join(',')} -> ${reference.parentTable}`,
      );
    }

    if (!options.execute) {
      console.log(
        '\n[clean-operational-data] SIMULACAO concluida. Nenhum dado foi alterado.',
      );
      console.log(
        `[clean-operational-data] Para executar: --execute --confirm=${CONFIRMATION_TOKEN} --backup=<arquivo.dump>`,
      );
      return;
    }

    const result = await executeCleanup(
      prisma,
      deletionOrder,
      cleanupModels,
      protectedModels,
      metadata,
    );
    printModelCounts(
      'Linhas removidas:',
      deletionOrder,
      result.deleted,
      metadata,
    );
    console.log(
      '\n[clean-operational-data] CONCLUIDO. Transacao confirmada; tabelas protegidas mantiveram suas quantidades.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`[clean-operational-data] FALHOU: ${error.message}`);
  process.exitCode = 1;
});
