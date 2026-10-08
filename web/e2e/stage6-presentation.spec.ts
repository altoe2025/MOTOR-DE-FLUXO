import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { formatMoney } from '../src/presentation/format';
import { readStoredStudy, seedWindowScenario, useDemoSamplingSeed } from './helpers/windowScenario';
import { buildCommunicationDocument } from '../src/communication/buildCommunicationDocument';
import { compareMvpDiagnostics } from '../src/hypotheses/comparison';
import type { ReplayDocument } from '../src/replay/domain';
import { formatCommunicationMetric, PRIMARY_EXECUTIVE_METRIC_CODES } from '../src/presentation/domain';
import type { ChatRequest, ChatResponse } from '../src/api/client';
import { HELP_IDS } from '../src/help/helpIds';
import { loadDemoIfEmpty } from './helpers/demo';

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
  await loadDemoIfEmpty(page);
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
  await page.goto(`/estudos/${study.id}/apresentacao?cenario=${scenario.id}&execucao=${diagnostic.id}#resumo`);
  await expect(page.getByRole('heading', { name: study.name, level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Resumo executivo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar PDF' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Resumo executivo' })).toContainText(formatMoney(diagnostic.savingsBrl));
  await expect(page.getByRole('region', { name: 'Composição e mecanismo' }))
    .toContainText(publication.source.label);
  await expect(page.getByRole('region', { name: 'Composição e mecanismo' })).toContainText('12 participantes');
  await page.getByRole('button', { name: 'Perguntar', exact: true }).click();
  const chat = page.getByRole('dialog', { name: 'ORKE AI', exact: true });
  expect((await page.request.post('/__e2e__/chat/control', { data: { mode: 'ok' } })).ok()).toBe(true);
  async function expectChatContext(helpId: string) {
    await chat.getByLabel('Sua pergunta').fill('Explique a publicação selecionada.');
    const responsePromise = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/chat') && response.request().method() === 'POST');
    await chat.getByRole('button', { name: 'Enviar', exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const request = response.request().postDataJSON() as ChatRequest;
    expect(request.routeContext).toMatchObject({
      routeId: 'presentation', helpId, studyId: study.id, scenarioId: scenario.id,
      diagnosticExecutionId: diagnostic.id, replayDay: null,
    });
    expect(request.context).toEqual({ kind: 'STUDY', document: publication });
    const answer = await response.json() as ChatResponse;
    expect(answer.contextFingerprint).toBe(publication.contextFingerprint);
    await expect(chat.getByRole('list', { name: 'Mensagens da conversa' })).toContainText(answer.answer);
  }
  await expectChatContext(HELP_IDS.PRESENTATION_PAGE);
  await chat.getByRole('button', { name: 'Fechar chat' }).click();
  await page.goto(`/estudos/${study.id}/apresentacao?cenario=${scenario.id}&execucao=${diagnostic.id}#composicao`);
  await expect(page.getByRole('region', { name: 'Composição e mecanismo' })).toBeVisible();
  await expect(page).toHaveURL(/#composicao$/);
  await page.getByRole('button', { name: 'Perguntar', exact: true }).click();
  await expectChatContext(HELP_IDS.COMPOSITION);
  await chat.getByRole('button', { name: 'Fechar chat' }).click();
  const before = await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot());

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.workspace-header')).toBeHidden();
  await expect(page.locator('.print-controls')).toBeHidden();
  await expect(page.locator('.presentation-header')).toContainText(scenario.name);
  await expect(page.locator('.presentation-header')).toContainText('Hipótese sintética não calibrada');
  const evidence = await page.locator('.presentation-page [data-evidence-refs]').evaluateAll((elements) =>
    elements.map((element) => ({ refs: element.getAttribute('data-evidence-refs')!.split(' '),
      sourceIds: element.getAttribute('data-source-ids') })));
  expect(evidence.length).toBeGreaterThan(0);
  for (const item of evidence) {
    expect(item.sourceIds).toBe(item.refs.map((ref) => publication.evidenceIndex[ref]!.sourceId).join(' '));
  }
  const pdf = testInfo.outputPath('presentation.pdf');
  await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
  const inspected = spawnSync(python, ['tests/web_api/render_stage6_pdf.py', '--pdf', pdf,
    '--render-dir', testInfo.outputPath('pages'), '--expect', study.name,
    '--expect', scenario.name, '--expect', 'Resumo executivo',
    '--expect', 'Composição e mecanismo', '--expect', '12 participantes',
    '--expect', 'Hipótese sintética não calibrada'], {
    cwd: '..', encoding: 'utf8', timeout: 30_000,
  });
  if (inspected.status !== 0) {
    const errorCode = (inspected.error as NodeJS.ErrnoException | undefined)?.code;
    expect(inspected.status, `erro=${errorCode ?? 'desconhecido'} sinal=${inspected.signal ?? 'nenhum'}\n${inspected.stderr}`).toBe(0);
  }
  const report = JSON.parse(inspected.stdout) as { pageCount: number; text: string };
  expect(report.pageCount).toBeGreaterThan(0);
  expect(report.text.replace(/\s/g, '')).toContain(formatMoney(diagnostic.savingsBrl).replace(/\s/g, ''));
  const pdfText = report.text.replace(/\s/g, '');
  const metrics = publication.executiveMetrics.filter((metric) => PRIMARY_EXECUTIVE_METRIC_CODES.has(metric.code));
  for (const metric of metrics) {
    expect(pdfText).toContain(metric.label.replace(/\s/g, ''));
    expect(pdfText).toContain(formatCommunicationMetric(metric).replace(/\s/g, ''));
    for (const ref of metric.evidenceRefs) expect(publication.evidenceIndex[ref]).toBeDefined();
  }
  expect(readFileSync(pdf).subarray(0, 4).toString()).toBe('%PDF');
  expect(await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot())).toEqual(before);
});

