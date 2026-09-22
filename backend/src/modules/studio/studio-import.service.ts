import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
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
  rawDataField?: string;
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

const MAX_IMPORT_ROWS = 20_000;

const SUPPLIER_IMPORT_DEFINITION: ImportDefinition = {
  resource: 'suppliers',
  label: 'Fornecedores',
  mode: StudioImportMode.CREATE_ONLY,
  resourceCreatePermission: 'purchaseOrders.create',
  domain: AuditDomain.PURCHASE_ORDERS,
  entityType: 'Supplier',
  uniqueField: 'cnpj',
  rawDataField: 'legacyData',
  fields: [
    {
      key: 'legacyCode',
      label: 'Codigo Legado',
      aliases: ['codigo', 'codigo legado'],
      normalize: normalizeText,
    },
    {
      key: 'companyName',
      label: 'Razao Social',
      aliases: [
        'razao social',
        'razão social',
        'empresa',
        'fornecedor',
        'nome',
      ],
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
      aliases: ['cnpj', 'cpf', 'documento', 'cpf/cnpj', 'cnpjcpf'],
      required: true,
      normalize: normalizeDigits,
      validate: (value) => {
        const document = primitiveString(value);
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
      validate: (value) => {
        if (!value) return [];
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primitiveString(value))
          ? []
          : [
              {
                code: 'INVALID_EMAIL',
                field: 'email',
                message: 'E-mail invalido.',
              },
            ];
      },
    },
    {
      key: 'phone',
      label: 'Telefone',
      aliases: ['telefone', 'tel', 'tel1', 'celular', 'whatsapp'],
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
      normalize: (value) =>
        normalizeText(value)?.toUpperCase().slice(0, 2) ?? null,
    },
    {
      key: 'address',
      label: 'Endereco',
      aliases: ['endereco', 'rua', 'logradouro', 'ruaprincipal'],
      normalize: normalizeText,
    },
    {
      key: 'stateRegistration',
      label: 'Inscricao Estadual',
      aliases: ['inscricao estadual', 'ie', 'inscrrg'],
      normalize: normalizeText,
    },
    {
      key: 'municipalRegistration',
      label: 'Inscricao Municipal',
      aliases: ['inscricao municipal', 'im', 'inscricaomunicipal'],
      normalize: normalizeText,
    },
    {
      key: 'paymentTerm',
      label: 'Condicao de Pagamento',
      aliases: [
        'condicao pagamento',
        'condição pagamento',
        'pagamento',
        'prazo',
      ],
      normalize: normalizeText,
    },
    {
      key: 'notes',
      label: 'Observacoes',
      aliases: ['observacoes', 'observacao', 'notas'],
      normalize: normalizeText,
    },
    {
      key: 'isActive',
      label: 'Ativo',
      aliases: ['ativo', 'status'],
      normalize: normalizeActiveStatus,
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
        legacyCode: nullableString(data.legacyCode),
        companyName: String(data.companyName),
        tradeName: nullableString(data.tradeName),
        cnpj: String(data.cnpj),
        email: nullableString(data.email),
        phone: nullableString(data.phone),
        address: nullableString(data.address),
        city: nullableString(data.city),
        state: nullableString(data.state),
        stateRegistration: nullableString(data.stateRegistration),
        municipalRegistration: nullableString(data.municipalRegistration),
        paymentTerm: nullableString(data.paymentTerm),
        notes: nullableString(data.notes),
        legacyData: jsonObjectOrUndefined(data.legacyData),
        isActive: data.isActive !== false,
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
  rawDataField: 'legacyData',
  fields: [
    {
      key: 'legacyCode',
      label: 'Codigo Legado',
      aliases: ['codigo', 'codigo legado'],
      normalize: normalizeText,
    },
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
      aliases: ['cnpj', 'cpf', 'documento', 'cpf/cnpj', 'cnpjcpf'],
      required: true,
      normalize: normalizeDigits,
      validate: (value) => {
        const document = primitiveString(value);
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
      aliases: ['telefone', 'tel', 'tel1', 'celular', 'whatsapp'],
      normalize: normalizeText,
      validate: (value, row) =>
        value || row.contact01Phone || row.contact01Mobile
          ? []
          : [
              {
                code: 'MISSING_PHONE',
                field: 'phone',
                message:
                  'Telefone ausente. O cadastro sera criado com telefone padrao.',
              },
            ],
    },
    {
      key: 'address',
      label: 'Endereco resumido',
      aliases: [
        'endereco',
        'endereÃ§o',
        'endereco completo',
        'ruaprincipal',
        'endereÃ§o completo',
      ],
      normalize: normalizeText,
    },
    {
      key: 'city',
      label: 'Cidade',
      aliases: ['cidade', 'cidadeprincipal', 'municipio', 'municÃ­pio'],
      normalize: normalizeText,
      validate: (value, row) =>
        value || row.billingCity || row.installationCity
          ? []
          : [
              {
                code: 'MISSING_CITY',
                field: 'city',
                message: 'Cidade obrigatoria.',
              },
            ],
    },
    {
      key: 'state',
      label: 'UF',
      aliases: ['estado', 'uf', 'ufprincipal'],
      normalize: normalizeUf,
      validate: (value, row) =>
        value || row.billingState || row.installationState
          ? []
          : [
              {
                code: 'MISSING_STATE',
                field: 'state',
                message: 'UF obrigatoria.',
              },
            ],
    },
    {
      key: 'stateRegistration',
      label: 'Inscricao Estadual',
      aliases: ['inscricao estadual', 'ie', 'inscrrg'],
      normalize: normalizeText,
    },
    {
      key: 'municipalRegistration',
      label: 'Inscricao Municipal',
      aliases: ['inscricao municipal', 'im', 'inscricaomunicipal'],
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
      aliases: ['preferencias', 'preferÃªncias'],
      normalize: normalizeText,
    },
    {
      key: 'notes',
      label: 'Observacoes',
      aliases: ['observacoes', 'observacao', 'obs'],
      normalize: normalizeText,
    },
    {
      key: 'isActive',
      label: 'Ativo',
      aliases: ['ativo', 'status'],
      normalize: normalizeActiveStatus,
    },
    {
      key: 'clientType',
      label: 'Tipo',
      aliases: ['tipo', 'tipo cliente', 'tipocliente', 'contrato'],
      normalize: normalizeClientType,
    },
    {
      key: 'personType',
      label: 'Pessoa',
      aliases: [
        'pessoa',
        'tipo pessoa',
        'fisica juridica',
        'fÃ­sica jurÃ­dica',
      ],
      normalize: normalizePersonType,
    },
    {
      key: 'paymentTermDefault',
      label: 'Condicao Padrao',
      aliases: [
        'condicao pagamento',
        'condiÃ§Ã£o pagamento',
        'pagamento',
        'prazo',
      ],
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
    ...clientAddressFields('primary', 'Principal', 'principal'),
    ...clientAddressFields('billing', 'Cobranca', 'cobranca'),
    ...clientAddressFields('installation', 'Entrega', 'entrega'),
    ...clientContactFields(1),
    ...clientContactFields(2),
    ...clientContactFields(3),
    ...clientContactFields(4),
  ],
  findDuplicates: async (tx, values) => {
    const clients = await tx.client.findMany({
      where: { cnpj: { in: values } },
      select: { cnpj: true },
    });
    return new Set(
      clients
        .map((client) => client.cnpj)
        .filter((document): document is string => Boolean(document)),
    );
  },
  createRecord: (tx, data) => {
    const city = (
      nullableString(data.city) ||
      nullableString(data.billingCity) ||
      nullableString(data.installationCity) ||
      ''
    ).trim();
    const state = (
      nullableString(data.state) ||
      nullableString(data.billingState) ||
      nullableString(data.installationState) ||
      ''
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
      buildClientAddress(data, 'primary', ClientAddressType.OTHER, city, state),
      buildClientAddress(
        data,
        'billing',
        ClientAddressType.BILLING,
        city,
        state,
      ),
      buildClientAddress(
        data,
        'installation',
        ClientAddressType.INSTALLATION,
        city,
        state,
      ),
    ].filter((address): address is NonNullable<typeof address> =>
      Boolean(address),
    );
    const contacts = [1, 2, 3, 4]
      .map((index) => buildClientContact(data, index))
      .filter((contact): contact is NonNullable<typeof contact> =>
        Boolean(contact),
      );

    return tx.client.create({
      data: {
        legacyCode: nullableString(data.legacyCode),
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
        notes: nullableString(data.notes),
        legacyData: jsonObjectOrUndefined(data.legacyData),
        isActive: data.isActive !== false,
        clientType:
          (data.clientType as ClientType | undefined) ?? ClientType.NO_CONTRACT,
        personType:
          (data.personType as ClientPersonType | undefined) ??
          (String(data.cnpj).length === 11
            ? ClientPersonType.INDIVIDUAL
            : ClientPersonType.LEGAL_ENTITY),
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

const EQUIPMENT_IMPORT_DEFINITION: ImportDefinition = {
  resource: 'equipments',
  label: 'Equipamentos',
  mode: StudioImportMode.CREATE_ONLY,
  resourceCreatePermission: 'equipments.create',
  domain: AuditDomain.MAINTENANCE_ORDERS,
  entityType: 'Generator',
  uniqueField: 'legacyCode',
  rawDataField: 'legacyTechnicalData',
  fields: [
    {
      key: 'legacyCode',
      label: 'Codigo Legado',
      aliases: ['sequencia', 'codigo legado'],
      required: true,
      normalize: normalizeText,
    },
    {
      key: 'name',
      label: 'Descricao',
      aliases: ['nome', 'equipamento'],
      required: true,
      normalize: normalizeText,
    },
    {
      key: 'serialNumber',
      label: 'Numero de Serie',
      aliases: ['serie', 'numero serie'],
      normalize: normalizeText,
    },
    {
      key: 'assetTag',
      label: 'Codigo do Equipamento',
      aliases: ['codigo', 'tag'],
      normalize: normalizeText,
    },
    {
      key: 'brand',
      label: 'Marca',
      aliases: ['descricao 1', 'fabricante', 'motor'],
      required: true,
      normalize: normalizeText,
    },
    {
      key: 'power',
      label: 'Potencia kVA',
      aliases: ['potencia', 'potencia alternador', 'potenciaalternador'],
      required: true,
      normalize: normalizePowerInput,
    },
    {
      key: 'voltage',
      label: 'Tensao',
      aliases: ['tensao nominal', 'tensao nominal alternador'],
      normalize: normalizeText,
    },
    {
      key: 'clientDocument',
      label: 'CNPJCPF Cliente',
      aliases: ['documento cliente', 'cnpj cliente', 'cpf cliente'],
      normalize: normalizeDigits,
      validate: (value, row) => {
        const document = primitiveString(value);
        if (!document) {
          return row.clientLegacyCode || row.ownerName
            ? []
            : [
                {
                  code: 'MISSING_CLIENT_REFERENCE',
                  field: 'clientDocument',
                  message:
                    'Informe CNPJ/CPF, codigo legado ou proprietario do cliente.',
                },
              ];
        }
        return isValidBrazilDocument(document)
          ? []
          : [
              {
                code: 'INVALID_CLIENT_DOCUMENT',
                field: 'clientDocument',
                message: 'CNPJ/CPF do cliente invalido ou incompleto.',
              },
            ];
      },
    },
    {
      key: 'clientLegacyCode',
      label: 'Codigo Legado Cliente',
      aliases: ['codigo cliente', 'codigo legado cliente'],
      normalize: normalizeText,
    },
    {
      key: 'ownerName',
      label: 'Proprietario',
      aliases: ['proprietario', 'cliente', 'razao social cliente'],
      normalize: normalizeText,
    },
    {
      key: 'condition',
      label: 'Condicao',
      aliases: ['condicao 1', 'situacao'],
      normalize: normalizeText,
    },
    {
      key: 'installationSite',
      label: 'Endereco Instalacao',
      aliases: ['local instalacao'],
      normalize: normalizeText,
    },
    {
      key: 'engineBrand',
      label: 'Fabricante Motor',
      aliases: ['marca motor'],
      normalize: normalizeText,
    },
    {
      key: 'engineModelName',
      label: 'Modelo Motor',
      aliases: ['motor modelo', 'modelomotor'],
      normalize: normalizeText,
    },
    {
      key: 'engineSerialNumber',
      label: 'Serie Motor',
      aliases: ['numero serie motor', 'seriemotor'],
      normalize: normalizeText,
    },
    {
      key: 'manufactureYear',
      label: 'Ano Fabricacao',
      aliases: ['ano fabricacao motor', 'anofabricacaomotor'],
      normalize: normalizeIntegerInput,
    },
    {
      key: 'alternatorBrand',
      label: 'Fabricante Alternador',
      aliases: ['marca alternador', 'fabricantealternador'],
      normalize: normalizeText,
    },
    {
      key: 'alternatorModelName',
      label: 'Modelo Alternador',
      aliases: ['alternador modelo', 'modeloalternador'],
      normalize: normalizeText,
    },
    {
      key: 'alternatorSerialNumber',
      label: 'Serie Alternador',
      aliases: ['nserie alternador', 'nseriealternador'],
      normalize: normalizeText,
    },
    {
      key: 'alternatorVoltage',
      label: 'Tensao Alternador',
      aliases: ['tensao nominal alternador', 'tensaonominalalternador'],
      normalize: normalizeText,
    },
    {
      key: 'transferSwitchBrand',
      label: 'Fabricante QTA',
      aliases: [
        'fabricante quadro transferencia',
        'fabricantequadrotransferencia',
      ],
      normalize: normalizeText,
    },
    {
      key: 'transferSwitchModel',
      label: 'Modelo QTA',
      aliases: ['modelo quadro transferencia', 'modeloquadrotransferencia'],
      normalize: normalizeText,
    },
    {
      key: 'transferSwitchCommandVoltage',
      label: 'Tensao Comando QTA',
      aliases: [
        'tensao comando quadro transferencia',
        'tensaocomandoquadrotransferenci',
      ],
      normalize: normalizeText,
    },
    {
      key: 'transferSwitchRatedCurrent',
      label: 'Corrente Nominal QTA',
      aliases: [
        'corrente nominal quadro transferencia',
        'correntenominalquadrotransferen',
      ],
      normalize: normalizeText,
    },
    {
      key: 'notes',
      label: 'Observacoes',
      aliases: ['observacao', 'notas'],
      normalize: normalizeText,
    },
    {
      key: 'hasMaintenanceContract',
      label: 'Possui Contrato',
      aliases: ['com contrato', 'contrato'],
      normalize: normalizeBooleanInput,
    },
  ],
  findDuplicates: async (tx, values) => {
    const generators = await tx.generator.findMany({
      where: { legacyCode: { in: values } },
      select: { legacyCode: true },
    });
    return new Set(
      generators
        .map((generator) => generator.legacyCode)
        .filter((value): value is string => Boolean(value)),
    );
  },
  createRecord: async (tx, data) => {
    const clientLegacyCode = nullableString(data.clientLegacyCode);
    const clientDocument = nullableString(data.clientDocument);
    const ownerName = nullableString(data.ownerName);
    const directReferences = [
      ...(clientDocument ? [{ cnpj: clientDocument }] : []),
      ...(clientLegacyCode ? [{ legacyCode: clientLegacyCode }] : []),
    ];
    let client = directReferences.length
      ? await tx.client.findFirst({
          where: { OR: directReferences },
          select: { id: true },
        })
      : null;
    if (!client && ownerName) {
      const ownerMatches = await tx.client.findMany({
        where: {
          OR: [
            { companyName: { equals: ownerName, mode: 'insensitive' } },
            { tradeName: { equals: ownerName, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
        take: 2,
      });
      if (ownerMatches.length === 1) client = ownerMatches[0];
      if (ownerMatches.length > 1) {
        throw new BadRequestException(
          'Proprietario da maquina corresponde a mais de um cliente. Informe CNPJ/CPF ou codigo legado.',
        );
      }
    }
    if (!client)
      throw new BadRequestException(
        'Cliente da maquina nao encontrado pelo CNPJ/CPF ou codigo legado.',
      );
    return tx.generator.create({
      data: {
        legacyCode: String(data.legacyCode),
        name: String(data.name),
        brand: String(data.brand),
        serialNumber: nullableString(data.serialNumber),
        assetTag: nullableString(data.assetTag),
        power: Number(data.power),
        voltage: nullableString(data.voltage),
        condition: nullableString(data.condition),
        installationSite: nullableString(data.installationSite),
        engineBrand: nullableString(data.engineBrand),
        engineModelName: nullableString(data.engineModelName),
        engineSerialNumber: nullableString(data.engineSerialNumber),
        manufactureYear:
          typeof data.manufactureYear === 'number'
            ? data.manufactureYear
            : undefined,
        alternatorBrand: nullableString(data.alternatorBrand),
        alternatorModelName: nullableString(data.alternatorModelName),
        alternatorSerialNumber: nullableString(data.alternatorSerialNumber),
        alternatorVoltage: nullableString(data.alternatorVoltage),
        transferSwitchBrand: nullableString(data.transferSwitchBrand),
        transferSwitchModel: nullableString(data.transferSwitchModel),
        transferSwitchCommandVoltage: nullableString(
          data.transferSwitchCommandVoltage,
        ),
        transferSwitchRatedCurrent: nullableString(
          data.transferSwitchRatedCurrent,
        ),
        notes: nullableString(data.notes),
        legacyTechnicalData: jsonObjectOrUndefined(data.legacyTechnicalData),
        hasMaintenanceContract: Boolean(data.hasMaintenanceContract),
        operationalStatus: GeneratorOperationalStatus.OPERATING,
        lifecycleStatus: GeneratorLifecycleStatus.AVAILABLE,
        criticality: GeneratorCriticality.B,
        clientId: client.id,
      },
      select: { id: true },
    });
  },
};

const CATALOG_IMPORT_DEFINITION: ImportDefinition = {
  resource: 'catalog',
  label: 'Catalogo',
  mode: StudioImportMode.CREATE_ONLY,
  resourceCreatePermission: 'catalog.create',
  domain: AuditDomain.INVENTORY,
  entityType: 'CatalogItem',
  uniqueField: 'legacySequence',
  fields: [
    {
      key: 'legacySequence',
      label: 'Sequencia Legada',
      aliases: ['sequencia', 'sequência', 'sequence'],
      required: true,
      normalize: normalizeText,
    },
    {
      key: 'name',
      label: 'Descricao',
      aliases: ['descricao', 'descrição', 'nome', 'produto', 'item'],
      required: true,
      normalize: normalizeText,
    },
    {
      key: 'commercialDescription',
      label: 'Descricao de faturamento',
      aliases: [
        'descricaofat',
        'descricao fat',
        'descrição faturamento',
        'descricao comercial',
      ],
      normalize: normalizeText,
    },
    {
      key: 'legacyDescription',
      label: 'Descricao complementar',
      aliases: [
        'descricao_1',
        'descricao 1',
        'descrição 1',
        'descricaocomplementar',
        'descricao complementar',
        'descrição complementar',
      ],
      normalize: normalizeText,
    },
    {
      key: 'type',
      label: 'Tipo do item',
      aliases: ['tipodoitem', 'tipo do item', 'tipo', 'item type'],
      required: true,
      normalize: normalizeCatalogItemType,
    },
    {
      key: 'itemClassification',
      label: 'Tipo do item original',
      aliases: [
        'tipodoitem',
        'tipo do item',
        'classificacao',
        'classificação do item',
      ],
      normalize: normalizeText,
    },
    {
      key: 'unit',
      label: 'Unidade',
      aliases: ['unidade', 'un', 'unit'],
      normalize: normalizeText,
    },
    {
      key: 'category',
      label: 'Familia',
      aliases: ['familia', 'família', 'categoria'],
      normalize: normalizeText,
    },
    {
      key: 'subcategory',
      label: 'Subfamilia',
      aliases: ['subfamilia', 'subfamília', 'subcategoria'],
      normalize: normalizeText,
    },
    {
      key: 'acquisitionOrigin',
      label: 'Origem',
      aliases: ['origem', 'origem do item', 'aquisicao', 'purchase origin'],
      normalize: normalizeText,
    },
    {
      key: 'legacyCode',
      label: 'Codigo legado',
      aliases: [
        'codigolegado',
        'codigo legado',
        'código legado',
        'legacycode',
        'legacy code',
        'codigo',
        'código',
      ],
      normalize: normalizeCatalogCode,
    },
    {
      key: 'ncm',
      label: 'NCM',
      aliases: ['ncm', 'codigo_1', 'codigo 1', 'código 1'],
      normalize: normalizeCatalogCode,
    },
    {
      key: 'radarCode',
      label: 'Codigo Radar',
      aliases: ['codigoradar', 'codigo radar', 'código radar'],
      normalize: normalizeCatalogCode,
    },
    {
      key: 'alternativeCode',
      label: 'Codigo alternativo',
      aliases: ['alternativo', 'codigo alternativo', 'código alternativo'],
      normalize: normalizeCatalogCode,
    },
    {
      key: 'storageLocation',
      label: 'Localizacao',
      aliases: ['localizacao', 'localização', 'local'],
      normalize: normalizeText,
    },
    {
      key: 'brand',
      label: 'Marca',
      aliases: ['marca', 'brand', 'fabricante'],
      normalize: normalizeText,
    },
    {
      key: 'costPrice',
      label: 'Preco de compra',
      aliases: [
        'precocompra',
        'preco compra',
        'preço de compra',
        'purchaseprice',
        'purchase price',
        'costprice',
        'custo',
      ],
      normalize: normalizeNumberInput,
    },
    {
      key: 'stockMin',
      label: 'Estoque minimo',
      aliases: ['estoque minimo', 'estoque mínimo', 'stockmin', 'minimo'],
      normalize: normalizeNumberInput,
    },
    {
      key: 'stockMax',
      label: 'Estoque maximo',
      aliases: ['estoque maximo', 'estoque máximo', 'stockmax', 'maximo'],
      normalize: normalizeNumberInput,
    },
    {
      key: 'isActive',
      label: 'Ativo',
      aliases: ['ativo', 'isactive', 'status'],
      normalize: normalizeCatalogActive,
    },
  ],
  findDuplicates: async (tx, values) => {
    const items = await tx.catalogItem.findMany({
      where: { legacySequence: { in: values } },
      select: { legacySequence: true },
    });
    return new Set(
      items
        .map((item) => item.legacySequence)
        .filter((sequence): sequence is string => Boolean(sequence)),
    );
  },
  createRecord: async (tx, data) => {
    const generatedSku = await generateProvisionalCatalogSku(
      tx,
      data.type as ItemType,
    );
    const sku = generatedSku.sku;
    const policy = await tx.catalogPricingPolicy.findFirst({
      where: { itemType: data.type as ItemType, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    const costPrice = Math.max(0, Number(data.costPrice || 0));
    const icmsPercent = Number(policy?.icmsPercent || 0);
    const pisPercent = Number(policy?.pisPercent || 0);
    const cofinsPercent = Number(policy?.cofinsPercent || 0);
    const ipiPercent = Number(policy?.ipiPercent || 0);
    const issPercent = Number(policy?.issPercent || 0);
    const irpjPercent = Number(policy?.irpjPercent || 0);
    const csllPercent = Number(policy?.csllPercent || 0);
    const cppPercent = Number(policy?.cppPercent || 0);
    const componentTaxPercent =
      icmsPercent +
      pisPercent +
      cofinsPercent +
      ipiPercent +
      issPercent +
      irpjPercent +
      csllPercent +
      cppPercent;
    const salesTaxPercent =
      componentTaxPercent > 0
        ? componentTaxPercent
        : Number(policy?.salesTaxPercent || 0);
    const commissionPercent = Number(policy?.commissionPercent || 0);
    const profitMarginPercent = Number(policy?.profitMarginPercent || 0);
    const operationalCostPercent = Number(policy?.operationalCostPercent || 0);
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
    const identifiers = [
      catalogIdentifier(
        sku,
        CatalogIdentifierType.INTERNAL_SKU,
        true,
        'importacao_legada',
      ),
      catalogIdentifier(
        nullableString(data.legacyCode),
        CatalogIdentifierType.LEGACY_CODE,
        false,
        'codigo_legado',
      ),
      catalogIdentifier(
        nullableString(data.legacySequence),
        CatalogIdentifierType.OTHER,
        false,
        'sequencia_legada',
      ),
      catalogIdentifier(
        nullableString(data.radarCode),
        CatalogIdentifierType.CATALOG_CODE,
        false,
        'codigo_radar',
      ),
      catalogIdentifier(
        nullableString(data.alternativeCode),
        CatalogIdentifierType.INTERNAL_ALIAS,
        false,
        'codigo_alternativo',
      ),
    ].filter((identifier): identifier is NonNullable<typeof identifier> =>
      Boolean(identifier),
    );

    return tx.catalogItem.create({
      data: {
        sku,
        legacyCode: nullableString(data.legacyCode),
        legacySequence: nullableString(data.legacySequence),
        radarCode: nullableString(data.radarCode),
        skuNumber: generatedSku.skuNumber,
        skuAreaId: generatedSku.areaId,
        skuFamilyId: generatedSku.familyId,
        skuApplicationId: generatedSku.applicationId,
        name: String(data.name).trim(),
        commercialDescription: nullableString(data.commercialDescription),
        description: nullableString(data.legacyDescription),
        type: data.type as ItemType,
        itemClassification:
          nullableString(data.itemClassification) ||
          (data.type === ItemType.SERVICE ? 'Servico' : 'Acabado'),
        unit: nullableString(data.unit) || 'UN',
        acquisitionOrigin: nullableString(data.acquisitionOrigin) || 'Comprado',
        category: nullableString(data.category),
        subcategory: nullableString(data.subcategory),
        brand: nullableString(data.brand),
        ncm: nullableString(data.ncm),
        pricingPolicyId: policy?.id || null,
        basePrice: suggestedSalePrice,
        costPrice,
        lastCost: costPrice,
        taxPercentage: salesTaxPercent,
        profitMargin: profitMarginPercent,
        icmsPercent,
        pisPercent,
        cofinsPercent,
        ipiPercent,
        issPercent,
        irpjPercent,
        csllPercent,
        cppPercent,
        commissionPercent,
        operationalCostPercent,
        stockMin: Math.max(0, Number(data.stockMin || 0)),
        stockMax: Math.max(0, Number(data.stockMax || 0)),
        storageLocation: nullableString(data.storageLocation),
        taxProfile: {
          icmsPercent,
          pisPercent,
          cofinsPercent,
          ipiPercent,
          issPercent,
          irpjPercent,
          csllPercent,
          cppPercent,
          salesTaxPercent,
          commissionPercent,
          profitMarginPercent,
          operationalCostPercent,
          suggestedSalePrice,
          pricingSource: policy ? 'DEFAULT_POLICY' : 'SYSTEM_DEFAULT',
        },
        isActive: data.isActive !== false,
        identifiers: { create: identifiers },
      },
      select: { id: true },
    });
  },
};

const IMPORT_DEFINITIONS: Record<string, ImportDefinition> = {
  clients: CLIENT_IMPORT_DEFINITION,
  suppliers: SUPPLIER_IMPORT_DEFINITION,
  equipments: EQUIPMENT_IMPORT_DEFINITION,
  catalog: CATALOG_IMPORT_DEFINITION,
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
    if (parsedRows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `A importacao aceita no maximo ${MAX_IMPORT_ROWS} linhas por arquivo.`,
      );
    }
    const analyzed = await this.analyzeRows(
      definition,
      parsedRows,
      input.columnMapping,
    );
    const summary = summarizeRows(analyzed);

    const batch = await this.prisma.$transaction(
      async (tx) => {
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
      },
      { maxWait: 10_000, timeout: 120_000 },
    );

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
      throw new BadRequestException(
        'Esta importacao nao esta pronta para executar.',
      );
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

    await this.prisma.studioImportBatch.update({
      where: { id: batchId },
      data: {
        status: StudioImportBatchStatus.PROCESSING,
        startedAt: new Date(),
      },
    });

    let createdRows = 0;
    let failedRows = 0;
    const skippedRows = analyzed.filter(
      (row) =>
        row.status === StudioImportRowStatus.DUPLICATE ||
        row.status === StudioImportRowStatus.INVALID,
    ).length;

    for (const row of executable) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            const created = await definition.createRecord(
              tx,
              row.normalizedData,
            );
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
          },
          { maxWait: 10_000, timeout: 30_000 },
        );
        createdRows += 1;
      } catch (error: unknown) {
        failedRows += 1;
        await this.prisma.studioImportRow.updateMany({
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

    const result = await this.prisma.studioImportBatch.update({
      where: { id: batchId },
      data: {
        status: finalStatus,
        totalRows: analyzed.length,
        validRows: analyzed.filter(
          (row) => row.status === StudioImportRowStatus.VALID,
        ).length,
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
        const normalizedData = normalizeRow(
          definition,
          row.rawData,
          columnMapping,
        );
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
      .map((row) => primitiveString(row.normalizedData[definition.uniqueField]))
      .filter(Boolean);
    const existing = await this.prisma.$transaction((tx) =>
      definition.findDuplicates(tx, uniqueValues),
    );

    return normalizedRows.map((row) => {
      const uniqueValue = primitiveString(
        row.normalizedData[definition.uniqueField],
      );
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

      const status = errors.some((issue) => issue.code === 'DUPLICATE_RECORD')
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
      throw new NotFoundException(
        'Importador nao registrado para este recurso.',
      );
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
    if (
      !hasPermission(actor.accessPolicy, definition.resourceCreatePermission)
    ) {
      throw new ForbiddenException(
        'Seu perfil nao possui permissao para criar registros deste recurso.',
      );
    }
  }
}

function hasPermission(
  accessPolicy: Record<string, any> | undefined,
  permission: string,
) {
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
    const rawValue = header ? (rawData[header] ?? '') : '';
    normalized[field.key] = field.normalize
      ? field.normalize(rawValue)
      : normalizeText(rawValue);
  }

  if (definition.rawDataField) {
    normalized[definition.rawDataField] = Object.fromEntries(
      Object.entries(rawData)
        .map(([key, value]) => [key.trim(), String(value ?? '').trim()])
        .filter(([key, value]) => Boolean(key) && Boolean(value)),
    );
  }

  return normalized;
}

function validateRequired(
  definition: ImportDefinition,
  row: Record<string, unknown>,
) {
  const errors: ImportIssue[] = [];
  for (const field of definition.fields) {
    if (!field.required) continue;
    const value = row[field.key];
    if (primitiveString(value).trim() === '') {
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
    valid: rows.filter((row) => row.status === StudioImportRowStatus.VALID)
      .length,
    warnings: rows.filter((row) => row.status === StudioImportRowStatus.WARNING)
      .length,
    invalid: rows.filter((row) => row.status === StudioImportRowStatus.INVALID)
      .length,
    duplicates: rows.filter(
      (row) => row.status === StudioImportRowStatus.DUPLICATE,
    ).length,
  };
}

function parseCsv(text: string) {
  const clean = String(text || '')
    .replace(/^\uFEFF/, '')
    .trim();
  if (!clean) throw new BadRequestException('CSV vazio.');
  const delimiter = detectDelimiter(clean.split(/\r?\n/, 1)[0]);
  const records = parseCsvRecords(clean, delimiter);
  const headers = (records.shift() ?? []).map((header) => header.trim());
  if (headers.length === 0)
    throw new BadRequestException('Cabecalho do CSV ausente.');

  return records
    .filter((values) => values.some((value) => value.trim()))
    .map((values, index) => {
      const rawData = headers.reduce<Record<string, string>>(
        (row, header, headerIndex) => {
          row[header] = values[headerIndex]?.trim() ?? '';
          return row;
        },
        {},
      );
      return { rowNumber: index + 2, rawData };
    });
}

function detectDelimiter(headerLine: string) {
  const semicolonCount = (headerLine.match(/;/g) || []).length;
  const commaCount = (headerLine.match(/,/g) || []).length;
  return semicolonCount >= commaCount ? ';' : ',';
}

function parseCsvRecords(text: string, delimiter: string) {
  const rows: string[][] = [];
  let values: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
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
    if ((char === '\r' || char === '\n') && !quoted) {
      values.push(current);
      rows.push(values);
      values = [];
      current = '';
      if (char === '\r' && next === '\n') index += 1;
      continue;
    }
    if (char === '\r' && quoted) {
      current += '\n';
      if (next === '\n') index += 1;
      continue;
    }
    current += char;
  }

  if (quoted) {
    throw new BadRequestException(
      'CSV possui campo com aspas nao finalizadas.',
    );
  }
  values.push(current);
  rows.push(values);
  return rows;
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
  const compact = text.replace(/\s/g, '');
  const normalized = compact.includes(',')
    ? compact.replace(/\./g, '').replace(',', '.')
    : /^-?\d{1,3}(\.\d{3})+$/.test(compact)
      ? compact.replace(/\./g, '')
      : compact;
  const numberValue = Number(normalized);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizePowerInput(value: string) {
  const match = String(value || '').match(/-?\d+(?:[.,]\d+)?/);
  return match ? normalizeNumberInput(match[0]) : null;
}

function normalizeIntegerInput(value: string) {
  const normalized = normalizePowerInput(value);
  return typeof normalized === 'number' ? Math.trunc(normalized) : null;
}

function normalizeCatalogCode(value: string) {
  return normalizeText(value)?.toUpperCase() ?? null;
}

function normalizeCatalogItemType(value: string) {
  const comparable = comparableHeader(value);
  if (!comparable) return null;
  if (['service', 'servico', 'servicos'].includes(comparable)) {
    return ItemType.SERVICE;
  }
  if (
    [
      'part',
      'peca',
      'pecas',
      'acabado',
      'componente',
      'material consumo',
      'material auxiliar',
      'ferramenta',
      'kit',
    ].includes(comparable)
  ) {
    return ItemType.PART;
  }
  return null;
}

function normalizeBooleanInput(value: string) {
  const comparable = comparableHeader(value);
  return ['1', 'sim', 's', 'true', 'yes', 'y'].includes(comparable);
}

function normalizeActiveStatus(value: string) {
  const comparable = comparableHeader(value);
  if (!comparable) return true;
  if (['inativo', 'inactive', '0', 'nao', 'n', 'false'].includes(comparable)) {
    return false;
  }
  return ['ativo', 'active', '1', 'sim', 's', 'true', 'yes', 'y'].includes(
    comparable,
  );
}

function normalizeCatalogActive(value: string) {
  return comparableHeader(value) ? normalizeBooleanInput(value) : true;
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
  if (!comparable) return null;
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
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primitiveString(value))
      ? []
      : [{ code: 'INVALID_EMAIL', field, message: 'E-mail invalido.' }];
  };
}

function clientAddressFields(
  prefix: 'primary' | 'billing' | 'installation',
  label: string,
  aliasPrefix: string,
): ImportFieldDefinition[] {
  const legacySuffix =
    prefix === 'primary'
      ? 'principal'
      : prefix === 'billing'
        ? 'cobranca'
        : 'entrega';
  return [
    {
      key: `${prefix}Street`,
      label: `Rua ${label}`,
      aliases: [
        `rua ${aliasPrefix}`,
        `logradouro ${aliasPrefix}`,
        `${aliasPrefix} rua`,
        `${aliasPrefix} logradouro`,
        `rua${legacySuffix}`,
      ],
      normalize: normalizeText,
    },
    {
      key: `${prefix}Number`,
      label: `Numero ${label}`,
      aliases: [
        `numero ${aliasPrefix}`,
        `n ${aliasPrefix}`,
        `${aliasPrefix} numero`,
        `numero${legacySuffix}`,
      ],
      normalize: normalizeText,
    },
    {
      key: `${prefix}Complement`,
      label: `Complemento ${label}`,
      aliases: [
        `complemento ${aliasPrefix}`,
        `${aliasPrefix} complemento`,
        `complemento${legacySuffix}`,
      ],
      normalize: normalizeText,
    },
    {
      key: `${prefix}District`,
      label: `Bairro ${label}`,
      aliases: [
        `bairro ${aliasPrefix}`,
        `${aliasPrefix} bairro`,
        `lote ${aliasPrefix}`,
        `bairro${legacySuffix}`,
      ],
      normalize: normalizeText,
    },
    {
      key: `${prefix}ZipCode`,
      label: `CEP ${label}`,
      aliases: [
        `cep ${aliasPrefix}`,
        `${aliasPrefix} cep`,
        `cep${legacySuffix}`,
      ],
      normalize: normalizeText,
    },
    {
      key: `${prefix}City`,
      label: `Cidade ${label}`,
      aliases: [
        `cidade ${aliasPrefix}`,
        `${aliasPrefix} cidade`,
        `cidade${legacySuffix}`,
      ],
      normalize: normalizeText,
    },
    {
      key: `${prefix}State`,
      label: `UF ${label}`,
      aliases: [
        `uf ${aliasPrefix}`,
        `estado ${aliasPrefix}`,
        `${aliasPrefix} uf`,
        `uf${legacySuffix}`,
      ],
      normalize: normalizeUf,
    },
  ];
}

function clientContactFields(index: 1 | 2 | 3 | 4): ImportFieldDefinition[] {
  const padded = String(index).padStart(2, '0');
  const legacySuffix = index === 1 ? '' : String(index);
  return [
    {
      key: `contact${padded}Name`,
      label: `Contato ${padded}`,
      aliases: [
        `contato ${padded}`,
        `nome contato ${padded}`,
        `contato ${index}`,
        `contatonome${legacySuffix}`,
      ],
      normalize: normalizeText,
    },
    {
      key: `contact${padded}Role`,
      label: `Cargo ${padded}`,
      aliases: [
        `cargo ${padded}`,
        `funcao ${padded}`,
        `contatocargo${legacySuffix}`,
      ],
      normalize: normalizeText,
    },
    {
      key: `contact${padded}Phone`,
      label: `Telefone ${padded}`,
      aliases: [
        `telefone ${padded}`,
        `tel ${padded}`,
        `telefone contato ${padded}`,
        `contatotel${legacySuffix}`,
      ],
      normalize: normalizeText,
    },
    {
      key: `contact${padded}Mobile`,
      label: `Celular ${padded}`,
      aliases: [
        `celular ${padded}`,
        `whatsapp ${padded}`,
        `mobile ${padded}`,
        `contatocelular${legacySuffix}`,
      ],
      normalize: normalizeText,
    },
    {
      key: `contact${padded}Email`,
      label: `E-mail ${padded}`,
      aliases: [
        `email ${padded}`,
        `e-mail ${padded}`,
        `email contato ${padded}`,
        `contatoemail${legacySuffix}`,
      ],
      normalize: (value) => normalizeText(value)?.toLowerCase() ?? null,
      validate: validateOptionalEmail(`contact${padded}Email`),
    },
  ];
}

function buildClientAddress(
  data: Record<string, unknown>,
  prefix: 'primary' | 'billing' | 'installation',
  type: ClientAddressType,
  fallbackCity: string,
  fallbackState: string,
) {
  const street =
    nullableString(data[`${prefix}Street`]) ||
    (prefix === 'primary' ? nullableString(data.address) : undefined);
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
  const text = primitiveString(value).trim();
  return text || undefined;
}

function jsonObjectOrUndefined(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Prisma.InputJsonObject;
}

async function generateProvisionalCatalogSku(
  tx: Prisma.TransactionClient,
  itemType: ItemType,
) {
  const areaCode = itemType === ItemType.SERVICE ? 'S' : 'O';
  const rule = await tx.catalogSkuRule.findFirst({
    where: {
      isActive: true,
      area: { code: areaCode, isActive: true },
      family: { code: 'O', isActive: true },
      application: { code: 'O', isActive: true },
    },
    include: { area: true, family: true, application: true },
  });
  if (!rule) {
    throw new BadRequestException(
      'Classificacao provisoria do SKU nao esta configurada.',
    );
  }
  const rows = await tx.$queryRaw<Array<{ nextval: number }>>`
    SELECT nextval('catalog_sku_number_seq')::integer AS "nextval"
  `;
  const skuNumber = Number(rows[0]?.nextval);
  if (!Number.isFinite(skuNumber)) {
    throw new BadRequestException('Nao foi possivel gerar o SKU interno.');
  }
  return {
    sku: `${skuNumber}${rule.area.code}${rule.family.code}${rule.application.code}`,
    skuNumber,
    areaId: rule.areaId,
    familyId: rule.familyId,
    applicationId: rule.applicationId,
  };
}

function normalizeCatalogIdentifier(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

function catalogIdentifier(
  code: string | undefined,
  type: CatalogIdentifierType,
  isPrimary: boolean,
  source: string,
) {
  if (!code) return null;
  return {
    type,
    code,
    normalizedCode: normalizeCatalogIdentifier(code),
    source,
    isPrimary,
    isActive: true,
  };
}

function primitiveString(value: unknown) {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
}

function isValidBrazilDocument(value: string) {
  const digits = normalizeDigits(value);
  return (
    (digits.length === 11 || digits.length === 14) && !/^(\d)\1+$/.test(digits)
  );
}
