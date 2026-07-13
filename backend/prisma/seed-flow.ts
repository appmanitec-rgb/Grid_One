
import {
  AccountsPayableStatus,
  AccountsReceivableStatus,
  BankAccountType,
  BillingAdjustmentIndex,
  ClientPersonType,
  ClientType,
  CommissionStatus,
  ContractInvoiceStatus,
  ContractStatus,
  CostCenterEntryType,
  CostCenterType,
  FleetVehicleStatus,
  HrAssetStatus,
  HrAssetType,
  ItemType,
  MaintenanceOrderType,
  OrderStatus,
  PartsCoverageType,
  PayableCategory,
  PreventiveRecurrence,
  ProductOrigin,
  ProposalStatus,
  ProposalType,
  PurchaseOrderStatus,
  ServiceGroup,
  UserRole,
  PrismaClient,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function mustPassword() {
  const password =
    process.env.SEED_DEMO_PASSWORD ||
    process.env.SEED_ADMIN_PASSWORD ||
    process.env.SEED_MASTER_PASSWORD;

  if (!password) {
    throw new Error(
      'Defina SEED_DEMO_PASSWORD (ou SEED_ADMIN_PASSWORD/SEED_MASTER_PASSWORD) para executar o seed completo.',
    );
  }

  return password;
}

function addDays(base: Date, days: number) {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  return date;
}

function monthStart(base: Date) {
  return new Date(base.getFullYear(), base.getMonth(), 1, 8, 0, 0, 0);
}

function monthShift(base: Date, months: number) {
  const date = new Date(base);
  date.setMonth(date.getMonth() + months);
  return date;
}

async function upsertUser(input: {
  name: string;
  email: string;
  role: UserRole;
  passwordHash: string;
  department?: string;
  branch?: string;
  approvalDiscountLimit?: number;
  hourCost?: number;
  linkedClientId?: string;
}) {
  return prisma.user.upsert({
    where: { email: input.email },
    update: {
      name: input.name,
      role: input.role,
      passwordHash: input.passwordHash,
      isActive: true,
      isSystemMaster: false,
      department: input.department,
      branch: input.branch,
      approvalDiscountLimit: input.approvalDiscountLimit,
      hourCost: input.hourCost,
      linkedClientId: input.linkedClientId,
    },
    create: {
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash: input.passwordHash,
      isActive: true,
      isSystemMaster: false,
      department: input.department,
      branch: input.branch,
      approvalDiscountLimit: input.approvalDiscountLimit,
      hourCost: input.hourCost,
      linkedClientId: input.linkedClientId,
    },
  });
}

async function main() {
  const now = new Date();
  const passwordHash = await bcrypt.hash(mustPassword(), 10);

  const salesUser = await upsertUser({
    name: 'Comercial Demo',
    email: 'vendas.demo@manitec.local',
    role: UserRole.SALES,
    passwordHash,
    department: 'Comercial',
    branch: 'Matriz',
    approvalDiscountLimit: 10,
    hourCost: 0,
  });

  const technicianUser = await upsertUser({
    name: 'Tecnico Demo',
    email: 'tecnico.demo@manitec.local',
    role: UserRole.TECHNICIAN,
    passwordHash,
    department: 'Operacoes',
    branch: 'Matriz',
    hourCost: 95,
  });

  const opsUser = await upsertUser({
    name: 'Coordenador Demo',
    email: 'operacao.demo@manitec.local',
    role: UserRole.LOGISTICS,
    passwordHash,
    department: 'Operacoes',
    branch: 'Matriz',
    hourCost: 120,
  });

  const managerUser = await upsertUser({
    name: 'Gestor Demo',
    email: 'gestor.demo@manitec.local',
    role: UserRole.MANAGER,
    passwordHash,
    department: 'Gestao',
    branch: 'Matriz',
    approvalDiscountLimit: 20,
    hourCost: 180,
  });

  const financeUser = await upsertUser({
    name: 'Financeiro Demo',
    email: 'financeiro.demo@manitec.local',
    role: UserRole.FINANCE,
    passwordHash,
    department: 'Financeiro',
    branch: 'Matriz',
    hourCost: 130,
  });

  const suppliesUser = await upsertUser({
    name: 'Suprimentos Demo',
    email: 'suprimentos.demo@manitec.local',
    role: UserRole.SUPPLIES,
    passwordHash,
    department: 'Suprimentos',
    branch: 'Matriz',
    hourCost: 110,
  });

  const hrUser = await upsertUser({
    name: 'Pessoas Demo',
    email: 'pessoas.demo@manitec.local',
    role: UserRole.HR,
    passwordHash,
    department: 'Pessoas',
    branch: 'Matriz',
    hourCost: 115,
  });

  const auditorUser = await upsertUser({
    name: 'Auditor Demo',
    email: 'auditor.demo@manitec.local',
    role: UserRole.AUDITOR,
    passwordHash,
    department: 'Auditoria',
    branch: 'Matriz',
    hourCost: 0,
  });

  const technicianProfile = await prisma.technician.upsert({
    where: { userId: technicianUser.id },
    update: {
      cpf: '12345678901',
      phone: '(11) 99999-0001',
      skills: ['eletrica', 'paralelismo', 'nr-35', 'preventiva'],
      latitude: -23.5505,
      longitude: -46.6333,
    },
    create: {
      userId: technicianUser.id,
      cpf: '12345678901',
      phone: '(11) 99999-0001',
      skills: ['eletrica', 'paralelismo', 'nr-35', 'preventiva'],
      latitude: -23.5505,
      longitude: -46.6333,
    },
  });

  await prisma.technicianCertification.deleteMany({
    where: { technicianId: technicianProfile.id },
  });

  await prisma.technicianCertification.createMany({
    data: [
      {
        technicianId: technicianProfile.id,
        code: 'NR-35',
        issuer: 'SENAI',
        validUntil: addDays(now, 180),
      },
      {
        technicianId: technicianProfile.id,
        code: 'NR-10',
        issuer: 'SENAI',
        validUntil: addDays(now, 210),
      },
    ],
  });

  const client = await prisma.client.upsert({
    where: { cnpj: '12.345.678/0001-90' },
    update: {
      companyName: 'Cliente Demo Energia S.A.',
      tradeName: 'Hospital Central Demo',
      email: 'contato@cliente-demo.local',
      contactName: 'Ana Martins',
      phone: '(11) 4000-1200',
      city: 'Sao Paulo',
      state: 'SP',
      segment: 'Hospitalar',
      preferences: 'Atendimento 24x7',
      clientType: ClientType.CONTRACT,
      personType: ClientPersonType.LEGAL_ENTITY,
      paymentTermDefault: '30 dias',
      priceTableCode: 'VIP',
      salesOwnerId: salesUser.id,
      withholdsInss: true,
      withholdsIss: false,
      isDelinquent: false,
    },
    create: {
      companyName: 'Cliente Demo Energia S.A.',
      tradeName: 'Hospital Central Demo',
      cnpj: '12.345.678/0001-90',
      email: 'contato@cliente-demo.local',
      contactName: 'Ana Martins',
      phone: '(11) 4000-1200',
      city: 'Sao Paulo',
      state: 'SP',
      segment: 'Hospitalar',
      preferences: 'Atendimento 24x7',
      clientType: ClientType.CONTRACT,
      personType: ClientPersonType.LEGAL_ENTITY,
      paymentTermDefault: '30 dias',
      priceTableCode: 'VIP',
      salesOwnerId: salesUser.id,
      withholdsInss: true,
      withholdsIss: false,
      isDelinquent: false,
    },
  });
  await prisma.clientAddress.deleteMany({ where: { clientId: client.id } });
  await prisma.clientContact.deleteMany({ where: { clientId: client.id } });

  await prisma.clientAddress.createMany({
    data: [
      {
        clientId: client.id,
        type: 'BILLING',
        street: 'Av. Paulista',
        number: '1000',
        district: 'Bela Vista',
        zipCode: '01310-100',
        city: 'Sao Paulo',
        state: 'SP',
        country: 'BR',
      },
      {
        clientId: client.id,
        type: 'INSTALLATION',
        street: 'Rua das Clinicas',
        number: '250',
        district: 'Cerqueira Cesar',
        zipCode: '01403-000',
        city: 'Sao Paulo',
        state: 'SP',
        country: 'BR',
      },
    ],
  });

  await prisma.clientContact.createMany({
    data: [
      {
        clientId: client.id,
        name: 'Ana Martins',
        role: 'Gerente de Infraestrutura',
        phone: '(11) 4000-1200',
        mobile: '(11) 98888-1200',
        email: 'ana.martins@cliente-demo.local',
      },
      {
        clientId: client.id,
        name: 'Carlos Rocha',
        role: 'Compras',
        phone: '(11) 4000-1210',
        mobile: '(11) 98888-1210',
        email: 'carlos.rocha@cliente-demo.local',
      },
    ],
  });

  const clientB = await prisma.client.upsert({
    where: { cnpj: '22.222.222/0001-22' },
    update: {
      companyName: 'Cliente Demo Backup Ltda.',
      tradeName: 'Industria Backup Demo',
      email: 'contato@cliente-b-demo.local',
      contactName: 'Bruno Almeida',
      phone: '(11) 4100-2200',
      city: 'Campinas',
      state: 'SP',
      segment: 'Industrial',
      preferences: 'Atendimento comercial em horario comercial',
      clientType: ClientType.NO_CONTRACT,
      personType: ClientPersonType.LEGAL_ENTITY,
      paymentTermDefault: '15 dias',
      priceTableCode: 'PADRAO',
      salesOwnerId: salesUser.id,
      withholdsInss: false,
      withholdsIss: false,
      isDelinquent: false,
    },
    create: {
      companyName: 'Cliente Demo Backup Ltda.',
      tradeName: 'Industria Backup Demo',
      cnpj: '22.222.222/0001-22',
      email: 'contato@cliente-b-demo.local',
      contactName: 'Bruno Almeida',
      phone: '(11) 4100-2200',
      city: 'Campinas',
      state: 'SP',
      segment: 'Industrial',
      preferences: 'Atendimento comercial em horario comercial',
      clientType: ClientType.NO_CONTRACT,
      personType: ClientPersonType.LEGAL_ENTITY,
      paymentTermDefault: '15 dias',
      priceTableCode: 'PADRAO',
      salesOwnerId: salesUser.id,
      withholdsInss: false,
      withholdsIss: false,
      isDelinquent: false,
    },
  });

  const clientUserA = await upsertUser({
    name: 'Cliente A Demo',
    email: 'cliente.a.demo@manitec.local',
    role: UserRole.CLIENT,
    passwordHash,
    department: 'Cliente',
    branch: 'Portal',
    linkedClientId: client.id,
  });

  const clientUserB = await upsertUser({
    name: 'Cliente B Demo',
    email: 'cliente.b.demo@manitec.local',
    role: UserRole.CLIENT,
    passwordHash,
    department: 'Cliente',
    branch: 'Portal',
    linkedClientId: clientB.id,
  });

  const site =
    (await prisma.site.findFirst({
      where: { clientId: client.id, name: 'Obra Hospital Central' },
    })) ||
    (await prisma.site.create({
      data: {
        clientId: client.id,
        name: 'Obra Hospital Central',
      },
    }));

  await prisma.site.update({
    where: { id: site.id },
    data: {
      code: 'OBR-HOSP-001',
      latitude: -23.5558,
      longitude: -46.6557,
      accessRestrictions: 'Entrada de carga com cadastro previo',
      baseContactName: 'Portaria Tecnica',
      baseContactPhone: '(11) 3333-7000',
      notes: 'Acesso 24h para chamados criticos',
    },
  });

  const siteB =
    (await prisma.site.findFirst({
      where: { clientId: clientB.id, name: 'Planta Industrial Demo' },
    })) ||
    (await prisma.site.create({
      data: {
        clientId: clientB.id,
        name: 'Planta Industrial Demo',
      },
    }));

  await prisma.site.update({
    where: { id: siteB.id },
    data: {
      code: 'OBR-IND-002',
      latitude: -22.9056,
      longitude: -47.0608,
      accessRestrictions: 'Portaria industrial com agendamento',
      baseContactName: 'Bruno Almeida',
      baseContactPhone: '(11) 4100-2200',
      notes: 'Base isolada para QA de portal Cliente B',
    },
  });

  const model = await prisma.generatorModel.upsert({
    where: { name: 'G-750 Smart Demo' },
    update: {
      brand: 'Cummins',
      category: 'Gerador Hospitalar',
      defaultPowerKva: 750,
      defaultPowerKw: 600,
      defaultVoltage: '380/220V',
      controllerType: 'DeepSea',
      engineModel: 'QSK19',
      alternatorModel: 'STAMFORD HCI544',
      defaultFuelConsumption: '95 L/h',
      defaultTankCapacity: '500 L',
    },
    create: {
      name: 'G-750 Smart Demo',
      brand: 'Cummins',
      category: 'Gerador Hospitalar',
      defaultPowerKva: 750,
      defaultPowerKw: 600,
      defaultVoltage: '380/220V',
      controllerType: 'DeepSea',
      engineModel: 'QSK19',
      alternatorModel: 'STAMFORD HCI544',
      defaultFuelConsumption: '95 L/h',
      defaultTankCapacity: '500 L',
    },
  });

  const partItem = await prisma.catalogItem.upsert({
    where: { sku: 'DEMO-FILTRO-001' },
    update: {
      name: 'Filtro de Oleo Primario Demo',
      description: 'Filtro principal para linha QSK19',
      commercialDescription: 'Filtro de oleo para preventiva hospitalar',
      category: 'Lubrificacao',
      subcategory: 'Filtros',
      type: ItemType.PART,
      unit: 'UN',
      manufacturerPartNumber: 'FILTRO-QSK19-001',
      brand: 'Cummins',
      supplier: 'Fornecedor Demo Power',
      origin: ProductOrigin.NACIONAL,
      costPrice: 180,
      averageCost: 175,
      lastCost: 180,
      basePrice: 320,
      stockMin: 10,
      stockMax: 50,
      stockCurrent: 32,
      storageLocation: 'A1-02',
      isActive: true,
    },
    create: {
      sku: 'DEMO-FILTRO-001',
      name: 'Filtro de Oleo Primario Demo',
      description: 'Filtro principal para linha QSK19',
      commercialDescription: 'Filtro de oleo para preventiva hospitalar',
      category: 'Lubrificacao',
      subcategory: 'Filtros',
      type: ItemType.PART,
      unit: 'UN',
      manufacturerPartNumber: 'FILTRO-QSK19-001',
      brand: 'Cummins',
      supplier: 'Fornecedor Demo Power',
      origin: ProductOrigin.NACIONAL,
      costPrice: 180,
      averageCost: 175,
      lastCost: 180,
      basePrice: 320,
      stockMin: 10,
      stockMax: 50,
      stockCurrent: 32,
      storageLocation: 'A1-02',
      isActive: true,
    },
  });

  const serviceItem = await prisma.catalogItem.upsert({
    where: { sku: 'DEMO-SERV-PM-001' },
    update: {
      name: 'Servico Preventivo Mensal Demo',
      description: 'Checklist, limpeza e testes de carga',
      commercialDescription: 'Pacote preventivo mensal para GMG',
      category: 'Servicos',
      subcategory: 'Manutencao',
      type: ItemType.SERVICE,
      unit: 'SV',
      basePrice: 6800,
      costPrice: 3800,
      averageCost: 3800,
      lastCost: 3800,
      isActive: true,
    },
    create: {
      sku: 'DEMO-SERV-PM-001',
      name: 'Servico Preventivo Mensal Demo',
      description: 'Checklist, limpeza e testes de carga',
      commercialDescription: 'Pacote preventivo mensal para GMG',
      category: 'Servicos',
      subcategory: 'Manutencao',
      type: ItemType.SERVICE,
      unit: 'SV',
      basePrice: 6800,
      costPrice: 3800,
      averageCost: 3800,
      lastCost: 3800,
      isActive: true,
    },
  });

  const epiItem = await prisma.catalogItem.upsert({
    where: { sku: 'DEMO-EPI-001' },
    update: {
      name: 'Capacete Classe B Demo',
      description: 'Capacete para trabalho eletrico',
      category: 'Seguranca',
      subcategory: 'EPI',
      type: ItemType.PART,
      unit: 'UN',
      basePrice: 95,
      costPrice: 45,
      averageCost: 45,
      lastCost: 45,
      stockCurrent: 20,
      stockMin: 5,
      stockMax: 30,
      isActive: true,
    },
    create: {
      sku: 'DEMO-EPI-001',
      name: 'Capacete Classe B Demo',
      description: 'Capacete para trabalho eletrico',
      category: 'Seguranca',
      subcategory: 'EPI',
      type: ItemType.PART,
      unit: 'UN',
      basePrice: 95,
      costPrice: 45,
      averageCost: 45,
      lastCost: 45,
      stockCurrent: 20,
      stockMin: 5,
      stockMax: 30,
      isActive: true,
    },
  });

  await prisma.modelBaseItem.deleteMany({ where: { modelId: model.id } });
  await prisma.modelBaseItem.createMany({
    data: [
      {
        modelId: model.id,
        catalogItemId: serviceItem.id,
        serviceGroup: ServiceGroup.TM,
        defaultQuantity: 1,
      },
      {
        modelId: model.id,
        catalogItemId: partItem.id,
        serviceGroup: ServiceGroup.TM,
        defaultQuantity: 2,
      },
    ],
  });

  const generator = await prisma.generator.upsert({
    where: { serialNumber: 'DEMO-GMG-0001' },
    update: {
      name: 'Gerador Hospital Principal',
      brand: 'Cummins',
      power: 750,
      hourMeter: 1240,
      condition: 'BOM',
      installationSite: 'Casa de Maquinas Bloco A',
      clientId: client.id,
      modelId: model.id,
      currentSiteId: site.id,
      createdByUserId: opsUser.id,
      hasMaintenanceContract: true,
    },
    create: {
      name: 'Gerador Hospital Principal',
      brand: 'Cummins',
      serialNumber: 'DEMO-GMG-0001',
      power: 750,
      hourMeter: 1240,
      condition: 'BOM',
      installationSite: 'Casa de Maquinas Bloco A',
      clientId: client.id,
      modelId: model.id,
      currentSiteId: site.id,
      createdByUserId: opsUser.id,
      hasMaintenanceContract: true,
    },
  });

  const generatorB = await prisma.generator.upsert({
    where: { serialNumber: 'DEMO-GMG-B-0001' },
    update: {
      name: 'Gerador Industrial Backup',
      brand: 'Stemac',
      power: 450,
      hourMeter: 620,
      condition: 'OPERACIONAL',
      installationSite: 'Sala de Energia Principal',
      clientId: clientB.id,
      modelId: model.id,
      currentSiteId: siteB.id,
      createdByUserId: opsUser.id,
      hasMaintenanceContract: false,
    },
    create: {
      name: 'Gerador Industrial Backup',
      brand: 'Stemac',
      serialNumber: 'DEMO-GMG-B-0001',
      power: 450,
      hourMeter: 620,
      condition: 'OPERACIONAL',
      installationSite: 'Sala de Energia Principal',
      clientId: clientB.id,
      modelId: model.id,
      currentSiteId: siteB.id,
      createdByUserId: opsUser.id,
      hasMaintenanceContract: false,
    },
  });

  await prisma.generatorBaseItem.deleteMany({ where: { generatorId: generator.id } });
  await prisma.generatorBaseItem.createMany({
    data: [
      {
        generatorId: generator.id,
        catalogItemId: serviceItem.id,
        serviceGroup: ServiceGroup.TM,
        quantity: 1,
      },
      {
        generatorId: generator.id,
        catalogItemId: partItem.id,
        serviceGroup: ServiceGroup.TM,
        quantity: 2,
      },
    ],
  });
  const supplier = await prisma.supplier.upsert({
    where: { cnpj: '98.765.432/0001-10' },
    update: {
      companyName: 'Fornecedor Demo Power',
      tradeName: 'Demo Power Parts',
      email: 'compras@demopower.local',
      phone: '(11) 3555-4400',
      city: 'Guarulhos',
      state: 'SP',
      categories: ['Filtros', 'Lubrificacao'],
      representedBrands: ['Cummins'],
      paymentTerm: '30 dias',
      qualityScore: 94,
      punctualityScore: 90,
      isActive: true,
    },
    create: {
      companyName: 'Fornecedor Demo Power',
      tradeName: 'Demo Power Parts',
      cnpj: '98.765.432/0001-10',
      email: 'compras@demopower.local',
      phone: '(11) 3555-4400',
      city: 'Guarulhos',
      state: 'SP',
      categories: ['Filtros', 'Lubrificacao'],
      representedBrands: ['Cummins'],
      paymentTerm: '30 dias',
      qualityScore: 94,
      punctualityScore: 90,
      isActive: true,
    },
  });

  await prisma.generatorBaseItem.deleteMany({ where: { generatorId: generatorB.id } });
  await prisma.generatorBaseItem.createMany({
    data: [
      {
        generatorId: generatorB.id,
        catalogItemId: serviceItem.id,
        serviceGroup: ServiceGroup.TM,
        quantity: 1,
      },
    ],
  });

  const supplierItem = await prisma.supplierCatalogItem.findFirst({
    where: { supplierId: supplier.id, catalogItemId: partItem.id },
  });

  if (supplierItem) {
    await prisma.supplierCatalogItem.update({
      where: { id: supplierItem.id },
      data: {
        supplierSku: 'DP-FILTRO-001',
        supplierPrice: 176,
        leadTimeDays: 3,
        isPrimary: true,
      },
    });
  } else {
    await prisma.supplierCatalogItem.create({
      data: {
        supplierId: supplier.id,
        catalogItemId: partItem.id,
        supplierSku: 'DP-FILTRO-001',
        supplierPrice: 176,
        leadTimeDays: 3,
        isPrimary: true,
      },
    });
  }

  const mainWarehouse = await prisma.warehouse.upsert({
    where: { code: 'MATRIZ' },
    update: {
      name: 'Almoxarifado Matriz',
      isActive: true,
    },
    create: {
      code: 'MATRIZ',
      name: 'Almoxarifado Matriz',
      type: 'MAIN',
      isActive: true,
    },
  });

  const mobileWarehouse = await prisma.warehouse.upsert({
    where: { code: 'TEC-DEMO-01' },
    update: {
      name: 'Estoque Movel Tecnico Demo',
      technicianId: technicianProfile.id,
      isActive: true,
    },
    create: {
      code: 'TEC-DEMO-01',
      name: 'Estoque Movel Tecnico Demo',
      type: 'MOBILE',
      technicianId: technicianProfile.id,
      isActive: true,
    },
  });

  const mainPartBalance = await prisma.inventoryBalance.findFirst({
    where: { warehouseId: mainWarehouse.id, catalogItemId: partItem.id },
  });

  if (mainPartBalance) {
    await prisma.inventoryBalance.update({
      where: { id: mainPartBalance.id },
      data: {
        physicalQty: 32,
        reservedQty: 6,
        minQty: 10,
        maxQty: 50,
        reorderPoint: 12,
      },
    });
  } else {
    await prisma.inventoryBalance.create({
      data: {
        warehouseId: mainWarehouse.id,
        catalogItemId: partItem.id,
        physicalQty: 32,
        reservedQty: 6,
        minQty: 10,
        maxQty: 50,
        reorderPoint: 12,
      },
    });
  }

  const mainEpiBalance = await prisma.inventoryBalance.findFirst({
    where: { warehouseId: mainWarehouse.id, catalogItemId: epiItem.id },
  });

  if (mainEpiBalance) {
    await prisma.inventoryBalance.update({
      where: { id: mainEpiBalance.id },
      data: {
        physicalQty: 20,
        reservedQty: 0,
        minQty: 5,
        maxQty: 30,
        reorderPoint: 8,
      },
    });
  } else {
    await prisma.inventoryBalance.create({
      data: {
        warehouseId: mainWarehouse.id,
        catalogItemId: epiItem.id,
        physicalQty: 20,
        reservedQty: 0,
        minQty: 5,
        maxQty: 30,
        reorderPoint: 8,
      },
    });
  }

  const mobilePartBalance = await prisma.inventoryBalance.findFirst({
    where: { warehouseId: mobileWarehouse.id, catalogItemId: partItem.id },
  });

  if (mobilePartBalance) {
    await prisma.inventoryBalance.update({
      where: { id: mobilePartBalance.id },
      data: {
        physicalQty: 4,
        reservedQty: 1,
        minQty: 1,
        maxQty: 8,
      },
    });
  } else {
    await prisma.inventoryBalance.create({
      data: {
        warehouseId: mobileWarehouse.id,
        catalogItemId: partItem.id,
        physicalQty: 4,
        reservedQty: 1,
        minQty: 1,
        maxQty: 8,
      },
    });
  }

  const opportunity =
    (await prisma.salesOpportunity.findFirst({
      where: {
        clientId: client.id,
        title: 'Projeto de continuidade energetica - Bloco Cirurgico',
      },
    })) ||
    (await prisma.salesOpportunity.create({
      data: {
        clientId: client.id,
        title: 'Projeto de continuidade energetica - Bloco Cirurgico',
      },
    }));

  await prisma.salesOpportunity.update({
    where: { id: opportunity.id },
    data: {
      assignedSellerId: salesUser.id,
      siteId: site.id,
      stage: 'NEGOTIATION',
      temperature: 'HOT',
      estimatedValue: 19800,
      expectedCloseDate: addDays(now, 12),
      notes: 'Cliente priorizou SLA de atendimento em ate 2h',
    },
  });

  const inspection = await prisma.commercialInspection.upsert({
    where: { code: 'VIS-DEMO-0001' },
    update: {
      status: 'COMPLETED',
      opportunityId: opportunity.id,
      clientId: client.id,
      siteId: site.id,
      inspectorUserId: opsUser.id,
      scheduledAt: addDays(now, -9),
      startedAt: addDays(now, -9),
      finishedAt: addDays(now, -8),
      requiredPowerKva: 750,
      voltage: '380/220V',
      qtaDistanceMeters: 26,
      needsMunck: false,
      accessNotes: 'Entrada de servico pelo portao 3',
      technicalNotes: 'QTA pronto para integracao com controle DeepSea',
    },
    create: {
      code: 'VIS-DEMO-0001',
      status: 'COMPLETED',
      opportunityId: opportunity.id,
      clientId: client.id,
      siteId: site.id,
      inspectorUserId: opsUser.id,
      scheduledAt: addDays(now, -9),
      startedAt: addDays(now, -9),
      finishedAt: addDays(now, -8),
      requiredPowerKva: 750,
      voltage: '380/220V',
      qtaDistanceMeters: 26,
      needsMunck: false,
      accessNotes: 'Entrada de servico pelo portao 3',
      technicalNotes: 'QTA pronto para integracao com controle DeepSea',
    },
  });

  await prisma.commercialInspectionMedia.deleteMany({
    where: { inspectionId: inspection.id },
  });

  await prisma.commercialInspectionMedia.create({
    data: {
      inspectionId: inspection.id,
      fileName: 'painel-qta-demo.jpg',
      fileUrl: 'https://example.com/demo/painel-qta-demo.jpg',
      mimeType: 'image/jpeg',
      fileSizeBytes: 245000,
      capturedAt: addDays(now, -8),
    },
  });
  const proposal = await prisma.proposal.upsert({
    where: { code: '90001/00' },
    update: {
      clientId: client.id,
      salesOpportunityId: opportunity.id,
      generatorId: generator.id,
      userId: salesUser.id,
      status: ProposalStatus.WON,
      type: ProposalType.PARTS_AND_SERVICES,
      totalValue: 17240,
      validUntil: addDays(now, 20),
      scope: 'Preventiva mensal + kit de reposicao',
      paymentTerm: '30 dias',
      paymentDetails: 'Boleto + PIX de contingencia',
      hasDownPayment: true,
      downPaymentAmount: 5000,
      installmentCount: 2,
      installmentIntervalDays: 30,
      firstDueDate: addDays(now, 10),
      discount: 560,
      internalNotes: 'Negociacao fechada com condicao VIP.',
      externalNotes: 'Execucao em janela noturna para nao impactar centro cirurgico.',
    },
    create: {
      code: '90001/00',
      status: ProposalStatus.WON,
      type: ProposalType.PARTS_AND_SERVICES,
      totalValue: 17240,
      validUntil: addDays(now, 20),
      clientId: client.id,
      salesOpportunityId: opportunity.id,
      generatorId: generator.id,
      userId: salesUser.id,
      scope: 'Preventiva mensal + kit de reposicao',
      paymentTerm: '30 dias',
      paymentDetails: 'Boleto + PIX de contingencia',
      hasDownPayment: true,
      downPaymentAmount: 5000,
      installmentCount: 2,
      installmentIntervalDays: 30,
      firstDueDate: addDays(now, 10),
      discount: 560,
      internalNotes: 'Negociacao fechada com condicao VIP.',
      externalNotes: 'Execucao em janela noturna para nao impactar centro cirurgico.',
    },
  });

  await prisma.proposalItem.deleteMany({ where: { proposalId: proposal.id } });
  await prisma.proposalItem.createMany({
    data: [
      {
        proposalId: proposal.id,
        catalogItemId: serviceItem.id,
        quantity: 2,
        unitPrice: 6800,
        totalPrice: 13600,
      },
      {
        proposalId: proposal.id,
        catalogItemId: partItem.id,
        quantity: 12,
        unitPrice: 350,
        totalPrice: 4200,
      },
    ],
  });

  await prisma.proposalMovement.deleteMany({ where: { proposalId: proposal.id } });
  await prisma.proposalMovement.createMany({
    data: [
      {
        proposalId: proposal.id,
        actorUserId: salesUser.id,
        action: 'CREATE_DRAFT',
        toStatus: ProposalStatus.DRAFT,
        note: 'Rascunho inicial criado pelo time comercial.',
      },
      {
        proposalId: proposal.id,
        actorUserId: opsUser.id,
        action: 'BOARD_APPROVE',
        fromStatus: ProposalStatus.BOARD_REVIEW,
        toStatus: ProposalStatus.CLIENT_REVIEW,
        note: 'Diretoria aprovou condicoes tecnicas e comerciais.',
      },
      {
        proposalId: proposal.id,
        actorUserId: salesUser.id,
        action: 'CLIENT_APPROVE',
        fromStatus: ProposalStatus.CLIENT_REVIEW,
        toStatus: ProposalStatus.WON,
        note: 'Cliente aprovou a proposta e autorizou execucao.',
      },
    ],
  });

  const contractCostCenter = await prisma.costCenter.upsert({
    where: { code: 'CC-DEMO-CONTRATO' },
    update: {
      name: 'Centro de Custo Contrato Demo Hospital',
      type: CostCenterType.CONTRACT,
      clientId: client.id,
      isActive: true,
    },
    create: {
      code: 'CC-DEMO-CONTRATO',
      name: 'Centro de Custo Contrato Demo Hospital',
      type: CostCenterType.CONTRACT,
      clientId: client.id,
      isActive: true,
    },
  });

  const generatorCostCenter = await prisma.costCenter.upsert({
    where: { code: 'CC-DEMO-GERADOR' },
    update: {
      name: 'Centro de Custo Gerador Hospital Principal',
      type: CostCenterType.GENERATOR,
      clientId: client.id,
      generatorId: generator.id,
      isActive: true,
    },
    create: {
      code: 'CC-DEMO-GERADOR',
      name: 'Centro de Custo Gerador Hospital Principal',
      type: CostCenterType.GENERATOR,
      clientId: client.id,
      generatorId: generator.id,
      isActive: true,
    },
  });

  const contractStart = monthStart(now);
  const contractEnd = monthShift(contractStart, 11);

  const contract = await prisma.serviceContract.upsert({
    where: { code: 'CTR-90001' },
    update: {
      title: 'Contrato Demo Hospital Central',
      status: ContractStatus.ACTIVE,
      startDate: contractStart,
      endDate: contractEnd,
      alertDays: 30,
      preventiveRecurrence: PreventiveRecurrence.MONTHLY,
      responseTimeHours: 2,
      correctiveVisitAllowance: 2,
      partsCoverage: PartsCoverageType.BILLED_SEPARATELY,
      recurringAmount: 15000,
      dueDay: 15,
      adjustmentIndex: BillingAdjustmentIndex.IPCA,
      adjustmentBaseMonth: contractStart.getMonth() + 1,
      includesFuelManagement: true,
      notes: 'Contrato de manutencao completa com SLA critico.',
      clientId: client.id,
      createdByUserId: salesUser.id,
      sourceProposalId: proposal.id,
      costCenterId: contractCostCenter.id,
    },
    create: {
      code: 'CTR-90001',
      title: 'Contrato Demo Hospital Central',
      status: ContractStatus.ACTIVE,
      startDate: contractStart,
      endDate: contractEnd,
      alertDays: 30,
      preventiveRecurrence: PreventiveRecurrence.MONTHLY,
      responseTimeHours: 2,
      correctiveVisitAllowance: 2,
      partsCoverage: PartsCoverageType.BILLED_SEPARATELY,
      recurringAmount: 15000,
      dueDay: 15,
      adjustmentIndex: BillingAdjustmentIndex.IPCA,
      adjustmentBaseMonth: contractStart.getMonth() + 1,
      includesFuelManagement: true,
      notes: 'Contrato de manutencao completa com SLA critico.',
      clientId: client.id,
      createdByUserId: salesUser.id,
      sourceProposalId: proposal.id,
      costCenterId: contractCostCenter.id,
    },
  });

  await prisma.costCenter.update({
    where: { id: contractCostCenter.id },
    data: { contractId: contract.id },
  });

  await prisma.contractEquipment.deleteMany({ where: { contractId: contract.id } });
  await prisma.contractEquipment.create({
    data: {
      contractId: contract.id,
      generatorId: generator.id,
      coverageAmount: 15000,
    },
  });

  await prisma.contractInvoice.deleteMany({ where: { contractId: contract.id } });
  await prisma.contractInvoice.createMany({
    data: [
      {
        contractId: contract.id,
        competenceDate: monthShift(contractStart, -1),
        dueDate: addDays(now, -20),
        amount: 15000,
        variableAmount: 0,
        status: ContractInvoiceStatus.PAID,
        description: 'Mensalidade contrato demo - competencia anterior',
        paidAt: addDays(now, -10),
      },
      {
        contractId: contract.id,
        competenceDate: contractStart,
        dueDate: addDays(now, 5),
        amount: 15000,
        variableAmount: 0,
        status: ContractInvoiceStatus.PENDING,
        description: 'Mensalidade contrato demo - competencia atual',
      },
      {
        contractId: contract.id,
        competenceDate: monthShift(contractStart, 1),
        dueDate: addDays(now, 35),
        amount: 15000,
        variableAmount: 0,
        status: ContractInvoiceStatus.PENDING,
        description: 'Mensalidade contrato demo - proxima competencia',
      },
    ],
  });

  await prisma.contractPreventiveSchedule.deleteMany({ where: { contractId: contract.id } });
  await prisma.contractPreventiveSchedule.createMany({
    data: [
      {
        contractId: contract.id,
        generatorId: generator.id,
        scheduledDate: addDays(now, 2),
        status: 'PLANNED',
      },
      {
        contractId: contract.id,
        generatorId: generator.id,
        scheduledDate: addDays(now, 32),
        status: 'PLANNED',
      },
      {
        contractId: contract.id,
        generatorId: generator.id,
        scheduledDate: addDays(now, 62),
        status: 'PLANNED',
      },
    ],
  });
  await prisma.generator.update({
    where: { id: generator.id },
    data: {
      hasMaintenanceContract: true,
      currentSiteId: site.id,
    },
  });

  await prisma.client.update({
    where: { id: client.id },
    data: {
      clientType: ClientType.CONTRACT,
      isDelinquent: false,
    },
  });

  const correctiveOrderBase = {
    title: 'OS DEMO - Troca de filtros corretiva',
    description: 'Equipamento apresentou oscilacao de pressao. Troca de filtro e teste final.',
    status: OrderStatus.OPEN,
    type: MaintenanceOrderType.CORRECTIVE,
    priority: 'HIGH',
    generatorId: generator.id,
    siteId: site.id,
    technicianId: technicianProfile.id,
    contractId: contract.id,
    costCenterId: generatorCostCenter.id,
    scheduledTo: addDays(now, 1),
    customerReport: 'Cliente reportou alarme intermitente no painel.',
  };

  const correctiveOrderExisting = await prisma.maintenanceOrder.findFirst({
    where: {
      generatorId: generator.id,
      title: correctiveOrderBase.title,
    },
  });

  const correctiveOrder = correctiveOrderExisting
    ? await prisma.maintenanceOrder.update({
        where: { id: correctiveOrderExisting.id },
        data: correctiveOrderBase,
      })
    : await prisma.maintenanceOrder.create({ data: correctiveOrderBase });

  const preventiveOrderBase = {
    title: 'OS DEMO - Preventiva contratual mensal',
    description: 'Execucao de preventiva programada com checklist padrao TM.',
    status: OrderStatus.IN_PROGRESS,
    type: MaintenanceOrderType.PREVENTIVE,
    priority: 'NORMAL',
    generatorId: generator.id,
    siteId: site.id,
    technicianId: technicianProfile.id,
    contractId: contract.id,
    costCenterId: generatorCostCenter.id,
    scheduledTo: addDays(now, 3),
    displacementStartedAt: addDays(now, 3),
    startedAt: addDays(now, 3),
  };

  const preventiveOrderExisting = await prisma.maintenanceOrder.findFirst({
    where: {
      generatorId: generator.id,
      title: preventiveOrderBase.title,
    },
  });

  const preventiveOrder = preventiveOrderExisting
    ? await prisma.maintenanceOrder.update({
        where: { id: preventiveOrderExisting.id },
        data: preventiveOrderBase,
      })
    : await prisma.maintenanceOrder.create({ data: preventiveOrderBase });

  await prisma.maintenanceOrderMaterial.deleteMany({ where: { orderId: correctiveOrder.id } });
  await prisma.maintenanceOrderMaterial.create({
    data: {
      orderId: correctiveOrder.id,
      catalogItemId: partItem.id,
      warehouseId: mainWarehouse.id,
      quantity: 2,
      unitCost: 180,
      reservedAt: now,
    },
  });

  const purchaseOrder = await prisma.purchaseOrder.upsert({
    where: { code: 'PO-90001' },
    update: {
      supplierId: supplier.id,
      status: PurchaseOrderStatus.APPROVED,
      issueDate: addDays(now, -6),
      expectedDate: addDays(now, 4),
      freightAmount: 220,
      taxAmount: 180,
      totalProductsAmount: 3520,
      totalAmount: 3920,
      paymentTerm: '30 dias',
      notes: 'Reposicao automatica de filtros para preventiva.',
      approvedAt: addDays(now, -5),
    },
    create: {
      code: 'PO-90001',
      supplierId: supplier.id,
      status: PurchaseOrderStatus.APPROVED,
      issueDate: addDays(now, -6),
      expectedDate: addDays(now, 4),
      freightAmount: 220,
      taxAmount: 180,
      totalProductsAmount: 3520,
      totalAmount: 3920,
      paymentTerm: '30 dias',
      notes: 'Reposicao automatica de filtros para preventiva.',
      approvedAt: addDays(now, -5),
    },
  });

  await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: purchaseOrder.id } });

  await prisma.purchaseOrderItem.create({
    data: {
      purchaseOrderId: purchaseOrder.id,
      catalogItemId: partItem.id,
      quantity: 20,
      receivedQty: 10,
      unitPrice: 176,
      taxAmount: 180,
      totalPrice: 3520,
    },
  });

  await prisma.purchaseOrderReceipt.deleteMany({ where: { purchaseOrderId: purchaseOrder.id } });
  await prisma.purchaseOrderReceipt.create({
    data: {
      purchaseOrderId: purchaseOrder.id,
      warehouseId: mainWarehouse.id,
      receivedAt: addDays(now, -2),
      notes: 'Recebimento parcial do lote de filtros.',
    },
  });

  const payableExisting = await prisma.accountsPayable.findFirst({
    where: { purchaseOrderId: purchaseOrder.id },
  });

  const payable = payableExisting
    ? await prisma.accountsPayable.update({
        where: { id: payableExisting.id },
        data: {
          supplierId: supplier.id,
          purchaseOrderId: purchaseOrder.id,
          costCenterId: contractCostCenter.id,
          description: `Pedido de Compra ${purchaseOrder.code}`,
          dueDate: addDays(now, 25),
          competenceDate: now,
          amount: 3920,
          category: PayableCategory.SUPPLIERS,
          status: AccountsPayableStatus.OPEN,
          paidAmount: 2000,
          paidAt: null,
        },
      })
    : await prisma.accountsPayable.create({
        data: {
          supplierId: supplier.id,
          purchaseOrderId: purchaseOrder.id,
          costCenterId: contractCostCenter.id,
          description: `Pedido de Compra ${purchaseOrder.code}`,
          dueDate: addDays(now, 25),
          competenceDate: now,
          amount: 3920,
          category: PayableCategory.SUPPLIERS,
          status: AccountsPayableStatus.OPEN,
          paidAmount: 2000,
        },
      });

  const bankAccount =
    (await prisma.bankAccount.findFirst({
      where: {
        name: 'Conta Operacional Demo',
      },
    })) ||
    (await prisma.bankAccount.create({
      data: {
        name: 'Conta Operacional Demo',
        bankName: 'Banco Demo',
        type: BankAccountType.CHECKING,
        agency: '0001',
        accountNumber: '12345-6',
        pixKey: 'financeiro@manitec.demo',
        initialBalance: 50000,
        currentBalance: 50000,
      },
    }));

  await prisma.bankAccount.update({
    where: { id: bankAccount.id },
    data: {
      bankName: 'Banco Demo',
      type: BankAccountType.CHECKING,
      agency: '0001',
      accountNumber: '12345-6',
      pixKey: 'financeiro@manitec.demo',
      initialBalance: 50000,
      currentBalance: 53000,
      isActive: true,
    },
  });

  const contractReceivableExisting = await prisma.accountsReceivable.findFirst({
    where: {
      clientId: client.id,
      contractId: contract.id,
      description: 'Mensalidade contrato demo 01',
    },
  });

  const contractReceivable = contractReceivableExisting
    ? await prisma.accountsReceivable.update({
        where: { id: contractReceivableExisting.id },
        data: {
          clientId: client.id,
          contractId: contract.id,
          costCenterId: contractCostCenter.id,
          description: 'Mensalidade contrato demo 01',
          competenceDate: now,
          dueDate: addDays(now, 5),
          grossAmount: 15000,
          discountAmount: 0,
          netAmount: 15000,
          paidAmount: 5000,
          status: AccountsReceivableStatus.PARTIAL,
        },
      })
    : await prisma.accountsReceivable.create({
        data: {
          clientId: client.id,
          contractId: contract.id,
          costCenterId: contractCostCenter.id,
          description: 'Mensalidade contrato demo 01',
          competenceDate: now,
          dueDate: addDays(now, 5),
          grossAmount: 15000,
          discountAmount: 0,
          netAmount: 15000,
          paidAmount: 5000,
          status: AccountsReceivableStatus.PARTIAL,
        },
      });
  const osReceivableExisting = await prisma.accountsReceivable.findFirst({
    where: {
      clientId: client.id,
      maintenanceOrderId: correctiveOrder.id,
      description: 'Servico avulso OS DEMO',
    },
  });

  const osReceivable = osReceivableExisting
    ? await prisma.accountsReceivable.update({
        where: { id: osReceivableExisting.id },
        data: {
          clientId: client.id,
          maintenanceOrderId: correctiveOrder.id,
          costCenterId: generatorCostCenter.id,
          description: 'Servico avulso OS DEMO',
          competenceDate: now,
          dueDate: addDays(now, 12),
          grossAmount: 3240,
          discountAmount: 0,
          netAmount: 3240,
          paidAmount: 0,
          status: AccountsReceivableStatus.OPEN,
        },
      })
    : await prisma.accountsReceivable.create({
        data: {
          clientId: client.id,
          maintenanceOrderId: correctiveOrder.id,
          costCenterId: generatorCostCenter.id,
          description: 'Servico avulso OS DEMO',
          competenceDate: now,
          dueDate: addDays(now, 12),
          grossAmount: 3240,
          discountAmount: 0,
          netAmount: 3240,
          paidAmount: 0,
          status: AccountsReceivableStatus.OPEN,
        },
      });

  await prisma.accountsReceivablePayment.deleteMany({
    where: {
      receivableId: contractReceivable.id,
      notes: 'DEMO_FLOW',
    },
  });

  await prisma.accountsReceivablePayment.create({
    data: {
      receivableId: contractReceivable.id,
      bankAccountId: bankAccount.id,
      amount: 5000,
      method: 'TRANSFER',
      paidAt: addDays(now, -1),
      actorUserId: opsUser.id,
      notes: 'DEMO_FLOW',
    },
  });

  await prisma.accountsPayablePayment.deleteMany({
    where: {
      payableId: payable.id,
      notes: 'DEMO_FLOW',
    },
  });

  await prisma.accountsPayablePayment.create({
    data: {
      payableId: payable.id,
      bankAccountId: bankAccount.id,
      amount: 2000,
      method: 'TRANSFER',
      paidAt: addDays(now, -1),
      actorUserId: opsUser.id,
      notes: 'DEMO_FLOW',
    },
  });

  await prisma.commissionEntry.deleteMany({
    where: {
      userId: salesUser.id,
      receivableId: contractReceivable.id,
    },
  });

  await prisma.commissionEntry.create({
    data: {
      userId: salesUser.id,
      receivableId: contractReceivable.id,
      contractId: contract.id,
      baseAmount: 15000,
      percent: 2,
      amount: 300,
      status: CommissionStatus.RELEASED,
      releasedAt: addDays(now, -1),
      notes: 'Comissao demo liberada apos recebimento parcial.',
    },
  });

  const entryDate = addDays(now, -1);

  const existingTimeEntry = await prisma.timeEntry.findFirst({
    where: {
      userId: technicianUser.id,
      maintenanceOrderId: correctiveOrder.id,
      startedAt: {
        gte: new Date(
          entryDate.getFullYear(),
          entryDate.getMonth(),
          entryDate.getDate(),
          0,
          0,
          0,
          0,
        ),
        lte: new Date(
          entryDate.getFullYear(),
          entryDate.getMonth(),
          entryDate.getDate(),
          23,
          59,
          59,
          999,
        ),
      },
    },
  });

  if (existingTimeEntry) {
    await prisma.timeEntry.update({
      where: { id: existingTimeEntry.id },
      data: {
        status: 'WORK',
        startedAt: addDays(now, -1),
        endedAt: now,
        transitMinutes: 45,
        workMinutes: 240,
        extraMinutes: 30,
        nightMinutes: 0,
      },
    });
  } else {
    await prisma.timeEntry.create({
      data: {
        userId: technicianUser.id,
        maintenanceOrderId: correctiveOrder.id,
        status: 'WORK',
        startedAt: addDays(now, -1),
        endedAt: now,
        transitMinutes: 45,
        workMinutes: 240,
        extraMinutes: 30,
        nightMinutes: 0,
      },
    });
  }

  const hrAssetExisting = await prisma.hrAssetAssignment.findFirst({
    where: {
      userId: technicianUser.id,
      title: 'Capacete classe B - Demo',
    },
  });

  if (hrAssetExisting) {
    await prisma.hrAssetAssignment.update({
      where: { id: hrAssetExisting.id },
      data: {
        catalogItemId: epiItem.id,
        assetType: HrAssetType.EPI,
        caCode: 'CA-12345',
        deliveredAt: addDays(now, -20),
        expiresAt: addDays(now, 60),
        signedTermUrl: 'https://example.com/demo/termo-capacete.pdf',
        status: HrAssetStatus.ACTIVE,
        returnedAt: null,
      },
    });
  } else {
    await prisma.hrAssetAssignment.create({
      data: {
        userId: technicianUser.id,
        catalogItemId: epiItem.id,
        assetType: HrAssetType.EPI,
        title: 'Capacete classe B - Demo',
        caCode: 'CA-12345',
        deliveredAt: addDays(now, -20),
        expiresAt: addDays(now, 60),
        signedTermUrl: 'https://example.com/demo/termo-capacete.pdf',
        status: HrAssetStatus.ACTIVE,
      },
    });
  }

  const vehicle = await prisma.fleetVehicle.upsert({
    where: { plate: 'DEM-9010' },
    update: {
      model: 'Fiat Strada Endurance',
      currentKm: 48450,
      nextOilChangeKm: 50000,
      status: FleetVehicleStatus.IN_USE,
      isActive: true,
    },
    create: {
      plate: 'DEM-9010',
      renavam: '99887766554',
      model: 'Fiat Strada Endurance',
      currentKm: 48450,
      avgKmPerLiter: 11.8,
      nextOilChangeKm: 50000,
      status: FleetVehicleStatus.IN_USE,
      isActive: true,
    },
  });

  const allocationOpen = await prisma.fleetAllocation.findFirst({
    where: {
      vehicleId: vehicle.id,
      userId: technicianUser.id,
      releasedAt: null,
    },
  });

  if (!allocationOpen) {
    await prisma.fleetAllocation.create({
      data: {
        vehicleId: vehicle.id,
        userId: technicianUser.id,
        maintenanceOrderId: correctiveOrder.id,
        assignedAt: addDays(now, -1),
        startKm: 48390,
      },
    });
  }

  await prisma.costCenterEntry.deleteMany({
    where: {
      costCenterId: contractCostCenter.id,
      sourceType: { startsWith: 'DEMO_' },
    },
  });

  await prisma.costCenterEntry.createMany({
    data: [
      {
        costCenterId: contractCostCenter.id,
        entryType: CostCenterEntryType.REVENUE,
        sourceType: 'DEMO_RECEIVABLE',
        sourceId: contractReceivable.id,
        amount: 15000,
        competenceDate: now,
        notes: 'Receita prevista da mensalidade do contrato demo.',
      },
      {
        costCenterId: contractCostCenter.id,
        entryType: CostCenterEntryType.COST,
        sourceType: 'DEMO_OPERATION_COST',
        sourceId: correctiveOrder.id,
        amount: 3200,
        competenceDate: now,
        notes: 'Custo tecnico e materiais aplicados na OS demo.',
      },
      {
        costCenterId: contractCostCenter.id,
        entryType: CostCenterEntryType.EXPENSE,
        sourceType: 'DEMO_PAYABLE',
        sourceId: payable.id,
        amount: 1800,
        competenceDate: now,
        notes: 'Despesa operacional vinculada ao pedido de compra demo.',
      },
    ],
  });

  console.log('[seed:flow] Fluxo completo criado/atualizado com sucesso.');
  console.log(`[seed:flow] Cliente: ${client.companyName} (${client.cnpj})`);
  console.log(`[seed:flow] Cliente B QA: ${clientB.companyName} (${clientB.cnpj})`);
  console.log(`[seed:flow] Equipamento: ${generator.name} (${generator.serialNumber})`);
  console.log(`[seed:flow] Equipamento Cliente B: ${generatorB.name} (${generatorB.serialNumber})`);
  console.log(`[seed:flow] Proposta: ${proposal.code} | Contrato: ${contract.code}`);
  console.log(`[seed:flow] OS: ${correctiveOrder.title} / ${preventiveOrder.title}`);
  console.log(`[seed:flow] Recebivel aberto: ${osReceivable.description}`);
  console.log(`[seed:flow] Pedido de compra: ${purchaseOrder.code} | Pagar: ${payable.description}`);
  console.log('[seed:flow] Usuarios demo:');
  console.log('  - admin@manitec.local (via seed principal, se executado)');
  console.log(`  - ${managerUser.email}`);
  console.log('  - vendas.demo@manitec.local');
  console.log(`  - ${opsUser.email}`);
  console.log('  - tecnico.demo@manitec.local');
  console.log(`  - ${financeUser.email}`);
  console.log(`  - ${suppliesUser.email}`);
  console.log(`  - ${hrUser.email}`);
  console.log(`  - ${auditorUser.email}`);
  console.log(`  - ${clientUserA.email}`);
  console.log(`  - ${clientUserB.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
