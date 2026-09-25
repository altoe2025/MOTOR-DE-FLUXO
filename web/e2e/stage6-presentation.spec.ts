import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { formatMoney } from '../src/presentation/format';
import { formatCommunicationMetric } from '../src/presentation/domain';

const python = process.env.MOT_STAGE6_PDF_PYTHON ?? process.env.MOT_E2E_PYTHON
  ?? (process.env.CI === 'true' ? 'python' : process.platform === 'win32'
    ? '.venv\\Scripts\\python.exe' : '.venv/bin/python');

test('inspetor PDF usa o interpretador E2E quando não há override específico', () => {
  test.skip(process.env.MOT_STAGE6_PDF_PYTHON !== undefined || process.env.MOT_E2E_PYTHON === undefined,
    'requer MOT_E2E_PYTHON sem MOT_STAGE6_PDF_PYTHON');
  expect(python).toBe(process.env.MOT_E2E_PYTHON);
});

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
  await expect(page.getByRole('region', { name: 'Composição e mecanismo' }))
    .toContainText('Receita sintética perfil-operacional-mvp');
  await expect(page.getByRole('region', { name: 'Composição e mecanismo' })).toContainText('12 participantes');
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
  await expect(page.getByRole('region', { name: 'Premissas e proveniência' })).toContainText('IOF de saída');
  await expect(page.getByRole('region', { name: 'Premissas e proveniência' })).toContainText('3,50%');
  await expect(page.getByRole('region', { name: 'Premissas e proveniência' })).toContainText('0,04%');
  await expect(page.getByRole('region', { name: 'Premissas e proveniência' })).toContainText('25,00 bps');
  await expect(page.getByRole('region', { name: 'Limitações e versões' }))
    .toContainText('As premissas de custo não foram observadas na fonte');
  const pdf = testInfo.outputPath('presentation.pdf');
  await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
  const inspected = spawnSync(python, ['tests/web_api/render_stage6_pdf.py', '--pdf', pdf,
    '--render-dir', testInfo.outputPath('pages'), '--expected-pages', '9', '--expect', study.name,
    '--expect', scenario.name, '--expect', diagnostic.id, '--expect', 'Resumo executivo',
    '--expect', 'Premissas e proveniência', '--expect', 'Limitações e versões',
    '--expect', 'Receita sintética perfil-operacional-mvp',
    '--expect', '12 participantes',
    '--expect', 'IOF de saída', '--expect', '3,50%', '--expect', '0,04%',
    '--expect', '25,00 bps', '--expect', 'As premissas de custo não foram observadas na fonte'], {
    cwd: '..', encoding: 'utf8', timeout: 30_000,
  });
  if (inspected.status !== 0) {
    const errorCode = (inspected.error as NodeJS.ErrnoException | undefined)?.code;
    expect(inspected.status, `erro=${errorCode ?? 'desconhecido'} sinal=${inspected.signal ?? 'nenhum'}\n${inspected.stderr}`).toBe(0);
  }
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

test('comparação e Replay chegam ao Painel somente quando explicitamente escolhidos', async ({ page }) => {
  await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  await expect.poll(async () => (await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot())).studies.length).toBe(1);
  const study = (await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot())).studies[0]!;
  const base = study.diagnostics.find((item) => item.scenarioId === study.scenarios[0]!.id)!;

  await page.goto(`/estudos/${study.id}/replay?executionId=${base.id}&day=31`);
  await expect(page.getByRole('heading', { name: 'Fronteira Viva', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Apresentar dia 31' }).click();
  await expect(page).toHaveURL(/&dia=31$/);
  await expect(page.getByRole('region', { name: 'Destaques do Replay' })).toContainText('Dia 31');
  await page.goto(`/estudos/${study.id}/apresentacao?cenario=${base.scenarioId}&execucao=${base.id}`);
  await expect(page.getByRole('region', { name: 'Destaques do Replay' }))
    .toContainText('Nenhum quadro do Replay selecionado');

  await page.goto(`/carteira/${study.id}`);
  const builder = page.getByRole('region', { name: 'Criar hipótese de composição' });
  await builder.getByLabel('Nome da hipótese').fill('Janela para Painel A');
  await builder.getByLabel('Janela em dias').fill('8');
  await builder.getByRole('button', { name: 'Criar hipótese', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/estudos/${study.id}/diagnostico\\?scenarioId=`));
  const scenarioId = new URL(page.url()).searchParams.get('scenarioId')!;
  const before = await (await page.request.get('/__e2e__/diagnostics/state')).json() as { submitted: number };
  await page.evaluate(() => {
    const original = crypto.randomUUID.bind(crypto);
    let first = true;
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => {
      if (first) { first = false; return '00000000-0000-4000-8000-000000000111'; }
      return original();
    } });
  });
  await page.getByRole('button', { name: 'Executar diagnóstico', exact: true }).click();
  for (let index = 0; index < 10; index += 1) {
    await expect.poll(async () => (await page.request.get('/__e2e__/diagnostics/state')).json())
      .toMatchObject({ pending: 1, submitted: before.submitted + index + 1 });
    const released = await page.request.post('/__e2e__/diagnostics/release', { data: { fail: false } });
    expect(released.ok(), await released.text()).toBe(true);
  }
  await expect(page.getByRole('heading', { name: 'Diagnóstico concluído' })).toBeVisible();
  const hypothesis = (await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot()))
    .studies[0]!.diagnostics.find((item) => item.scenarioId === scenarioId)!;
  await page.goto(`/comparar?studyId=${study.id}`);
  await page.getByLabel('Execução base').selectOption(base.id);
  await page.getByLabel('Execução da hipótese').selectOption(hypothesis.id);
  await page.getByRole('button', { name: 'Comparar', exact: true }).click();
  await page.getByRole('link', { name: 'Apresentar comparação' }).click();
  await expect(page).toHaveURL(new RegExp(`&comparacao=${base.id}$`));
  await expect(page.getByRole('region', { name: 'Consequência econômica e comparação' }))
    .not.toContainText('Nenhuma comparação selecionada');
  await expect(page.getByRole('region', { name: 'Destaques do Replay' }))
    .toContainText('Nenhum quadro do Replay selecionado');
  await page.goto(`/estudos/${study.id}/apresentacao?cenario=${scenarioId}&execucao=${hypothesis.id}&comparacao=${base.id}&dia=31`);
  await expect(page.getByRole('region', { name: 'Consequência econômica e comparação' }))
    .not.toContainText('Nenhuma comparação selecionada');
  await expect(page.getByRole('region', { name: 'Destaques do Replay' })).toContainText('Dia 31');

  await page.goto(`/estudos/${study.id}/apresentacao?cenario=${scenarioId}&execucao=${hypothesis.id}&comparacao=ausente`);
  await expect(page.getByRole('alert')).toContainText('comparação solicitada');
  await page.goto(`/estudos/${study.id}/apresentacao?cenario=${scenarioId}&execucao=${hypothesis.id}&dia=-1`);
  await expect(page.getByRole('alert')).toContainText('seleção de comparação ou Replay');
});
