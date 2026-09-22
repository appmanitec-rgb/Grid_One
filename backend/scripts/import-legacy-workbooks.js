const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  AuditDomain,
  CatalogIdentifierType,
  ClientAddressType,
  ClientContactStatus,
  ClientPersonType,
  ClientType,
  GeneratorCriticality,
  GeneratorLifecycleStatus,
  GeneratorOperationalStatus,
  ItemType,
  Prisma,
  PrismaClient,
  ServiceGroup,
  StudioImportBatchStatus,
  StudioImportMode,
} = require('@prisma/client');
const readXlsxFile = require('read-excel-file/node').default;

const CONFIRMATION_TOKEN = 'IMPORTAR_PLANILHAS_LEGADAS';
const DEFAULT_INPUT_DIRECTORY = path.resolve(
  __dirname,
  '..',
  '..',
  '.runtime-imports',
  '2026-09-16',
);
const INPUT_FILES = {
  agents: 'Agentes.xlsx',
  products: 'Produtos.xlsx',
  equipments: 'Equipamento sem acessorios.xlsx',
  accessories: 'Equipamento com acessorios.xlsx',
};
const IGNORED_PRODUCT_PRICING_COLUMNS = [
  'ICMS',
  'PIS',
  'COFINS',
  'MARGEMLUCRO',
  'COMISSAOVENDA',
  'VENDASUGERIDA',
  'PRECO',
  'PRECODOLAR',
  'MARGEM',
  'DIASCOTACAO',
];
const PROMOTED_CLIENT_AGENT_CODES = new Set(['273', '698', '1809']);

function loadEnvFile() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 0) continue;
    const name = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^"|"$/g, '');
    if (!(name in process.env)) process.env[name] = value;
  }
}

function parseArgs(argv) {
  const options = {
    execute: false,
    dryRun: false,
    help: false,
    confirm: null,
    directory: DEFAULT_INPUT_DIRECTORY,
    report: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--execute') options.execute = true;
    else if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument.startsWith('--confirm=')) {
      options.confirm = argument.slice('--confirm='.length);
    } else if (argument === '--confirm') {
      options.confirm = argv[++index] || null;
    } else if (argument.startsWith('--directory=')) {
      options.directory = path.resolve(argument.slice('--directory='.length));
    } else if (argument === '--directory') {
      options.directory = path.resolve(argv[++index] || '');
    } else if (argument.startsWith('--report=')) {
      options.report = path.resolve(argument.slice('--report='.length));
    } else if (argument === '--report') {
      options.report = path.resolve(argv[++index] || '');
    } else {
      throw new Error(`Argumento desconhecido: ${argument}`);
    }
  }
  if (options.execute && options.dryRun) {
    throw new Error('Use --execute ou --dry-run, nunca os dois juntos.');
  }
  if (options.execute && options.confirm !== CONFIRMATION_TOKEN) {
    throw new Error(
      `Execucao recusada. Informe --confirm=${CONFIRMATION_TOKEN}.`,
    );
  }
  options.report ||= path.join(
    options.directory,
    options.execute
      ? 'relatorio-importacao-executada.json'
      : 'relatorio-simulacao-importacao.json',
  );
  return options;
}

function printHelp() {
  console.log(`
Uso:
  node scripts/import-legacy-workbooks.js --dry-run --directory=<pasta>
  node scripts/import-legacy-workbooks.js --execute \\
    --confirm=${CONFIRMATION_TOKEN} --directory=<pasta>

Arquivos esperados:
  ${Object.values(INPUT_FILES).join('\n  ')}

Sem --execute, a ferramenta apenas valida, transforma e gera um relatorio.
Na execucao, clientes, fornecedores, produtos e maquinas devem estar vazios.
`);
}

function text(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function comparable(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toUpperCase();
}

function readOwnerAliases(inputDirectory) {
  const aliasPath = path.join(inputDirectory, 'owner-aliases.json');
  if (!fs.existsSync(aliasPath)) return new Map();

  const parsed = JSON.parse(fs.readFileSync(aliasPath, 'utf8'));
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(
      'owner-aliases.json deve ser um objeto no formato { "nome": "codigo legado" }.',
    );
  }

  return new Map(
    Object.entries(parsed)
      .map(([ownerName, legacyCode]) => [
        comparable(ownerName),
        text(legacyCode),
      ])
      .filter(([ownerName, legacyCode]) => ownerName && legacyCode),
  );
}

function digits(value) {
  return text(value).replace(/\D/g, '');
}

function nullable(value) {
  const normalized = text(value);
  return normalized || null;
}

function validDocument(value) {
  const normalized = digits(value);
  if (!['11', '14'].includes(String(normalized.length))) return null;
  if (/^(\d)\1+$/.test(normalized)) return null;
  return normalized;
}

