import {
  HrAssetStatus,
  HrAssetType,
  ItemType,
  ManufacturerType,
  CatalogItem,
  Client,
  GeneratorModel,
  Prisma,
  PrismaClient,
  ProductOrigin,
  Site,
  Supplier,
  User,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

const PRESERVED_EMAILS = ['gustavo@manitec.com.br', 'marcos@manitec.com.br'];

const departmentUsers = [
  ['Gestao', 'gestao@manitec.local', UserRole.MANAGER],
  ['Comercial', 'comercial@manitec.local', UserRole.SALES],
  [
    'Engenharia de Aplicacao',
    'engenharia@manitec.local',
    UserRole.ENGINEER_APPLICATION,
  ],
  ['Operacao', 'operacao@manitec.local', UserRole.LOGISTICS],
  ['Tecnico', 'tecnico@manitec.local', UserRole.TECHNICIAN],
  ['Ativos', 'ativos@manitec.local', UserRole.LOGISTICS],
  ['Suprimentos', 'suprimentos@manitec.local', UserRole.SUPPLIES],
  ['Financeiro', 'financeiro@manitec.local', UserRole.FINANCE],
  ['RH Operacional', 'rh@manitec.local', UserRole.HR],
  ['Auditoria', 'auditoria@manitec.local', UserRole.AUDITOR],
] as const;

const manufacturers = [
  ['Cummins', ManufacturerType.ENGINE],
  ['Scania', ManufacturerType.ENGINE],
  ['MWM', ManufacturerType.ENGINE],
  ['Perkins', ManufacturerType.ENGINE],
  ['Volvo Penta', ManufacturerType.ENGINE],
  ['Caterpillar', ManufacturerType.ENGINE],
  ['Stamford', ManufacturerType.ALTERNATOR],
  ['WEG', ManufacturerType.ALTERNATOR],
  ['Leroy-Somer', ManufacturerType.ALTERNATOR],
  ['Stemac', ManufacturerType.GENERATOR],
  ['Toyama', ManufacturerType.GENERATOR],
  ['Branco', ManufacturerType.GENERATOR],
  ['Modine', ManufacturerType.RADIATOR],
  ['Deep Sea Electronics', ManufacturerType.CONTROLLER],
  ['ComAp', ManufacturerType.CONTROLLER],
] as const;

const generatorModels = [
  ['GMG 30 kVA Compacto', 'Stemac', 30],
  ['GMG 45 kVA Industrial', 'Stemac', 45],
  ['GMG 55 kVA Silenciado', 'MWM', 55],
  ['GMG 75 kVA Automatico', 'Cummins', 75],
  ['GMG 100 kVA Standby', 'Cummins', 100],
  ['GMG 125 kVA Prime', 'Scania', 125],
  ['GMG 150 kVA Hospitalar', 'Cummins', 150],
  ['GMG 180 kVA Industrial', 'MWM', 180],
  ['GMG 200 kVA Automatico', 'Perkins', 200],
  ['GMG 250 kVA Super Silenciado', 'Volvo Penta', 250],
  ['GMG 300 kVA Paralelismo', 'Cummins', 300],
  ['GMG 400 kVA Data Center', 'Scania', 400],
  ['GMG 500 kVA Hospitalar', 'Caterpillar', 500],
  ['GMG 625 kVA Missao Critica', 'Cummins', 625],
  ['GMG 750 kVA Continuidade', 'Cummins', 750],
] as const;

const materialNames = [
  'Filtro de oleo lubrificante',
  'Filtro de combustivel primario',
  'Filtro separador de agua',
  'Filtro de ar externo',
  'Filtro de ar interno',
  'Correia do alternador',
  'Mangueira de combustivel',
  'Mangueira do radiador',
  'Bateria estacionaria 150 Ah',
  'Aditivo para radiador 1 L',
  'Oleo diesel 15W40 20 L',
  'Rele auxiliar 24 V',
  'Sensor de pressao de oleo',
  'Sensor de temperatura',
  'Fusivel NH de protecao',
];

const serviceNames = [
  'Manutencao preventiva basica',
  'Manutencao preventiva completa',
  'Manutencao corretiva em campo',
  'Atendimento tecnico emergencial',
  'Termografia em quadro eletrico',
  'Analise de qualidade de energia',
  'Teste de banco de carga',
  'Limpeza tecnica de gerador',
  'Troca de oleo e filtros',
  'Instalacao de grupo gerador',
  'Comissionamento e partida',
  'Retrofit de painel de comando',
  'Configuracao de controlador',
  'Inspecao tecnica contratual',
  'Treinamento operacional',
];

const toolNames = [
  'Multimetro digital True RMS',
  'Alicate amperimetro',
  'Megometro digital',
  'Terrrometro digital',
  'Camera termografica',
  'Torquimetro 20-200 Nm',
  'Chave de impacto a bateria',
  'Furadeira de impacto',
  'Jogo de chaves combinadas',
  'Jogo de soquetes',
  'Manometro de pressao de oleo',
  'Tacometro digital',
  'Analisador de energia',
  'Bomba manual de transferencia',
  'Notebook de diagnostico',
];

const epiNames = [
  'Capacete classe B',
  'Oculos de protecao incolor',
  'Protetor auricular tipo plug',
  'Luva isolante classe 0',
  'Luva de cobertura em vaqueta',
  'Luva nitrilica para manutencao',
  'Botina de seguranca eletricista',
  'Vestimenta antichama NR-10',
  'Protetor facial para arco eletrico',
  'Cinturao paraquedista',
  'Talabarte duplo com absorvedor',
  'Respirador semifacial PFF2',
  'Colete refletivo',
  'Creme de protecao para as maos',
  'Mascara de solda automatica',
];

function temporaryPassword() {
  return (
    process.env.SEED_SIMULATION_PASSWORD ||
    `Sim!${randomBytes(9).toString('base64url')}`
  );
}

function preservedUserData(user: any): Prisma.UserUncheckedCreateInput {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    passwordHash: user.passwordHash,
    role: UserRole.ADMIN,
    isActive: true,
    isSystemMaster: user.isSystemMaster,
    functionalId: user.functionalId,
    documentId: user.documentId,
    profilePhotoUrl: user.profilePhotoUrl,
    availabilityStatus: user.availabilityStatus,
    availabilityUpdatedAt: user.availabilityUpdatedAt,
    skillLevel: user.skillLevel,
    regionTags: user.regionTags,
    digitalSignatureUrl: user.digitalSignatureUrl,
    mfaEnabled: user.mfaEnabled,
    mfaSecretEncrypted: user.mfaSecretEncrypted,
    ...(user.mfaRecoveryCodesHash !== null
      ? { mfaRecoveryCodesHash: user.mfaRecoveryCodesHash }
      : {}),
    department: user.department,
    branch: user.branch,
    approvalDiscountLimit: user.approvalDiscountLimit,
    hourCost: user.hourCost,
  };
}

