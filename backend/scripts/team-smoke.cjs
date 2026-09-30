const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const base = process.env.TEAM_SMOKE_API || 'http://127.0.0.1:3002';
const prisma = new PrismaClient();
if (new URL(base).port !== '3002' || !/^gridone_pilot_/.test(new URL(process.env.DATABASE_URL || 'postgres://x:x@localhost/invalid').pathname.slice(1))) {
  throw new Error('O teste de equipe exige API na porta 3002 e banco gridone_pilot_*');
}

function totp() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of 'JBSWY3DPEHPK3PXP') bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const secret = Buffer.from(bits.match(/.{8}/g).map((part) => parseInt(part, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', secret).update(counter).digest();
  return String((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000).padStart(6, '0');
}

async function call(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = raw; }
  return { status: response.status, data };
}

async function login(email, internal = true) {
  const result = await call('/auth/login', {
    method: 'POST',
    body: { email, password: process.env.SEED_DEMO_PASSWORD || 'Demo@123456', ...(internal ? { mfaCode: totp() } : {}) },
  });
  assert.ok(result.status === 200 || result.status === 201, `login ${email}: HTTP ${result.status}`);
  return result.data.access_token;
}

async function ok(path, options) {
  const result = await call(path, options);
  assert.ok(result.status >= 200 && result.status < 300, `${options?.method || 'GET'} ${path}: ${result.status} ${JSON.stringify(result.data)}`);
  return result.data;
}

async function main() {
  const admin = await login('admin.demo@manitec.local');
  const sales = await login('vendas.demo@manitec.local');
  const client = await login('cliente.a.demo@manitec.local', false);
  assert.equal((await call('/team/feed')).status, 401);
  assert.equal((await call('/team/feed', { token: client })).status, 403);
  assert.equal((await call('/team/channels', { token: client })).status, 403);

  const channels = await ok('/team/channels', { token: admin });
  assert.ok(channels.some((channel) => channel.slug === 'geral'));
  const general = channels.find((channel) => channel.slug === 'geral');
  const stamp = Date.now();
  const post = await ok('/team/feed', { token: sales, method: 'POST', body: { body: `Aviso de teste ${stamp}` } });
  assert.equal((await call(`/team/feed/${post.id}/pin`, { token: sales, method: 'POST' })).status, 403);
  await ok(`/team/feed/${post.id}/pin`, { token: admin, method: 'POST' });
  await ok(`/team/feed/${post.id}/comments`, { token: admin, method: 'POST', body: { body: 'Recebido pela gestão.' } });
  await ok(`/team/feed/${post.id}/comments`, { token: sales, method: 'POST', body: { body: 'Combinado com a equipe.' } });
  const firstComments = await ok(`/team/feed/${post.id}/comments?limit=1`, { token: admin });
  assert.ok(firstComments.nextCursor);
  const olderComments = await ok(`/team/feed/${post.id}/comments?limit=1&cursor=${firstComments.nextCursor}`, { token: admin });
  assert.equal(olderComments.items.length, 1);
  assert.notEqual(firstComments.items[0].id, olderComments.items[0].id);
  const reaction = await ok(`/team/feed/${post.id}/react`, { token: admin, method: 'POST' });
  assert.equal(reaction.likedByMe, true);
  const feed = await ok('/team/feed', { token: sales });
  const visible = feed.items.find((item) => item.id === post.id);
  assert.ok(visible?.pinnedAt && visible.commentCount === 2 && visible.reactionCount === 1);
  assert.equal((await call(`/team/feed/${post.id}`, { token: admin, method: 'PATCH', body: { body: 'Alteração indevida' } })).status, 403);
  await ok(`/team/feed/${post.id}`, { token: sales, method: 'PATCH', body: { body: `Aviso atualizado ${stamp}` } });
  const secondPost = await ok('/team/feed', { token: admin, method: 'POST', body: { body: `Segundo aviso ${stamp}` } });
  const firstPosts = await ok('/team/feed?limit=1', { token: admin });
  assert.ok(firstPosts.nextCursor);
  const olderPosts = await ok(`/team/feed?limit=1&cursor=${firstPosts.nextCursor}`, { token: admin });
  assert.equal(olderPosts.items.length, 1);
  assert.notEqual(firstPosts.items[0].id, olderPosts.items[0].id);

  const message = await ok(`/team/channels/${general.id}/messages`, { token: sales, method: 'POST', body: { body: `Mensagem de teste ${stamp}` } });
  const secondMessage = await ok(`/team/channels/${general.id}/messages`, { token: sales, method: 'POST', body: { body: `Outra mensagem ${stamp}` } });
  const firstMessages = await ok(`/team/channels/${general.id}/messages?limit=1`, { token: admin });
  assert.ok(firstMessages.nextCursor);
  const olderMessages = await ok(`/team/channels/${general.id}/messages?limit=1&before=${firstMessages.nextCursor}`, { token: admin });
  assert.equal(olderMessages.items.length, 1);
  assert.notEqual(firstMessages.items[0].id, olderMessages.items[0].id);
  assert.equal((await call(`/team/messages/${message.id}`, { token: admin, method: 'PATCH', body: { body: 'Alteração indevida' } })).status, 403);
  const adminChannels = await ok('/team/channels', { token: admin });
  assert.ok(adminChannels.find((channel) => channel.id === general.id).unreadCount > 0);
  const history = await ok(`/team/channels/${general.id}/messages`, { token: admin });
  assert.ok(history.items.some((item) => item.id === message.id));
  await ok(`/team/channels/${general.id}/read`, { token: admin, method: 'POST' });
  const readChannels = await ok('/team/channels', { token: admin });
  assert.equal(readChannels.find((channel) => channel.id === general.id).unreadCount, 0);
  await ok(`/team/messages/${message.id}`, { token: admin, method: 'DELETE' });
  await ok(`/team/messages/${secondMessage.id}`, { token: admin, method: 'DELETE' });
  const afterDelete = await ok(`/team/channels/${general.id}/messages`, { token: admin });
  assert.ok(!afterDelete.items.some((item) => item.id === message.id));
  await ok(`/team/feed/${post.id}`, { token: admin, method: 'DELETE' });
  await ok(`/team/feed/${secondPost.id}`, { token: admin, method: 'DELETE' });
  const afterPostDelete = await ok('/team/feed', { token: admin });
  assert.ok(!afterPostDelete.items.some((item) => item.id === post.id));
  assert.equal((await call('/team/channels', { token: sales, method: 'POST', body: { name: `Teste ${stamp}` } })).status, 403);

  const temporaryUser = await prisma.user.create({ data: {
    name: 'Colaborador Temporário', email: `team-smoke-${stamp}@example.test`,
    passwordHash: 'test-only-unusable', role: 'NORMAL',
  } });
  const historicalPost = await prisma.teamPost.create({ data: {
    authorId: temporaryUser.id, authorName: temporaryUser.name,
    body: `Histórico preservado ${stamp}`,
  } });
  await prisma.user.delete({ where: { id: temporaryUser.id } });
  const historyAfterUserRemoval = await ok('/team/feed', { token: admin });
  const preserved = historyAfterUserRemoval.items.find((item) => item.id === historicalPost.id);
  assert.equal(preserved?.author.name, 'Colaborador Temporário');
  await ok(`/team/feed/${historicalPost.id}`, { token: admin, method: 'DELETE' });
  console.log('Feed, chat, leitura, moderação e isolamento de clientes: OK');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
