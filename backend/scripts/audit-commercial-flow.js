/*
 * Full commercial-flow audit against a disposable, local QA database.
 * Refuses to run unless DATABASE_URL names an explicitly isolated database.
 * Usage: node scripts/audit-commercial-flow.js [--inspect | --prepare]
 */
const assert = require('node:assert/strict');
const { createHash, randomBytes } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const speakeasy = require('speakeasy');
const bcrypt = require('bcrypt');

const databaseUrl = new URL(
  process.env.DATABASE_URL || 'postgres://localhost/invalid',
);
const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
const apiBase = process.env.FLOW_QA_API_URL || 'http://127.0.0.1:3100';
const stage3 =
  databaseName === 'gridone_stage3_stage' &&
  databaseUrl.hostname === '127.0.0.1' &&
  databaseUrl.port === '5545' &&
  process.env.STAGE3_CONFIRM_FICTIONAL_SEED === 'yes';
if (
  (!stage3 && !/^gridone_flow_qa_[a-zA-Z0-9_]+$/.test(databaseName)) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname) ||
  !/^http:\/\/127\.0\.0\.1:3100$/.test(apiBase)
) {
  throw new Error(
    'Auditoria permitida somente em banco QA local explicitamente isolado e API local :3100.',
  );
}
if (!process.env.FLOW_QA_PASSWORD)
  throw new Error('Defina FLOW_QA_PASSWORD para as contas de teste.');

const prisma = new PrismaClient();
const failures = [];
const results = [];
const additionalChecks = [];
const round = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const datePlus = (days) => new Date(Date.now() + days * 86400000).toISOString();

async function prepareIsolatedFixtures() {
  const issuers = await prepareFiscalIssuers();
  for (const [technicianType, unitPrice] of [
    ['ASSISTANT', 100],
    ['JUNIOR_TECHNICIAN', 150],
  ]) {
    await prisma.proposalHourlyRate.upsert({
      where: {
        hourType_technicianType: { hourType: 'ONE_OFF', technicianType },
      },
      create: {
        hourType: 'ONE_OFF',
        technicianType,
        unitPrice,
        isActive: true,
        notes: 'QA ISOLADA - valor ficticio',
      },
      update: {
        unitPrice,
        isActive: true,
        notes: 'QA ISOLADA - valor ficticio',
      },
    });
  }
  for (const purpose of ['PARTS', 'SERVICES']) {
    const issuer = purpose === 'PARTS' ? issuers[1] : issuers[0];
    const name = `QA ISOLADA ${purpose} - NUNCA PAGAR`;
    const existing = await prisma.proposalPaymentProfile.findFirst({
      where: { name, purpose },
    });
    const data = {
      name,
      purpose,
      method: 'PIX',
      issuerCompanyId: issuer.id,
      beneficiary: issuer.companyName,
      beneficiaryDocument: issuer.cnpj,
      pixKey: `${purpose.toLowerCase()}@qa.invalid`,
      pixCopyPaste: `QA-FLOW-${purpose}-NAO-PAGAR`,
      isActive: true,
    };
    if (existing)
      await prisma.proposalPaymentProfile.update({
        where: { id: existing.id },
        data,
      });
    else await prisma.proposalPaymentProfile.create({ data });
  }
}

async function prepareCustomerUser(clientId) {
  const email = 'flow.qa.customer@manitec.local';
  const passwordHash = await bcrypt.hash(process.env.FLOW_QA_PASSWORD, 10);
  await prisma.user.upsert({
    where: { email },
    create: {
      name: 'Cliente QA Isolada',
      email,
      passwordHash,
      role: 'CLIENT',
      linkedClientId: clientId,
      regionTags: [],
      isActive: true,
    },
    update: {
      passwordHash,
      linkedClientId: clientId,
      role: 'CLIENT',
      isActive: true,
    },
  });
}

async function prepareWarehouse() {
  return prisma.warehouse.upsert({
    where: { code: 'QA-FLOW-ISOLATED' },
    create: {
      code: 'QA-FLOW-ISOLATED',
      name: 'Almoxarifado QA isolado',
      isActive: true,
    },
    update: { isActive: true },
  });
}

async function prepareFiscalIssuers() {
  const issuers = [];
  for (const suffix of ['A', 'B']) {
    issuers.push(
      await prisma.companySettings.upsert({
        where: { key: `qa-flow-issuer-${suffix.toLowerCase()}` },
        create: {
          key: `qa-flow-issuer-${suffix.toLowerCase()}`,
          companyName: `EMITENTE QA ${suffix} - NAO EMITIR`,
          cnpj: suffix === 'A' ? '00000000000000' : '11111111111111',
          stateRegistration: 'QA-SOMENTE-TESTE',
          municipalRegistration: 'QA-SOMENTE-TESTE',
          taxRegime: 'QA',
          address: 'Rua Teste QA',
          addressNumber: '1',
          district: 'Centro',
          city: 'Indaiatuba',
          state: 'SP',
          zipCode: '13330000',
        },
        update: {},
      }),
    );
  }
  return issuers;
}

async function prepareBankPayer(clientId) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { addresses: true },
  });
  if (
    !client.cnpj ||
    ![11, 14].includes(client.cnpj.replace(/\D/g, '').length)
  ) {
    await prisma.client.update({
      where: { id: clientId },
      data: { cnpj: '99999999999999' },
    });
  }
  const billing = client.addresses.find((row) => row.type === 'BILLING');
  const addressData = {
    type: 'BILLING',
    street: 'Rua QA isolada',
    number: '1',
    district: 'Centro',
    zipCode: '13330000',
    city: 'Indaiatuba',
    state: 'SP',
  };
  if (billing)
    await prisma.clientAddress.update({
      where: { id: billing.id },
      data: addressData,
    });
  else
    await prisma.clientAddress.create({ data: { ...addressData, clientId } });
}

async function request(token, path, method = 'GET', body) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = raw;
  }
  if (!response.ok) {
    throw new Error(
      `${method} ${path}: HTTP ${response.status} ${JSON.stringify(payload).slice(0, 500)}`,
    );
  }
  return payload;
}

