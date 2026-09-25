import { expect, test, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { strToU8, unzipSync, zipSync } from 'fflate';

import type { ChatRequest } from '../src/api/client';
import { formatCommunicationMetric } from '../src/presentation/domain';
import { formatFraction, formatMoney } from '../src/presentation/format';

const RAW_NAME = 'CLIENTE_BRUTO_MOT99';
const RAW_FILE = 'FONTE_BRUTA_MOT99.xlsx';
const REFUSAL = 'Posso ajudar apenas com o Motor de Fluxo, o funcionamento da aplicação e os dados deste projeto.';
const python = process.env.MOT_STAGE6_PDF_PYTHON ?? process.env.MOT_E2E_PYTHON
  ?? (process.env.CI === 'true' ? 'python' : process.platform === 'win32' ? '.venv\\Scripts\\python.exe' : '.venv/bin/python');

function workbook(): Buffer {
  const fixture = readFileSync(fileURLToPath(new URL('../src/importer/__fixtures__/valid-minimal.xlsx', import.meta.url)));
  const entries = unzipSync(fixture);
  const rows = [
    ['operacao_id', 'cliente_nome', 'classificacao_perfil', 'direcao', 'data_conhecida', 'data_limite', 'valor_brl'],
    ['MOT99-OUT', RAW_NAME, 'PERFIL_BRUTO_MOT99', 'OUT', '01/01/2026', '03/01/2026', '100,00'],
    ['MOT99-IN', RAW_NAME, 'PERFIL_BRUTO_MOT99', 'IN', '01/01/2026', '03/01/2026', '100,00'],
  ];
  const xml = rows.map((row, index) => `<row r="${index + 1}">${row.map((value, column) =>
    `<c r="${String.fromCharCode(65 + column)}${index + 1}" t="inlineStr"><is><t>${value}</t></is></c>`).join('')}</row>`).join('');
  entries['xl/worksheets/sheet1.xml'] = strToU8(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xml}</sheetData></worksheet>`);
  return Buffer.from(zipSync(entries, { mtime: new Date('2020-01-01T00:00:00Z') }));
}

async function demo(page: Page) {
  await page.goto('/estudos');
  await expect(page.getByRole('heading', { name: 'Estudos', exact: true })).toBeVisible();
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  await expect.poll(async () => (await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot())).studies.length).toBe(1);
  const state = await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot());
  return state.studies[0]!;
}

async function chat(page: Page, question: string) {
  await page.getByRole('button', { name: 'Perguntar', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'ORKE AI', exact: true });
  await panel.getByLabel('Sua pergunta').fill(question);
  const response = page.waitForResponse((item) => item.url().endsWith('/api/v1/chat') && item.request().method() === 'POST');
  await panel.getByRole('button', { name: 'Enviar', exact: true }).click();
  return { panel, response: await response };
}

test('Etapa 6: finalidade opcional percorre Caso observado, Diagnóstico, Replay, Painel A e PDF', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const bodies: string[] = [];
  page.on('request', (request) => { if (request.postData()) bodies.push(request.postData()!); });
  await page.goto('/importar');
  await page.getByLabel('Nome da nova empresa').fill('Empresa observada MOT-99');
  await page.getByRole('button', { name: 'Usar nova empresa neste Caso' }).click();
  await page.getByLabel('Planilha canônica XLSX').setInputFiles({
    name: RAW_FILE, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: workbook(),
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
  await expect(page).toHaveURL(/\/carteira\/[0-9a-f-]+$/);
  const studyId = page.url().split('/').at(-1)!;
  await page.getByRole('radio', { name: 'Caso observado', exact: true }).check();
  await page.getByLabel('Caso confirmado').selectOption(caseId);
  await page.getByRole('button', { name: 'Usar caso confirmado' }).click();
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studySource(id), studyId)).toBe('OBSERVED_CASE');
  await page.goto(profileUrl!);
  await page.getByLabel('Estudo para receber a evidência').selectOption(studyId);
  await page.getByRole('button', { name: 'Usar como evidência em estudo' }).click();
  await page.goto(`/estudos/${studyId}/diagnostico`);
  await page.getByRole('button', { name: 'Executar diagnóstico', exact: true }).click();
  await expect.poll(async () => (await page.request.get('/__e2e__/diagnostics/state')).json()).toMatchObject({ pending: 1 });
  expect((await page.request.post('/__e2e__/diagnostics/release', { data: { fail: false } })).ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'Resultado do motor' })).toBeVisible();
  await expect(page.getByText('IOF padrão por direção', { exact: true })).toBeVisible();
  expect(await page.evaluate((id) => window.__MOTOR_E2E__!.studyExecutionStatuses(id), studyId)).toEqual(['QUEUED', 'SUCCEEDED']);
  expect(bodies.join('\n')).not.toMatch(/CLIENTE_BRUTO_MOT99|PERFIL_BRUTO_MOT99|FONTE_BRUTA_MOT99|PK\\u0003\\u0004/);
  const state = await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot());
  const observed = state.studies.find((item) => item.id === studyId)!;
  const execution = observed.diagnostics[0]!;
  expect(execution.count).toBe(1);
  const document = await page.evaluate((input) => window.__MOTOR_E2E__!.projectDemoCommunication(input), {
    studyId, scenarioId: execution.scenarioId, diagnosticExecutionId: execution.id, replayDay: null,
  });
  expect(document.source.synthetic).toBe(false);
  expect(document.selection.repetitionId).toBe(execution.repetitionId);
  expect(document.assumptions).toContainEqual(expect.objectContaining({ code: 'IOF_APPLICATION_MODE', value: 'FALLBACK_ONLY' }));
  const selected = page.getByRole('region', { name: 'Resultado do motor' });
  await expect(selected.getByTestId('economia-brl')).toHaveText(formatMoney(execution.savingsBrl));
  await expect(selected.getByTestId('netabilidade')).toHaveText(formatFraction(execution.netability));
  await page.getByRole('link', { name: 'Abrir Replay · Fronteira Viva' }).click();
  await expect(page.getByRole('region', { name: 'Repetição exibida' })).toContainText(execution.repetitionId);
  await page.goto(`/estudos/${studyId}/apresentacao?cenario=${execution.scenarioId}&execucao=${execution.id}`);
  await expect(page.getByRole('region', { name: 'Resumo executivo' })).toContainText(formatMoney(execution.savingsBrl));
  await expect(page.getByRole('region', { name: 'Premissas e proveniência' })).toContainText('IOF padrão por direção');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Premissas e proveniência' })).toContainText('IOF padrão por direção');
  await page.emulateMedia({ media: 'print' });
  const pdf = testInfo.outputPath('stage6-observed-purpose-optional.pdf');
  await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
  const inspected = spawnSync(python, ['tests/web_api/render_stage6_pdf.py', '--pdf', pdf,
    '--render-dir', testInfo.outputPath('observed-pages'), '--expected-pages', '7',
    '--expect', execution.id, '--expect', 'IOF padrão por direção', '--expect', 'Limitações e versões'], {
    cwd: '..', encoding: 'utf8', timeout: 30_000,
  });
  expect(inspected.status, inspected.stderr).toBe(0);
  const pdfText = (JSON.parse(inspected.stdout) as { text: string }).text.replace(/\s/g, '');
  expect(pdfText).toContain(document.contextFingerprint);
  for (const metric of document.executiveMetrics) {
    expect(pdfText).toContain(metric.label.replace(/\s/g, ''));
    expect(pdfText).toContain(formatCommunicationMetric(metric).replace(/\s/g, ''));
  }
  await testInfo.attach('observed-purpose-optional-pdf', { path: pdf, contentType: 'application/pdf' });
  await page.emulateMedia({ media: 'screen' });
  await page.goto(`/estudos/${studyId}/apresentacao?cenario=ausente&execucao=ausente`);
  await expect(page.getByRole('alert')).toBeVisible();
  await page.evaluate(() => localStorage.setItem('motor-fluxo:e2e-account', 'b'));
  await page.goto(`/estudos/${studyId}/diagnostico`);
  await expect(page.getByText(/não existe ou pertence a outra conta/)).toBeVisible();
});

test('estudo comum excluído sai da lista, restaura pela lixeira e reabre com a mesma identidade', async ({ page }) => {
  await page.goto('/estudos');
  await page.getByRole('button', { name: 'Novo estudo', exact: true }).click();
  await expect(page).toHaveURL(/\/carteira\/[0-9a-f-]+$/);
  const studyUrl = page.url();
  const studyId = studyUrl.split('/').at(-1)!;
  const sourceBefore = await page.evaluate((id) => window.__MOTOR_E2E__!.studySource(id), studyId);
  await page.goto('/estudos');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Excluir Novo estudo' }).click();
  await expect(page.getByRole('button', { name: 'Abrir Novo estudo' })).toHaveCount(0);
  const trash = page.getByRole('button', { name: 'Lixeira de estudos' });
  await trash.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('list', { name: 'Lixeira de estudos' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir Novo estudo' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Restaurar Novo estudo' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Restaurar Novo estudo' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Voltar aos estudos' }).click();
  await page.getByRole('button', { name: 'Abrir Novo estudo' }).click();
  await expect(page).toHaveURL(studyUrl);
  expect(await page.evaluate((id) => window.__MOTOR_E2E__!.studySource(id), studyId)).toBe(sourceBefore);
});

test('cinco mixes demonstrativos reconciliam diagnóstico, Replay, chat, Painel A e PDF', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const study = await demo(page);
  expect(study.scenarios.map((item) => item.name)).toEqual([
    'equilibrado', 'retail pesado', 'corporativo pesado', 'PSP dominante', 'outbound extremo',
  ]);
  expect(study.diagnostics).toHaveLength(5);
  for (const scenario of study.scenarios) {
    const execution = study.diagnostics.find((item) => item.scenarioId === scenario.id)!;
    const document = await page.evaluate((input) => window.__MOTOR_E2E__!.projectDemoCommunication(input), {
      studyId: study.id, scenarioId: scenario.id, diagnosticExecutionId: execution.id, replayDay: 31,
    });
    expect(document.source).toMatchObject({ synthetic: true });
    expect(document.source.label).toContain('não calibrada');
    expect(document.selection.repetitionId).toBe(execution.repetitionId);
    expect(document.executiveMetrics.find((item) => item.code === 'SAVINGS_BRL')?.value).toBe(execution.savingsBrl);
    expect(document.executiveMetrics.find((item) => item.code === 'NETABILITY')?.value).toBe(execution.netability);
    for (const metric of document.executiveMetrics) {
      expect(metric.evidenceRefs.length).toBeGreaterThan(0);
      for (const ref of metric.evidenceRefs) expect(document.evidenceIndex[ref]).toBeDefined();
    }
    await page.goto(`/estudos/${study.id}/diagnostico?scenarioId=${scenario.id}&executionId=${execution.id}`);
    const selected = page.getByRole('region', { name: 'Resultado do motor' });
    await expect(selected.getByTestId('economia-brl')).toHaveText(formatMoney(execution.savingsBrl));
    await expect(selected.getByTestId('netabilidade')).toHaveText(formatFraction(execution.netability));
    expect(document.selection.repetitionId).toBe(execution.repetitionId);
    await page.goto(`/estudos/${study.id}/replay?executionId=${execution.id}&day=31`);
    await expect(page.getByRole('region', { name: 'Repetição exibida' })).toContainText(execution.repetitionId);
    await page.goto(`/estudos/${study.id}/apresentacao?cenario=${scenario.id}&execucao=${execution.id}&dia=31#resumo`);
    await expect(page.getByRole('region', { name: 'Resumo executivo' })).toContainText(formatMoney(execution.savingsBrl));
    await expect(page.getByRole('region', { name: 'Destaques do Replay' })).toContainText('Dia 31');
  }
  const first = study.diagnostics.find((item) => item.scenarioId === study.scenarios[0]!.id)!;
  const presentation = `/estudos/${study.id}/apresentacao?cenario=${first.scenarioId}&execucao=${first.id}&dia=31#resumo`;
  await page.goto(presentation);
  await page.reload();
  await expect(page).toHaveURL(/#resumo$/);
  await expect(page.getByRole('region', { name: 'Resumo executivo' })).toContainText(formatMoney(first.savingsBrl));
  const document = await page.evaluate((input) => window.__MOTOR_E2E__!.projectDemoCommunication(input), {
    studyId: study.id, scenarioId: first.scenarioId, diagnosticExecutionId: first.id, replayDay: 31,
  });
  const inScope = await chat(page, 'Explique a economia selecionada.');
  expect(inScope.response.status()).toBe(200);
  const sent = inScope.response.request().postDataJSON() as ChatRequest;
  expect(sent.routeContext).toMatchObject({ studyId: study.id, scenarioId: first.scenarioId,
    diagnosticExecutionId: first.id, replayDay: 31 });
  expect(sent.communication).not.toBeNull();
  if (sent.communication === null) throw new Error('Chat sem CommunicationDocumentV1.');
  expect(sent.communication.study).toEqual(document.study);
  expect(sent.communication.selection).toEqual(document.selection);
  expect(sent.communication.source).toEqual(document.source);
  expect(sent.communication.contextFingerprint).toBe(document.contextFingerprint);
  for (const field of ['executiveMetrics', 'composition', 'mechanism', 'economics',
    'robustness', 'comparison', 'replaySnapshot', 'limitations', 'evidenceIndex'] as const) {
    expect(sent.communication[field]).toEqual(document[field]);
  }
  expect(sent.communication.executiveMetrics.find((metric) => metric.code === 'SAVINGS_BRL')?.value).toBe(first.savingsBrl);
  expect(sent.communication.executiveMetrics.find((metric) => metric.code === 'NETABILITY')?.value).toBe(first.netability);
  const answer = await inScope.response.json() as { classification: string; contextFingerprint: string; answer: string };
  expect(answer.classification).toBe('IN_SCOPE');
  expect(answer.contextFingerprint).toBe(document.contextFingerprint);
  await expect(inScope.panel).toContainText(answer.answer);
  await inScope.panel.getByRole('button', { name: 'Fechar chat' }).click();
  expect(answer.contextFingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect((await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot())).studies[0]!.diagnostics).toEqual(study.diagnostics);
  expect((await page.request.post('/__e2e__/chat/control', { data: { mode: 'out' } })).ok()).toBe(true);
  const outside = await chat(page, 'Como está o clima?');
  expect(outside.response.status()).toBe(200);
  const refused = await outside.response.json() as { classification: string; answer: string };
  expect(refused).toMatchObject({ classification: 'OUT_OF_SCOPE', answer: REFUSAL });
  await outside.panel.getByRole('button', { name: 'Fechar chat' }).click();

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Perguntar', exact: true })).toBeHidden();
  const pdf = testInfo.outputPath('stage6-acceptance.pdf');
  await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
  const inspected = spawnSync(python, ['tests/web_api/render_stage6_pdf.py', '--pdf', pdf,
    '--render-dir', testInfo.outputPath('pages'), '--expected-pages', '9',
    '--expect', study.name, '--expect', first.id, '--expect', 'Limitações e versões'], {
    cwd: '..', encoding: 'utf8', timeout: 30_000,
  });
  expect(inspected.status, inspected.stderr).toBe(0);
  const pdfText = (JSON.parse(inspected.stdout) as { text: string }).text.replace(/\s/g, '');
  for (const metric of [...document.executiveMetrics, ...document.composition.metrics,
    ...document.mechanism.metrics, ...document.economics.metrics, ...document.robustness.metrics,
    ...document.replaySnapshot!.metrics]) {
    expect(pdfText).toContain(metric.label.replace(/\s/g, ''));
    expect(pdfText).toContain(formatCommunicationMetric(metric).replace(/\s/g, ''));
  }
  expect(pdfText).toContain(document.contextFingerprint);
});

