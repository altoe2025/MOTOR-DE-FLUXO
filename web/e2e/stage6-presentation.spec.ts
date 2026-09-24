import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { formatMoney } from '../src/presentation/format';
import { formatCommunicationMetric } from '../src/presentation/domain';

const python = process.env.MOT_STAGE6_PDF_PYTHON ?? (process.env.CI === 'true' ? 'python' : process.platform === 'win32'
  ? '.venv\\Scripts\\python.exe' : '.venv/bin/python');

test('deep link e relatório A4 conservam a publicação e ocultam controles', async ({ page }, testInfo) => {
  await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  await expect(page.getByRole('heading', { name: 'Estudos' })).toBeVisible();
  await expect.poll(async () => (await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot())).studies.length)
    .toBe(1);
  const snapshot = await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot());
  const study = snapshot.studies[0]!;
  const scenario = study.scenarios[0]!;
  const diagnostic = study.diagnostics.find((item) => item.scenarioId === scenario.id)!;
  const publication = await page.evaluate((input) => window.__MOTOR_E2E__!.projectDemoCommunication(input), {
    studyId: study.id, scenarioId: scenario.id, diagnosticExecutionId: diagnostic.id, replayDay: null,
  });
  expect(publication.replaySnapshot).toBeNull();
  await page.goto(`/estudos/${study.id}/apresentacao?cenario=${scenario.id}&execucao=${diagnostic.id}#premissas`);
  await expect(page.getByRole('heading', { name: study.name, level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Premissas e proveniência' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar PDF' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Resumo executivo' })).toContainText(formatMoney(diagnostic.savingsBrl));
  await page.getByRole('button', { name: 'Perguntar', exact: true }).click();
  const chat = page.getByRole('dialog', { name: 'Chat', exact: true });
  await expect(chat.locator('.chat-context-label')).toHaveText('Contexto: Apresentação');
  await chat.getByRole('button', { name: 'Fechar chat' }).click();
  await page.getByRole('navigation', { name: 'Seções da apresentação' }).getByRole('link', { name: 'Composição' }).click();
  await expect(page).toHaveURL(/#composicao$/);
  await page.getByRole('button', { name: 'Perguntar', exact: true }).click();
  await expect(chat.locator('.chat-context-label')).toHaveText('Contexto: Composição');
  await chat.getByRole('button', { name: 'Fechar chat' }).click();
  const before = await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot());

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.workspace-header')).toBeHidden();
  await expect(page.locator('.print-controls')).toBeHidden();
  await expect(page.locator('.print-metadata')).toBeVisible();
  await expect(page.locator('.print-metadata')).toContainText(diagnostic.id);
  await expect(page.locator('.presentation-page')).toContainText('Limitações e versões');
  const pdf = testInfo.outputPath('presentation.pdf');
  await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
  const inspected = spawnSync(python, ['tests/web_api/render_stage6_pdf.py', '--pdf', pdf,
    '--render-dir', testInfo.outputPath('pages'), '--expected-pages', '8', '--expect', study.name,
    '--expect', scenario.name, '--expect', diagnostic.id, '--expect', 'Resumo executivo',
    '--expect', 'Premissas e proveniência', '--expect', 'Limitações e versões'], {
    cwd: '..', encoding: 'utf8', timeout: 30_000,
  });
  expect(inspected.status, inspected.stderr).toBe(0);
  const report = JSON.parse(inspected.stdout) as { pageCount: number; text: string };
  expect(report.pageCount).toBeGreaterThan(1);
  expect(report.text.replace(/\s/g, '')).toContain(formatMoney(diagnostic.savingsBrl).replace(/\s/g, ''));
  const pdfText = report.text.replace(/\s/g, '');
  const metrics = [...publication.executiveMetrics, ...publication.composition.metrics,
    ...publication.mechanism.metrics, ...publication.economics.metrics, ...publication.robustness.metrics];
  for (const metric of metrics) {
    expect(pdfText).toContain(metric.label.replace(/\s/g, ''));
    expect(pdfText).toContain(formatCommunicationMetric(metric).replace(/\s/g, ''));
    for (const ref of metric.evidenceRefs) expect(pdfText).toContain(publication.evidenceIndex[ref]!.sourceId);
  }
  expect(pdfText).toContain(publication.contextFingerprint);
  expect(readFileSync(pdf).subarray(0, 4).toString()).toBe('%PDF');
  expect(await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot())).toEqual(before);
});
