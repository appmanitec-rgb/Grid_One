import { expect, test } from '@playwright/test';
import { apiLogin, apiRequest, apiRequestRaw, loginByApi } from './helpers/auth';
import { accounts } from './helpers/test-data';

test('perfil anexa foto, salva, mantém após recarregar e permite remover', async ({ page }) => {
  const account = accounts.sales;
  const login = await apiLogin(account);
  const original = await apiRequest<{ profilePhotoUrl: string | null }>(login.access_token, '/users/me');
  try {
    await loginByApi(page, account);
    await page.goto('/dashboard/profile');
    await expect(page.getByRole('heading', { name: 'Meu Perfil', exact: true, level: 1 })).toBeVisible();
    const otherTab = await page.context().newPage();
    await otherTab.goto('/dashboard/clients');
    const otherHeaderPhoto = otherTab.getByRole('link', { name: 'Abrir meu perfil', exact: true }).getByRole('img', { name: 'Foto do meu perfil' });
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#0066bb';
      context.fillRect(0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    const photo = page.getByLabel('Anexar foto do perfil', { exact: true });
    await photo.setInputFiles({ name: 'foto-teste.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    const preview = page.getByRole('img', { name: 'Prévia da foto do perfil' });
    await expect(preview).toHaveAttribute('src', /^data:image\/webp;base64,/);
    await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
    await expect(page.getByText('Perfil atualizado com sucesso.', { exact: true })).toBeVisible();
    const saved = await apiRequest<{ profilePhotoUrl: string }>(login.access_token, '/users/me');
    expect(saved.profilePhotoUrl).toMatch(/^data:image\/webp;base64,/);
    const headerPhoto = page.getByRole('link', { name: 'Abrir meu perfil', exact: true }).getByRole('img', { name: 'Foto do meu perfil' });
    await expect(headerPhoto).toHaveAttribute('src', saved.profilePhotoUrl);
    await expect(otherHeaderPhoto).toHaveAttribute('src', saved.profilePhotoUrl);
    await otherTab.close();
    await page.reload();
    await expect(headerPhoto).toHaveAttribute('src', saved.profilePhotoUrl);
    await expect(preview).toHaveAttribute('src', saved.profilePhotoUrl);
    await photo.setInputFiles({ name: 'arquivo.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') });
    await expect(page.getByRole('region', { name: 'Foto do perfil', exact: true }).getByRole('alert')).toHaveText('Escolha uma foto JPG, PNG ou WebP.');
    await expect(preview).toHaveAttribute('src', saved.profilePhotoUrl);
    const invalid = await apiRequestRaw(login.access_token, '/users/me', { method: 'PATCH', body: { profilePhotoUrl: 'data:image/svg+xml;base64,PHN2Zz4=' } });
    expect(invalid.status).toBe(400);
    await page.getByRole('button', { name: 'Remover foto', exact: true }).click();
    await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
    await expect(page.getByText('Perfil atualizado com sucesso.', { exact: true })).toBeVisible();
    await expect(headerPhoto).toHaveCount(0);
    expect((await apiRequest<{ profilePhotoUrl: string | null }>(login.access_token, '/users/me')).profilePhotoUrl).toBeNull();
  } finally {
    await apiRequest(login.access_token, '/users/me', { method: 'PATCH', body: { profilePhotoUrl: original.profilePhotoUrl } });
  }
});