test('falhas locais conservam a fonte e não transformam ausência em resultado', async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.goto('/importar');
  await page.getByLabel('Nome da nova empresa').fill('Empresa falha MOT-99');
  await page.getByRole('button', { name: 'Usar nova empresa neste Caso' }).click();
  await page.getByLabel('Planilha canônica XLSX').setInputFiles({
    name: 'formula.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: readFileSync(fileURLToPath(new URL('../src/importer/__fixtures__/formula.xlsx', import.meta.url))),
  });
  await page.getByRole('checkbox', { name: /operações explícitas/ }).check();
  await page.getByRole('button', { name: 'Ler planilha' }).click();
  await expect(page.getByRole('alert')).toContainText(/fórmula/i);
  await expect(page.getByRole('heading', { name: 'Caso confirmado' })).toHaveCount(0);

  const study = await demo(page);
  const execution = study.diagnostics[0]!;
  let expiredJobRequests = 0;
  await page.route('**/api/v1/diagnosticos/jobs/**', async (route) => {
    expiredJobRequests += 1; await route.fulfill({ status: 410, body: '' });
  });
  await page.goto(`/estudos/${study.id}/diagnostico?scenarioId=${execution.scenarioId}&executionId=${execution.id}`);
  await expect(page.getByRole('region', { name: 'Resultado do motor' }).getByTestId('economia-brl')).toHaveText(formatMoney(execution.savingsBrl));
  await page.reload();
  await expect(page.getByRole('region', { name: 'Resultado do motor' }).getByTestId('economia-brl')).toHaveText(formatMoney(execution.savingsBrl));
  const persisted = await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot());
  expect(persisted.studies.find((item) => item.id === study.id)!.diagnostics.find((item) => item.id === execution.id)).toEqual(execution);
  expect(expiredJobRequests).toBe(0);
  await page.goto(`/estudos/${study.id}/apresentacao?cenario=${execution.scenarioId}&execucao=${execution.id}`);
  await expect(page.getByRole('heading', { name: study.name, level: 1 })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('navigation', { name: 'Seções da apresentação' }).getByRole('link', { name: 'Premissas' }).click();
  await expect(page.getByRole('region', { name: 'Premissas e proveniência' })).toBeVisible();
  await context.setOffline(false);
  expect((await page.request.post('/__e2e__/chat/control', { data: { mode: 'disabled' } })).ok()).toBe(true);
  const unavailable = await chat(page, 'Explique o produto.');
  expect(unavailable.response.status()).toBe(503);
  await expect(unavailable.panel.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Resumo executivo' })).toContainText(formatMoney(execution.savingsBrl));
  expect((await page.request.post('/__e2e__/chat/control', { data: { mode: 'ok' } })).ok()).toBe(true);
  await unavailable.panel.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(unavailable.panel.getByRole('button', { name: 'Tentar novamente' })).toHaveCount(0);
  await expect(unavailable.panel.getByRole('list', { name: 'Mensagens da conversa' }).locator('article')).toHaveCount(2);
  await unavailable.panel.getByRole('button', { name: 'Fechar chat' }).click();
  await page.evaluate(() => localStorage.setItem('motor-fluxo:e2e-account', 'b'));
  await page.reload();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('IndexedDB indisponível apresenta falha sem publicar Estudo', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(indexedDB, 'open', { configurable: true, value: () => {
      throw new DOMException('Armazenamento indisponível no teste', 'InvalidStateError');
    } });
  });
  await page.goto('/estudos');
  await expect(page.getByRole('heading', { name: 'Estudos', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir Estudo demonstrativo sintético' })).toHaveCount(0);
});

test('timeout, resposta inválida e transporte temporariamente indisponível permitem recuperação manual', async ({ page }) => {
  test.setTimeout(90_000);
  const study = await demo(page);
  const execution = study.diagnostics[0]!;
  await page.goto(`/estudos/${study.id}/apresentacao?cenario=${execution.scenarioId}&execucao=${execution.id}`);
  await expect(page.getByRole('region', { name: 'Resumo executivo' })).toBeVisible();
  await page.route('**/api/v1/chat', (route) => route.abort('failed'));
  await page.getByRole('button', { name: 'Perguntar', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'ORKE AI', exact: true });
  await panel.getByLabel('Sua pergunta').fill('Explique o piloto.');
  await panel.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Resumo executivo' })).toContainText(formatMoney(execution.savingsBrl));
  await page.unroute('**/api/v1/chat');
  await panel.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(panel.getByRole('button', { name: 'Tentar novamente' })).toHaveCount(0);
  for (const mode of ['hold', 'invalid-citation']) {
    expect((await page.request.post('/__e2e__/chat/control', { data: { mode } })).ok()).toBe(true);
    await panel.getByLabel('Sua pergunta').fill(`Explique a execução (${mode}).`);
    const response = page.waitForResponse((item) => item.url().endsWith('/api/v1/chat') && item.request().method() === 'POST');
    await panel.getByRole('button', { name: 'Enviar', exact: true }).click();
    expect((await response).status()).toBe(503);
    await expect(panel.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
    expect((await page.request.post('/__e2e__/chat/control', { data: { mode: 'ok' } })).ok()).toBe(true);
    await panel.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(panel.getByRole('button', { name: 'Tentar novamente' })).toHaveCount(0);
  }
  await expect(page.getByRole('region', { name: 'Resumo executivo' })).toContainText(formatMoney(execution.savingsBrl));
});