test('comparação e Replay conservam a seleção publicada e rejeitam seleções inválidas', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/estudos');
  await loadDemoIfEmpty(page);
  const study = (await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot())).studies[0]!;
  const base = study.diagnostics.find((item) => item.scenarioId === study.scenarios[0]!.id)!;
  await page.goto(`/estudos/${study.id}/replay?executionId=${base.id}&day=31`);
  await expect(page.getByRole('heading', { name: 'Fronteira Viva', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Apresentar dia 31' }).click();
  await expect(page).toHaveURL(/&dia=31$/);
  await expect(page.getByRole('heading', { name: study.name, level: 1 })).toBeVisible();

  const scenarioId = await seedWindowScenario(page, study.id);
  await page.goto(`/estudos/${study.id}/diagnostico?scenarioId=${scenarioId}`);
  await expect(page.getByRole('heading', { name: 'Diagnóstico robusto' })).toBeVisible();
  await useDemoSamplingSeed(page);
  await page.getByRole('button', { name: 'Executar diagnóstico', exact: true }).click();
  for (let index = 0; index < 10; index += 1) {
    await expect.poll(async () => (await page.request.get('/__e2e__/diagnostics/state')).json()).toMatchObject({ pending: 1 });
    expect((await page.request.post('/__e2e__/diagnostics/release', { data: { fail: false } })).ok()).toBe(true);
  }
  await expect(page.getByRole('heading', { name: 'Resultado do motor' })).toBeVisible();
  const hypothesis = (await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot()))
    .studies[0]!.diagnostics.find((item) => item.scenarioId === scenarioId)!;
  expect((await page.request.post('/__e2e__/chat/control', { data: { mode: 'ok' } })).ok()).toBe(true);
  for (const selection of [
    { comparisonExecutionId: undefined, replayDay: null },
    { comparisonExecutionId: base.id, replayDay: null },
    { comparisonExecutionId: base.id, replayDay: 31 },
  ]) {
    const suffix = (selection.comparisonExecutionId === undefined ? '' : `&comparacao=${base.id}`)
      + (selection.replayDay === null ? '' : '&dia=31');
    const replayResponse = selection.replayDay === null ? null : page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/replays') && response.request().method() === 'POST');
    await page.goto(`/estudos/${study.id}/apresentacao?cenario=${scenarioId}&execucao=${hypothesis.id}${suffix}`);
    await expect(page.getByRole('heading', { name: study.name, level: 1 })).toBeVisible();
    const storedStudy = await readStoredStudy(page, study.id);
    const baseRecord = storedStudy.executions.find((item) => item.id === base.id)!;
    const hypothesisRecord = storedStudy.executions.find((item) => item.id === hypothesis.id)!;
    if (baseRecord.kind !== 'DIAGNOSTIC' || hypothesisRecord.kind !== 'DIAGNOSTIC') throw new Error('Diagnostic fixtures missing');
    const compared = compareMvpDiagnostics(baseRecord, hypothesisRecord);
    expect(compared.ok).toBe(true);
    if (!compared.ok) throw new Error(compared.reason);
    const replay = replayResponse === null ? null : await (await replayResponse).json() as ReplayDocument;
    const projected = await buildCommunicationDocument({
      study: storedStudy, scenarioId, diagnosticExecutionId: hypothesis.id,
      comparisonExecutionId: selection.comparisonExecutionId ?? null,
      comparison: selection.comparisonExecutionId === undefined ? null : {
        baseExecutionId: base.id, hypothesisExecutionId: hypothesis.id, value: compared.value,
      }, replay, replayDay: selection.replayDay,
    });
    expect(projected.selection.replayDay).toBe(selection.replayDay);
    expect(projected.selection.comparisonExecutionId).toBe(selection.comparisonExecutionId ?? null);
    expect(projected.replaySnapshot === null).toBe(selection.replayDay === null);
    expect(projected.comparison === null).toBe(selection.comparisonExecutionId === undefined);
    await page.getByRole('button', { name: 'Perguntar', exact: true }).click();
    const chat = page.getByRole('dialog', { name: 'ORKE AI', exact: true });
    await chat.getByLabel('Sua pergunta').fill('Explique a publicação selecionada.');
    const responsePromise = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/chat') && response.request().method() === 'POST');
    await chat.getByRole('button', { name: 'Enviar', exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect((response.request().postDataJSON() as ChatRequest).context).toEqual({ kind: 'STUDY', document: projected });
  }
  await page.goto(`/estudos/${study.id}/apresentacao?cenario=${scenarioId}&execucao=${hypothesis.id}&comparacao=ausente`);
  await expect(page.getByRole('alert')).toContainText('comparação solicitada');
  await page.goto(`/estudos/${study.id}/apresentacao?cenario=${scenarioId}&execucao=${hypothesis.id}&dia=-1`);
  await expect(page.getByRole('alert')).toContainText('seleção de comparação ou Replay');
});
