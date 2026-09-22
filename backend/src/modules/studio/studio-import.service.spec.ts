/* eslint-disable @typescript-eslint/no-unsafe-call */
import { StudioImportBatchStatus } from '@prisma/client';
import { StudioImportService } from './studio-import.service';

describe('StudioImportService - catalog import', () => {
  function setup() {
    let previewRows: any[] = [];
    const tx = {
      catalogItem: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: `item-${data.sku}` }),
          ),
      },
      catalogPricingPolicy: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'policy-part',
          salesTaxPercent: 27.25,
          icmsPercent: 18,
          pisPercent: 1.65,
          cofinsPercent: 7.6,
          ipiPercent: 0,
          issPercent: 0,
          irpjPercent: 0,
          csllPercent: 0,
          cppPercent: 0,
          commissionPercent: 2,
          profitMarginPercent: 50,
          operationalCostPercent: 0,
        }),
      },
      catalogSkuRule: {
        findFirst: jest.fn().mockResolvedValue({
          areaId: 'area-outros',
          familyId: 'family-outros',
          applicationId: 'application-outra',
          area: { code: 'O' },
          family: { code: 'O' },
          application: { code: 'O' },
        }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ nextval: 123456789 }]),
      studioImportBatch: {
        create: jest.fn().mockResolvedValue({ id: 'batch-1' }),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'batch-1', ...data }),
          ),
      },
      studioImportRow: {
        createMany: jest.fn().mockImplementation(({ data }) => {
          previewRows = data;
          return Promise.resolve({ count: data.length });
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      systemAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      studioImportBatch: {
        findUnique: jest.fn(),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'batch-1', ...data }),
          ),
      },
      studioImportRow: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new StudioImportService(prisma as never);
    return { service, prisma, tx, getPreviewRows: () => previewRows };
  }

  it('uses legacy sequence as identity and accepts repeated legacy codes', async () => {
    const { service, tx, getPreviewRows } = setup();
    const csv = [
      'CODIGO;DESCRICAO;DESCRICAOFAT;TIPODOITEM;PRECO;CUSTO;ORIGEM;SEQUENCIA',
      'P-001;Filtro;Filtro faturamento;Componente;10,50;4,25;Comprado;100',
      'P-001;Filtro repetido;;Acabado;11,00;5,00;Comprado;101',
      ';Sem codigo;;Componente;10,00;;;102',
      'P-002;Sem tipo;;;20,00;;;103',
      'P-003;Sem preco;;Servico;;;;104',
      'S-001;Manutencao;;Serviço;100.25;;;105',
    ].join('\n');

    const preview = await service.preview(
      { resource: 'catalog', originalFileName: 'Produtos.xlsx', csv },
      { role: 'ADMIN' },
    );

    expect(preview.summary).toMatchObject({
      total: 6,
      valid: 5,
      warnings: 0,
      invalid: 1,
      duplicates: 0,
    });
    expect(preview.rows[0].normalizedData).toMatchObject({
      legacyCode: 'P-001',
      name: 'Filtro',
      commercialDescription: 'Filtro faturamento',
      type: 'PART',
      acquisitionOrigin: 'Comprado',
      itemClassification: 'Componente',
      costPrice: 4.25,
      legacySequence: '100',
    });
    expect(preview.rows[0].normalizedData).not.toHaveProperty('basePrice');
    expect(preview.rows[1]).toMatchObject({
      status: 'VALID',
      normalizedData: {
        legacyCode: 'P-001',
        legacySequence: '101',
      },
    });
    expect(tx.catalogItem.findMany).toHaveBeenCalledWith({
      where: {
        legacySequence: {
          in: ['100', '101', '102', '103', '104', '105'],
        },
      },
      select: { legacySequence: true },
    });
    expect(getPreviewRows()).toHaveLength(6);
    expect(tx.catalogItem.create).not.toHaveBeenCalled();
  });

  it('accepts the Portuguese PX headers and ignores intact template examples', async () => {
    const { service, tx, getPreviewRows } = setup();
    const csv = [
      'DESCRICAO;CODIGO PX;TIPO DO ITEM;FAMILIA;SUBFAMILIA;UNIDADE;ORIGEM;MARCA;DESCRICAO COMPLEMENTAR;SEQ PX;CODIGO RADAR;NCM;CODIGO ALTERNATIVO/PARALELO;PART NUMBER;DESCRICAO FATURAMENTO;PRECO DE COMPRA;ESTOQUE MINIMO;ESTOQUE MAXIMO;LOCALIZACAO;ATIVO',
      'EXEMPLO - FILTRO;EXEMPLO-PX-0001;PECA;PECAS MECANICAS;FILTROS;PC;Comprado;FLEETGUARD;Linha guia;EXEMPLO-SEQ-PX-0001;EXEMPLO-RADAR-0001;84212300;ALT-EXEMPLO;LF9009;FILTRO EXEMPLO;10;1;5;A-01;SIM',
      'Filtro real;PX-000042;PECA;PECAS MECANICAS;FILTROS;PC;Comprado;FLEETGUARD;Filtro diesel;000123;RAD-009;84212300;ALT-42;LF-009;FILTRO DE OLEO;189,90;2;10;A-01-01;SIM',
    ].join('\n');

    const preview = await service.preview(
      { resource: 'catalog', originalFileName: 'modelo-catalogo.csv', csv },
      { role: 'ADMIN' },
    );

    expect(preview.summary).toMatchObject({
      total: 1,
      valid: 1,
      warnings: 0,
      invalid: 0,
      duplicates: 0,
    });
    expect(preview.rows[0].normalizedData).toMatchObject({
      name: 'Filtro real',
      legacyCode: 'PX-000042',
      legacySequence: '000123',
      radarCode: 'RAD-009',
      ncm: '84212300',
      alternativeCode: 'ALT-42',
      manufacturerPartNumber: 'LF-009',
      category: 'PECAS MECANICAS',
      subcategory: 'FILTROS',
      unit: 'PC',
      type: 'PART',
      costPrice: 189.9,
    });
    expect(tx.catalogItem.findMany).toHaveBeenCalledWith({
      where: { legacySequence: { in: ['000123'] } },
      select: { legacySequence: true },
    });
    expect(getPreviewRows()).toHaveLength(1);
  });

  it('marks a repeated legacy sequence as duplicate', async () => {
    const { service } = setup();
    const csv = [
      'CODIGO;SEQUENCIA;DESCRICAO;TIPODOITEM',
      'P-001;200;Filtro principal;Componente',
      'P-002;200;Filtro repetido;Componente',
    ].join('\n');

    const preview = await service.preview(
      { resource: 'catalog', originalFileName: 'Produtos.xlsx', csv },
      { role: 'ADMIN' },
    );

    expect(preview.summary).toMatchObject({
      total: 2,
      valid: 1,
      invalid: 0,
      duplicates: 1,
    });
    expect(preview.rows[0].status).toBe('VALID');
    expect(preview.rows[1]).toMatchObject({
      status: 'DUPLICATE',
      errors: [
        expect.objectContaining({
          code: 'DUPLICATE_RECORD',
          field: 'legacySequence',
        }),
      ],
    });
  });

  it('creates only valid catalog rows when the preview is confirmed', async () => {
    const { service, prisma, tx, getPreviewRows } = setup();
    const csv = [
      'CODIGO;SKU INTERNO;SEQUENCIA;DESCRICAO;TIPODOITEM;CUSTO;CODIGORADAR;ALTERNATIVO;PART NUMBER',
      'P-010;999XXX;10;Peca valida;Kit;25,90;RAD-10;ALT-10;PN-010',
      ';IGNORAR;11;Ignorar sem codigo;Componente;10,00;;;',
      'S-010;123SSS;12;Servico valido;Serviço;80,00;;;',
    ].join('\n');

    await service.preview(
      { resource: 'catalog', originalFileName: 'Produtos.xlsx', csv },
      { role: 'ADMIN' },
    );
    const storedRows = getPreviewRows();
    prisma.studioImportBatch.findUnique
      .mockResolvedValueOnce({
        id: 'batch-1',
        resource: 'catalog',
        status: StudioImportBatchStatus.PREVIEW,
        rows: storedRows.map((row) => ({
          rowNumber: row.rowNumber,
          rawData: row.rawData,
        })),
      })
      .mockResolvedValueOnce({ id: 'batch-1', rows: [] });

    await service.execute('batch-1', { role: 'ADMIN' });

    expect(tx.catalogItem.create).toHaveBeenCalledTimes(3);
    expect(tx.catalogItem.create.mock.calls[0][0].data).toMatchObject({
      sku: '123456789OOO',
      legacyCode: 'P-010',
      legacySequence: '10',
      radarCode: 'RAD-10',
      manufacturerPartNumber: 'PN-010',
      name: 'Peca valida',
      type: 'PART',
      basePrice: 46.43,
      costPrice: 25.9,
      icmsPercent: 18,
      pisPercent: 1.65,
      cofinsPercent: 7.6,
      commissionPercent: 2,
      profitMargin: 50,
      isActive: true,
    });
    expect(
      tx.catalogItem.create.mock.calls[0][0].data.identifiers.create,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: '123456789OOO', isPrimary: true }),
        expect.objectContaining({ code: 'P-010', isPrimary: false }),
        expect.objectContaining({ code: '10' }),
        expect.objectContaining({ code: 'RAD-10' }),
        expect.objectContaining({ code: 'ALT-10' }),
        expect.objectContaining({
          code: 'PN-010',
          type: 'MANUFACTURER_PART_NUMBER',
          source: 'part_number',
        }),
      ]),
    );
    const finalUpdate = prisma.studioImportBatch.update.mock.calls.at(-1)?.[0];
    expect(finalUpdate.data).toMatchObject({
      createdRows: 3,
      skippedRows: 0,
      failedRows: 0,
    });
  });
});

