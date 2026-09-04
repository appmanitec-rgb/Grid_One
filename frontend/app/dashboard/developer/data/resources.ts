export type StudioFieldType = "text" | "number" | "select" | "boolean";

export type StudioField = {
  key: string;
  label: string;
  type?: StudioFieldType;
  sortable?: boolean;
  searchable?: boolean;
  editable?: boolean;
  importable?: boolean;
  readOnly?: boolean;
  required?: boolean;
  defaultValue?: string | number | boolean;
  hidden?: boolean;
  hiddenByDefault?: boolean;
  sensitive?: boolean;
  options?: Array<{ value: string; label: string }>;
  render?: (row: StudioRecord) => string;
};

export type StudioRecord = Record<string, any>;

export type StudioResource = {
  key: string;
  label: string;
  pluralLabel: string;
  category:
    | "Comercial"
    | "Operacao"
    | "Ativos"
    | "Suprimentos"
    | "Financeiro"
    | "RH";
  description: string;
  endpoint: string;
  updateEndpoint?: (id: string) => string;
  createHref?: string;
  detailHref?: (id: string) => string;
  entityType: string;
  editable: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canImport: boolean;
  canExport: boolean;
  importMode: "SAFE" | "DISABLED";
  fields: StudioField[];
};

const yesNoOptions = [
  { value: "true", label: "Sim" },
  { value: "false", label: "Nao" },
];

function addressByType(row: StudioRecord, type: string) {
  const addresses = Array.isArray(row.addresses) ? row.addresses : [];
  return addresses.find((address) => address?.type === type) || null;
}

function formatAddress(row: StudioRecord, type: string) {
  const address = addressByType(row, type);
  if (!address) return "";
  return [
    address.street,
    address.number,
    address.complement,
    address.district,
    address.city,
    address.state,
    address.zipCode,
  ]
    .filter(Boolean)
    .join(", ");
}

function addressPart(row: StudioRecord, type: string, key: string) {
  return String(addressByType(row, type)?.[key] ?? "");
}

function contactByIndex(row: StudioRecord, index: number) {
  const contacts = Array.isArray(row.contacts) ? row.contacts : [];
  return contacts[index] || null;
}

function contactPart(row: StudioRecord, index: number, key: string) {
  return String(contactByIndex(row, index)?.[key] ?? "");
}

const controlOptionFields: StudioField[] = [
  {
    key: "code",
    label: "Codigo",
    searchable: true,
    sortable: true,
    editable: true,
    required: true,
  },
  {
    key: "name",
    label: "Nome",
    searchable: true,
    sortable: true,
    editable: true,
    required: true,
  },
  { key: "description", label: "Descricao", searchable: true, editable: true },
  {
    key: "sortOrder",
    label: "Ordem",
    type: "number",
    sortable: true,
    editable: true,
  },
  {
    key: "isActive",
    label: "Ativo",
    type: "boolean",
    sortable: true,
    editable: true,
    defaultValue: true,
  },
];

function controlResource({
  key,
  label,
  pluralLabel,
  category,
  description,
  type,
}: {
  key: string;
  label: string;
  pluralLabel: string;
  category: StudioResource["category"];
  description: string;
  type: string;
}): StudioResource {
  return {
    key,
    label,
    pluralLabel,
    category,
    description,
    endpoint: `/studio/control-options/${type}`,
    updateEndpoint: (id) => `/studio/data/${key}/${id}`,
    entityType: "ControlOption",
    editable: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canImport: false,
    canExport: true,
    importMode: "DISABLED",
    fields:
      type === "PAYMENT_TERM"
        ? [
            ...controlOptionFields,
            {
              key: "isBlockedForNewClients",
              label: "Bloquear cliente novo",
              type: "boolean",
              sortable: true,
              editable: true,
              defaultValue: false,
            },
          ]
        : controlOptionFields,
  };
}

