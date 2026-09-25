import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { assertCompletedChatExchange, requireRenderSmokeConfig } from '../scripts/render-smoke-gate.mjs';
import { allHelpIds } from '../src/help/helpIds';

const renderConfig = requireRenderSmokeConfig(process.env);
const xlsx = readFileSync(fileURLToPath(new URL('../src/importer/__fixtures__/valid-minimal.xlsx', import.meta.url)));
const python = process.env.MOT_STAGE6_PDF_PYTHON ?? process.env.MOT_E2E_PYTHON
  ?? (process.platform === 'win32' ? '.venv\\Scripts\\python.exe' : '.venv/bin/python');

test.beforeEach(() => {
  test.setTimeout(240_000); // Inclui um cold start legítimo do plano gratuito.
});

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByLabel('E-mail').fill(renderConfig.email);
  await page.getByLabel('Senha').fill(renderConfig.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/carteira$/, { timeout: 90_000 });
}

test('HTTPS, login, demonstração, chat real, apresentação, PDF e deep links', async ({ page, request }, testInfo) => {
  const health = await request.get('/api/v1/health', { timeout: 120_000 });
  expect(health.status()).toBe(200);
  await login(page);
  await page.goto('/estudos');
  await expect(page.getByRole('button', { name: 'Abrir Estudo demonstrativo sintético' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir Estudo demonstrativo sintético' }).click();
  await expect(page).toHaveURL(/\/estudos\/[0-9a-f-]+$/);
  await page.getByRole('button', { name: 'Executar diagnóstico' }).first().click();
  await expect(page.getByRole('region', { name: 'Resultado do motor' })).toBeVisible();
  await page.getByRole('link', { name: 'Apresentar esta execução' }).click();
  await expect(page.getByRole('region', { name: 'Resumo executivo' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Limitações e versões' })).toBeVisible();
  const firstMetric = await page.getByRole('region', { name: 'Resumo executivo' })
    .getByTestId('presentation-metric').first().evaluate((element) => ({
      label: element.querySelector('dt')?.textContent?.trim() ?? '',
      value: element.querySelector('dd')?.textContent?.split('Fonte:')[0]?.trim() ?? '',
    }));
  expect(firstMetric.label).not.toBe('');
  expect(firstMetric.value).not.toBe('');
  const deepLink = page.url();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(deepLink);
  await expect(page.getByRole('region', { name: 'Resumo executivo' })).toBeVisible();
  await page.getByRole('button', { name: 'Perguntar', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'ORKE AI', exact: true });
  await panel.getByLabel('Sua pergunta').fill('Qual é a economia BRL desta execução e qual evidência sustenta esse valor?');
  const chatResponse = page.waitForResponse((item) => item.url().endsWith('/api/v1/chat')
    && item.request().method() === 'POST', { timeout: 90_000 });
  await panel.getByRole('button', { name: 'Enviar', exact: true }).click();
  const completed = await chatResponse;
  expect(completed.status()).toBe(200);
  const responseBody = await completed.json() as { messageId?: string };
  expect(responseBody.messageId).toMatch(/^[0-9a-f-]+$/);
  const assistantArticle = panel.getByRole('list', { name: 'Mensagens da conversa' })
    .locator(`article[data-chat-role="ASSISTANT"][data-chat-status="SUCCEEDED"][data-chat-message-id="${responseBody.messageId}"]`);
  await expect(assistantArticle).toBeVisible({ timeout: 90_000 });
  const assistant = {
    role: await assistantArticle.getAttribute('data-chat-role'),
    status: await assistantArticle.getAttribute('data-chat-status'),
    text: await assistantArticle.locator('p').first().innerText(),
    citationCount: await assistantArticle.getByRole('navigation', { name: 'Fontes da resposta' }).getByRole('link').count(),
  };
  assertCompletedChatExchange({ status: completed.status(), request: completed.request().postDataJSON(),
    response: responseBody, assistant, knownHelpIds: allHelpIds });
  await panel.getByRole('button', { name: 'Fechar chat' }).click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.sidebar')).toBeHidden();
  const pdfPath = testInfo.outputPath('render-demo-report.pdf');
  const pdf = await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true });
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  const inspected = spawnSync(python, ['tests/web_api/render_stage6_pdf.py', '--pdf', pdfPath,
    '--render-dir', testInfo.outputPath('pages'), '--expect', firstMetric.label,
    '--expect', firstMetric.value], { cwd: '..', encoding: 'utf8', timeout: 30_000 });
  expect(inspected.status, inspected.stderr).toBe(0);
  await testInfo.attach('render-demo-report-anonymized', { path: pdfPath, contentType: 'application/pdf' });
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('XLSX sintético permanece local e o Caso alcança diagnóstico observado', async ({ page }) => {
  await login(page);
  const bodies: string[] = [];
  page.on('request', (request) => { if (request.postData()) bodies.push(request.postData()!); });
  await page.goto('/importar');
  await page.getByLabel('Nome da nova empresa').fill('Empresa smoke sintética');
  await page.getByRole('button', { name: 'Usar nova empresa neste Caso' }).click();
  await page.getByLabel('Planilha canônica XLSX').setInputFiles({
    name: 'smoke-sintetico.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsx,
  });
  await page.getByRole('checkbox', { name: /operações explícitas/ }).check();
  await page.getByRole('button', { name: 'Ler planilha' }).click();
  await expect(page.getByRole('heading', { name: 'Revisar operações' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar Caso Observado' }).click();
  await expect(page.getByRole('heading', { name: 'Caso confirmado' })).toBeVisible();
  const profileUrl = await page.getByRole('link', { name: 'Criar Perfil Operacional' }).getAttribute('href');
  const caseId = new URL(profileUrl!, page.url()).searchParams.get('caseId')!;
  await page.goto(profileUrl!);
  await page.getByRole('button', { name: 'Confirmar versão' }).click();
  await expect(page.getByRole('heading', { name: 'Versão 1' })).toBeVisible();
  await page.goto('/estudos');
  await page.getByRole('button', { name: 'Novo estudo', exact: true }).click();
  const studyId = page.url().split('/').at(-1)!;
  await page.getByRole('radio', { name: 'Caso observado', exact: true }).check();
  await page.getByLabel('Caso confirmado').selectOption(caseId);
  await page.getByRole('button', { name: 'Usar caso confirmado' }).click();
  await page.goto(profileUrl!);
  await page.getByLabel('Estudo para receber a evidência').selectOption(studyId);
  await page.getByRole('button', { name: 'Usar como evidência em estudo' }).click();
  await page.goto(`/estudos/${studyId}/diagnostico`);
  await page.getByRole('button', { name: 'Executar diagnóstico', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resultado do motor' })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('link', { name: 'Apresentar esta execução' })).toBeVisible();
  expect(bodies.join('\n')).not.toMatch(/smoke-sintetico\.xlsx|PK\\u0003\\u0004|<worksheet/);
});
