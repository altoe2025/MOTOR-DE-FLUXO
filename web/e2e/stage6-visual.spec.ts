import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const python = process.env.MOT_STAGE6_PDF_PYTHON ?? process.env.MOT_E2E_PYTHON
  ?? (process.env.CI === 'true' ? 'python' : process.platform === 'win32' ? '.venv\\Scripts\\python.exe' : '.venv/bin/python');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const key = 'motor-stage6-visual-uuid-sequence';
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => {
      const next = Number(sessionStorage.getItem(key) ?? '0') + 1;
      sessionStorage.setItem(key, String(next));
      return `00000000-0000-4000-8000-${next.toString(16).padStart(12, '0')}`;
    } });
  });
});

test('login, import, demo, chat and presentation match reviewed baselines', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/estudos');
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await expect(page).toHaveScreenshot('login.png', { fullPage: true });

  await page.getByLabel('E-mail').fill('piloto@example.com');
  await page.getByLabel('Senha').fill('fixture-only-password');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.goto('/importar');
  await expect(page.getByRole('heading', { name: /Importar/ })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Sem regras específicas de finalidade; os Estudos usarão IOF padrão por direção.');
  await expect(page.getByRole('status')).not.toContainText('execução bloqueada');
  await expect(page).toHaveScreenshot('import.png', { fullPage: true });

  await page.goto('/estudos');
  await expect(page.getByRole('heading', { name: 'Estudos' })).toBeVisible();
  await expect.poll(async () => (await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot())).studies.length).toBe(1);
  await expect(page).toHaveScreenshot('demo.png', { fullPage: true });
  await page.getByRole('button', { name: 'Perguntar', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Chat' })).toBeVisible();
  await expect(page).toHaveScreenshot('chat.png', { fullPage: true });
  await page.getByRole('button', { name: 'Fechar chat' }).click();

  const study = (await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot())).studies[0]!;
  const scenario = study.scenarios[0]!;
  const diagnostic = study.diagnostics.find((item) => item.scenarioId === scenario.id)!;
  await page.goto(`/estudos/${study.id}/apresentacao?cenario=${scenario.id}&execucao=${diagnostic.id}`);
  await expect(page.getByRole('heading', { name: study.name, level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Limitações e versões' })).toBeVisible();
  await expect(page).toHaveScreenshot('presentation.png', {
    fullPage: true,
    mask: [page.locator('.presentation-header time')],
    timeout: 15_000,
  });
});

test('first two A4 pages match reviewed print baselines', async ({ page }, testInfo) => {
  await page.goto('/estudos');
  await expect.poll(async () => (await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot())).studies.length).toBe(1);
  const study = (await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot())).studies[0]!;
  const scenario = study.scenarios[0]!;
  const diagnostic = study.diagnostics.find((item) => item.scenarioId === scenario.id)!;
  await page.goto(`/estudos/${study.id}/apresentacao?cenario=${scenario.id}&execucao=${diagnostic.id}`);
  await expect(page.getByRole('heading', { name: study.name, level: 1 })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await page.addStyleTag({ content: '.presentation-header time, .print-metadata dl > div:nth-child(4) dd, .print-metadata dl > div:nth-child(6) dd { color: transparent !important; }' });
  const pdf = testInfo.outputPath('visual-report.pdf');
  await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
  const pages = testInfo.outputPath('pages');
  const rendered = spawnSync(python, ['tests/web_api/render_stage6_pdf.py', '--pdf', pdf,
    '--render-dir', pages, '--expected-pages', '9'], { cwd: '..', encoding: 'utf8', timeout: 30_000 });
  expect(rendered.status, rendered.stderr).toBe(0);
  expect(readFileSync(`${pages}/page-01.png`)).toMatchSnapshot('print-page-01.png');
  expect(readFileSync(`${pages}/page-02.png`)).toMatchSnapshot('print-page-02.png');
});
