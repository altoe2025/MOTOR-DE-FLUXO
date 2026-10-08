import { expect, test } from '@playwright/test';

const email = process.env.MOT_REAL_AUTH_EMAIL;
const password = process.env.MOT_REAL_AUTH_PASSWORD;

test('real Supabase login, rejected token, preview and logout', async ({ page, request }) => {
  test.skip(email === undefined || password === undefined, 'credenciais reais são fornecidas somente pelo ambiente protegido');

  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha').fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/carteira$/);

  const rejected = await request.get('/api/v1/session', {
    headers: { Authorization: 'Bearer token-deliberadamente-invalido' },
  });
  expect(rejected.status()).toBe(401);

  await page.getByLabel('Nome do estudo').fill('Aceitação real MOT-22');
  await page.getByRole('button', { name: 'Executar exemplo de referência' }).click();
  await page.getByRole('link', { name: 'Diagnóstico' }).click();
  await expect(page.getByTestId('economia-brl')).toHaveText('R$ 1.026.000,00');
  await expect(page.getByTestId('netabilidade')).toHaveText('58,82%');

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('E-mail')).toHaveValue('');
  await expect(page.getByLabel('Senha')).toHaveValue('');
});