async function main() {
  if (process.env.CONFIRM_CLEAN_SIMULATION !== 'DELETE_ALL_DATA') {
    throw new Error(
      'Operacao bloqueada. Defina CONFIRM_CLEAN_SIMULATION=DELETE_ALL_DATA.',
    );
  }

  const [preservedUsers, companySettings] = await Promise.all([
    prisma.user.findMany({ where: { email: { in: PRESERVED_EMAILS } } }),
    prisma.companySettings.findFirst({
      where: { isPrimary: true },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  const missing = PRESERVED_EMAILS.filter(
    (email) => !preservedUsers.some((user) => user.email === email),
  );
  if (missing.length) {
    throw new Error(
      `Usuarios obrigatorios nao encontrados: ${missing.join(', ')}`,
    );
  }

  const password = temporaryPassword();
  const passwordHash = await bcrypt.hash(password, 10);
  const structuralModels = new Set([
    'ControlOption',
    'CatalogSkuArea',
    'CatalogSkuFamily',
    'CatalogSkuApplication',
    'CatalogSkuRule',
    'CatalogPricingPolicy',
  ]);
  const tables = Prisma.dmmf.datamodel.models
    .filter((model) => !structuralModels.has(model.name))
    .map((model) => `"${model.dbName || model.name}"`);

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`,
      );
      await tx.$executeRawUnsafe(
        `SELECT setval('catalog_sku_number_seq', 123456788, true)`,
      );

      for (const user of preservedUsers) {
        await tx.user.create({ data: preservedUserData(user) });
      }

      const lacerda = await tx.user.findUniqueOrThrow({
        where: { email: 'gustavo@manitec.com.br' },
      });

      await tx.user.create({
        data: {
          name: 'RODRIGO',
          email: 'rodrigo@manitec.com.br',
          passwordHash,
          role: UserRole.ADMIN,
          isActive: true,
          isSystemMaster: false,
          department: 'Administracao e Desenvolvimento',
          branch: 'Matriz',
          approvalDiscountLimit: 100,
        },
      });

      const createdDepartmentUsers: User[] = [];
      for (const [name, email, role] of departmentUsers) {
        createdDepartmentUsers.push(
          await tx.user.create({
            data: {
              name,
              email,
              passwordHash,
              role,
              isActive: true,
              department: name,
              branch: 'Matriz',
              approvalDiscountLimit: role === UserRole.SALES ? 10 : 0,
              hourCost: role === UserRole.TECHNICIAN ? 95 : 0,
            },
          }),
        );
      }

      const technicianUser = createdDepartmentUsers.find(
        (user) => user.role === UserRole.TECHNICIAN,
      )!;
      const technician = await tx.technician.create({
        data: {
          userId: technicianUser.id,
          cpf: '00000000191',
          phone: '(11) 90000-0100',
          skills: ['preventiva', 'corretiva', 'eletrica', 'mecanica'],
        },
      });

      if (companySettings) {
        const { id, deliveryTemplatesJson, ...settings } = companySettings;
        await tx.companySettings.create({
          data: {
            ...settings,
            id,
            updatedByUserId: lacerda.id,
            ...(deliveryTemplatesJson === null
              ? {}
              : { deliveryTemplatesJson }),
          },
        });
      } else {
        await tx.companySettings.create({
          data: {
            key: 'default',
            companyName: 'MANITEC Manutencao e Instalacao Tecnica',
            tradeName: 'MANITEC',
            email: 'contato@manitec.com.br',
            city: 'Indaiatuba',
            state: 'SP',
            country: 'BR',
            primaryColor: '#1d4ed8',
            secondaryColor: '#0f172a',
            isPrimary: true,
            updatedByUserId: lacerda.id,
          },
        });
      }

      for (const [name, type] of manufacturers) {
        await tx.manufacturer.create({
          data: { name, type, country: 'Brasil', isActive: true },
        });
      }

      const models: GeneratorModel[] = [];
      for (let index = 0; index < generatorModels.length; index += 1) {
        const [name, brand, power] = generatorModels[index];
        models.push(
          await tx.generatorModel.create({
            data: {
              name,
              brand,
              category:
                power >= 400 ? 'Missao critica' : 'Grupo gerador diesel',
              defaultPowerKva: power,
              defaultPowerKw: Number((power * 0.8).toFixed(1)),
              defaultVoltage: index % 2 ? '220/127V' : '380/220V',
              frequencyHz: 60,
              controllerType:
                index % 2 ? 'Deep Sea DSE7320' : 'ComAp InteliLite',
              engineModel: `${brand} Motor ${index + 1}`,
              alternatorModel: index % 2 ? 'Stamford' : 'WEG',
              description:
                'Modelo base para simulacoes comerciais e operacionais.',
              isActive: true,
            },
          }),
        );
      }

      const clients: Array<{ client: Client; site: Site }> = [];
      for (let index = 1; index <= 5; index += 1) {
        const client = await tx.client.create({
          data: {
            companyName: `Cliente Simulacao ${String(index).padStart(2, '0')} Ltda.`,
            tradeName: `Cliente Simulacao ${index}`,
            cnpj: `90.000.00${index}/0001-${String(10 + index).padStart(2, '0')}`,
            email: `compras${index}@cliente-simulacao.local`,
            contactName: `Contato Comercial ${index}`,
            phone: `(11) 4000-${String(1000 + index)}`,
            address: `Avenida Industrial, ${100 + index}`,
            city: index % 2 ? 'Indaiatuba' : 'Campinas',
            state: 'SP',
            segment: [
              'Hospital',
              'Industria',
              'Condominio',
              'Varejo',
              'Logistica',
            ][index - 1],
            paymentTermDefault: '30 dias',
            creditLimit: 250000,
            salesOwnerId: lacerda.id,
          },
        });
        const site = await tx.site.create({
          data: {
            clientId: client.id,
            name: 'Unidade Principal',
            code: `SIM-${String(index).padStart(3, '0')}`,
            baseContactName: `Responsavel Tecnico ${index}`,
            baseContactPhone: `(11) 90000-${String(2000 + index)}`,
          },
        });
        await tx.clientContact.create({
          data: {
            clientId: client.id,
            name: `Comprador ${index}`,
            role: 'Compras',
            phone: `(11) 90000-${String(3000 + index)}`,
            email: `comprador${index}@cliente-simulacao.local`,
          },
        });
        clients.push({ client, site });
      }

      for (let index = 0; index < 15; index += 1) {
        const owner = clients[index % clients.length];
        const model = models[index];
        await tx.generator.create({
          data: {
            name: `Gerador Simulacao ${String(index + 1).padStart(2, '0')}`,
            brand: model.brand || 'MANITEC',
            serialNumber: `SIM-GMG-${String(index + 1).padStart(4, '0')}`,
            assetTag: `PAT-SIM-${String(index + 1).padStart(4, '0')}`,
            power: model.defaultPowerKva || 100,
            voltage: model.defaultVoltage,
            frequencyHz: 60,
            hourMeter: 350 + index * 275,
            condition: 'BOM',
            operationalStatus: 'OPERATING',
            lifecycleStatus: 'AVAILABLE',
            criticality: index % 5 === 0 ? 'A' : index % 2 ? 'B' : 'C',
            hasMaintenanceContract: false,
            application: index % 2 ? 'STANDBY' : 'PRIME',
            operationMode: 'AUTOMATIC',
            modelId: model.id,
            clientId: owner.client.id,
            currentSiteId: owner.site.id,
            createdByUserId: lacerda.id,
          },
        });
      }

      const suppliers: Supplier[] = [];
      for (let index = 1; index <= 5; index += 1) {
        suppliers.push(
          await tx.supplier.create({
            data: {
              companyName: `Fornecedor Tecnico Simulacao ${index} Ltda.`,
              tradeName: `Fornecedor Simulacao ${index}`,
              cnpj: `80.000.00${index}/0001-${String(20 + index).padStart(2, '0')}`,
              email: `vendas${index}@fornecedor-simulacao.local`,
              phone: `(11) 4100-${String(1000 + index)}`,
              city: 'Sao Paulo',
              state: 'SP',
              categories: ['Pecas', 'Ferramentas', 'EPIs'],
              representedBrands: [manufacturers[index - 1][0]],
              paymentTerm: index % 2 ? '28 dias' : '30/60 dias',
              qualityScore: 80 + index * 3,
              punctualityScore: 78 + index * 4,
              isActive: true,
            },
          }),
        );
      }

      const areaByCode = new Map(
        (await tx.catalogSkuArea.findMany()).map((item) => [item.code, item]),
      );
      const applicationByCode = new Map(
        (await tx.catalogSkuApplication.findMany()).map((item) => [
          item.code,
          item,
        ]),
      );
      const families = await tx.catalogSkuFamily.findMany();
      const familyFor = (areaCode: string, familyCode: string) =>
        families.find(
          (item) =>
            item.areaId === areaByCode.get(areaCode)?.id &&
            item.code === familyCode,
        );

      const classifications = {
        material: [
          areaByCode.get('M'),
          familyFor('M', 'F'),
          applicationByCode.get('D'),
        ],
        service: [
          areaByCode.get('S'),
          familyFor('S', 'M'),
          applicationByCode.get('I'),
        ],
        tool: [
          areaByCode.get('C'),
          familyFor('C', 'F'),
          applicationByCode.get('T'),
        ],
        epi: [
          areaByCode.get('C'),
          familyFor('C', 'E'),
          applicationByCode.get('T'),
        ],
      } as const;
      if (
        Object.values(classifications).some((parts) =>
          parts.some((part) => !part),
        )
      ) {
        throw new Error(
          'Classificacao SKU estrutural incompleta. Execute as migrations.',
        );
      }

      const createdItems: CatalogItem[] = [];
      const groups = [
        {
          key: 'material',
          names: materialNames,
          type: ItemType.PART,
          category: 'Pecas e materiais',
          suffix: 'MFD',
          unit: 'UN',
          startCost: 45,
        },
        {
          key: 'service',
          names: serviceNames,
          type: ItemType.SERVICE,
          category: 'Servicos tecnicos',
          suffix: 'SMI',
          unit: 'SERV',
          startCost: 280,
        },
        {
          key: 'tool',
          names: toolNames,
          type: ItemType.PART,
          category: 'Ferramentas tecnicas',
          suffix: 'CFT',
          unit: 'UN',
          startCost: 180,
        },
        {
          key: 'epi',
          names: epiNames,
          type: ItemType.PART,
          category: 'EPI',
          suffix: 'CET',
          unit: 'UN',
          startCost: 35,
        },
      ] as const;

      let skuNumber = 123456789;
      for (const group of groups) {
        const [area, family, application] = classifications[group.key];
        for (let index = 0; index < group.names.length; index += 1) {
          const cost =
            group.startCost + index * (group.key === 'service' ? 95 : 18);
          const sale = Number(
            (cost * (group.key === 'service' ? 2.1 : 1.75)).toFixed(2),
          );
          createdItems.push(
            await tx.catalogItem.create({
              data: {
                sku: `${skuNumber}${group.suffix}`,
                skuNumber,
                skuAreaId: area!.id,
                skuFamilyId: family!.id,
                skuApplicationId: application!.id,
                name: group.names[index],
                description: `${group.names[index]} para base de simulacao MANITEC.`,
                commercialDescription: `${group.names[index]} com especificacao comercial de referencia.`,
                category: group.category,
                subcategory:
                  group.key === 'epi' ? 'Protecao individual' : group.category,
                type: group.type,
                unit: group.unit,
                brand:
                  group.key === 'service' ? 'MANITEC' : manufacturers[index][0],
                manufacturerPartNumber:
                  group.key === 'service'
                    ? null
                    : `FAB-${group.suffix}-${String(index + 1).padStart(3, '0')}`,
                origin: group.key === 'service' ? null : ProductOrigin.NACIONAL,
                costPrice: cost,
                averageCost: cost,
                lastCost: cost,
                taxPercentage: group.key === 'service' ? 5 : 12,
                profitMargin: group.key === 'service' ? 35 : 28,
                basePrice: sale,
                stockCurrent: group.key === 'service' ? 0 : 15 + index * 2,
                stockMin: group.key === 'service' ? 0 : 5,
                stockMax: group.key === 'service' ? 0 : 50,
                storageLocation:
                  group.key === 'service'
                    ? null
                    : `ALM-${String((index % 5) + 1).padStart(2, '0')}`,
                technicalSpecs:
                  group.key === 'epi' ? { caCode: `CA-${30000 + index}` } : {},
                isActive: true,
              },
            }),
          );
          skuNumber += 1;
        }
      }
      await tx.$executeRawUnsafe(
        `SELECT setval('catalog_sku_number_seq', ${skuNumber - 1}, true)`,
      );

      const warehouse = await tx.warehouse.create({
        data: {
          code: 'MATRIZ',
          name: 'Almoxarifado Matriz',
          type: 'MAIN',
          isActive: true,
        },
      });

      const stockItems = createdItems.filter(
        (item) => item.type === ItemType.PART,
      );
      for (let index = 0; index < stockItems.length; index += 1) {
        const item = stockItems[index];
        await tx.inventoryBalance.create({
          data: {
            warehouseId: warehouse.id,
            catalogItemId: item.id,
            physicalQty: item.stockCurrent || 0,
            reservedQty: 0,
            minQty: item.stockMin || 0,
            maxQty: item.stockMax || 0,
            reorderPoint: 8,
          },
        });
        const supplier = suppliers[index % suppliers.length];
        await tx.supplierCatalogItem.create({
          data: {
            supplierId: supplier.id,
            catalogItemId: item.id,
            supplierSku: `FOR-${String(index + 1).padStart(4, '0')}`,
            supplierPrice: item.costPrice,
            leadTimeDays: 2 + (index % 8),
            isPrimary: true,
            purchasePaymentTerm: supplier.paymentTerm,
            priceValidFrom: new Date(),
            priceValidUntil: new Date(Date.now() + 90 * 86_400_000),
          },
        });
      }

      const tools = createdItems.filter(
        (item) => item.category === 'Ferramentas tecnicas',
      );
      const epis = createdItems.filter((item) => item.category === 'EPI');
      for (let index = 0; index < 3; index += 1) {
        await tx.hrAssetAssignment.create({
          data: {
            userId: technicianUser.id,
            catalogItemId: tools[index].id,
            assetType: HrAssetType.TOOL,
            title: tools[index].name,
            deliveredAt: new Date(),
            status: HrAssetStatus.ACTIVE,
          },
        });
        await tx.hrAssetAssignment.create({
          data: {
            userId: technicianUser.id,
            catalogItemId: epis[index].id,
            assetType: HrAssetType.EPI,
            title: epis[index].name,
            caCode: `CA-${30000 + index}`,
            deliveredAt: new Date(),
            expiresAt: new Date(Date.now() + 365 * 86_400_000),
            status: HrAssetStatus.ACTIVE,
          },
        });
      }

      const materials = createdItems.filter(
        (item) => item.category === 'Pecas e materiais',
      );
      const services = createdItems.filter(
        (item) => item.type === ItemType.SERVICE,
      );
      for (let index = 0; index < models.length; index += 1) {
        await tx.generatorModel.update({
          where: { id: models[index].id },
          data: {
            suggestedItems: {
              connect: [
                materials[index % materials.length],
                services[index % services.length],
              ].map((item) => ({ id: item.id })),
            },
          },
        });
      }
    },
    { maxWait: 20_000, timeout: 180_000 },
  );

  console.log('[seed:simulation] Base limpa criada com sucesso.');
  console.log('[seed:simulation] Preservados: Lacerda e Marcos.');
  console.log('[seed:simulation] Novo admin: rodrigo@manitec.com.br');
  console.log(
    `[seed:simulation] Senha temporaria dos novos usuarios: ${password}`,
  );
  console.log('[seed:simulation] Troque as senhas no primeiro acesso.');
  console.log(
    '[seed:simulation] 10 usuarios departamentais, 5 clientes e 5 fornecedores.',
  );
  console.log(
    '[seed:simulation] 15 modelos, 15 geradores e 60 itens de catalogo.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