async function expectHttpError(
  token,
  path,
  method,
  body,
  allowedStatuses = [400, 403, 409],
) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(
    allowedStatuses.includes(response.status),
    `${method} ${path}: esperado ${allowedStatuses}, recebido ${response.status}`,
  );
  return response.status;
}

async function login(email) {
  const response = await request(null, '/auth/login', 'POST', {
    email,
    password: process.env.FLOW_QA_PASSWORD,
    mfaCode: speakeasy.totp({ secret: 'JBSWY3DPEHPK3PXP', encoding: 'base32' }),
  });
  assert.ok(response.access_token, `Login sem token: ${email}`);
  return response;
}

async function candidates() {
  const rows = await prisma.client.findMany({
    where: {
      ...(stage3 ? { email: { endsWith: '@stage3.invalid' } } : {}),
      isActive: true,
      proposalCreationBlocked: false,
      isDelinquent: false,
      generators: {
        some: {
          baseItems: {
            some: {
              catalogItem: {
                isActive: true,
                type: 'PART',
                basePrice: { gt: 0 },
              },
            },
          },
        },
      },
    },
    select: {
      id: true,
      companyName: true,
      cnpj: true,
      generators: {
        where: {
          baseItems: {
            some: {
              catalogItem: {
                isActive: true,
                type: 'PART',
                basePrice: { gt: 0 },
              },
            },
          },
        },
        take: 1,
        select: {
          id: true,
          name: true,
          currentSiteId: true,
          baseItems: {
            where: {
              catalogItem: {
                isActive: true,
                type: 'PART',
                basePrice: { gt: 0 },
              },
            },
            take: 3,
            select: {
              quantity: true,
              catalogItem: {
                select: {
                  id: true,
                  name: true,
                  basePrice: true,
                  manufacturerPartNumber: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { companyName: 'asc' },
    take: 12,
  });
  if (rows.length < 12)
    throw new Error(
      `Apenas ${rows.length} clientes elegiveis com gerador/peca; minimo 12.`,
    );
  return rows;
}

function scenario(index, client, service, rates, avulsa) {
  const machinePart = client.generators[0].baseItems[0].catalogItem;
  const cases = [
    {
      name: 'peca-maquina',
      type: 'PARTS',
      items: [
        {
          catalogItemId: machinePart.id,
          kind: 'PART_MATERIAL',
          quantity: 2,
          unitPrice: machinePart.basePrice,
        },
      ],
    },
    {
      name: 'peca-avulsa',
      type: 'PARTS',
      items: [
        {
          catalogItemId: avulsa.id,
          kind: 'PART_MATERIAL',
          quantity: 1,
          unitPrice: avulsa.basePrice,
        },
      ],
    },
    {
      name: 'servico-catalogo',
      type: 'SERVICES',
      items: [
        {
          catalogItemId: service.id,
          kind: 'CATALOG_SERVICE',
          quantity: 1,
          unitPrice: service.basePrice,
        },
      ],
    },
    {
      name: 'hora-junior',
      type: 'SERVICES',
      items: [
        {
          kind: 'HOURLY_SERVICE',
          description: 'Atendimento tecnico junior',
          hourType: 'ONE_OFF',
          technicianType: 'JUNIOR_TECHNICIAN',
          hours: 2.5,
          quantity: 3,
          unitPrice: 1,
        },
      ],
    },
    {
      name: 'misto-maquina-hora',
      type: 'PARTS_AND_SERVICES',
      items: [
        {
          catalogItemId: machinePart.id,
          kind: 'PART_MATERIAL',
          quantity: 1,
          unitPrice: machinePart.basePrice,
        },
        {
          kind: 'HOURLY_SERVICE',
          hourType: 'ONE_OFF',
          technicianType: 'JUNIOR_TECHNICIAN',
          hours: 3,
          quantity: 3,
          unitPrice: 1,
        },
      ],
    },
    {
      name: 'contrato',
      type: 'CONTRACT',
      items: [
        {
          catalogItemId: service.id,
          kind: 'CATALOG_SERVICE',
          quantity: 1,
          unitPrice: service.basePrice,
        },
      ],
    },
    {
      name: 'peca-maquina-desconto',
      type: 'PARTS',
      items: [
        {
          catalogItemId: machinePart.id,
          kind: 'PART_MATERIAL',
          quantity: 3,
          unitPrice: machinePart.basePrice,
          discountPercent: 5,
        },
      ],
    },
    {
      name: 'peca-avulsa-quantidade',
      type: 'PARTS',
      items: [
        {
          catalogItemId: avulsa.id,
          kind: 'PART_MATERIAL',
          quantity: 4,
          unitPrice: avulsa.basePrice,
        },
      ],
    },
    {
      name: 'servico-mais-hora',
      type: 'SERVICES',
      items: [
        {
          catalogItemId: service.id,
          kind: 'CATALOG_SERVICE',
          quantity: 2,
          unitPrice: service.basePrice,
        },
        {
          kind: 'HOURLY_SERVICE',
          hourType: 'ONE_OFF',
          technicianType: 'JUNIOR_TECHNICIAN',
          hours: 1,
          quantity: 1,
          unitPrice: 1,
        },
      ],
    },
    {
      name: 'hora-assistente',
      type: 'SERVICES',
      items: [
        {
          kind: 'HOURLY_SERVICE',
          hourType: 'ONE_OFF',
          technicianType: 'ASSISTANT',
          hours: 4,
          quantity: 4,
          unitPrice: 1,
        },
      ],
    },
    {
      name: 'misto-avulsa-servico',
      type: 'PARTS_AND_SERVICES',
      items: [
        {
          catalogItemId: avulsa.id,
          kind: 'PART_MATERIAL',
          quantity: 1,
          unitPrice: avulsa.basePrice,
        },
        {
          catalogItemId: service.id,
          kind: 'CATALOG_SERVICE',
          quantity: 1,
          unitPrice: service.basePrice,
        },
      ],
    },
    {
      name: 'pecas-multiplas-maquina',
      type: 'PARTS',
      items: client.generators[0].baseItems
        .slice(0, 2)
        .map((row) => ({
          catalogItemId: row.catalogItem.id,
          kind: 'PART_MATERIAL',
          quantity: row.quantity,
          unitPrice: row.catalogItem.basePrice,
        })),
    },
  ];
  const selected = cases[index];
  for (const item of selected.items)
    if (item.kind === 'HOURLY_SERVICE') {
      assert.ok(
        rates.some(
          (r) =>
            r.hourType === item.hourType &&
            r.technicianType === item.technicianType,
        ),
        `Tarifa ausente: ${item.technicianType}`,
      );
    }
  return selected;
}

async function auditCase(index, client, setup) {
  const itemCase = scenario(
    index,
    client,
    setup.service,
    setup.rates,
    setup.avulsa,
  );
  const generator = client.generators[0];
  const label = `QA-FLOW-${String(index + 1).padStart(2, '0')}-${itemCase.name}`;
  const result = {
    case: label,
    clientId: client.id,
    client: client.companyName,
    generatorId: generator.id,
    type: itemCase.type,
    steps: [],
  };
  results.push(result);
  const step = (name, value) => {
    result.steps.push(name);
    return value;
  };
  try {
    const opportunity = step(
      'oportunidade',
      await request(setup.sales.access_token, '/crm/opportunities', 'POST', {
        title: label,
        clientId: client.id,
        assignedSellerId: setup.sales.user.id,
        pipeline: 'COMMERCIAL_03_PARTS_SERVICES',
        opportunityType:
          itemCase.type === 'PARTS' ? 'PARTS_SALE' : 'FIELD_SERVICE',
        estimatedValue: 1000,
        source: 'QA_ISOLATED_FULL_FLOW',
        expectedCloseDate: datePlus(30),
      }),
    );
    result.opportunityId = opportunity.id;
    const activity = step(
      'atividade-e-prazo',
      await request(setup.sales.access_token, '/crm/activities', 'POST', {
        clientId: client.id,
        opportunityId: opportunity.id,
        type: 'TASK',
        subject: `Retorno comercial ${label}`,
        dueAt: datePlus(2),
      }),
    );
    assert.equal(activity.opportunityId, opportunity.id);
    const proposalBody = {
      clientId: client.id,
      salesOpportunityId: opportunity.id,
      generatorId: generator.id,
      userId: setup.sales.user.id,
      type: itemCase.type,
      scope: label,
      validUntil: datePlus(30),
      firstDueDate: datePlus(15),
      installmentCount: itemCase.type === 'CONTRACT' ? 3 : 1,
      installmentIntervalDays: 30,
      paymentTerm: 'Mensal',
      items: itemCase.items,
      ...(setup.partsProfile &&
      itemCase.items.some((i) => i.kind === 'PART_MATERIAL')
        ? { partsPaymentProfileId: setup.partsProfile.id }
        : {}),
      ...(setup.servicesProfile &&
      itemCase.items.some((i) => i.kind !== 'PART_MATERIAL')
        ? { servicesPaymentProfileId: setup.servicesProfile.id }
        : {}),
    };
    const proposal = step(
      'proposta',
      await request(
        setup.sales.access_token,
        '/proposals',
        'POST',
        proposalBody,
      ),
    );
    result.proposalId = proposal.id;
    assert.equal(proposal.status, 'DRAFT');
    assert.equal(proposal.salesOpportunityId, opportunity.id);
    const expected = round(
      proposal.items.reduce((sum, item) => sum + item.totalPrice, 0),
    );
    assert.equal(
      round(proposal.totalValue),
      expected,
      'Total da proposta diverge da soma dos itens',
    );
    for (const item of proposal.items.filter(
      (i) => i.kind === 'HOURLY_SERVICE',
    )) {
      const rate = setup.rates.find(
        (r) =>
          r.hourType === item.hourType &&
          r.technicianType === item.technicianType,
      );
      assert.equal(
        item.unitPrice,
        rate.unitPrice,
        'Preco por hora nao corresponde a tabela Studio',
      );
    }
    step(
      'diretoria',
      await request(
        setup.sales.access_token,
        `/proposals/${proposal.id}/submit-board`,
        'POST',
        {},
      ),
    );
    const approved = step(
      'aprovacao-diretoria',
      await request(
        setup.admin.access_token,
        `/proposals/${proposal.id}/board-approve`,
        'POST',
        {},
      ),
    );
    assert.equal(approved.status, 'CLIENT_REVIEW');
    const approvedByPortal = index === 4;
    const won = step(
      approvedByPortal ? 'aprovacao-portal-cliente' : 'aprovacao-cliente',
      approvedByPortal
        ? await request(
            setup.customer.access_token,
            `/customer-portal/proposals/${proposal.id}/approve`,
            'POST',
            { note: 'Aprovado no teste isolado' },
          )
        : await request(
            setup.admin.access_token,
            `/proposals/${proposal.id}/client-approve`,
            'POST',
            {},
          ),
    );
    const wonProposal = won.proposal || won;
    assert.equal(wonProposal.status, 'WON');
    const updatedOpportunity = await prisma.salesOpportunity.findUnique({
      where: { id: opportunity.id },
    });
    assert.equal(
      updatedOpportunity.stage,
      'WON',
      'Oportunidade nao foi ganha com a proposta',
    );
    let orderId = won.ordemDeServico?.id;
    if (approvedByPortal) {
      const portalOrders = await prisma.maintenanceOrder.findMany({
        where: {
          generatorId: generator.id,
          title: `OS Automatica - Proposta ${proposal.code}`,
        },
      });
      assert.equal(
        portalOrders.length,
        1,
        'Aprovacao pelo portal nao gerou exatamente uma OS',
      );
      orderId = portalOrders[0].id;
    }
    if (itemCase.type === 'PARTS') {
      const sale = await prisma.salesOrder.findUnique({
        where: { proposalId: proposal.id },
        include: { items: true },
      });
      assert.ok(sale, 'Aprovacao de pecas nao criou pedido de venda');
      assert.equal(sale.items.length, proposal.items.length);
      result.salesOrderId = sale.id;
      await expectHttpError(
        setup.finance.access_token,
        `/finance/receivables/sync/sales-orders/${sale.id}`,
        'POST',
        { dueDate: datePlus(15) },
        [400],
      );
      await request(setup.admin.access_token, '/inventory/adjust', 'POST', {
        warehouseId: setup.warehouseId,
        reason: `${label}: entrada ficticia`,
        items: sale.items.map((item) => ({ catalogItemId: item.catalogItemId, delta: item.quantity })),
      });
      for (const item of sale.items) {
        const stock = {
          itemId: item.id,
          warehouseId: setup.warehouseId,
          quantity: item.quantity,
        };
        step('reserva-peca', await request(setup.admin.access_token, `/sales-orders/${sale.id}/reserve`, 'POST', stock));
        step('separacao-peca', await request(setup.admin.access_token, `/sales-orders/${sale.id}/pick`, 'POST', stock));
      }
      const delivery = step('entrega', await request(setup.admin.access_token, `/sales-orders/${sale.id}/deliveries`, 'POST', {
        receivedByName: 'Recebedor QA ficticio',
        items: sale.items.map((item) => ({
          itemId: item.id,
          warehouseId: setup.warehouseId,
          quantity: item.quantity,
        })),
      }));
      assert.equal(delivery.status, 'DELIVERED');
      const ar = step('faturamento-pedido', await request(setup.finance.access_token, `/finance/receivables/sync/sales-orders/${sale.id}`, 'POST', {
        dueDate: datePlus(15),
      }));
      const duplicate = await request(setup.finance.access_token, `/finance/receivables/sync/sales-orders/${sale.id}`, 'POST', {
        dueDate: datePlus(15),
      });
      assert.equal(duplicate.id, ar.id, 'Pedido duplicou titulo');
      assert.equal(ar.clientId, client.id);
      assert.equal(round(ar.netAmount), expected);
      result.receivableIds = [ar.id];
    } else if (itemCase.type === 'CONTRACT') {
      const converted = step(
        'contrato',
        await request(
          setup.admin.access_token,
          `/proposals/${proposal.id}/convert-contract`,
          'POST',
          {},
        ),
      );
      result.contractId = converted.contract?.id;
      assert.ok(result.contractId, 'Contrato nao gerado');
      const ar = await prisma.accountsReceivable.findMany({
        where: { contractId: result.contractId },
      });
      assert.ok(ar.length > 0, 'Contrato sem contas a receber');
      result.receivableIds = ar.map((entry) => entry.id);
      const generated = step(
        'ordens-preventivas',
        await request(
          setup.admin.access_token,
          `/contracts/${result.contractId}/generate-orders?daysAhead=400`,
          'POST',
          {},
        ),
      );
      const again = await request(
        setup.admin.access_token,
        `/contracts/${result.contractId}/generate-orders?daysAhead=400`,
        'POST',
        {},
      );
      assert.equal(again.createdCount, 0, 'Geracao duplicou OS preventiva');
      result.generatedOrders = generated.createdCount;
      const preventiveOrder = await prisma.maintenanceOrder.findFirst({
        where: { contractId: result.contractId },
        orderBy: { openedAt: 'asc' },
      });
      assert.ok(preventiveOrder, 'Contrato nao gerou OS preventiva');
      await request(
        setup.admin.access_token,
        `/maintenance-orders/${preventiveOrder.id}`,
        'PATCH',
        { status: 'IN_PROGRESS', startedAt: new Date().toISOString() },
      );
      const preventiveCompleted = step(
        'execucao-preventiva',
        await request(
          setup.admin.access_token,
          `/maintenance-orders/${preventiveOrder.id}`,
          'PATCH',
          { status: 'COMPLETED', finishedAt: new Date().toISOString(), laborHours: 2 },
        ),
      );
      assert.equal(preventiveCompleted.status, 'COMPLETED');
    } else if (orderId) {
      result.orderId = orderId;
      const order = step(
        'ordem-servico',
        await request(
          setup.admin.access_token,
          `/maintenance-orders/${orderId}`,
        ),
      );
      assert.equal(order.generatorId, generator.id);
      const proposedParts = proposal.items.filter(
        (item) => item.kind === 'PART_MATERIAL' && item.catalogItemId,
      );
      if (proposedParts.length) {
        const orderParts = await prisma.maintenanceOrderMaterial.findMany({
          where: { orderId },
        });
        for (const part of proposedParts) {
          assert.ok(
            orderParts.some(
              (material) =>
                material.catalogItemId === part.catalogItemId &&
                material.quantity === part.quantity,
            ),
            `Peca ${part.catalogItemId} da proposta nao consta na OS`,
          );
        }
        await request(setup.admin.access_token, '/inventory/adjust', 'POST', {
          warehouseId: setup.warehouseId,
          reason: `${label}: entrada ficticia na copia QA`,
          items: proposedParts.map((part) => ({
            catalogItemId: part.catalogItemId,
            delta: part.quantity,
          })),
        });
        step(
          'estoque-reserva',
          await request(
            setup.admin.access_token,
            `/maintenance-orders/${orderId}`,
            'PATCH',
            {
              materials: proposedParts.map((part) => ({
                catalogItemId: part.catalogItemId,
                warehouseId: setup.warehouseId,
                quantity: part.quantity,
              })),
            },
          ),
        );
      }
      await request(
        setup.admin.access_token,
        `/maintenance-orders/${orderId}`,
        'PATCH',
        { status: 'IN_PROGRESS', startedAt: new Date().toISOString() },
      );
      const completed = step(
        'execucao',
        await request(
          setup.admin.access_token,
          `/maintenance-orders/${orderId}`,
          'PATCH',
          {
            status: 'COMPLETED',
            finishedAt: new Date().toISOString(),
            laborHours: 1,
          },
        ),
      );
      assert.equal(completed.status, 'COMPLETED');
      if (proposedParts.length) {
        const applied = await prisma.maintenanceOrderMaterial.findMany({
          where: { orderId },
        });
        assert.ok(
          applied.every(
            (material) =>
              material.appliedAt && material.warehouseId === setup.warehouseId,
          ),
          'Materiais nao foram baixados do almoxarifado',
        );
      }
      const billed = await prisma.accountsReceivable.findMany({
        where: { maintenanceOrderId: orderId, status: { not: 'CANCELED' } },
      });
      assert.ok(billed.length > 0, 'OS concluida sem titulo financeiro');
      assert.equal(round(billed.reduce((sum, row) => sum + row.netAmount, 0)), expected);
      assert.ok(billed.every((row) => row.clientId === client.id));
      const repeated = step('faturamento-os-idempotente', await request(setup.finance.access_token, `/finance/execution-billing/orders/${orderId}/confirm`, 'POST', { dueDate: datePlus(15) }));
      assert.equal(repeated.status, 'ALREADY_BILLED');
      assert.equal((await prisma.accountsReceivable.count({ where: { maintenanceOrderId: orderId } })), billed.length);
      result.receivableIds = billed.map((row) => row.id);
      if (setup.bankAccountId) {
        const ar = billed[0];
        const paid = step(
          'baixa-financeira',
          await request(
            setup.finance.access_token,
            `/finance/receivables/${ar.id}/pay`,
            'PATCH',
            {
              amount: ar.netAmount,
              method: 'PIX',
              bankAccountId: setup.bankAccountId,
              paidAt: new Date().toISOString(),
              notes: label,
            },
          ),
        );
        assert.equal(paid.status, 'PAID', 'Titulo nao foi quitado');
        assert.equal(round(paid.paidAmount), round(ar.netAmount));
      }
    } else {
      result.steps.push('sem-os-automatica');
    }
    const movements = await prisma.proposalMovement.count({
      where: { proposalId: proposal.id },
    });
    assert.ok(movements >= 4, 'Historico comercial incompleto');
    result.total = expected;
    result.status = 'PASS';
  } catch (error) {
    result.status = 'FAIL';
    result.error = error.message;
    failures.push(`${label}: ${error.message}`);
  }
}

async function auditFinanceAndValidation(setup) {
  async function check(name, action) {
    try {
      const data = await action();
      additionalChecks.push({ name, status: 'PASS', ...data });
      console.log(`PASS ${name}`);
    } catch (error) {
      additionalChecks.push({ name, status: 'FAIL', error: error.message });
      failures.push(`${name}: ${error.message}`);
      console.log(`FAIL ${name}: ${error.message}`);
    }
  }
  const service = results[2];
  const parts = results[0];
  const contract = results[5];

  await check('contrato-baixa-e-fatura', async () => {
    const receivable = await prisma.accountsReceivable.findFirst({
      where: { contractId: contract.contractId, status: 'OPEN' },
      orderBy: { dueDate: 'asc' },
    });
    assert.ok(receivable, 'Contrato sem parcela aberta');
    const paid = await request(
      setup.finance.access_token,
      `/finance/receivables/${receivable.id}/pay`,
      'PATCH',
      {
        amount: receivable.netAmount,
        method: 'PIX',
        bankAccountId: setup.bankAccountId,
        paidAt: new Date().toISOString(),
      },
    );
    assert.equal(paid.status, 'PAID');
    const invoice = await prisma.contractInvoice.findFirst({
      where: {
        contractId: contract.contractId,
        competenceDate: receivable.competenceDate,
      },
    });
    assert.equal(
      invoice?.status,
      'PAID',
      'Parcela do contrato nao refletiu baixa',
    );
    await expectHttpError(
      setup.finance.access_token,
      `/finance/receivables/${receivable.id}/pay`,
      'PATCH',
      {
        amount: receivable.netAmount,
        method: 'PIX',
        bankAccountId: setup.bankAccountId,
      },
      [400],
    );
    return { receivableId: receivable.id };
  });
  await check('fiscal-nfse-rascunho', async () => {
    const draft = await request(
      setup.finance.access_token,
      '/finance/fiscal-documents/drafts',
      'POST',
      {
        receivableId: service.receivableIds[0],
        issuerCompanyId: setup.issuers[0].id,
        kind: 'NFSE',
        items: [
          {
            description: 'Servico QA isolado',
            quantity: 1,
            unitAmount: service.total,
            serviceCode: '1401',
          },
        ],
      },
    );
    assert.equal(draft.status, 'DRAFT');
    assert.equal(draft.issuerCompanyId, setup.issuers[0].id);
    assert.equal(Number(draft.totalAmount), service.total);
    return { draftId: draft.id, checklist: draft.checklist };
  });
  await check('fiscal-nfe-rascunho-pecas', async () => {
    const draft = await request(
      setup.finance.access_token,
      '/finance/fiscal-documents/drafts',
      'POST',
      {
        receivableId: parts.receivableIds[0],
        issuerCompanyId: setup.issuers[1].id,
        kind: 'NFE',
        items: [
          {
            description: 'Peca QA isolada',
            quantity: 1,
            unitAmount: parts.total,
            ncm: '84099999',
            cfop: '5102',
          },
        ],
      },
    );
    assert.equal(draft.status, 'DRAFT');
    assert.equal(draft.issuerCompanyId, setup.issuers[1].id);
    assert.equal(Number(draft.totalAmount), parts.total);
    return {
      draftId: draft.id,
      receivableId: parts.receivableIds[0],
      checklist: draft.checklist,
      salesOrderId: parts.salesOrderId,
    };
  });
  await check('santander-remessa-homologacao', async () => {
    await prepareBankPayer(contract.clientId);
    const bank = await request(
      setup.finance.access_token,
      '/finance/bank-accounts',
      'POST',
      {
        name: `QA SANTANDER ${Date.now()} - NAO ENVIAR`,
        bankName: 'Santander',
        agency: '1234',
        accountNumber: '123456789',
        initialBalance: 0,
      },
    );
    const agreement = await request(
      setup.finance.access_token,
      '/finance/collections/agreement',
      'POST',
      {
        bankAccountId: bank.id,
        issuerCompanyId: setup.issuers[0].id,
        transmissionCode: '123456789012345',
        beneficiaryName: 'QA ISOLADA NAO ENVIAR',
        beneficiaryDocument: setup.issuers[0].cnpj,
        agency: '1234',
        agencyDigit: '5',
        accountNumber: '123456789',
        accountDigit: '0',
      },
    );
    assert.equal(agreement.homologated, false);
    const ar = await prisma.accountsReceivable.findFirst({
      where: { contractId: contract.contractId, status: 'OPEN' },
      orderBy: { dueDate: 'asc' },
    });
    assert.ok(ar, 'Sem parcela de contrato aberta para boleto');
    const title = await request(
      setup.finance.access_token,
      '/finance/collections/titles',
      'POST',
      { receivableId: ar.id, bankAccountId: bank.id },
    );
    assert.ok(title.ourNumber);
    const batch = await request(
      setup.finance.access_token,
      '/finance/collections/batches',
      'POST',
      { bankAccountId: bank.id, titleIds: [title.id] },
    );
    assert.equal(batch.titleCount, 1);
    assert.equal(batch.homologated, false);
    const downloaded = await fetch(
      `${apiBase}/finance/collections/batches/${batch.id}/download`,
      { headers: { authorization: `Bearer ${setup.finance.access_token}` } },
    );
    assert.equal(downloaded.status, 200);
    const cnab = await downloaded.text();
    const lines = cnab.split(/\r?\n/).filter(Boolean);
    assert.ok(lines.length >= 6, 'Remessa incompleta');
    assert.ok(
      lines.every((line) => line.length === 240),
      'Registro CNAB nao tem 240 posicoes',
    );
    await expectHttpError(
      setup.finance.access_token,
      `/finance/collections/batches/${batch.id}/sent`,
      'POST',
      {},
      [400],
    );
    return { batchId: batch.id, records: lines.length, homologated: false };
  });
  await check('validacao-cliente-gerador', async () => {
    await expectHttpError(
      setup.sales.access_token,
      '/proposals',
      'POST',
      {
        clientId: results[0].clientId,
        generatorId: results[1].generatorId,
        userId: setup.sales.user.id,
        type: 'PARTS',
        items: [
          {
            catalogItemId: setup.avulsa.id,
            kind: 'PART_MATERIAL',
            quantity: 1,
            unitPrice: setup.avulsa.basePrice,
          },
        ],
      },
      [400],
    );
    return {};
  });
  await check('aceite-link-assinado-servico', async () => {
    const reference = results[3];
    const opportunity = await request(setup.sales.access_token, '/crm/opportunities', 'POST', {
      title: 'QA-FLOW-LINK-ASSINADO', clientId: reference.clientId,
      assignedSellerId: setup.sales.user.id, opportunityType: 'FIELD_SERVICE', source: 'QA_ISOLATED_FULL_FLOW',
    });
    const proposal = await request(setup.sales.access_token, '/proposals', 'POST', {
      clientId: reference.clientId, generatorId: reference.generatorId, salesOpportunityId: opportunity.id,
      userId: setup.sales.user.id, type: 'SERVICES', scope: 'QA link assinado',
      validUntil: datePlus(30), paymentTerm: 'Mensal',
      servicesPaymentProfileId: setup.servicesProfile.id,
      items: [{ catalogItemId: setup.service.id, kind: 'CATALOG_SERVICE', quantity: 1, unitPrice: setup.service.basePrice }],
    });
    await request(setup.sales.access_token, `/proposals/${proposal.id}/submit-board`, 'POST', {});
    await request(setup.admin.access_token, `/proposals/${proposal.id}/board-approve`, 'POST', {});
    const token = randomBytes(24).toString('hex');
    const share = await prisma.documentShareToken.create({
      data: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
        documentType: 'PROPOSAL', documentId: proposal.id, documentCode: proposal.code,
        clientId: reference.clientId, createdByUserId: setup.sales.user.id, expiresAt: new Date(datePlus(7)),
      },
    });
    await prisma.documentDelivery.create({
      data: {
        documentType: 'PROPOSAL', documentId: proposal.id, documentCode: proposal.code,
        clientId: reference.clientId, channel: 'WHATSAPP', recipientTarget: 'QA-SEM-ENVIO',
        shareTokenId: share.id, createdByUserId: setup.sales.user.id,
      },
    });
    const approved = await request(null, `/deliveries/share/${token}/proposal-approval`, 'POST', {
      signerName: 'Cliente QA Isolada', signerCpf: '12345678909', signatureData: 'ASSINATURA QA SEM VALIDADE',
      note: 'Aprovado em copia isolada',
    });
    assert.equal(approved.proposal.status, 'WON');
    const orders = await prisma.maintenanceOrder.findMany({ where: { title: `OS Automatica - Proposta ${proposal.code}` } });
    assert.equal(orders.length, 1, 'Aceite assinado nao criou exatamente uma OS');
    await expectHttpError(null, `/deliveries/share/${token}/proposal-approval`, 'POST', {
      signerName: 'Cliente QA Isolada', signerCpf: '12345678909', signatureData: 'ASSINATURA QA SEM VALIDADE',
    }, [400]);
    return { proposalId: proposal.id, orderId: orders[0].id };
  });
  await check('revisao-financeira-sem-vencimento', async () => {
    const reference = results[2];
    const opportunity = await request(setup.sales.access_token, '/crm/opportunities', 'POST', {
      title: 'QA-FLOW-REVISAO-FINANCEIRA', clientId: reference.clientId,
      assignedSellerId: setup.sales.user.id, opportunityType: 'FIELD_SERVICE', source: 'QA_ISOLATED_FULL_FLOW',
    });
    const proposal = await request(setup.sales.access_token, '/proposals', 'POST', {
      clientId: reference.clientId, generatorId: reference.generatorId, salesOpportunityId: opportunity.id,
      userId: setup.sales.user.id, type: 'SERVICES', scope: 'QA revisao financeira sem vencimento',
      validUntil: datePlus(30), paymentTerm: 'Mensal',
      servicesPaymentProfileId: setup.servicesProfile.id,
      items: [{ catalogItemId: setup.service.id, kind: 'CATALOG_SERVICE', quantity: 1, unitPrice: setup.service.basePrice }],
    });
    await request(setup.sales.access_token, `/proposals/${proposal.id}/submit-board`, 'POST', {});
    await request(setup.admin.access_token, `/proposals/${proposal.id}/board-approve`, 'POST', {});
    const won = await request(setup.admin.access_token, `/proposals/${proposal.id}/client-approve`, 'POST', {});
    const orderId = won.ordemDeServico?.id;
    assert.ok(orderId);
    await request(setup.admin.access_token, `/maintenance-orders/${orderId}`, 'PATCH', {
      status: 'IN_PROGRESS', startedAt: new Date().toISOString(),
    });
    await request(setup.admin.access_token, `/maintenance-orders/${orderId}`, 'PATCH', {
      status: 'COMPLETED', finishedAt: new Date().toISOString(), laborHours: 1,
    });
    assert.equal(await prisma.accountsReceivable.count({ where: { maintenanceOrderId: orderId } }), 0);
    const queue = await request(setup.finance.access_token, '/finance/execution-billing/queue');
    assert.ok(queue.some((entry) => entry.id === orderId));
    await expectHttpError(setup.finance.access_token, `/finance/receivables/sync/orders/${orderId}`, 'POST', {
      amount: 1, dueDate: datePlus(15), description: 'Valor divergente QA',
    }, [400]);
    const billed = await request(setup.finance.access_token, `/finance/execution-billing/orders/${orderId}/confirm`, 'POST', { dueDate: datePlus(15) });
    assert.equal(billed.status, 'CREATED');
    const again = await request(setup.finance.access_token, `/finance/execution-billing/orders/${orderId}/confirm`, 'POST', { dueDate: datePlus(15) });
    assert.equal(again.status, 'ALREADY_BILLED');
    const receivables = await prisma.accountsReceivable.findMany({ where: { maintenanceOrderId: orderId } });
    assert.equal(receivables.length, billed.receivableIds.length);
    assert.equal(round(receivables.reduce((sum, row) => sum + row.netAmount, 0)), round(proposal.totalValue));
    return { proposalId: proposal.id, orderId, receivableIds: billed.receivableIds };
  });
  await check('permissao-comercial-sem-baixa-financeira', async () => {
    const receivableId = parts.receivableIds[0];
    await expectHttpError(setup.sales.access_token, `/finance/receivables/${receivableId}/pay`, 'PATCH', {
      amount: 1, bankAccountId: setup.bankAccountId,
    }, [403]);
    return { receivableId };
  });
}

async function auditSalesOrderExceptions(setup, client) {
  const checks = [];
  const generator = client.generators[0];
  async function approvedParts(label) {
    const opportunity = await request(setup.sales.access_token, '/crm/opportunities', 'POST', {
      title: label, clientId: client.id, assignedSellerId: setup.sales.user.id,
      opportunityType: 'PARTS_SALE', source: 'QA_ISOLATED_FULL_FLOW',
    });
    const proposal = await request(setup.sales.access_token, '/proposals', 'POST', {
      clientId: client.id, generatorId: generator.id, salesOpportunityId: opportunity.id,
      userId: setup.sales.user.id, type: 'PARTS', scope: label,
      validUntil: datePlus(30), paymentTerm: 'Mensal', firstDueDate: datePlus(15),
      partsPaymentProfileId: setup.partsProfile.id,
      items: [{ catalogItemId: setup.avulsa.id, kind: 'PART_MATERIAL', quantity: 2, unitPrice: setup.avulsa.basePrice }],
    });
    await request(setup.sales.access_token, `/proposals/${proposal.id}/submit-board`, 'POST', {});
    await request(setup.admin.access_token, `/proposals/${proposal.id}/board-approve`, 'POST', {});
    await request(setup.admin.access_token, `/proposals/${proposal.id}/client-approve`, 'POST', {});
    const sale = await prisma.salesOrder.findUnique({ where: { proposalId: proposal.id }, include: { items: true } });
    assert.ok(sale && sale.items.length === 1);
    return { proposal, sale, item: sale.items[0] };
  }
  async function check(name, action) {
    try {
      checks.push({ name, status: 'PASS', ...(await action()) });
      console.log(`PASS ${name}`);
    } catch (error) {
      checks.push({ name, status: 'FAIL', error: error.message });
      console.log(`FAIL ${name}: ${error.message}`);
    }
  }
  await check('cancelamento-libera-reserva-sem-cobranca', async () => {
    const { sale, item } = await approvedParts(`QA-FLOW-CANCEL-${Date.now()}`);
    await request(setup.admin.access_token, '/inventory/adjust', 'POST', {
      warehouseId: setup.warehouseId, reason: 'Entrada ficticia para cancelamento QA',
      items: [{ catalogItemId: item.catalogItemId, delta: 2 }],
    });
    await request(setup.admin.access_token, `/sales-orders/${sale.id}/reserve`, 'POST', {
      itemId: item.id, warehouseId: setup.warehouseId, quantity: 2,
    });
    const canceled = await request(setup.admin.access_token, `/sales-orders/${sale.id}/close`, 'POST', {
      reason: 'Cancelamento ficticio de teste',
    });
    assert.equal(canceled.status, 'CANCELED');
    const balance = await prisma.inventoryBalance.findUnique({
      where: { warehouseId_catalogItemId: { warehouseId: setup.warehouseId, catalogItemId: item.catalogItemId } },
    });
    assert.equal(balance.reservedQty, 0);
    assert.equal(await prisma.accountsReceivable.count({ where: { salesOrderId: sale.id } }), 0);
    await expectHttpError(setup.finance.access_token, `/finance/receivables/sync/sales-orders/${sale.id}`, 'POST', {
      dueDate: datePlus(15),
    }, [400]);
    return { salesOrderId: sale.id };
  });
  await check('entrega-parcial-cobra-somente-entregue', async () => {
    const { sale, item } = await approvedParts(`QA-FLOW-PARTIAL-${Date.now()}`);
    await request(setup.admin.access_token, '/inventory/adjust', 'POST', {
      warehouseId: setup.warehouseId, reason: 'Entrada ficticia para entrega parcial QA',
      items: [{ catalogItemId: item.catalogItemId, delta: 2 }],
    });
    const stock = { itemId: item.id, warehouseId: setup.warehouseId, quantity: 1 };
    await request(setup.admin.access_token, `/sales-orders/${sale.id}/reserve`, 'POST', stock);
    await request(setup.admin.access_token, `/sales-orders/${sale.id}/pick`, 'POST', stock);
    const delivery = await request(setup.admin.access_token, `/sales-orders/${sale.id}/deliveries`, 'POST', {
      receivedByName: 'Recebedor QA ficticio', items: [stock],
    });
    assert.equal(delivery.status, 'PARTIALLY_DELIVERED');
    const closed = await request(setup.admin.access_token, `/sales-orders/${sale.id}/close`, 'POST', {
      reason: 'Saldo nao entregue cancelado para teste',
    });
    assert.equal(closed.status, 'CLOSED');
    const ar = await request(setup.finance.access_token, `/finance/receivables/sync/sales-orders/${sale.id}`, 'POST', {
      dueDate: datePlus(15),
    });
    assert.equal(round(ar.netAmount), round(sale.totalValue / 2));
    const again = await request(setup.finance.access_token, `/finance/receivables/sync/sales-orders/${sale.id}`, 'POST', {
      dueDate: datePlus(15),
    });
    assert.equal(again.id, ar.id);
    return { salesOrderId: sale.id, receivableId: ar.id, amount: ar.netAmount };
  });
  return checks;
}

async function main() {
  if (process.argv.includes('--prepare')) await prepareIsolatedFixtures();
  const clients = await candidates();
  if (process.argv.includes('--prepare'))
    await prepareCustomerUser(clients[4].id);
  const [service, avulsa, rates, profiles] = await Promise.all([
    prisma.catalogItem.findFirst({
      where: { isActive: true, type: 'SERVICE', basePrice: { gt: 0 } },
      orderBy: { name: 'asc' },
    }),
    prisma.catalogItem.findFirst({
      where: {
        isActive: true,
        type: 'PART',
        basePrice: { gt: 0 },
        generatorBaseItems: { none: {} },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.proposalHourlyRate.findMany({ where: { isActive: true } }),
    prisma.proposalPaymentProfile.findMany({ where: { isActive: true } }),
  ]);
  const setup = {
    service,
    avulsa,
    rates,
    partsProfile: profiles.find((p) => p.purpose === 'PARTS'),
    servicesProfile: profiles.find((p) => p.purpose === 'SERVICES'),
  };
  const facts = {
    databaseName,
    clientCount: await prisma.client.count(),
    generatorCount: await prisma.generator.count(),
    catalogCount: await prisma.catalogItem.count(),
    companySettings: await prisma.companySettings.findMany({
      select: {
        id: true,
        key: true,
        companyName: true,
        cnpj: true,
        isPrimary: true,
      },
    }),
    collectionAgreementCount: await prisma.bankCollectionAgreement.count(),
    selectedClients: clients.map((c) => ({
      id: c.id,
      name: c.companyName,
      generator: c.generators[0].name,
      machineParts: c.generators[0].baseItems.length,
    })),
    service: service && {
      id: service.id,
      name: service.name,
      price: service.basePrice,
    },
    avulsa: avulsa && {
      id: avulsa.id,
      name: avulsa.name,
      price: avulsa.basePrice,
    },
    hourlyRates: rates.map((r) => ({
      hourType: r.hourType,
      technicianType: r.technicianType,
      unitPrice: r.unitPrice,
    })),
    activePaymentProfiles: profiles.map((p) => ({
      id: p.id,
      purpose: p.purpose,
      method: p.method,
    })),
  };
  if (process.argv.includes('--inspect')) {
    console.log(JSON.stringify(facts, null, 2));
    return;
  }
  assert.ok(service, 'Nenhum servico do catalogo com preco');
  assert.ok(avulsa, 'Nenhuma peca avulsa com preco');
  const [admin, sales, finance, customer] = await Promise.all([
    login('admin.demo@manitec.local'),
    login('vendas.demo@manitec.local'),
    login('financeiro.demo@manitec.local'),
    login('flow.qa.customer@manitec.local'),
  ]);
  const bank = await request(
    finance.access_token,
    '/finance/bank-accounts',
    'POST',
    {
      name: `QA ISOLADA ${Date.now()} - NUNCA USAR`,
      bankName: 'BANCO FICTICIO',
      initialBalance: 0,
    },
  );
  const [warehouse, issuers] = await Promise.all([
    prepareWarehouse(),
    prepareFiscalIssuers(),
  ]);
  Object.assign(setup, {
    admin,
    sales,
    finance,
    customer,
    bankAccountId: bank.id,
    warehouseId: warehouse.id,
    issuers,
  });
  if (process.argv.includes('--exceptions')) {
    const checks = await auditSalesOrderExceptions(setup, clients[0]);
    const report = { databaseName, checks, failures: checks.filter((row) => row.status === 'FAIL') };
    if (process.env.FLOW_QA_REPORT_FILE)
      writeFileSync(process.env.FLOW_QA_REPORT_FILE, JSON.stringify(report, null, 2));
    else console.log(JSON.stringify(report, null, 2));
    if (report.failures.length) process.exitCode = 1;
    return;
  }
  for (let i = 0; i < clients.length; i += 1) {
    await auditCase(i, clients[i], setup);
    console.log(
      `${results[i].status} ${results[i].case}${results[i].error ? `: ${results[i].error}` : ''}`,
    );
  }
  await auditFinanceAndValidation(setup);
  const report = JSON.stringify(
    { facts, results, additionalChecks, failures },
    null,
    2,
  );
  if (process.env.FLOW_QA_REPORT_FILE)
    writeFileSync(process.env.FLOW_QA_REPORT_FILE, report);
  else console.log(report);
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