function numberValue(value) {
  const source = text(value).replace(/\s/g, '');
  if (!source) return null;
  const normalized = source.includes(',')
    ? source.replace(/\./g, '').replace(',', '.')
    : /^-?\d{1,3}(\.\d{3})+$/.test(source)
      ? source.replace(/\./g, '')
      : source;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstNumber(value) {
  const match = text(value).match(/-?\d+(?:[.,]\d+)?/);
  return match ? numberValue(match[0]) : null;
}

function integerValue(value) {
  const parsed = firstNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function uniqueNonEmpty(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function sourceData(row) {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => key !== '__rowNumber')
      .map(([key, value]) => [key, text(value)])
      .filter(([, value]) => Boolean(value)),
  );
}

function hashFile(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex')
    .toUpperCase();
}

async function readWorksheet(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Planilha nao encontrada: ${filePath}`);
  }
  const workbook = await readXlsxFile(filePath);
  const rows = Array.isArray(workbook[0]) ? workbook : workbook[0]?.data || [];
  if (rows.length < 2) throw new Error(`Planilha vazia: ${filePath}`);
  const headers = rows[0].map(text);
  if (headers.some((header) => !header)) {
    throw new Error(`Planilha possui cabecalho vazio: ${filePath}`);
  }
  const duplicateHeaders = headers.filter(
    (header, index) => headers.indexOf(header) !== index,
  );
  if (duplicateHeaders.length) {
    throw new Error(
      `Planilha possui cabecalhos repetidos (${uniqueNonEmpty(duplicateHeaders).join(', ')}): ${filePath}`,
    );
  }
  return rows
    .slice(1)
    .filter((row) => row.some((value) => text(value)))
    .map((row, index) => ({
      __rowNumber: index + 2,
      ...Object.fromEntries(
        headers.map((header, column) => [header, row[column] ?? '']),
      ),
    }));
}

function assertHeaders(rows, required, fileName) {
  const available = new Set(Object.keys(rows[0] || {}));
  const missing = required.filter((header) => !available.has(header));
  if (missing.length) {
    throw new Error(
      `${fileName} nao possui as colunas obrigatorias: ${missing.join(', ')}.`,
    );
  }
}

function bestAgentRow(rows) {
  return [...rows].sort((left, right) => {
    const statusRank = (row) => {
      const status = comparable(row.STATUS);
      if (status === 'ATIVO') return 2;
      if (!status) return 1;
      return 0;
    };
    const updatedAt = (row) => {
      const value = row.DATAATUALIZACAO;
      const timestamp =
        value instanceof Date ? value.getTime() : Date.parse(text(value));
      return Number.isFinite(timestamp) ? timestamp : 0;
    };
    return (
      statusRank(right) - statusRank(left) ||
      updatedAt(right) - updatedAt(left) ||
      Object.values(sourceData(right)).filter(Boolean).length -
        Object.values(sourceData(left)).filter(Boolean).length ||
      left.__rowNumber - right.__rowNumber
    );
  })[0];
}

function groupAgentRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const document = validDocument(row.CNPJCPF);
    const legacyCode = text(row.CODIGO);
    const groupKey = document
      ? `DOCUMENTO:${document}`
      : `CODIGO:${legacyCode || row.__rowNumber}`;
    const grouped = groups.get(groupKey) || [];
    grouped.push(row);
    groups.set(groupKey, grouped);
  }
  return groups;
}

function agentIsActive(rows) {
  const statuses = uniqueNonEmpty(rows.map((row) => comparable(row.STATUS)));
  if (!statuses.length) return true;
  return statuses.includes('ATIVO');
}

function buildClientAddress(clientId, row, type, suffix) {
  const street = text(row[`RUA${suffix}`]);
  const number = text(row[`NUMERO${suffix}`]);
  const complement = text(row[`COMPLEMENTO${suffix}`]);
  const district = text(row[`BAIRRO${suffix}`]);
  const zipCode = digits(row[`CEP${suffix}`]);
  const city = text(row[`CIDADE${suffix}`]);
  const state = text(row[`UF${suffix}`]).toUpperCase().slice(0, 2);
  if (
    ![street, number, complement, district, zipCode, city, state].some(Boolean)
  ) {
    return null;
  }
  return {
    id: crypto.randomUUID(),
    clientId,
    type,
    street: street || '-',
    number: number || null,
    complement: complement || null,
    district: district || null,
    zipCode: zipCode || null,
    city: city || '-',
    state: state || '--',
    country: 'BR',
  };
}

function buildClientContacts(clientId, rows) {
  const contacts = [];
  const seen = new Set();
  for (const row of rows) {
    for (let index = 1; index <= 4; index += 1) {
      const suffix = index === 1 ? '' : String(index);
      const name = text(row[`CONTATONOME${suffix}`]);
      const role = text(row[`CONTATOCARGO${suffix}`]);
      const phone = text(row[`CONTATOTEL${suffix}`]);
      const mobile = text(row[`CONTATOCELULAR${suffix}`]);
      const email = text(row[`CONTATOEMAIL${suffix}`]);
      if (![name, role, phone, mobile, email].some(Boolean)) continue;
      const dedupeKey = [name, email, phone, mobile].map(comparable).join('|');
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      contacts.push({
        id: crypto.randomUUID(),
        clientId,
        name: name || `Contato legado ${index}`,
        status: ClientContactStatus.ACTIVE,
        role: role || null,
        phone: phone || null,
        mobile: mobile || null,
        email: email || null,
      });
    }
  }
  return contacts;
}

function buildClientCluster(groupKey, rows) {
  const selected = bestAgentRow(rows);
  const id = crypto.randomUUID();
  const document = validDocument(selected.CNPJCPF);
  const addresses = [];
  const addressKeys = new Set();
  for (const row of rows) {
    for (const [type, suffix] of [
      [ClientAddressType.OTHER, 'PRINCIPAL'],
      [ClientAddressType.BILLING, 'COBRANCA'],
      [ClientAddressType.INSTALLATION, 'ENTREGA'],
    ]) {
      const address = buildClientAddress(id, row, type, suffix);
      if (!address) continue;
      const addressKey = [
        address.type,
        address.street,
        address.number,
        address.city,
        address.state,
        address.zipCode,
      ]
        .map(comparable)
        .join('|');
      if (addressKeys.has(addressKey)) continue;
      addressKeys.add(addressKey);
      addresses.push(address);
    }
  }
  const contacts = buildClientContacts(id, rows);
  const principal =
    addresses.find((address) => address.type === ClientAddressType.OTHER) ||
    addresses[0];
  const observation = uniqueNonEmpty(
    rows.flatMap((row) => [row.OBS1, row.OBS2, row.OBS3, row.OBSF]),
  ).join(' | ');
  const names = new Set(
    rows
      .flatMap((row) => [row.NOME, row.FANTASIA])
      .map(comparable)
      .filter(Boolean),
  );
  const active = agentIsActive(rows);
  const legacyCodes = uniqueNonEmpty(rows.map((row) => row.CODIGO));
  return {
    groupKey,
    names,
    active,
    data: {
      id,
      legacyCode: text(selected.CODIGO) || null,
      companyName: text(selected.NOME) || `Cliente legado ${selected.CODIGO}`,
      tradeName: nullable(selected.FANTASIA),
      cnpj: document,
      email: nullable(selected.EMAIL),
      contactName: contacts[0]?.name || null,
      phone:
        nullable(selected.TEL1) ||
        nullable(contacts[0]?.mobile) ||
        nullable(contacts[0]?.phone) ||
        '-',
      address: principal
        ? `${principal.street}${principal.number ? `, ${principal.number}` : ''}`
        : null,
      city: principal?.city || text(selected.CIDADEPRINCIPAL) || '-',
      state: principal?.state || text(selected.UFPRINCIPAL).slice(0, 2) || '--',
      stateRegistration: nullable(selected.INSCRRG),
      municipalRegistration: nullable(selected.INSCRICAOMUNICIPAL),
      cnae: null,
      preferences: null,
      notes: observation || null,
      legacyData: {
        sourceFile: INPUT_FILES.agents,
        sourceRows: rows.map((row) => ({
          rowNumber: row.__rowNumber,
          data: sourceData(row),
        })),
        legacyCodes,
        consolidatedBy: document ? 'CNPJCPF' : 'CODIGO',
      },
      segment: nullable(selected.RAMO) || nullable(selected.REGIAO),
      clientType: rows.some((row) => {
        const value = comparable(row.TIPOCLIENTE);
        return value.includes('CONTRATO') && !value.includes('SEM CONTRATO');
      })
        ? ClientType.CONTRACT
        : ClientType.NO_CONTRACT,
      personType:
        document?.length === 11
          ? ClientPersonType.INDIVIDUAL
          : ClientPersonType.LEGAL_ENTITY,
      isActive: active,
      isProvisional: false,
    },
    addresses,
    contacts,
  };
}

function buildSupplierCluster(groupKey, rows) {
  const selected = bestAgentRow(rows);
  const document = validDocument(selected.CNPJCPF);
  const observation = uniqueNonEmpty(
    rows.flatMap((row) => [row.OBS1, row.OBS2, row.OBS3, row.OBSF]),
  ).join(' | ');
  const street = text(selected.RUAPRINCIPAL);
  const number = text(selected.NUMEROPRINCIPAL);
  return {
    groupKey,
    data: {
      id: crypto.randomUUID(),
      legacyCode: text(selected.CODIGO) || null,
      companyName:
        text(selected.NOME) || `Fornecedor legado ${selected.CODIGO}`,
      tradeName: nullable(selected.FANTASIA),
      cnpj: document,
      email: nullable(selected.EMAIL),
      phone: nullable(selected.TEL1),
      address: street ? `${street}${number ? `, ${number}` : ''}` : null,
      city: nullable(selected.CIDADEPRINCIPAL),
      state: nullable(text(selected.UFPRINCIPAL).toUpperCase().slice(0, 2)),
      stateRegistration: nullable(selected.INSCRRG),
      municipalRegistration: nullable(selected.INSCRICAOMUNICIPAL),
      categories: [],
      representedBrands: [],
      paymentTerm: null,
      notes: observation || null,
      legacyData: {
        sourceFile: INPUT_FILES.agents,
        agentKinds: uniqueNonEmpty(rows.map((row) => row.DESCRICAO)),
        legacyCodes: uniqueNonEmpty(rows.map((row) => row.CODIGO)),
        sourceRows: rows.map((row) => ({
          rowNumber: row.__rowNumber,
          data: sourceData(row),
        })),
        consolidatedBy: document ? 'CNPJCPF' : 'CODIGO',
      },
      isActive: agentIsActive(rows),
    },
  };
}

function buildAgentsPlan(rows) {
  const clientRows = rows.filter(
    (row) =>
      comparable(row.DESCRICAO) === 'CLIENTE' ||
      PROMOTED_CLIENT_AGENT_CODES.has(text(row.CODIGO)),
  );
  const supplierRows = rows.filter(
    (row) => comparable(row.DESCRICAO) !== 'CLIENTE',
  );
  const clientGroups = groupAgentRows(clientRows);
  const supplierGroups = groupAgentRows(supplierRows);
  const clientClusters = [...clientGroups].map(([groupKey, grouped]) =>
    buildClientCluster(groupKey, grouped),
  );
  const suppliers = [...supplierGroups].map(([groupKey, grouped]) =>
    buildSupplierCluster(groupKey, grouped),
  );
  return {
    sourceRows: rows.length,
    clientSourceRows: clientRows.length,
    supplierSourceRows: supplierRows.length,
    clientClusters,
    suppliers,
    invalidOrMissingClientDocuments: clientRows.filter(
      (row) => !validDocument(row.CNPJCPF),
    ).length,
    invalidOrMissingSupplierDocuments: supplierRows.filter(
      (row) => !validDocument(row.CNPJCPF),
    ).length,
    consolidatedClientRows: clientRows.length - clientClusters.length,
    consolidatedSupplierRows: supplierRows.length - suppliers.length,
  };
}

function productType(value) {
  return comparable(value).includes('SERV') ? ItemType.SERVICE : ItemType.PART;
}

function groupBy(rows, selector) {
  const grouped = new Map();
  for (const row of rows) {
    const key = selector(row);
    const values = grouped.get(key) || [];
    values.push(row);
    grouped.set(key, values);
  }
  return grouped;
}

function bestProductRow(rows) {
  const important = [
    'DESCRICAO',
    'TIPODOITEM',
    'UNIDADE',
    'FAMILIA',
    'SUBFAMILIA',
    'CODIGO',
    'CODIGORADAR',
    'CUSTO',
  ];
  return [...rows].sort((left, right) => {
    const score = (row) =>
      important.reduce((total, field) => total + (text(row[field]) ? 1 : 0), 0);
    return score(right) - score(left) || left.__rowNumber - right.__rowNumber;
  })[0];
}

function mergedValue(rows, selected, field) {
  const values = rows
    .map((row) => ({ value: text(row[field]), row: row.__rowNumber }))
    .filter((entry) => entry.value);
  if (!values.length) return '';
  const frequencies = new Map();
  for (const entry of values) {
    const normalized = comparable(entry.value);
    const current = frequencies.get(normalized) || {
      count: 0,
      value: entry.value,
      firstRow: entry.row,
    };
    current.count += 1;
    frequencies.set(normalized, current);
  }
  return [...frequencies.values()].sort(
    (left, right) => right.count - left.count || left.firstRow - right.firstRow,
  )[0].value;
}

function fieldConflicts(rows, fields) {
  return Object.fromEntries(
    fields
      .map((field) => [field, uniqueNonEmpty(rows.map((row) => row[field]))])
      .filter(([, values]) => values.length > 1),
  );
}

function pricingSnapshot(policy, costPrice) {
  const numeric = (field) => Number(policy?.[field] || 0);
  const componentTaxPercent = [
    'icmsPercent',
    'pisPercent',
    'cofinsPercent',
    'ipiPercent',
    'issPercent',
    'irpjPercent',
    'csllPercent',
    'cppPercent',
  ].reduce((total, field) => total + numeric(field), 0);
  const salesTaxPercent = componentTaxPercent || numeric('salesTaxPercent');
  const commissionPercent = numeric('commissionPercent');
  const profitMarginPercent = numeric('profitMarginPercent');
  const operationalCostPercent = numeric('operationalCostPercent');
  const suggestedSalePrice = Number(
    Math.max(
      costPrice,
      costPrice *
        (1 +
          (salesTaxPercent +
            commissionPercent +
            profitMarginPercent +
            operationalCostPercent) /
            100),
    ).toFixed(2),
  );
  return {
    icmsPercent: numeric('icmsPercent'),
    pisPercent: numeric('pisPercent'),
    cofinsPercent: numeric('cofinsPercent'),
    ipiPercent: numeric('ipiPercent'),
    issPercent: numeric('issPercent'),
    irpjPercent: numeric('irpjPercent'),
    csllPercent: numeric('csllPercent'),
    cppPercent: numeric('cppPercent'),
    salesTaxPercent,
    commissionPercent,
    profitMarginPercent,
    operationalCostPercent,
    suggestedSalePrice,
    pricingSource: policy ? 'DEFAULT_POLICY' : 'SYSTEM_DEFAULT',
  };
}

function buildCatalogItemFromRows(sequence, rows, policies) {
  const selected = bestProductRow(rows);
  const type = productType(mergedValue(rows, selected, 'TIPODOITEM'));
  const costPrice = Math.max(
    0,
    numberValue(mergedValue(rows, selected, 'CUSTO')) || 0,
  );
  const lastCost = Math.max(
    0,
    numberValue(mergedValue(rows, selected, 'ULTIMOCUSTO')) ?? costPrice,
  );
  const pricing = pricingSnapshot(policies.get(type), costPrice);
  const name =
    mergedValue(rows, selected, 'DESCRICAO') || `PRODUTO LEGADO ${sequence}`;
  return {
    id: crypto.randomUUID(),
    type,
    legacySequence: sequence,
    legacyCode: nullable(mergedValue(rows, selected, 'CODIGO')),
    radarCode: nullable(mergedValue(rows, selected, 'CODIGORADAR')),
    alternativeCode: nullable(mergedValue(rows, selected, 'ALTERNATIVO')),
    data: {
      name,
      description: nullable(mergedValue(rows, selected, 'DESCRICAO_1')),
      commercialDescription: nullable(
        mergedValue(rows, selected, 'DESCRICAOFAT'),
      ),
      category: nullable(mergedValue(rows, selected, 'FAMILIA')),
      subcategory: nullable(mergedValue(rows, selected, 'SUBFAMILIA')),
      itemClassification:
        nullable(mergedValue(rows, selected, 'TIPODOITEM')) ||
        (type === ItemType.SERVICE ? 'Servico' : 'Acabado'),
      unit: nullable(mergedValue(rows, selected, 'UNIDADE')) || 'UN',
      acquisitionOrigin:
        nullable(mergedValue(rows, selected, 'ORIGEM')) || 'Comprado',
      ncm: nullable(mergedValue(rows, selected, 'CODIGO_1')),
      costPrice,
      averageCost: costPrice,
      lastCost,
      storageLocation: nullable(mergedValue(rows, selected, 'LOCALIZACAO')),
      technicalSpecs: {
        legacyImport: {
          sourceFile: INPUT_FILES.products,
          sourceRows: rows.map((row) => row.__rowNumber),
          duplicateRowsConsolidated: Math.max(0, rows.length - 1),
          conflicts: fieldConflicts(rows, [
            'CODIGO',
            'DESCRICAO',
            'DESCRICAOFAT',
            'TIPODOITEM',
            'UNIDADE',
            'FAMILIA',
            'SUBFAMILIA',
            'DESCRICAO_1',
            'CODIGO_1',
            'CODIGORADAR',
            'ALTERNATIVO',
            'CUSTO',
            'ULTIMOCUSTO',
          ]),
          ignoredPricingColumns: IGNORED_PRODUCT_PRICING_COLUMNS,
          classificationInferred: !text(selected.TIPODOITEM),
        },
      },
      pricing,
    },
  };
}

function buildMissingCatalogItem(sequence, accessoryRows, policies) {
  const descriptions = uniqueNonEmpty(
    accessoryRows.map((row) => row.ACESSORIO),
  );
  const costPrice = 0;
  return {
    id: crypto.randomUUID(),
    type: ItemType.PART,
    legacySequence: sequence,
    legacyCode: null,
    radarCode: null,
    alternativeCode: null,
    data: {
      name: descriptions[0] || `ACESSORIO LEGADO ${sequence}`,
      description: null,
      commercialDescription: descriptions[0] || null,
      category: 'ACESSORIO LEGADO',
      subcategory: null,
      itemClassification: 'Componente',
      unit: 'UN',
      acquisitionOrigin: 'Comprado',
      ncm: null,
      costPrice,
      averageCost: costPrice,
      lastCost: costPrice,
      storageLocation: null,
      technicalSpecs: {
        legacyImport: {
          sourceFile: INPUT_FILES.accessories,
          sourceRows: accessoryRows.map((row) => row.__rowNumber),
          missingFromProductsWorkbook: true,
          descriptions,
          ignoredPricingColumns: IGNORED_PRODUCT_PRICING_COLUMNS,
        },
      },
      pricing: pricingSnapshot(policies.get(ItemType.PART), costPrice),
    },
  };
}

function buildCatalogPlan(productRows, accessoryRows, policies) {
  const productGroups = groupBy(productRows, (row) => text(row.SEQUENCIA));
  if (productGroups.has('')) {
    throw new Error('Produtos.xlsx possui linha sem SEQUENCIA.');
  }
  const items = [...productGroups].map(([sequence, rows]) =>
    buildCatalogItemFromRows(sequence, rows, policies),
  );
  const productSequences = new Set(items.map((item) => item.legacySequence));
  const referencedAccessories = accessoryRows.filter((row) =>
    text(row.SEQACESSORIO),
  );
  const missingGroups = groupBy(
    referencedAccessories.filter(
      (row) => !productSequences.has(text(row.SEQACESSORIO)),
    ),
    (row) => text(row.SEQACESSORIO),
  );
  const placeholderItems = [...missingGroups].map(([sequence, rows]) =>
    buildMissingCatalogItem(sequence, rows, policies),
  );
  return {
    sourceRows: productRows.length,
    items: [...items, ...placeholderItems],
    productItems: items.length,
    placeholderItems: placeholderItems.length,
    duplicateRowsConsolidated: productRows.length - items.length,
    missingDescriptionItems: items.filter((item) =>
      item.data.name.startsWith('PRODUTO LEGADO '),
    ).length,
  };
}

function createProvisionalClient(ownerName, reason, candidates) {
  const normalizedOwner = comparable(ownerName) || 'PROPRIETARIO NAO INFORMADO';
  const digest = crypto
    .createHash('sha1')
    .update(normalizedOwner)
    .digest('hex')
    .slice(0, 12)
    .toUpperCase();
  return {
    groupKey: `PENDENTE:${normalizedOwner}`,
    names: new Set([normalizedOwner]),
    active: false,
    provisional: true,
    data: {
      id: crypto.randomUUID(),
      legacyCode: `PEND-EQP-${digest}`,
      companyName: `${text(ownerName) || 'PROPRIETARIO NAO INFORMADO'} [VINCULO PENDENTE]`,
      tradeName: null,
      cnpj: null,
      email: null,
      contactName: null,
      phone: '-',
      address: null,
      city: '-',
      state: '--',
      stateRegistration: null,
      municipalRegistration: null,
      cnae: null,
      preferences: null,
      notes:
        'Cadastro provisório criado na importação. Revise o vínculo das máquinas antes de ativar este cliente.',
      legacyData: {
        sourceFile: INPUT_FILES.equipments,
        provisionalOwner: text(ownerName) || null,
        resolutionReason: reason,
        candidateLegacyCodes: candidates,
      },
      segment: 'IMPORTACAO_PENDENTE',
      clientType: ClientType.NO_CONTRACT,
      personType: ClientPersonType.LEGAL_ENTITY,
      isActive: false,
      isProvisional: true,
    },
    addresses: [],
    contacts: [],
  };
}

function buildOwnerResolver(clientClusters, ownerAliases) {
  const byName = new Map();
  for (const cluster of clientClusters) {
    for (const name of cluster.names) {
      const matches = byName.get(name) || new Set();
      matches.add(cluster);
      byName.set(name, matches);
    }
  }
  const provisionalByOwner = new Map();
  const resolutions = new Map();
  const byLegacyCode = new Map(
    clientClusters
      .filter((cluster) => cluster.data.legacyCode)
      .map((cluster) => [cluster.data.legacyCode, cluster]),
  );

  function addressTokens(value) {
    const ignored = new Set([
      'R',
      'RUA',
      'AV',
      'AVENIDA',
      'ROD',
      'RODOVIA',
      'ESTRADA',
      'ALAMEDA',
      'TRAVESSA',
      'KM',
      'DE',
      'DA',
      'DO',
      'DAS',
      'DOS',
    ]);
    return comparable(value)
      .split(' ')
      .filter((token) => token.length >= 2 && !ignored.has(token));
  }

  function resolveByInstallationAddress(matches, row) {
    const installation = comparable(row.ENDERECOINSTALACAO);
    if (!installation) return null;
    const installationTokens = new Set(addressTokens(installation));
    const installationDigits = digits(installation);
    const matched = matches.filter((cluster) =>
      cluster.addresses.some((address) => {
        if (
          address.zipCode &&
          address.zipCode.length === 8 &&
          installationDigits.includes(address.zipCode)
        ) {
          return true;
        }
        const streetTokens = addressTokens(address.street);
        const significantLength = streetTokens.join('').length;
        if (streetTokens.length < 2 || significantLength < 6) return false;
        if (!streetTokens.every((token) => installationTokens.has(token))) {
          return false;
        }
        const number = comparable(address.number);
        const city = comparable(address.city);
        const numberConfirms =
          number &&
          new RegExp(`(^| )${number.replace(/[^A-Z0-9]/g, '')}( |$)`).test(
            installation,
          );
        const cityConfirms = city && installation.includes(city);
        return numberConfirms || cityConfirms || (!number && !city);
      }),
    );
    return matched.length === 1 ? matched[0] : null;
  }

  function resolve(ownerName, row) {
    const ownerKey = comparable(ownerName);
    const aliasedLegacyCode = ownerAliases.get(ownerKey);
    const aliasedCluster = aliasedLegacyCode
      ? byLegacyCode.get(aliasedLegacyCode)
      : null;
    if (aliasedCluster) {
      const result = { cluster: aliasedCluster, reason: 'ALIAS_REVISADO' };
      resolutions.set(result.reason, (resolutions.get(result.reason) || 0) + 1);
      return result;
    }
    const matches = [...(byName.get(ownerKey) || [])];
    if (matches.length === 1) {
      const result = { cluster: matches[0], reason: 'NOME_EXATO_UNICO' };
      resolutions.set(result.reason, (resolutions.get(result.reason) || 0) + 1);
      return result;
    }
    const addressMatch = resolveByInstallationAddress(matches, row);
    if (addressMatch) {
      const result = {
        cluster: addressMatch,
        reason: 'NOME_E_ENDERECO_EXATOS',
      };
      resolutions.set(result.reason, (resolutions.get(result.reason) || 0) + 1);
      return result;
    }
    const reason = !ownerKey
      ? 'PROPRIETARIO_AUSENTE'
      : matches.length
        ? 'PROPRIETARIO_AMBIGUO'
        : 'PROPRIETARIO_NAO_LOCALIZADO';
    const provisionalKey = ownerKey || 'PROPRIETARIO NAO INFORMADO';
    let provisional = provisionalByOwner.get(provisionalKey);
    if (!provisional) {
      provisional = createProvisionalClient(
        ownerName,
        reason,
        matches.map((match) => match.data.legacyCode).filter(Boolean),
      );
      provisionalByOwner.set(provisionalKey, provisional);
    }
    resolutions.set(reason, (resolutions.get(reason) || 0) + 1);
    return { cluster: provisional, reason };
  }

  return { resolve, provisionalByOwner, resolutions };
}

function equipmentSourceRows(equipmentRows, accessoryRows) {
  const result = new Map(
    equipmentRows.map((row) => [text(row.SEQUENCIA), { row, detailed: true }]),
  );
  const quarantinedAccessoryOnlyIds = new Set();
  for (const row of accessoryRows) {
    const sequence = text(row.EQUIPAMENTO);
    if (!result.has(sequence)) quarantinedAccessoryOnlyIds.add(sequence);
  }
  if (result.has('')) throw new Error('Equipamento sem identificador legado.');
  return { result, quarantinedAccessoryOnlyIds };
}

function buildEquipmentPlan(
  equipmentRows,
  accessoryRows,
  clientClusters,
  ownerAliases,
) {
  const { result: sourceBySequence, quarantinedAccessoryOnlyIds } =
    equipmentSourceRows(equipmentRows, accessoryRows);
  const serialCounts = new Map();
  for (const { row } of sourceBySequence.values()) {
    const serial = text(row.SERIE);
    if (serial) serialCounts.set(serial, (serialCounts.get(serial) || 0) + 1);
  }
  const resolver = buildOwnerResolver(clientClusters, ownerAliases);
  const generators = [];
  for (const [sequence, source] of sourceBySequence) {
    const row = source.row;
    const ownerName = text(row.PROPRIETARIO);
    const resolved = resolver.resolve(ownerName, row);
    const rawSerial = text(row.SERIE);
    const serialNumber =
      rawSerial && serialCounts.get(rawSerial) === 1 ? rawSerial : null;
    const name = text(row.DESCRICAO) || `EQUIPAMENTO LEGADO ${sequence}`;
    const brand =
      text(row.FABRICANTEMOTOR) ||
      text(row.DESCRICAO_1) ||
      text(row.MOTOR) ||
      'NAO INFORMADO';
    const power = Math.max(0, firstNumber(row.POTENCIAALTERNADOR) || 0);
    const transferFields = [
      row.FABRICANTEQUADROTRANSFERENCIA,
      row.MODELOQUADROTRANSFERENCIA,
      row.COMPONENTEPRINCIPALQUADROTRANSF,
      row.TENSAOCOMANDOQUADROTRANSFERENCI,
      row.CORRENTENOMINALQUADROTRANSFEREN,
    ];
    const assetTag =
      nullable(row.CODIGO) || nullable(row['COD. EQUIPAMENTO DO CLIENTE']);
    generators.push({
      id: crypto.randomUUID(),
      legacyCode: sequence,
      data: {
        clientId: resolved.cluster.data.id,
        name,
        brand,
        serialNumber,
        power,
        condition: nullable(row.CONDICAO_1) || nullable(row.CONDICAO) || 'BOM',
        assetTag,
        installationSite: nullable(row.ENDERECOINSTALACAO),
        operationalStatus: GeneratorOperationalStatus.OPERATING,
        lifecycleStatus: GeneratorLifecycleStatus.AVAILABLE,
        criticality: GeneratorCriticality.B,
        manufactureYear: integerValue(row.ANOFABRICACAOMOTOR),
        hasMaintenanceContract: false,
        application: nullable(row.TIPO),
        notes: nullable(
          uniqueNonEmpty([
            row.TECNICO ? `Tecnico legado: ${text(row.TECNICO)}` : '',
            ownerName ? `Proprietario legado: ${ownerName}` : '',
          ]).join(' | '),
        ),
        legacyTechnicalData: {
          sourceFile: source.detailed
            ? INPUT_FILES.equipments
            : INPUT_FILES.accessories,
          rowNumber: row.__rowNumber,
          sourceData: sourceData(row),
          ownerResolution: {
            ownerName: ownerName || null,
            reason: resolved.reason,
            clientId: resolved.cluster.data.id,
            clientLegacyCode: resolved.cluster.data.legacyCode,
            provisional: Boolean(resolved.cluster.provisional),
          },
          serialDiscardedBecauseDuplicated:
            Boolean(rawSerial) && serialCounts.get(rawSerial) > 1,
          createdFromAccessoryWorkbookOnly: !source.detailed,
        },
        voltage: nullable(row.TENSAONOMINALALTERNADOR),
        ratedCurrent: null,
        engineBrand: nullable(row.FABRICANTEMOTOR) || nullable(row.MOTOR),
        engineModelName: nullable(row.MODELOMOTOR),
        engineSerialNumber: nullable(row.SERIEMOTOR),
        alternatorBrand: nullable(row.FABRICANTEALTERNADOR),
        alternatorModelName: nullable(row.MODELOALTERNADOR),
        alternatorSerialNumber: nullable(row.NSERIEALTERNADOR),
        alternatorVoltage: nullable(row.TENSAONOMINALALTERNADOR),
        hasTransferSwitch: transferFields.some((value) => text(value)) || null,
        transferSwitchBrand: nullable(row.FABRICANTEQUADROTRANSFERENCIA),
        transferSwitchModel: nullable(row.MODELOQUADROTRANSFERENCIA),
        transferSwitchRatedCurrent: nullable(
          row.CORRENTENOMINALQUADROTRANSFEREN,
        ),
        transferSwitchCommandVoltage: nullable(
          row.TENSAOCOMANDOQUADROTRANSFERENCI,
        ),
        transferSwitchType: nullable(row.COMPONENTEPRINCIPALQUADROTRANSF),
        transferSwitchNotes: nullable(row.DESCRICAOQUADROTRANSFERENCIA),
      },
    });
  }
  const provisionalClients = [...resolver.provisionalByOwner.values()];
  return {
    sourceDetailRows: equipmentRows.length,
    sourceAccessoryEquipmentRows: accessoryRows.length,
    generators,
    provisionalClients,
    resolutionCounts: Object.fromEntries(resolver.resolutions),
    duplicatedSerialValues: [...serialCounts.values()].filter(
      (count) => count > 1,
    ).length,
    generatorsWithoutPower: generators.filter(
      (generator) => generator.data.power === 0,
    ).length,
    extraGeneratorsFromAccessoryWorkbook:
      generators.length - equipmentRows.length,
    quarantinedAccessoryOnlyIds: [...quarantinedAccessoryOnlyIds],
  };
}

function buildAccessoryLinks(accessoryRows, generators, catalogItems) {
  const generatorBySequence = new Map(
    generators.map((generator) => [generator.legacyCode, generator]),
  );
  const itemBySequence = new Map(
    catalogItems.map((item) => [item.legacySequence, item]),
  );
  const pairs = new Map();
  let blankSequenceWithDescription = 0;
  let blankAccessoryRows = 0;
  for (const row of accessoryRows) {
    const generatorSequence = text(row.EQUIPAMENTO);
    const itemSequence = text(row.SEQACESSORIO);
    if (!itemSequence) {
      if (text(row.ACESSORIO)) blankSequenceWithDescription += 1;
      else blankAccessoryRows += 1;
      continue;
    }
    const generator = generatorBySequence.get(generatorSequence);
    const item = itemBySequence.get(itemSequence);
    if (!generator || !item) {
      throw new Error(
        `Vinculo inconsistente na linha ${row.__rowNumber}: equipamento=${generatorSequence}; produto=${itemSequence}.`,
      );
    }
    const pairKey = `${generator.id}|${item.id}`;
    const pair = pairs.get(pairKey) || {
      id: crypto.randomUUID(),
      generatorId: generator.id,
      catalogItemId: item.id,
      serviceGroup: ServiceGroup.OUTROS,
      quantity: 1,
      isCustomized: false,
    };
    pairs.set(pairKey, pair);
  }
  return {
    links: [...pairs.values()],
    sourceRows: accessoryRows.length,
    referencedRows:
      accessoryRows.length - blankSequenceWithDescription - blankAccessoryRows,
    blankSequenceWithDescription,
    blankAccessoryRows,
    duplicatePairRows:
      accessoryRows.length -
      blankSequenceWithDescription -
      blankAccessoryRows -
      pairs.size,
  };
}

async function readInputs(directory) {
  const paths = Object.fromEntries(
    Object.entries(INPUT_FILES).map(([key, fileName]) => [
      key,
      path.join(directory, fileName),
    ]),
  );
  const [agents, products, equipments, accessories] = await Promise.all([
    readWorksheet(paths.agents),
    readWorksheet(paths.products),
    readWorksheet(paths.equipments),
    readWorksheet(paths.accessories),
  ]);
  assertHeaders(
    agents,
    ['CODIGO', 'NOME', 'DESCRICAO', 'CNPJCPF'],
    INPUT_FILES.agents,
  );
  assertHeaders(
    products,
    ['SEQUENCIA', 'CODIGO', 'DESCRICAO', 'TIPODOITEM', 'CUSTO'],
    INPUT_FILES.products,
  );
  assertHeaders(
    equipments,
    ['SEQUENCIA', 'DESCRICAO', 'PROPRIETARIO'],
    INPUT_FILES.equipments,
  );
  assertHeaders(
    accessories,
    ['EQUIPAMENTO', 'PROPRIETARIO', 'ACESSORIO', 'SEQACESSORIO'],
    INPUT_FILES.accessories,
  );
  return {
    paths,
    hashes: Object.fromEntries(
      Object.entries(paths).map(([key, filePath]) => [key, hashFile(filePath)]),
    ),
    agents,
    products,
    equipments,
    accessories,
  };
}

async function databaseReadiness(prisma) {
  const [rules, policies, counts, appliedMigrations] = await Promise.all([
    prisma.catalogSkuRule.findMany({
      where: { isActive: true },
      include: { area: true, family: true, application: true },
    }),
    prisma.catalogPricingPolicy.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    }),
    Promise.all([
      prisma.client.count(),
      prisma.supplier.count(),
      prisma.catalogItem.count(),
      prisma.generator.count(),
      prisma.generatorBaseItem.count(),
    ]),
    prisma.$queryRawUnsafe(`
      SELECT migration_name
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    `),
  ]);
  const ruleMap = new Map();
  for (const rule of rules) {
    if (rule.family.code !== 'O' || rule.application.code !== 'O') continue;
    if (rule.area.code === 'O') ruleMap.set(ItemType.PART, rule);
    if (rule.area.code === 'S') ruleMap.set(ItemType.SERVICE, rule);
  }
  const policyMap = new Map();
  for (const policy of policies) {
    if (!policyMap.has(policy.itemType)) policyMap.set(policy.itemType, policy);
  }
  const localMigrations = fs
    .readdirSync(path.resolve(__dirname, '..', 'prisma', 'migrations'), {
      withFileTypes: true,
    })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const applied = new Set(appliedMigrations.map((row) => row.migration_name));
  return {
    rules: ruleMap,
    policies: policyMap,
    counts: {
      clients: counts[0],
      suppliers: counts[1],
      catalogItems: counts[2],
      generators: counts[3],
      generatorBaseItems: counts[4],
    },
    pendingMigrations: localMigrations.filter((name) => !applied.has(name)),
  };
}

function assertConfiguration(readiness, catalogPlan) {
  const types = new Set(catalogPlan.items.map((item) => item.type));
  for (const type of types) {
    if (!readiness.rules.has(type)) {
      throw new Error(
        `Regra provisoria de SKU nao configurada para ${type} (area/familia/aplicacao O-O-O ou S-O-O).`,
      );
    }
    if (!readiness.policies.has(type)) {
      throw new Error(
        `Politica financeira padrao ativa nao configurada para ${type}.`,
      );
    }
  }
}

function buildReport(
  inputs,
  readiness,
  agentsPlan,
  catalogPlan,
  equipmentPlan,
  accessoryPlan,
) {
  return {
    generatedAt: new Date().toISOString(),
    mode: 'DRY_RUN',
    inputDirectory: path.dirname(inputs.paths.agents),
    files: Object.fromEntries(
      Object.entries(inputs.paths).map(([key, filePath]) => [
        key,
        {
          name: path.basename(filePath),
          sha256: inputs.hashes[key],
        },
      ]),
    ),
    databaseBefore: readiness.counts,
    pendingMigrations: readiness.pendingMigrations,
    agents: {
      sourceRows: agentsPlan.sourceRows,
      clientSourceRows: agentsPlan.clientSourceRows,
      supplierSourceRows: agentsPlan.supplierSourceRows,
      clientsToCreate: agentsPlan.clientClusters.length,
      suppliersToCreate: agentsPlan.suppliers.length,
      clientRowsConsolidatedByDocument: agentsPlan.consolidatedClientRows,
      supplierRowsConsolidatedByDocument: agentsPlan.consolidatedSupplierRows,
      clientRowsWithoutValidDocument:
        agentsPlan.invalidOrMissingClientDocuments,
      supplierRowsWithoutValidDocument:
        agentsPlan.invalidOrMissingSupplierDocuments,
    },
    products: {
      sourceRows: catalogPlan.sourceRows,
      uniqueProductsToCreate: catalogPlan.productItems,
      duplicateRowsConsolidated: catalogPlan.duplicateRowsConsolidated,
      productsWithoutDescriptionUsingFallback:
        catalogPlan.missingDescriptionItems,
      placeholdersForReferencedMissingProducts: catalogPlan.placeholderItems,
      totalCatalogItemsToCreate: catalogPlan.items.length,
      pricingColumnsIgnored: IGNORED_PRODUCT_PRICING_COLUMNS,
      pricingSource: 'POLITICA_FINANCEIRA_PADRAO',
    },
    equipments: {
      detailedSourceRows: equipmentPlan.sourceDetailRows,
      generatorsToCreate: equipmentPlan.generators.length,
      createdFromAccessoryWorkbookOnly:
        equipmentPlan.extraGeneratorsFromAccessoryWorkbook,
      accessoryOnlyIdsQuarantined: equipmentPlan.quarantinedAccessoryOnlyIds,
      provisionalClientsToCreate: equipmentPlan.provisionalClients.length,
      ownerResolution: equipmentPlan.resolutionCounts,
      duplicateSerialValuesNotApplied: equipmentPlan.duplicatedSerialValues,
      generatorsWithoutPowerImportedAsZero:
        equipmentPlan.generatorsWithoutPower,
    },
    accessories: {
      sourceRows: accessoryPlan.sourceRows,
      rowsWithProductSequence: accessoryPlan.referencedRows,
      linksToCreate: accessoryPlan.links.length,
      repeatedPairsDeduplicated: accessoryPlan.duplicatePairRows,
      descriptionsWithoutSequenceSkipped:
        accessoryPlan.blankSequenceWithDescription,
      rowsWithoutAccessory: accessoryPlan.blankAccessoryRows,
    },
  };
}

async function createManyInChunks(delegate, data, chunkSize = 200) {
  for (let start = 0; start < data.length; start += chunkSize) {
    await delegate.createMany({ data: data.slice(start, start + chunkSize) });
  }
}

function catalogRecord(item, skuNumber, rule, policy) {
  const pricing = item.data.pricing;
  return {
    id: item.id,
    sku: `${skuNumber}${rule.area.code}${rule.family.code}${rule.application.code}`,
    skuNumber,
    skuAreaId: rule.areaId,
    skuFamilyId: rule.familyId,
    skuApplicationId: rule.applicationId,
    legacyCode: item.legacyCode,
    legacySequence: item.legacySequence,
    radarCode: item.radarCode,
    name: item.data.name,
    description: item.data.description,
    commercialDescription: item.data.commercialDescription,
    category: item.data.category,
    subcategory: item.data.subcategory,
    type: item.type,
    itemClassification: item.data.itemClassification,
    unit: item.data.unit,
    acquisitionOrigin: item.data.acquisitionOrigin,
    ncm: item.data.ncm,
    costPrice: item.data.costPrice,
    averageCost: item.data.averageCost,
    lastCost: item.data.lastCost,
    pricingPolicyId: policy.id,
    basePrice: pricing.suggestedSalePrice,
    taxPercentage: pricing.salesTaxPercent,
    profitMargin: pricing.profitMarginPercent,
    icmsPercent: pricing.icmsPercent,
    pisPercent: pricing.pisPercent,
    cofinsPercent: pricing.cofinsPercent,
    ipiPercent: pricing.ipiPercent,
    issPercent: pricing.issPercent,
    irpjPercent: pricing.irpjPercent,
    csllPercent: pricing.csllPercent,
    cppPercent: pricing.cppPercent,
    commissionPercent: pricing.commissionPercent,
    operationalCostPercent: pricing.operationalCostPercent,
    stockCurrent: 0,
    stockMin: 0,
    stockMax: 0,
    storageLocation: item.data.storageLocation,
    technicalSpecs: item.data.technicalSpecs,
    taxProfile: pricing,
    isActive: true,
  };
}

function identifierRecords(item, sku) {
  const candidates = [
    [sku, CatalogIdentifierType.INTERNAL_SKU, true, 'importacao_legada'],
    [
      item.legacyCode,
      CatalogIdentifierType.LEGACY_CODE,
      false,
      'codigo_legado',
    ],
    [
      item.legacySequence,
      CatalogIdentifierType.OTHER,
      false,
      'sequencia_legada',
    ],
    [item.radarCode, CatalogIdentifierType.CATALOG_CODE, false, 'codigo_radar'],
    [
      item.alternativeCode,
      CatalogIdentifierType.INTERNAL_ALIAS,
      false,
      'codigo_alternativo',
    ],
  ];
  return candidates
    .filter(([code]) => Boolean(code))
    .map(([code, type, isPrimary, source]) => ({
      id: crypto.randomUUID(),
      catalogItemId: item.id,
      type,
      code,
      normalizedCode: comparable(code).replace(/\s/g, ''),
      source,
      isPrimary,
      isActive: true,
    }));
}

function importBatches(report) {
  const hasEquipmentWarnings =
    report.equipments.provisionalClientsToCreate > 0 ||
    report.equipments.duplicateSerialValuesNotApplied > 0 ||
    report.equipments.generatorsWithoutPowerImportedAsZero > 0;
  const hasAccessoryWarnings =
    report.accessories.descriptionsWithoutSequenceSkipped > 0;
  return [
    {
      id: crypto.randomUUID(),
      resource: 'legacy-agents',
      originalFileName: INPUT_FILES.agents,
      mode: StudioImportMode.CREATE_ONLY,
      status: StudioImportBatchStatus.COMPLETED,
      totalRows: report.agents.sourceRows,
      validRows: report.agents.sourceRows,
      warningRows:
        report.agents.clientRowsWithoutValidDocument +
        report.agents.supplierRowsWithoutValidDocument,
      invalidRows: 0,
      duplicateRows:
        report.agents.clientRowsConsolidatedByDocument +
        report.agents.supplierRowsConsolidatedByDocument,
      createdRows:
        report.agents.clientsToCreate + report.agents.suppliersToCreate,
      skippedRows: 0,
      failedRows: 0,
      summary: report.agents,
      startedAt: new Date(),
      completedAt: new Date(),
    },
    {
      id: crypto.randomUUID(),
      resource: 'legacy-catalog',
      originalFileName: INPUT_FILES.products,
      mode: StudioImportMode.CREATE_ONLY,
      status: StudioImportBatchStatus.COMPLETED_WITH_ERRORS,
      totalRows: report.products.sourceRows,
      validRows: report.products.sourceRows,
      warningRows:
        report.products.productsWithoutDescriptionUsingFallback +
        report.products.placeholdersForReferencedMissingProducts,
      invalidRows: 0,
      duplicateRows: report.products.duplicateRowsConsolidated,
      createdRows: report.products.totalCatalogItemsToCreate,
      skippedRows: 0,
      failedRows: 0,
      summary: report.products,
      startedAt: new Date(),
      completedAt: new Date(),
    },
    {
      id: crypto.randomUUID(),
      resource: 'legacy-equipments',
      originalFileName: INPUT_FILES.equipments,
      mode: StudioImportMode.CREATE_ONLY,
      status: hasEquipmentWarnings
        ? StudioImportBatchStatus.COMPLETED_WITH_ERRORS
        : StudioImportBatchStatus.COMPLETED,
      totalRows: report.equipments.detailedSourceRows,
      validRows: report.equipments.generatorsToCreate,
      warningRows:
        report.equipments.provisionalClientsToCreate +
        report.equipments.duplicateSerialValuesNotApplied +
        report.equipments.generatorsWithoutPowerImportedAsZero,
      invalidRows: 0,
      duplicateRows: 0,
      createdRows: report.equipments.generatorsToCreate,
      skippedRows: 0,
      failedRows: 0,
      summary: report.equipments,
      startedAt: new Date(),
      completedAt: new Date(),
    },
    {
      id: crypto.randomUUID(),
      resource: 'legacy-equipment-accessories',
      originalFileName: INPUT_FILES.accessories,
      mode: StudioImportMode.CREATE_ONLY,
      status: hasAccessoryWarnings
        ? StudioImportBatchStatus.COMPLETED_WITH_ERRORS
        : StudioImportBatchStatus.COMPLETED,
      totalRows: report.accessories.sourceRows,
      validRows: report.accessories.rowsWithProductSequence,
      warningRows: report.accessories.descriptionsWithoutSequenceSkipped,
      invalidRows: report.accessories.descriptionsWithoutSequenceSkipped,
      duplicateRows: report.accessories.repeatedPairsDeduplicated,
      createdRows: report.accessories.linksToCreate,
      skippedRows:
        report.accessories.descriptionsWithoutSequenceSkipped +
        report.accessories.rowsWithoutAccessory,
      failedRows: 0,
      summary: report.accessories,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  ];
}

async function executeImport(prisma, readiness, plans, report) {
  if (readiness.pendingMigrations.length) {
    throw new Error(
      `Migracoes pendentes: ${readiness.pendingMigrations.join(', ')}.`,
    );
  }
  const nonEmpty = Object.entries(readiness.counts).filter(
    ([, count]) => count,
  );
  if (nonEmpty.length) {
    throw new Error(
      `Importacao recusada: as tabelas operacionais nao estao vazias (${nonEmpty.map(([name, count]) => `${name}=${count}`).join(', ')}).`,
    );
  }
  return prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext('manitec-import-legacy-workbooks'))::text AS "lock"`,
      );
      const allClientClusters = [
        ...plans.agents.clientClusters,
        ...plans.equipments.provisionalClients,
      ];
      await createManyInChunks(
        transaction.client,
        allClientClusters.map((cluster) => cluster.data),
        50,
      );
      await createManyInChunks(
        transaction.clientAddress,
        plans.agents.clientClusters.flatMap((cluster) => cluster.addresses),
      );
      await createManyInChunks(
        transaction.clientContact,
        plans.agents.clientClusters.flatMap((cluster) => cluster.contacts),
      );
      await createManyInChunks(
        transaction.supplier,
        plans.agents.suppliers.map((supplier) => supplier.data),
        50,
      );

      const skuRows = await transaction.$queryRawUnsafe(
        `SELECT nextval('catalog_sku_number_seq')::integer AS value
         FROM generate_series(1, $1::integer) AS generated
         ORDER BY generated`,
        plans.catalog.items.length,
      );
      if (skuRows.length !== plans.catalog.items.length) {
        throw new Error('Falha ao reservar a numeracao dos SKUs internos.');
      }
      const catalogRecords = plans.catalog.items.map((item, index) => {
        const skuNumber = Number(skuRows[index].value);
        const rule = readiness.rules.get(item.type);
        const policy = readiness.policies.get(item.type);
        return catalogRecord(item, skuNumber, rule, policy);
      });
      await createManyInChunks(transaction.catalogItem, catalogRecords, 100);
      await createManyInChunks(
        transaction.catalogItemIdentifier,
        plans.catalog.items.flatMap((item, index) =>
          identifierRecords(item, catalogRecords[index].sku),
        ),
        200,
      );
      await createManyInChunks(
        transaction.generator,
        plans.equipments.generators.map((generator) => ({
          id: generator.id,
          legacyCode: generator.legacyCode,
          ...generator.data,
        })),
        100,
      );
      await createManyInChunks(
        transaction.generatorBaseItem,
        plans.accessories.links,
        200,
      );

      const batches = importBatches(report);
      await transaction.studioImportBatch.createMany({ data: batches });
      await transaction.systemAuditLog.create({
        data: {
          domain: AuditDomain.INVENTORY,
          entityType: 'LegacyWorkbookImport',
          entityId: batches[0].id,
          action: 'IMPORT_CREATE',
          afterPayload: {
            inputFiles: report.files,
            agents: report.agents,
            products: report.products,
            equipments: report.equipments,
            accessories: report.accessories,
          },
          reason: 'Carga controlada das quatro planilhas do sistema legado.',
        },
      });

      const counts = {
        clients: await transaction.client.count(),
        suppliers: await transaction.supplier.count(),
        catalogItems: await transaction.catalogItem.count(),
        generators: await transaction.generator.count(),
        generatorBaseItems: await transaction.generatorBaseItem.count(),
      };
      const expected = {
        clients: allClientClusters.length,
        suppliers: plans.agents.suppliers.length,
        catalogItems: plans.catalog.items.length,
        generators: plans.equipments.generators.length,
        generatorBaseItems: plans.accessories.links.length,
      };
      const mismatches = Object.keys(expected).filter(
        (key) => counts[key] !== expected[key],
      );
      if (mismatches.length) {
        throw new Error(
          `Validacao final divergente: ${mismatches.map((key) => `${key}=${counts[key]}/${expected[key]}`).join(', ')}.`,
        );
      }
      return counts;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 30_000,
      timeout: 1_800_000,
    },
  );
}

