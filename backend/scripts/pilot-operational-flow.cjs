// Run only against the isolated pilot database and API on port 3002.
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const databaseUrl = process.env.DATABASE_URL;
const apiUrl = process.env.PILOT_API_URL || 'http://127.0.0.1:3002';
if (!databaseUrl || !/^gridone_pilot_/.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error('Piloto exige DATABASE_URL apontando para gridone_pilot_*');
}
if (new URL(apiUrl).port !== '3002') {
  throw new Error('Piloto exige API isolada na porta 3002');
}

const prisma = new PrismaClient();
const report = { database: new URL(databaseUrl).pathname.slice(1), checks: [] };
function check(name, condition, details) {
  assert.ok(condition, `${name}: ${JSON.stringify(details)}`);
  report.checks.push(name);
}
function totp() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const secret = process.env.E2E_TOTP_SECRET || 'JBSWY3DPEHPK3PXP';
  let bits = '';
  for (const letter of secret.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(letter).toString(2).padStart(5, '0');
  }
  const key = Buffer.from((bits.match(/.{8}/g) || []).map((part) => parseInt(part, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest[19] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
async function request(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = raw; }
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${raw.slice(0, 600)}`);
  return data;
}

async function main() {
  const actualDb = await prisma.$queryRawUnsafe('SELECT current_database() AS name');
  check('banco isolado', actualDb[0].name === report.database, actualDb);
  const health = await request('/health');
  check('API saudavel', health.status === 'ok', health);

  const password = process.env.SEED_DEMO_PASSWORD || 'Demo@123456';
  async function login(email, internal) {
    return request('/auth/login', {
      method: 'POST',
      body: { email, password, ...(internal ? { mfaCode: totp() } : {}) },
    });
  }
  const admin = await login('admin.demo@manitec.local', true);
  const sales = await login('vendas.demo@manitec.local', true);
  const customer = await login('cliente.a.demo@manitec.local', false);
  const token = admin.access_token;
  check('acesso dos tres perfis', Boolean(token && sales.user?.id && customer.access_token));

  const generator = await prisma.generator.findUnique({ where: { serialNumber: 'DEMO-GMG-0001' }, include: { currentSite: true } });
  const part = await prisma.catalogItem.findUnique({ where: { sku: 'DEMO-FILTRO-001' } });
  const bank = await prisma.bankAccount.findFirst({ where: { isActive: true } });
  check('dados de piloto disponiveis', Boolean(generator?.clientId && part?.id && bank?.id));
  const paymentTerm = await prisma.controlOption.findUnique({
    where: { type_code: { type: 'PAYMENT_TERM', code: 'Mensal' } },
  });
  check('condicao de pagamento do seed', paymentTerm?.isActive === true, paymentTerm);

  const suffix = Date.now();
  const validUntil = new Date(Date.now() + 30 * 86400000).toISOString();
  const dueDate = new Date(Date.now() + 7 * 86400000).toISOString();
  const opportunity = await request('/crm/opportunities', { token, method: 'POST', body: {
    title: `Piloto operacional ${suffix}`, clientId: generator.clientId,
    siteId: generator.currentSite?.id, assignedSellerId: sales.user.id,
    estimatedValue: 1777, expectedCloseDate: validUntil, source: 'PILOTO_ISOLADO',
  } });
  check('oportunidade criada', Boolean(opportunity.id));
  const proposal = await request('/proposals', { token, method: 'POST', body: {
    clientId: generator.clientId, salesOpportunityId: opportunity.id,
    generatorId: generator.id, userId: sales.user.id, type: 'CONTRACT',
    scope: 'Manutencao preventiva do piloto isolado.', freight: 'Incluso',
    validUntil, paymentTerm: 'Mensal', installmentCount: 12,
    installmentIntervalDays: 30, firstDueDate: dueDate,
    items: [{ catalogItemId: part.id, quantity: 1, unitPrice: 1777 }],
  } });
  check('proposta ligada a oportunidade', proposal.status === 'DRAFT' && proposal.salesOpportunity?.id === opportunity.id, proposal);
  await request(`/proposals/${proposal.id}/submit-board`, { token, method: 'POST', body: {} });
  const board = await request(`/proposals/${proposal.id}/board-approve`, { token, method: 'POST', body: {} });
  check('aprovacao interna', board.status === 'CLIENT_REVIEW', board);
  await request(`/customer-portal/proposals/${proposal.id}/approve`, { token: customer.access_token, method: 'POST', body: { note: 'Aceite de piloto.' } });
  const approved = await request(`/proposals/${proposal.id}`, { token });
  check('aceite do cliente', approved.status === 'WON', approved);

  const converted = await request(`/proposals/${proposal.id}/convert-contract`, { token, method: 'POST', body: {} });
  const contractId = converted.contract?.id;
  check('contrato gerado', Boolean(contractId), converted);
  const receivables = await request('/finance/receivables', { token });
  const linked = receivables.filter((row) => row.contractId === contractId);
  check('recebiveis vinculados ao contrato', linked.length > 0, { contractId });
  const convertedAgain = await request(`/proposals/${proposal.id}/convert-contract`, { token, method: 'POST', body: {} });
  const receivablesAgain = await request('/finance/receivables', { token });
  check('conversao sem duplicatas', convertedAgain.contract.id === contractId && receivablesAgain.filter((row) => row.contractId === contractId).length === linked.length);

  const firstGeneration = await request(`/contracts/${contractId}/generate-orders?daysAhead=400`, { token, method: 'POST', body: {} });
  check('OS preventiva gerada', firstGeneration.createdCount > 0, firstGeneration);
  const secondGeneration = await request(`/contracts/${contractId}/generate-orders?daysAhead=400`, { token, method: 'POST', body: {} });
  check('geracao de OS sem duplicatas', secondGeneration.createdCount === 0, secondGeneration);
  const orders = await request('/maintenance-orders', { token });
  const order = orders.find((row) => row.contract?.id === contractId);
  check('OS vinculada ao contrato', Boolean(order?.id), { contractId });

  const reservation = await request('/inventory/reserve', { token, method: 'POST', body: {
    catalogItemId: part.id, quantity: 1, referenceType: 'MAINTENANCE_ORDER', referenceId: order.id,
  } });
  check('peca reservada para OS', reservation.ok === true, reservation);
  const movement = await prisma.inventoryMovement.findFirst({ where: { referenceId: order.id, movementType: 'RESERVATION' } });
  check('movimento de peca rastreavel', movement?.catalogItemId === part.id, movement);

  const receivable = linked[0];
  const payment = await request(`/finance/receivables/${receivable.id}/pay`, { token, method: 'PATCH', body: {
    amount: Math.min(100, Number(receivable.netAmount)), bankAccountId: bank.id,
    notes: 'Pagamento parcial de piloto.',
  } });
  check('pagamento parcial registrado', Boolean(payment.id), payment);
  const paid = await prisma.accountsReceivable.findUnique({ where: { id: receivable.id }, include: { payments: true } });
  check('pagamento ligado ao recebivel', paid?.payments?.length > 0, paid);

  Object.assign(report, { opportunityId: opportunity.id, proposalCode: proposal.code, contractCode: converted.contract.code, orderId: order.id, receivableId: receivable.id });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