export const STUDIO_RESOURCES: StudioResource[] = [
  {
    key: "clients",
    label: "Cliente",
    pluralLabel: "Clientes",
    category: "Comercial",
    description:
      "Empresas, contatos principais, retencoes e situacao comercial.",
    endpoint: "/clients",
    updateEndpoint: (id) => `/clients/${id}`,
    createHref: "/dashboard/clients/new",
    detailHref: (id) => `/dashboard/clients/${id}`,
    entityType: "Client",
    editable: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canImport: true,
    canExport: true,
    importMode: "SAFE",
    fields: [
      {
        key: "companyName",
        label: "Empresa",
        searchable: true,
        sortable: true,
        editable: true,
        required: true,
      },
      {
        key: "tradeName",
        label: "Fantasia",
        searchable: true,
        sortable: true,
        editable: true,
      },
      {
        key: "cnpj",
        label: "CNPJ/CPF",
        searchable: true,
        sortable: true,
        editable: true,
        required: true,
      },
      { key: "email", label: "E-mail", searchable: true, editable: true },
      { key: "phone", label: "Telefone", searchable: true, editable: true },
      {
        key: "address",
        label: "Endereco resumido",
        searchable: true,
        editable: true,
        hiddenByDefault: true,
      },
      {
        key: "city",
        label: "Cidade",
        searchable: true,
        sortable: true,
        editable: true,
      },
      {
        key: "state",
        label: "UF",
        searchable: true,
        sortable: true,
        editable: true,
      },
      {
        key: "stateRegistration",
        label: "Inscricao estadual",
        searchable: true,
        editable: true,
        hiddenByDefault: true,
      },
      {
        key: "municipalRegistration",
        label: "Inscricao municipal",
        searchable: true,
        editable: true,
        hiddenByDefault: true,
      },
      {
        key: "cnae",
        label: "CNAE",
        searchable: true,
        editable: true,
        hiddenByDefault: true,
      },
      {
        key: "segment",
        label: "Segmento",
        searchable: true,
        editable: true,
        hiddenByDefault: true,
      },
      {
        key: "preferences",
        label: "Preferencias",
        searchable: true,
        editable: true,
        hiddenByDefault: true,
      },
      {
        key: "clientType",
        label: "Tipo",
        type: "select",
        sortable: true,
        editable: true,
        options: [
          { value: "CONTRACT", label: "Com contrato" },
          { value: "NO_CONTRACT", label: "Sem contrato" },
        ],
      },
      {
        key: "personType",
        label: "Pessoa",
        type: "select",
        sortable: true,
        editable: true,
        hiddenByDefault: true,
        options: [
          { value: "LEGAL_ENTITY", label: "Juridica" },
          { value: "INDIVIDUAL", label: "Fisica" },
        ],
      },
      {
        key: "paymentTermDefault",
        label: "Condicao padrao",
        searchable: true,
        editable: true,
        hiddenByDefault: true,
      },
      {
        key: "creditLimit",
        label: "Limite credito",
        type: "number",
        sortable: true,
        editable: true,
        hiddenByDefault: true,
      },
      {
        key: "priceTableCode",
        label: "Tabela preco",
        searchable: true,
        editable: true,
        hiddenByDefault: true,
      },
      {
        key: "isDelinquent",
        label: "Inadimplente",
        type: "boolean",
        sortable: true,
        editable: true,
      },
      {
        key: "withholdsInss",
        label: "Retem INSS",
        type: "boolean",
        editable: true,
      },
      {
        key: "withholdsIss",
        label: "Retem ISS",
        type: "boolean",
        editable: true,
      },
      {
        key: "billingAddress",
        label: "Endereco cobranca",
        searchable: true,
        sortable: true,
        hiddenByDefault: true,
        render: (row) => formatAddress(row, "BILLING"),
      },
      {
        key: "billingStreet",
        label: "Rua cobranca",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => addressPart(row, "BILLING", "street"),
      },
      {
        key: "billingNumber",
        label: "Numero cobranca",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => addressPart(row, "BILLING", "number"),
      },
      {
        key: "billingComplement",
        label: "Complemento cobranca",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => addressPart(row, "BILLING", "complement"),
      },
      {
        key: "billingDistrict",
        label: "Bairro cobranca",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => addressPart(row, "BILLING", "district"),
      },
      {
        key: "billingZipCode",
        label: "CEP cobranca",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => addressPart(row, "BILLING", "zipCode"),
      },
      {
        key: "billingCity",
        label: "Cidade cobranca",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => addressPart(row, "BILLING", "city"),
      },
      {
        key: "billingState",
        label: "UF cobranca",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => addressPart(row, "BILLING", "state"),
      },
      {
        key: "installationAddress",
        label: "Endereco instalacao",
        searchable: true,
        sortable: true,
        hiddenByDefault: true,
        render: (row) => formatAddress(row, "INSTALLATION"),
      },
      {
        key: "installationStreet",
        label: "Rua instalacao",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => addressPart(row, "INSTALLATION", "street"),
      },
      {
        key: "installationNumber",
        label: "Numero instalacao",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => addressPart(row, "INSTALLATION", "number"),
      },
      {
        key: "installationComplement",
        label: "Complemento instalacao",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => addressPart(row, "INSTALLATION", "complement"),
      },
      {
        key: "installationDistrict",
        label: "Bairro instalacao",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => addressPart(row, "INSTALLATION", "district"),
      },
      {
        key: "installationZipCode",
        label: "CEP instalacao",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => addressPart(row, "INSTALLATION", "zipCode"),
      },
      {
        key: "installationCity",
        label: "Cidade instalacao",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => addressPart(row, "INSTALLATION", "city"),
      },
      {
        key: "installationState",
        label: "UF instalacao",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => addressPart(row, "INSTALLATION", "state"),
      },
      {
        key: "contact01Name",
        label: "Contato 01",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => contactPart(row, 0, "name"),
      },
      {
        key: "contact01Role",
        label: "Cargo 01",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => contactPart(row, 0, "role"),
      },
      {
        key: "contact01Phone",
        label: "Telefone 01",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => contactPart(row, 0, "phone"),
      },
      {
        key: "contact01Mobile",
        label: "Celular 01",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => contactPart(row, 0, "mobile"),
      },
      {
        key: "contact01Email",
        label: "E-mail 01",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => contactPart(row, 0, "email"),
      },
      {
        key: "contact02Name",
        label: "Contato 02",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => contactPart(row, 1, "name"),
      },
      {
        key: "contact02Role",
        label: "Cargo 02",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => contactPart(row, 1, "role"),
      },
      {
        key: "contact02Phone",
        label: "Telefone 02",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => contactPart(row, 1, "phone"),
      },
      {
        key: "contact02Mobile",
        label: "Celular 02",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => contactPart(row, 1, "mobile"),
      },
      {
        key: "contact02Email",
        label: "E-mail 02",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => contactPart(row, 1, "email"),
      },
      {
        key: "contact03Name",
        label: "Contato 03",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => contactPart(row, 2, "name"),
      },
      {
        key: "contact03Role",
        label: "Cargo 03",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => contactPart(row, 2, "role"),
      },
      {
        key: "contact03Phone",
        label: "Telefone 03",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => contactPart(row, 2, "phone"),
      },
      {
        key: "contact03Mobile",
        label: "Celular 03",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => contactPart(row, 2, "mobile"),
      },
      {
        key: "contact03Email",
        label: "E-mail 03",
        searchable: true,
        importable: true,
        hiddenByDefault: true,
        render: (row) => contactPart(row, 2, "email"),
      },
    ],
  },
  {
    key: "suppliers",
    label: "Fornecedor",
    pluralLabel: "Fornecedores",
    category: "Suprimentos",
    description: "Parceiros de compra, marcas, categorias e contatos.",
    endpoint: "/suppliers",
    updateEndpoint: (id) => `/suppliers/${id}`,
    createHref: "/dashboard/suppliers/new",
    detailHref: (id) => `/dashboard/suppliers/${id}`,
    entityType: "Supplier",
    editable: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canImport: true,
    canExport: true,
    importMode: "SAFE",
    fields: [
      {
        key: "companyName",
        label: "Fornecedor",
        searchable: true,
        sortable: true,
        editable: true,
        required: true,
      },
      {
        key: "tradeName",
        label: "Fantasia",
        searchable: true,
        sortable: true,
        editable: true,
      },
      {
        key: "cnpj",
        label: "CNPJ",
        searchable: true,
        sortable: true,
        editable: true,
      },
      { key: "email", label: "E-mail", searchable: true, editable: true },
      { key: "phone", label: "Telefone", searchable: true, editable: true },
      {
        key: "city",
        label: "Cidade",
        searchable: true,
        sortable: true,
        editable: true,
      },
      {
        key: "state",
        label: "UF",
        searchable: true,
        sortable: true,
        editable: true,
      },
      {
        key: "paymentTerm",
        label: "Pagamento",
        searchable: true,
        editable: true,
      },
      {
        key: "categories",
        label: "Categorias",
        searchable: true,
        render: (row) =>
          Array.isArray(row.categories) ? row.categories.join(", ") : "",
      },
    ],
  },
  {
    key: "equipments",
    label: "Equipamento",
    pluralLabel: "Equipamentos",
    category: "Ativos",
    description:
      "Geradores por cliente, serie, criticidade e status operacional.",
    endpoint: "/generators",
    updateEndpoint: (id) => `/generators/${id}`,
    createHref: "/dashboard/equipments/new",
    detailHref: (id) => `/dashboard/equipments/${id}`,
    entityType: "Generator",
    editable: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canImport: false,
    canExport: true,
    importMode: "DISABLED",
    fields: [
      {
        key: "name",
        label: "Equipamento",
        searchable: true,
        sortable: true,
        editable: true,
        required: true,
      },
      {
        key: "client.companyName",
        label: "Cliente",
        searchable: true,
        sortable: true,
      },
      {
        key: "brand",
        label: "Marca",
        searchable: true,
        sortable: true,
        editable: true,
      },
      { key: "model.name", label: "Modelo", searchable: true, sortable: true },
      {
        key: "serialNumber",
        label: "Serie",
        searchable: true,
        sortable: true,
        editable: true,
      },
      {
        key: "assetTag",
        label: "Tag",
        searchable: true,
        sortable: true,
        editable: true,
      },
      {
        key: "power",
        label: "kVA",
        type: "number",
        sortable: true,
        editable: true,
      },
      {
        key: "hourMeter",
        label: "Horimetro",
        type: "number",
        sortable: true,
        editable: true,
      },
      {
        key: "criticality",
        label: "Criticidade",
        type: "select",
        sortable: true,
        editable: true,
        options: [
          { value: "A", label: "A" },
          { value: "B", label: "B" },
          { value: "C", label: "C" },
        ],
      },
      {
        key: "operationalStatus",
        label: "Status",
        type: "select",
        sortable: true,
        editable: true,
        options: [
          { value: "OPERATING", label: "Operando" },
          { value: "IN_MAINTENANCE", label: "Em manutencao" },
          { value: "STOPPED_BY_FAILURE", label: "Parado por falha" },
          { value: "DEACTIVATED", label: "Desativado" },
        ],
      },
      { key: "voltage", label: "Tensao", searchable: true, editable: true },
      {
        key: "notes",
        label: "Notas",
        searchable: true,
        editable: true,
        hiddenByDefault: true,
      },
    ],
  },
  {
    key: "models",
    label: "Modelo",
    pluralLabel: "Modelos",
    category: "Ativos",
    description: "Modelos tecnicos usados como base para novos equipamentos.",
    endpoint: "/generators/models",
    updateEndpoint: (id) => `/generators/models/${id}`,
    createHref: "/dashboard/equipments/models",
    detailHref: (id) => `/dashboard/equipments/models?id=${id}`,
    entityType: "GeneratorModel",
    editable: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canImport: false,
    canExport: true,
    importMode: "DISABLED",
    fields: [
      {
        key: "name",
        label: "Modelo",
        searchable: true,
        sortable: true,
        editable: true,
        required: true,
      },
      {
        key: "brand",
        label: "Marca",
        searchable: true,
        sortable: true,
        editable: true,
      },
      {
        key: "category",
        label: "Categoria",
        searchable: true,
        sortable: true,
        editable: true,
      },
      {
        key: "defaultPowerKva",
        label: "kVA",
        type: "number",
        sortable: true,
        editable: true,
      },
      {
        key: "defaultVoltage",
        label: "Tensao",
        searchable: true,
        editable: true,
      },
      {
        key: "frequencyHz",
        label: "Hz",
        type: "number",
        sortable: true,
        editable: true,
      },
      {
        key: "isActive",
        label: "Ativo",
        type: "boolean",
        sortable: true,
        editable: true,
        defaultValue: true,
      },
      {
        key: "notes",
        label: "Notas",
        searchable: true,
        editable: true,
        hiddenByDefault: true,
      },
    ],
  },
  {
    key: "manufacturers",
    label: "Fabricante",
    pluralLabel: "Fabricantes",
    category: "Ativos",
    description:
      "Fabricantes por familia tecnica: gerador, motor, alternador, radiador e componentes.",
    endpoint: "/manufacturers",
    entityType: "Manufacturer",
    editable: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canImport: false,
    canExport: true,
    importMode: "DISABLED",
    fields: [
      {
        key: "name",
        label: "Fabricante",
        searchable: true,
        sortable: true,
        editable: true,
        required: true,
      },
      {
        key: "type",
        label: "Tipo",
        type: "select",
        sortable: true,
        editable: true,
        defaultValue: "OTHER",
        options: [
          { value: "GENERATOR", label: "Gerador" },
          { value: "ENGINE", label: "Motor" },
          { value: "ALTERNATOR", label: "Alternador" },
          { value: "RADIATOR", label: "Radiador" },
          { value: "TRANSFER_SWITCH", label: "QTA/Transferencia" },
          { value: "BATTERY", label: "Bateria" },
          { value: "CONTROLLER", label: "Controlador" },
          { value: "OTHER", label: "Outro" },
        ],
      },
      {
        key: "country",
        label: "Pais",
        searchable: true,
        sortable: true,
        editable: true,
      },
      { key: "website", label: "Site", searchable: true, editable: true },
      {
        key: "supportPhone",
        label: "Suporte",
        searchable: true,
        editable: true,
      },
      {
        key: "supportEmail",
        label: "E-mail suporte",
        searchable: true,
        editable: true,
      },
      {
        key: "isActive",
        label: "Ativo",
        type: "boolean",
        sortable: true,
        editable: true,
        defaultValue: true,
      },
      {
        key: "notes",
        label: "Notas",
        searchable: true,
        editable: true,
        hiddenByDefault: true,
      },
    ],
  },
  {
    key: "catalog",
    label: "Item",
    pluralLabel: "Catalogo",
    category: "Suprimentos",
    description:
      "Pecas, servicos, classificacao, precificacao e parametros de estoque.",
    endpoint: "/catalogs",
    updateEndpoint: (id) => `/catalogs/${id}`,
    createHref: "/dashboard/catalog/new",
    detailHref: (id) => `/dashboard/catalog/${id}`,
    entityType: "CatalogItem",
    editable: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canImport: false,
    canExport: true,
    importMode: "DISABLED",
    fields: [
      {
        key: "name",
        label: "Item",
        searchable: true,
        sortable: true,
        editable: true,
        required: true,
      },
      {
        key: "sku",
        label: "SKU",
        searchable: true,
        sortable: true,
        editable: true,
        required: true,
      },
      {
        key: "type",
        label: "Tipo",
        type: "select",
        sortable: true,
        editable: true,
        defaultValue: "PART",
        options: [
          { value: "PART", label: "Peca" },
          { value: "SERVICE", label: "Servico" },
        ],
      },
      {
        key: "category",
        label: "Categoria",
        searchable: true,
        sortable: true,
        editable: true,
      },
      { key: "unit", label: "Unidade", searchable: true, editable: true },
      { key: "brand", label: "Marca", searchable: true, editable: true },
      {
        key: "basePrice",
        label: "Preco",
        type: "number",
        sortable: true,
        editable: true,
      },
      {
        key: "stockCurrent",
        label: "Saldo",
        type: "number",
        sortable: true,
        readOnly: true,
      },
      {
        key: "stockMin",
        label: "Min.",
        type: "number",
        sortable: true,
        editable: true,
      },
      {
        key: "stockMax",
        label: "Max.",
        type: "number",
        sortable: true,
        editable: true,
      },
      {
        key: "storageLocation",
        label: "Local",
        searchable: true,
        editable: true,
      },
      {
        key: "isActive",
        label: "Ativo",
        type: "boolean",
        sortable: true,
        editable: true,
      },
    ],
  },
  {
    key: "pricingPolicies",
    label: "Politica de Preco",
    pluralLabel: "Politicas de Preco",
    category: "Suprimentos",
    description:
      "Percentuais padrao para comissao, margem, custos operacionais e calculo de pecas/servicos.",
    endpoint: "/catalogs/pricing-policies",
    updateEndpoint: (id) => `/studio/data/pricingPolicies/${id}`,
    entityType: "CatalogPricingPolicy",
    editable: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canImport: false,
    canExport: true,
    importMode: "DISABLED",
    fields: [
      {
        key: "name",
        label: "Nome",
        searchable: true,
        sortable: true,
        editable: true,
        required: true,
      },
      {
        key: "itemType",
        label: "Tipo",
        type: "select",
        sortable: true,
        editable: true,
        defaultValue: "PART",
        options: [
          { value: "PART", label: "Peca/produto" },
          { value: "SERVICE", label: "Servico" },
        ],
      },
      {
        key: "salesTaxPercent",
        label: "Impostos venda %",
        type: "number",
        sortable: true,
        editable: true,
      },
      {
        key: "commissionPercent",
        label: "Comissao %",
        type: "number",
        sortable: true,
        editable: true,
      },
      {
        key: "profitMarginPercent",
        label: "Margem %",
        type: "number",
        sortable: true,
        editable: true,
      },
      {
        key: "operationalCostPercent",
        label: "Custo operacional %",
        type: "number",
        sortable: true,
        editable: true,
      },
      {
        key: "serviceCalculationMode",
        label: "Metodo servico",
        type: "select",
        editable: true,
        defaultValue: "FIXED_PRICE",
        options: [
          { value: "FIXED_PRICE", label: "Preco informado" },
          { value: "HOURLY_RATE", label: "Valor hora" },
          { value: "SUPPLIER_COST_MARKUP", label: "Custo + markup" },
        ],
      },
      {
        key: "isDefault",
        label: "Padrao",
        type: "boolean",
        sortable: true,
        editable: true,
        defaultValue: false,
      },
      {
        key: "isActive",
        label: "Ativo",
        type: "boolean",
        sortable: true,
        editable: true,
        defaultValue: true,
      },
      {
        key: "notes",
        label: "Notas",
        searchable: true,
        editable: true,
        hiddenByDefault: true,
      },
    ],
  },
  controlResource({
    key: "catalogUnits",
    label: "Unidade",
    pluralLabel: "Unidades de Medida",
    category: "Suprimentos",
    description:
      "Unidades padrao para pecas, produtos, kits, litros, horas e servicos.",
    type: "CATALOG_UNIT",
  }),
  controlResource({
    key: "catalogBrands",
    label: "Marca de Peca",
    pluralLabel: "Marcas de Pecas",
    category: "Suprimentos",
    description: "Marcas comerciais usadas no catalogo de pecas e produtos.",
    type: "CATALOG_BRAND",
  }),
  controlResource({
    key: "catalogDocumentCategories",
    label: "Categoria de Documento",
    pluralLabel: "Categorias de Documentos",
    category: "Suprimentos",
    description: "Tipos controlados para documentos anexados ao catalogo.",
    type: "CATALOG_DOCUMENT_CATEGORY",
  }),
  controlResource({
    key: "storageLocations",
    label: "Local de Estoque",
    pluralLabel: "Locais de Estoque",
    category: "Suprimentos",
    description: "Locais fisicos e logicos para organizacao do estoque.",
    type: "STORAGE_LOCATION",
  }),
  controlResource({
    key: "serviceTypes",
    label: "Tipo de Servico",
    pluralLabel: "Tipos de Servico",
    category: "Operacao",
    description:
      "Servicos previstos como termografia, preventiva, corretiva e comissionamento.",
    type: "SERVICE_TYPE",
  }),
  controlResource({
    key: "maintenanceTypes",
    label: "Tipo de Manutencao",
    pluralLabel: "Tipos de Manutencao",
    category: "Operacao",
    description:
      "Classificacoes de OS e manutencao usadas no fluxo operacional.",
    type: "MAINTENANCE_TYPE",
  }),
  controlResource({
    key: "maintenanceTemplateCategories",
    label: "Categoria de Plano",
    pluralLabel: "Categorias de Planos",
    category: "Operacao",
    description:
      "Categorias dos modelos de manutencao por oleo, filtro, bateria, inspecao e testes.",
    type: "MAINTENANCE_TEMPLATE_CATEGORY",
  }),
  controlResource({
    key: "ticketCategories",
    label: "Categoria de Chamado",
    pluralLabel: "Categorias de Chamados",
    category: "Operacao",
    description: "Categorias controladas para triagem de chamados e tickets.",
    type: "TICKET_CATEGORY",
  }),
  controlResource({
    key: "equipmentApplications",
    label: "Aplicacao de Equipamento",
    pluralLabel: "Aplicacoes de Equipamentos",
    category: "Ativos",
    description:
      "Aplicacoes previstas para geradores: standby, prime, continuo, locacao e ponta.",
    type: "EQUIPMENT_APPLICATION",
  }),
  controlResource({
    key: "equipmentOperationModes",
    label: "Modo de Operacao",
    pluralLabel: "Modos de Operacao",
    category: "Ativos",
    description: "Modos operacionais previstos para equipamentos.",
    type: "EQUIPMENT_OPERATION_MODE",
  }),
  controlResource({
    key: "hrAssetCategories",
    label: "Categoria de Item RH",
    pluralLabel: "Categorias de Itens RH",
    category: "RH",
    description:
      "Divisao de EPIs, ferramentas tecnicas, uso interno e pecas de geradores.",
    type: "HR_ASSET_CATEGORY",
  }),
  controlResource({
    key: "paymentTerms",
    label: "Condicao de Pagamento",
    pluralLabel: "Condicoes de Pagamento",
    category: "Financeiro",
    description:
      "Prazos padrao de pagamento para compras, propostas e fornecedores.",
    type: "PAYMENT_TERM",
  }),
  controlResource({
    key: "brazilStates",
    label: "UF",
    pluralLabel: "Estados / UF",
    category: "Comercial",
    description:
      "Lista controlada de estados brasileiros para cadastros e enderecos.",
    type: "BRAZIL_STATE",
  }),
  {
    key: "collaborators",
    label: "Colaborador",
    pluralLabel: "Colaboradores",
    category: "RH",
    description:
      "Base operacional de pessoas internas. Edicao continua no modulo de RH.",
    endpoint: "/hr-admin/collaborators",
    entityType: "User",
    editable: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canImport: false,
    canExport: true,
    importMode: "DISABLED",
    fields: [
      { key: "name", label: "Nome", searchable: true, sortable: true },
      { key: "email", label: "E-mail", searchable: true, sortable: true },
      { key: "role", label: "Perfil", searchable: true, sortable: true },
      {
        key: "department",
        label: "Departamento",
        searchable: true,
        sortable: true,
      },
      { key: "branch", label: "Filial", searchable: true, sortable: true },
      { key: "hourCost", label: "Custo HH", type: "number", sortable: true },
      { key: "isActive", label: "Ativo", type: "boolean", sortable: true },
    ],
  },
];

export function getStudioResource(resourceKey: string) {
  return STUDIO_RESOURCES.find((resource) => resource.key === resourceKey);
}

export function getFieldValue(row: StudioRecord, key: string) {
  return key.split(".").reduce<any>((value, part) => value?.[part], row);
}

export function formatStudioValue(value: unknown, field?: StudioField) {
  if (field?.type === "boolean") {
    if (value === true) return "Sim";
    if (value === false) return "Nao";
    return "-";
  }
  if (field?.type === "number") {
    if (value === null || value === undefined || value === "") return "-";
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? String(numberValue) : String(value);
  }
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export function normalizeEditableValue(
  value: string | boolean,
  field: StudioField,
) {
  if (field.type === "boolean") return value === true || value === "true";
  if (field.type === "number") {
    if (value === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return String(value);
}

export function booleanOptions() {
  return yesNoOptions;
}