function writeReport(reportPath, report) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  loadEnvFile();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL nao esta configurada.');
  }
  console.log(
    `[legacy-import] modo=${options.execute ? 'EXECUCAO' : 'SIMULACAO'}`,
  );
  console.log(`[legacy-import] pasta=${options.directory}`);
  const inputs = await readInputs(options.directory);
  const ownerAliases = readOwnerAliases(options.directory);
  console.log(
    `[legacy-import] aliases de proprietario revisados=${ownerAliases.size}`,
  );
  const prisma = new PrismaClient();
  try {
    const readiness = await databaseReadiness(prisma);
    const agentsPlan = buildAgentsPlan(inputs.agents);
    const catalogPlan = buildCatalogPlan(
      inputs.products,
      inputs.accessories,
      readiness.policies,
    );
    assertConfiguration(readiness, catalogPlan);
    const equipmentPlan = buildEquipmentPlan(
      inputs.equipments,
      inputs.accessories,
      agentsPlan.clientClusters,
      ownerAliases,
    );
    const accessoryPlan = buildAccessoryLinks(
      inputs.accessories,
      equipmentPlan.generators,
      catalogPlan.items,
    );
    const plans = {
      agents: agentsPlan,
      catalog: catalogPlan,
      equipments: equipmentPlan,
      accessories: accessoryPlan,
    };
    const report = buildReport(
      inputs,
      readiness,
      agentsPlan,
      catalogPlan,
      equipmentPlan,
      accessoryPlan,
    );
    if (options.execute) {
      report.databaseAfter = await executeImport(
        prisma,
        readiness,
        plans,
        report,
      );
      report.mode = 'EXECUTED';
      report.executedAt = new Date().toISOString();
    }
    writeReport(options.report, report);
    console.log(JSON.stringify(report, null, 2));
    console.log(`[legacy-import] relatorio=${options.report}`);
    console.log(
      options.execute
        ? '[legacy-import] CONCLUIDO. A transacao foi confirmada e validada.'
        : '[legacy-import] SIMULACAO concluida. Nenhum dado foi alterado.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`[legacy-import] FALHOU: ${error.message}`);
  process.exitCode = 1;
});
