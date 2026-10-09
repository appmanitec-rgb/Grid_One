import { expect, test } from '@playwright/test';
import { apiLogin, apiRequest, apiRequestRaw, loginByApi } from './helpers/auth';
import { accounts } from './helpers/test-data';

type ClientRow = { id: string; cnpj: string };
type PortalUserCreated = { user: { id: string }; activation: { token: string } };
type Login = { access_token: string; refresh_token?: string; user?: unknown };

test('gestao por cliente, acesso limitado e feedback', async ({ page }) => {
  const admin = await apiLogin(accounts.admin);
  const clients = await apiRequest<ClientRow[]>(admin.access_token, '/clients');
  const client = clients.find((item) => item.cnpj === '12.345.678/0001-90');
  const other = clients.find((item) => item.cnpj === '22.222.222/0001-22');
  expect(client).toBeTruthy();
  expect(other).toBeTruthy();
  const id = client!.id;

  await loginByApi(page, accounts.admin);
  await page.goto('/dashboard/clients/' + id);
  await expect(page.getByRole('link', { name: 'Gerenciar central do cliente' })).toBeVisible();
  await expect(page.getByText('Usuarios da central')).toHaveCount(0);
  await page.getByRole('link', { name: 'Gerenciar central do cliente' }).click();
  await expect(page).toHaveURL(new RegExp('/dashboard/clients/' + id + '/portal'));
  await expect(page.getByRole('heading', { name: 'Gerenciar central do cliente' })).toBeVisible();
  await expect(page.getByText('Usuarios da central')).toBeVisible();

  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
  const logo = await apiRequest<{ portalLogoDataUrl: string }>(admin.access_token, '/clients/' + id + '/portal', { method: 'PATCH', body: { logoDataUrl: tinyPng } });
  expect(logo.portalLogoDataUrl).toBe(tinyPng);
  const invalidLogo = await apiRequestRaw(admin.access_token, '/clients/' + id + '/portal', { method: 'PATCH', body: { logoDataUrl: 'data:image/png;base64,AAAA' } });
  expect(invalidLogo.status).toBe(400);

  const email = 'portal.permissao.' + Date.now() + '@example.test';
  const created = await apiRequest<PortalUserCreated>(admin.access_token, '/clients/' + id + '/portal/users', {
    method: 'POST',
    body: { name: 'Marcos Propostas', email, permissions: ['PROPOSALS', 'FEEDBACK'] },
  });
  expect(created.activation.token).toBeTruthy();
  const wrongClient = await apiRequestRaw(admin.access_token, '/clients/' + other!.id + '/portal/users/' + created.user.id, { method: 'PATCH', body: { permissions: ['EQUIPMENT'] } });
  expect(wrongClient.status).toBe(404);

  const password = 'Portal@123456';
  await apiRequest(undefined, '/auth/client-activate', { method: 'POST', body: { token: created.activation.token, password } });
  const login = await apiRequest<Login>(undefined, '/auth/client-login', { method: 'POST', body: { email, password } });
  const me = await apiRequest<{ user: { portalPermissions: string[] } }>(login.access_token, '/customer-portal/me');
  expect(me.user.portalPermissions).toEqual(['PROPOSALS', 'FEEDBACK']);
  const proposals = await apiRequestRaw(login.access_token, '/customer-portal/proposals');
  expect(proposals.status).toBe(200);
  const equipment = await apiRequestRaw(login.access_token, '/customer-portal/equipment');
  expect(equipment.status).toBe(403);
  const dashboard = await apiRequest<{ stats: { equipmentCount: number }; recentOrders: unknown[] }>(login.access_token, '/customer-portal/dashboard');
  expect(dashboard.stats.equipmentCount).toBe(0);
  expect(dashboard.recentOrders).toEqual([]);

  const message = 'Feedback E2E ' + Date.now();
  await apiRequest(login.access_token, '/customer-portal/feedback', { method: 'POST', body: { kind: 'FEEDBACK', message } });
  const overview = await apiRequest<{ portalFeedbacks: Array<{ message: string }> }>(admin.access_token, '/clients/' + id + '/portal');
  expect(overview.portalFeedbacks.some((item) => item.message === message)).toBe(true);

  await page.addInitScript((session: Login) => {
    localStorage.setItem('manitec_token', session.access_token);
    if (session.refresh_token) localStorage.setItem('manitec_refresh_token', session.refresh_token);
    if (session.user) localStorage.setItem('manitec_user', JSON.stringify(session.user));
  }, login);
  await page.goto('/portal/dashboard');
  await expect(page.getByRole('link', { name: 'Propostas' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Observacoes e feedback' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Equipamentos' })).toHaveCount(0);
  await page.goto('/portal/feedback');
  await expect(page.getByText(message)).toBeVisible();

  try {
    await apiRequest(admin.access_token, '/clients/' + id + '/portal', { method: 'PATCH', body: { enabled: false } });
    const blocked = await apiRequestRaw(login.access_token, '/customer-portal/me');
    expect(blocked.status).toBe(401);
  } finally {
    await apiRequest(admin.access_token, '/clients/' + id + '/portal', { method: 'PATCH', body: { enabled: true, logoDataUrl: null } });
  }
});