describe('StudioImportService - supplier import', () => {
  it('accepts an individual supplier and preserves legacy operational fields', async () => {
    let previewRows: any[] = [];
    const tx = {
      supplier: { findMany: jest.fn().mockResolvedValue([]) },
      studioImportBatch: {
        create: jest.fn().mockResolvedValue({ id: 'supplier-batch-1' }),
      },
      studioImportRow: {
        createMany: jest.fn().mockImplementation(({ data }) => {
          previewRows = data;
          return Promise.resolve({ count: data.length });
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new StudioImportService(prisma as never);

    const preview = await service.preview(
      {
        resource: 'suppliers',
        originalFileName: 'Agentes-fornecedores.csv',
        csv: [
          'Razao Social;CNPJ/CPF;Telefone;Endereco;Cidade;Estado;Inscricao Estadual;Inscricao Municipal;Observacoes;Ativo',
          'Prestador Individual;12345678901;11999999999;Rua Um, 10;Sao Paulo;SP;ISENTO;123;"Codigo legado: 42',
          'Atendimento prioritario";Inativo',
        ].join('\r\n'),
      },
      { role: 'ADMIN' },
    );

    expect(preview.summary).toMatchObject({ total: 1, valid: 1, invalid: 0 });
    expect(previewRows[0].normalizedData).toMatchObject({
      companyName: 'Prestador Individual',
      cnpj: '12345678901',
      address: 'Rua Um, 10',
      stateRegistration: 'ISENTO',
      municipalRegistration: '123',
      notes: 'Codigo legado: 42\nAtendimento prioritario',
      isActive: false,
      legacyData: expect.objectContaining({
        Observacoes: 'Codigo legado: 42\nAtendimento prioritario',
      }),
    });
  });
});

describe('StudioImportService - client import', () => {
  it('infers an individual client from CPF and preserves the complete legacy row', async () => {
    let previewRows: any[] = [];
    const tx = {
      client: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'client-1' }),
      },
      studioImportBatch: {
        create: jest.fn().mockResolvedValue({ id: 'client-batch-1' }),
      },
      studioImportRow: {
        createMany: jest.fn().mockImplementation(({ data }) => {
          previewRows = data;
          return Promise.resolve({ count: data.length });
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      systemAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-client-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      studioImportBatch: {
        findUnique: jest.fn(),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'client-batch-1', ...data }),
          ),
      },
      studioImportRow: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new StudioImportService(prisma as never);
    const csv = [
      'CODIGO;NOME;CNPJCPF;TEL1;CIDADEPRINCIPAL;UFPRINCIPAL;EMAILFINANC',
      '42;Cliente Pessoa Fisica;12345678901;11999999999;Sao Paulo;SP;financeiro@cliente.test',
    ].join('\n');

    const preview = await service.preview(
      { resource: 'clients', originalFileName: 'Agentes.xlsx', csv },
      { role: 'ADMIN' },
    );
    expect(preview.summary).toMatchObject({ total: 1, valid: 1, invalid: 0 });

    prisma.studioImportBatch.findUnique
      .mockResolvedValueOnce({
        id: 'client-batch-1',
        resource: 'clients',
        status: StudioImportBatchStatus.PREVIEW,
        rows: previewRows.map((row) => ({
          rowNumber: row.rowNumber,
          rawData: row.rawData,
        })),
      })
      .mockResolvedValueOnce({ id: 'client-batch-1', rows: [] });

    await service.execute('client-batch-1', { role: 'ADMIN' });

    expect(tx.client.create).toHaveBeenCalledTimes(1);
    expect(tx.client.create.mock.calls[0][0].data).toMatchObject({
      legacyCode: '42',
      companyName: 'Cliente Pessoa Fisica',
      cnpj: '12345678901',
      personType: 'INDIVIDUAL',
      legacyData: {
        CODIGO: '42',
        NOME: 'Cliente Pessoa Fisica',
        CNPJCPF: '12345678901',
        TEL1: '11999999999',
        CIDADEPRINCIPAL: 'Sao Paulo',
        UFPRINCIPAL: 'SP',
        EMAILFINANC: 'financeiro@cliente.test',
      },
    });
  });
});

describe('StudioImportService - equipment import', () => {
  it('resolves the client by owner name without a document and preserves technical legacy data', async () => {
    let previewRows: any[] = [];
    const tx = {
      generator: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'generator-1' }),
      },
      client: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ id: 'client-1' }]),
      },
      studioImportBatch: {
        create: jest.fn().mockResolvedValue({ id: 'equipment-batch-1' }),
      },
      studioImportRow: {
        createMany: jest.fn().mockImplementation(({ data }) => {
          previewRows = data;
          return Promise.resolve({ count: data.length });
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      systemAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-equipment-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      studioImportBatch: {
        findUnique: jest.fn(),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'equipment-batch-1', ...data }),
          ),
      },
      studioImportRow: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new StudioImportService(prisma as never);
    const csv = [
      'SEQUENCIA;EQUIPAMENTO;MOTOR;POTENCIAALTERNADOR;PROPRIETARIO;MODELOMOTOR;CAMPOEXTRA',
      '9001;GERADOR 100 KVA;MWM;100 KVA;CLIENTE TESTE;4.10 TCA;valor preservado',
    ].join('\n');

    const preview = await service.preview(
      {
        resource: 'equipments',
        originalFileName: 'Equipamento sem acessorios.xlsx',
        csv,
      },
      { role: 'ADMIN' },
    );
    expect(preview.summary).toMatchObject({ total: 1, valid: 1, invalid: 0 });

    prisma.studioImportBatch.findUnique
      .mockResolvedValueOnce({
        id: 'equipment-batch-1',
        resource: 'equipments',
        status: StudioImportBatchStatus.PREVIEW,
        rows: previewRows.map((row) => ({
          rowNumber: row.rowNumber,
          rawData: row.rawData,
        })),
      })
      .mockResolvedValueOnce({ id: 'equipment-batch-1', rows: [] });

    await service.execute('equipment-batch-1', { role: 'ADMIN' });

    expect(tx.client.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { companyName: { equals: 'CLIENTE TESTE', mode: 'insensitive' } },
          { tradeName: { equals: 'CLIENTE TESTE', mode: 'insensitive' } },
        ],
      },
      select: { id: true },
      take: 2,
    });
    expect(tx.generator.create).toHaveBeenCalledTimes(1);
    expect(tx.generator.create.mock.calls[0][0].data).toMatchObject({
      legacyCode: '9001',
      clientId: 'client-1',
      brand: 'MWM',
      power: 100,
      engineModelName: '4.10 TCA',
      legacyTechnicalData: {
        SEQUENCIA: '9001',
        EQUIPAMENTO: 'GERADOR 100 KVA',
        MOTOR: 'MWM',
        POTENCIAALTERNADOR: '100 KVA',
        PROPRIETARIO: 'CLIENTE TESTE',
        MODELOMOTOR: '4.10 TCA',
        CAMPOEXTRA: 'valor preservado',
      },
    });
  });
});
