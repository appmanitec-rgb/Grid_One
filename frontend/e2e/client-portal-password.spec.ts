import { expect, test } from '@playwright/test';
import { apiLogin, apiRequest, apiRequestRaw, loginByApi } from './helpers/auth';
import { accounts } from './helpers/test-data';

type Session = { access_token: string; refresh_token?: string };
test('administrador altera senha na central e invalida credenciais e sessões antigas', async ({ page }) => {
  const admin = await apiLogin(accounts.admin);
  const clients = await apiRequest<Array<{ id: string; cnpj: string }>>(admin.access_token, '/clients');
  const client = clients.find(row => row.cnpj === '12.345.678/0001-90')!;
  const other = clients.find(row => row.cnpj === '22.222.222/0001-22')!;
  expect(client).toBeTruthy(); expect(other).toBeTruthy();
  const stamp = Date.now();
  const email = 'portal.senha.' + stamp + '@example.test';
  const oldPassword = 'Portal@1234567';
  const newPassword = 'Portal!SenhaNova123';
  const deviceId = 'portal-senha-' + stamp;
  const created = await apiRequest<{ user: { id: string }; activation: { token: string } }>(admin.access_token, '/clients/' + client.id + '/portal/users', { method: 'POST', body: { name: 'Teste de troca de senha', email, permissions: ['PROPOSALS', 'FEEDBACK'] } });
  const path = '/clients/' + client.id + '/portal/users/' + created.user.id + '/password';
  await apiRequest(undefined, '/auth/client-activate', { method: 'POST', body: { token: created.activation.token, password: oldPassword } });
  const oldSession = await apiRequest<Session>(undefined, '/auth/client-login', { method: 'POST', body: { email, password: oldPassword, deviceId } });
  try {
    expect((await apiRequestRaw(admin.access_token, path, { method: 'PATCH', body: { password: 'curta', confirmPassword: 'curta' } })).status).toBe(400);
    expect((await apiRequestRaw(admin.access_token, path, { method: 'PATCH', body: { password: newPassword, confirmPassword: 'OutraSenha!123456' } })).status).toBe(400);
    expect((await apiRequestRaw(admin.access_token, '/clients/' + other.id + '/portal/users/' + created.user.id + '/password', { method: 'PATCH', body: { password: newPassword, confirmPassword: newPassword } })).status).toBe(404);
    expect((await apiRequestRaw(oldSession.access_token, path, { method: 'PATCH', body: { password: newPassword, confirmPassword: newPassword } })).status).toBe(403);

    await loginByApi(page, accounts.admin);
    await page.goto('/dashboard/clients/' + client.id + '/portal');
    const card = page.getByRole('article', { name: 'Usuário da central: ' + email, exact: true });
    await card.getByRole('button', { name: 'Alterar senha', exact: true }).click();
    const form = card.getByRole('form', { name: 'Alterar senha de ' + email, exact: true });
    await form.getByLabel('Nova senha', { exact: true }).fill(newPassword);
    await form.getByLabel('Confirmar nova senha', { exact: true }).fill('OutraSenha!123456');
    await form.getByRole('button', { name: 'Salvar nova senha', exact: true }).click();
    await expect(form.getByRole('alert')).toHaveText('A confirmação não corresponde à nova senha.');
    await form.getByLabel('Confirmar nova senha', { exact: true }).fill(newPassword);
    await form.getByRole('button', { name: 'Salvar nova senha', exact: true }).click();
    await expect(page.getByText('Senha alterada. O usuário pode entrar com a nova senha.', { exact: true })).toBeVisible();
    await expect(form).toHaveCount(0);

    expect((await apiRequestRaw(undefined, '/auth/client-login', { method: 'POST', body: { email, password: oldPassword } })).status).toBe(401);
    expect((await apiRequestRaw(oldSession.access_token, '/customer-portal/me')).status).toBe(401);
    expect(oldSession.refresh_token).toBeTruthy();
    expect((await apiRequestRaw(undefined, '/auth/refresh', { method: 'POST', body: { refreshToken: oldSession.refresh_token, deviceId } })).status).toBe(401);
    const current = await apiRequest<Session>(undefined, '/auth/client-login', { method: 'POST', body: { email, password: newPassword, deviceId } });
    const me = await apiRequest<{ client: { id: string }; user: { portalPermissions: string[] } }>(current.access_token, '/customer-portal/me');
    expect(me.client.id).toBe(client.id);
    expect(me.user.portalPermissions).toEqual(['PROPOSALS', 'FEEDBACK']);
    expect((await apiRequestRaw(current.access_token, '/customer-portal/equipment')).status).toBe(403);
  } finally {
    await apiRequest(admin.access_token, '/clients/' + client.id + '/portal/users/' + created.user.id, { method: 'PATCH', body: { isActive: false } });
  }
});
