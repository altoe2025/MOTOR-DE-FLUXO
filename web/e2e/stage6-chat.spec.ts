import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { strToU8, unzipSync, zipSync } from 'fflate';
import type { ChatConversation } from '../src/chat/domain';
import type { ChatRequest, ChatResponse } from '../src/api/client';

const OWNER = '00000000-0000-4000-8000-000000000021';
const REFUSAL = 'Posso ajudar apenas com o Motor de Fluxo, o funcionamento da aplicação e os dados deste projeto.';
type Demo = { studies: { id: string; scenarios: { id: string }[]; diagnostics: { id: string; scenarioId: string; repetitionId: string; savingsBrl: string }[] }[] };
type Bridge = { demoAcceptanceSnapshot(): Promise<Demo> };
const panel = (page: Page) => page.getByRole('dialog', { name: 'ORKE AI', exact: true });
const messages = (page: Page) => panel(page).getByRole('list', { name: 'Mensagens da conversa' });

async function demo(page: Page) {
  await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  await expect.poll(async () => (await page.evaluate(() => (window.__MOTOR_E2E__ as unknown as Bridge).demoAcceptanceSnapshot())).studies.length).toBe(1);
  return (await page.evaluate(() => (window.__MOTOR_E2E__ as unknown as Bridge).demoAcceptanceSnapshot())).studies[0]!;
}
async function mode(page: Page, value: string) {
  expect((await page.request.post('/__e2e__/chat/control', { data: { mode: value }, maxRetries: 1 })).ok()).toBe(true);
}
async function open(page: Page) {
  await page.getByRole('button', { name: 'Perguntar', exact: true }).click();
  await expect(panel(page).getByLabel('Sua pergunta')).toBeEnabled();
}
async function send(page: Page, question: string) {
  await panel(page).getByLabel('Sua pergunta').fill(question);
  const response = page.waitForResponse((item) => item.url().endsWith('/api/v1/chat') && item.request().method() === 'POST');
  await panel(page).getByRole('button', { name: 'Enviar', exact: true }).click();
  const result = await response;
  return { request: result.request().postDataJSON() as ChatRequest, response: await result.json() as ChatResponse, status: result.status() };
}
async function conversations(page: Page): Promise<ChatConversation[]> {
  return page.evaluate(async (owner) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`motor-fluxo:app:v2:local:${owner}`);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<ChatConversation[]>((resolve, reject) => {
        const request = db.transaction('chat_conversations').objectStore('chat_conversations').getAll();
        request.onsuccess = () => resolve(request.result.map((row: { document: ChatConversation }) => row.document));
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, OWNER);
}
// Arrange quota boundaries directly in IDB; sends/reloads still traverse the real repository.
async function seedQuota(page: Page, count: number, messageCount: number, withHelpCitation = false) {
  await page.evaluate(async ({ owner, count, messageCount, withHelpCitation }) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open(`motor-fluxo:app:v2:local:${owner}`); request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('chat_conversations', 'readwrite');
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
      const store = tx.objectStore('chat_conversations'); store.clear();
      for (let index = 0; index < count; index += 1) {
        const now = new Date().toISOString();
        const document: ChatConversation = { schemaVersion: '1.0.0', id: `quota-${index}`, ownerSub: owner, studyId: null,
          title: `Conversa ${index}`, revision: 1, createdAt: now, updatedAt: now,
          messages: Array.from({ length: messageCount }, (_, offset) => ({ id: `msg-${offset}`, role: offset % 2 ? 'ASSISTANT' : 'USER',
            text: `Histórico ${offset}`, status: 'SUCCEEDED', classification: offset % 2 ? 'IN_SCOPE' : null,
            citations: withHelpCitation && offset === messageCount - 1 ? [{ kind: 'HELP', id: 'page.importacao' }] : [],
            contextFingerprint: null, createdAt: now })) };
        store.put({ conversation_id: document.id, owner_sub: owner, study_key: 'null', updated_at: now, document });
      }
    }); db.close();
  }, { owner: OWNER, count, messageCount, withHelpCitation });
}

test.beforeEach(async ({ page, context }) => {
  test.setTimeout(90_000);
  // No request from the browser is permitted outside this local test server.
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') throw new Error('External network forbidden in chat acceptance');
    await route.continue();
  });
  await mode(page, 'ok');
});

test('presença global nas rotas implementadas; auth sem painel e deep links preservados', async ({ page }) => {
  const study = await demo(page); const execution = study.diagnostics[0]!;
  const company = '00000000-0000-4000-8000-000000000999';
  for (const path of ['/empresas', `/empresas/${company}`, `/empresas/${company}/casos`, `/empresas/${company}/perfis`,
    `/empresas/${company}/estudos`, `/empresas/${company}/importar`, '/importar', '/estudos', '/carteira', `/carteira/${study.id}`,
    '/diagnostico', `/estudos/${study.id}/diagnostico?scenarioId=${execution.scenarioId}&executionId=${execution.id}`,
    `/comparar?studyId=${study.id}`, '/replay', `/estudos/${study.id}/replay?executionId=${execution.id}&day=31`, '/premissas']) {
    await page.goto(path);
    // Wait for lazy route content before testing focus restoration in that screen.
    if (path.includes('/diagnostico?')) await expect(page.getByRole('region', { name: 'Resultado do motor' })).toBeVisible();
    if (path.includes('/replay?')) await expect(page.getByRole('heading', { name: 'Fronteira Viva', exact: true })).toBeVisible();
    await open(page);
    expect(new URL(page.url()).pathname).toBe(path.split('?')[0]);
    await expect(panel(page)).toHaveAttribute('aria-modal', 'false');
    await panel(page).getByRole('button', { name: 'Fechar chat' }).click();
    await expect(page.getByRole('button', { name: 'Perguntar', exact: true })).toBeFocused();
  }
  for (const path of ['/login', '/auth/callback', '/auth/definir-senha']) {
    await page.goto(path); await expect(page.getByRole('button', { name: 'Perguntar', exact: true })).toHaveCount(0);
  }
});

test('quatro classes, recusa server-side, histórico/reload e isolamento de conta', async ({ page }) => {
  await page.goto('/importar'); await open(page);
  const ui = await send(page, 'Como funciona a importação?');
  expect(ui.status).toBe(200); expect(ui.request.communication).toBeNull();
  expect(ui.response.classification).toBe('IN_SCOPE');
  await expect(messages(page)).toContainText(ui.response.answer);
  await expect(panel(page).getByRole('link', { name: 'Importação' })).toBeVisible();
  for (const [value, question, classification] of [['insufficient', 'Qual é a economia sem um estudo?', 'INSUFFICIENT_EVIDENCE'],
    ['out', 'Como está o clima?', 'OUT_OF_SCOPE'], ['mixed', 'Explique importar e o clima.', 'MIXED']]) {
    await mode(page, value!); const result = await send(page, question!);
    expect(result.response.classification).toBe(classification);
    if (value === 'out') expect(result.response.answer).toBe(REFUSAL);
    if (value === 'mixed') expect(result.response.answer).toContain(REFUSAL);
    await expect(messages(page)).toContainText(result.response.answer);
  }
  const saved = await conversations(page); expect(saved[0]!.messages).toHaveLength(8);
  expect(saved[0]!.messages.every((message) => message.status === 'SUCCEEDED')).toBe(true);
  await page.reload(); await open(page);
  expect(await conversations(page)).toEqual(saved);
  await expect(messages(page).locator('article')).toHaveCount(8);
  await expect(panel(page).locator('[aria-live="polite"]')).toBeEmpty();
  await page.evaluate(() => localStorage.setItem('motor-fluxo:e2e-account', 'b'));
  await page.reload(); await open(page); await expect(messages(page).locator('article')).toHaveCount(0);
});

test('contexto da execução, evidências reais, fingerprint e citação restauram execução após reload', async ({ page }) => {
  const study = await demo(page); const execution = study.diagnostics[0]!;
  await page.goto(`/estudos/${study.id}/diagnostico?scenarioId=${execution.scenarioId}&executionId=${execution.id}`);
  await open(page);
  const result = await send(page, 'Explique a economia selecionada.');
  expect(result.status).toBe(200); const document = result.request.communication!;
  const expectedDocument = await page.evaluate((input) => window.__MOTOR_E2E__!.projectDemoCommunication(input), {
    studyId: study.id, scenarioId: execution.scenarioId, diagnosticExecutionId: execution.id, replayDay: null,
  });
  expect(document).toEqual(expectedDocument);
  const savings = document.executiveMetrics.find((item) => item.code === 'SAVINGS_BRL')!;
  expect(savings.value).toBe(execution.savingsBrl);
  for (const ref of savings.evidenceRefs) expect(document.evidenceIndex[ref]).toBeDefined();
  expect(result.response.contextFingerprint).toBe(document.contextFingerprint);
  const serialized = JSON.stringify(result.request);
  for (const forbidden of [OWNER, 'ownerSub', 'access_token', 'mot21-controlled-e2e-token', ...study.diagnostics.slice(1).map((item) => item.id)]) expect(serialized).not.toContain(forbidden);
  await expect(messages(page)).toContainText(result.response.answer);
  await page.reload(); await open(page);
  const link = panel(page).getByRole('navigation', { name: 'Fontes da resposta' }).getByRole('link');
  await expect(link).toHaveAttribute('href', new RegExp(`executionId=${execution.id}`));
  await link.click();
  await expect(page.getByRole('region', { name: 'Resultado do motor' })).toBeVisible();
  const restored = await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot());
  expect(restored.studies.find((item) => item.id === study.id)!.diagnostics.find((item) => item.id === execution.id)!.repetitionId).toBe(execution.repetitionId);
  expect(new URL(page.url()).searchParams.get('executionId')).toBe(execution.id);
});

test('Replay preserva dia da citação e marca contexto anterior ao trocar seleção', async ({ page }) => {
  const study = await demo(page); const execution = study.diagnostics[0]!;
  await page.goto(`/estudos/${study.id}/replay?executionId=${execution.id}&day=31`);
  await expect(page.getByLabel('Selecionar dia')).toHaveValue('31'); await open(page);
  const result = await send(page, 'Explique o dia selecionado.');
  expect(result.status).toBe(200); expect(result.request.routeContext.replayDay).toBe(31);
  expect(result.request.communication?.replaySnapshot?.day).toBe(31);
  await expect(messages(page)).toContainText(result.response.answer);
  await page.getByLabel('Selecionar dia').fill('32');
  await expect(panel(page).getByText('Contexto anterior', { exact: true })).toBeVisible();
  const link = panel(page).getByRole('navigation', { name: 'Fontes da resposta' }).getByRole('link');
  await expect(link).toHaveAttribute('href', /day=31/); await link.click();
  await expect(page.getByLabel('Selecionar dia')).toHaveValue('31');
  expect((await conversations(page)).find((item) => item.studyId === study.id)!.messages.at(-1)!.contextFingerprint).toBe(result.response.contextFingerprint);
});

for (const value of ['disabled', 'fail', 'hold', 'invalid-citation']) {
  test(`falha ${value} permite retry sem duplicar USER nem bloquear produto`, async ({ page }) => {
    await page.goto('/importar'); await open(page); await mode(page, value);
    const result = await send(page, `Explique importar (${value}).`); expect(result.status).toBe(503);
    await expect(panel(page).getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
    const before = (await conversations(page))[0]!; expect(before.messages.at(-1)?.status).toBe('FAILED');
    await mode(page, 'ok');
    await panel(page).getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(messages(page)).toContainText('A importação revisa uma planilha local.');
    const after = (await conversations(page))[0]!; expect(after.messages).toHaveLength(2);
    expect(after.messages[0]!.id).toBe(before.messages[0]!.id);
    expect(after.messages[1]!.id).not.toBe(before.messages[1]!.id);
    await panel(page).getByRole('button', { name: 'Fechar chat' }).click();
    await page.getByRole('link', { name: 'Estudos', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Estudos', exact: true })).toBeVisible();
  });
}

test('cancelamento de request em voo mantém FAILED e retry manual', async ({ page }) => {
  await page.goto('/importar'); await open(page); await mode(page, 'hold');
  await panel(page).getByLabel('Sua pergunta').fill('Explique importar após cancelar.');
  const sent = page.waitForRequest('**/api/v1/chat');
  await panel(page).getByRole('button', { name: 'Enviar', exact: true }).click(); await sent;
  await expect(panel(page).getByLabel('Sua pergunta')).toBeDisabled();
  await panel(page).getByRole('button', { name: 'Cancelar envio' }).click();
  await expect(panel(page).getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  expect((await conversations(page))[0]!.messages.at(-1)?.status).toBe('FAILED');
  await mode(page, 'ok'); await panel(page).getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(messages(page)).toContainText('A importação revisa uma planilha local.');
  expect((await conversations(page))[0]!.messages).toHaveLength(2);
});

test('CAS entre duas abas relê revisão vencedora antes de novo envio', async ({ page, context }) => {
  await page.goto('/importar'); await open(page);
  const second = await context.newPage(); await second.goto('/importar'); await open(second);
  await send(page, 'Pergunta vencedora'); await expect(messages(page)).toContainText('A importação revisa uma planilha local.');
  let requests = 0; second.on('request', (request) => { if (request.url().endsWith('/api/v1/chat')) requests += 1; });
  await panel(second).getByLabel('Sua pergunta').fill('Pergunta após conflito');
  await panel(second).getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(messages(second)).toContainText('Pergunta vencedora');
  await expect(panel(second).getByRole('alert')).toContainText('Não foi possível'); expect(requests).toBe(0);
  await send(second, 'Pergunta após conflito');
  await expect(messages(second).locator('article')).toHaveCount(4);
  const saved = (await conversations(second))[0]!;
  expect(saved.messages.filter((item) => item.role === 'USER').map((item) => item.text)).toEqual(['Pergunta vencedora', 'Pergunta após conflito']);
});

test('quotas de 100 mensagens e 20 conversas oferecem saída sem apagar histórico', async ({ page }) => {
  await page.goto('/importar'); await open(page); await seedQuota(page, 1, 100); await page.reload();
  await page.getByRole('button', { name: 'Perguntar', exact: true }).click();
  await expect(panel(page).getByLabel('Sua pergunta')).toBeDisabled();
  await expect(panel(page)).toContainText('100 mensagens');
  await panel(page).getByRole('button', { name: 'Nova conversa', exact: true }).click();
  await expect(panel(page).getByLabel('Sua pergunta')).toBeEnabled();
  expect((await conversations(page)).some((item) => item.messages.length === 100)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 960 });
  await seedQuota(page, 20, 20, true); await page.reload(); await open(page);
  await expect(panel(page)).toContainText('20 conversas');
  expect(await conversations(page)).toHaveLength(20);
  await expect(messages(page).locator('article')).toHaveCount(20);
  const historySize = await panel(page).locator('.chat-body').evaluate((element) => ({ visible: element.clientHeight, content: element.scrollHeight }));
  expect(historySize.visible).toBeGreaterThan(0);
  expect(historySize.content).toBeGreaterThan(historySize.visible);
  const citation = panel(page).getByRole('navigation', { name: 'Fontes da resposta' }).getByRole('link', { name: 'Importação' });
  await panel(page).getByRole('button', { name: 'Conversas', exact: true }).click();
  const conversation = panel(page).getByRole('navigation', { name: 'Conversas do chat' }).getByRole('button').first();
  await conversation.focus();
  await page.keyboard.press('Enter');
  await expect(messages(page)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Fechar chat' }).focus();
  await page.keyboard.press('Tab');
  await expect(citation).toBeFocused();
  await expect(citation).toBeInViewport();
  for (const { width, height, zoom } of [{ width: 1280, height: 960, zoom: '2' }, { width: 375, height: 667, zoom: '1' }]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((value) => { document.documentElement.style.zoom = value; }, zoom);
    expect(await messages(page).evaluate((element) => element.clientHeight)).toBeGreaterThan(0);
    await citation.scrollIntoViewIfNeeded();
    await expect(citation).toBeInViewport();
    await panel(page).getByLabel('Sua pergunta').focus();
    await expect(panel(page).getByLabel('Sua pergunta')).toBeInViewport();
  }
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
  await panel(page).getByRole('button', { name: 'Excluir conversa', exact: true }).click();
  await panel(page).getByRole('button', { name: 'Confirmar exclusão', exact: true }).click();
  await expect.poll(async () => (await conversations(page)).length).toBe(19);
  await panel(page).getByRole('button', { name: 'Nova conversa', exact: true }).click();
  await expect.poll(async () => (await conversations(page)).length).toBe(20);
});

test('teclado, aria-live incremental, foco e layout a 200%', async ({ page }, testInfo) => {
  await page.goto('/importar');
  const trigger = page.getByRole('button', { name: 'Perguntar', exact: true });
  await trigger.focus(); await page.keyboard.press('Enter');
  await expect(panel(page).getByRole('heading', { name: 'ORKE AI', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(panel(page).getByRole('button', { name: 'Conversas', exact: true })).toBeFocused();
  const result = await send(page, 'Como usar a importação pelo teclado?');
  await expect(panel(page).locator('[aria-live="polite"]')).toHaveText(result.response.answer);
  await expect(messages(page)).not.toHaveAttribute('aria-live');
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await expect(panel(page).getByLabel('Sua pergunta')).toBeVisible();
  const bounds = await panel(page).evaluate((element) => ({ width: element.getBoundingClientRect().width, viewport: window.innerWidth, overflow: element.scrollWidth > element.clientWidth }));
  expect(bounds.width).toBeLessThanOrEqual(bounds.viewport); expect(bounds.overflow).toBe(false);
  await panel(page).getByLabel('Sua pergunta').focus();
  await expect(panel(page).getByLabel('Sua pergunta')).toBeInViewport();
  await page.keyboard.type('Pergunta com zoom'); await page.keyboard.press('Tab');
  await expect(panel(page).getByRole('button', { name: 'Enviar', exact: true })).toBeFocused();
  await expect(panel(page).getByRole('button', { name: 'Enviar', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('chat-200-percent.png'), fullPage: true });
  await panel(page).getByRole('button', { name: 'Fechar chat' }).focus(); await page.keyboard.press('Enter');
  await expect(trigger).toBeFocused();
});

test('arquivo XLSX/raw, credenciais e dados não selecionados ficam fora de request e console', async ({ page }, testInfo) => {
  const logs: string[] = []; const bodies: string[] = [];
  page.on('console', (message) => logs.push(message.text())); page.on('pageerror', (error) => logs.push(error.message));
  page.on('request', (request) => { if (request.postData()) bodies.push(request.postData()!); });
  await page.goto('/importar');
  await page.getByLabel('Nome da nova empresa').fill('EMPRESA_PRIVADA_C6');
  await page.getByRole('button', { name: 'Usar nova empresa neste Caso' }).click();
  const entries = unzipSync(readFileSync(fileURLToPath(new URL('../src/importer/__fixtures__/valid-minimal.xlsx', import.meta.url))));
  const rows = [
    ['operacao_id', 'cliente_nome', 'classificacao_perfil', 'direcao', 'data_conhecida', 'data_limite', 'valor_brl', 'finalidade_codigo'],
    ['RAW_ORDER_C6', 'RAW_CLIENT_C6', 'RAW_PROFILE_C6', 'OUT', '01/01/2026', '03/01/2026', '987,65', 'ANEXO_V_REMESSA_TERCEIRO'],
  ];
  const xml = rows.map((row, index) => `<row r="${index + 1}">${row.map((value, column) => `<c r="${String.fromCharCode(65 + column)}${index + 1}" t="inlineStr"><is><t>${value}</t></is></c>`).join('')}</row>`).join('');
  entries['xl/worksheets/sheet1.xml'] = strToU8(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xml}</sheetData></worksheet>`);
  const bytes = Buffer.from(zipSync(entries, { mtime: new Date('2020-01-01T00:00:00Z') }));
  await page.getByLabel('Planilha canônica XLSX').setInputFiles({ name: 'ARQUIVO_PRIVADO_C6.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: bytes });
  await page.getByRole('checkbox', { name: /operações explícitas/ }).check();
  await page.getByRole('button', { name: 'Ler planilha' }).click();
  await expect(page.getByRole('heading', { name: 'Revisar operações' })).toBeVisible();
  await open(page); const result = await send(page, 'PERGUNTA_PRIVADA_C6: como importar?');
  expect(result.status).toBe(200); expect(result.request.communication).toBeNull();
  const payloads = bodies.join('\n');
  for (const value of ['ARQUIVO_PRIVADO_C6', 'EMPRESA_PRIVADA_C6', 'ownerSub', OWNER, 'mot21-controlled-e2e-token', bytes.toString('base64'), 'xl/worksheets', 'RAW_CLIENT_C6', 'RAW_PROFILE_C6', 'RAW_ORDER_C6', '987.65']) expect(payloads).not.toContain(value);
  for (const value of ['PERGUNTA_PRIVADA_C6', result.response.answer, 'ARQUIVO_PRIVADO_C6', OWNER, 'mot21-controlled-e2e-token', 'RAW_CLIENT_C6', 'RAW_PROFILE_C6', 'RAW_ORDER_C6', '987.65']) expect(logs.join('\n')).not.toContain(value);
  writeFileSync(testInfo.outputPath('browser-console.log'), logs.join('\n'));
  writeFileSync(testInfo.outputPath('privacy-canaries.json'), JSON.stringify({ question: 'PERGUNTA_PRIVADA_C6', answer: result.response.answer, owner: OWNER, bearer: 'mot21-controlled-e2e-token', file: 'ARQUIVO_PRIVADO_C6', 'raw-client': 'RAW_CLIENT_C6', 'raw-profile': 'RAW_PROFILE_C6', 'financial-value': '987.65' }));
});

test('contexto da comparação e citação restauram o par base/hipótese após reload', async ({ page }) => {
  test.setTimeout(180_000);
  const study = await demo(page); const base = study.diagnostics.find((item) => item.scenarioId === study.scenarios[0]!.id)!;
  await page.goto(`/carteira/${study.id}`);
  const builder = page.getByRole('region', { name: 'Criar hipótese de composição' });
  await builder.getByLabel('Nome da hipótese').fill('Janela comparável C6');
  await builder.getByLabel('Janela em dias').fill('8');
  await builder.getByRole('button', { name: 'Criar hipótese', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/estudos/${study.id}/diagnostico\\?scenarioId=`));
  const scenarioId = new URL(page.url()).searchParams.get('scenarioId')!;
  const before = await (await page.request.get('/__e2e__/diagnostics/state')).json() as { submitted: number };
  await page.evaluate(() => {
    const original = crypto.randomUUID.bind(crypto); let first = true;
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => {
      if (first) { first = false; return '00000000-0000-4000-8000-000000000111'; }
      return original();
    } });
  });
  await page.getByRole('button', { name: 'Executar diagnóstico', exact: true }).click();
  for (let index = 0; index < 10; index += 1) {
    await expect.poll(async () => (await page.request.get('/__e2e__/diagnostics/state', { maxRetries: 1 })).json()).toMatchObject({ pending: 1, submitted: before.submitted + index + 1 });
    expect((await page.request.post('/__e2e__/diagnostics/release', { data: { fail: false } })).ok()).toBe(true);
  }
  await expect(page.getByRole('heading', { name: 'Resultado do motor' })).toBeVisible();
  const after = await page.evaluate(() => (window.__MOTOR_E2E__ as unknown as Bridge).demoAcceptanceSnapshot());
  const hypothesis = after.studies[0]!.diagnostics.find((item) => item.scenarioId === scenarioId)!;
  expect(hypothesis).toBeDefined();
  const path = `/comparar?studyId=${study.id}&baseExecutionId=${base.id}&hypothesisExecutionId=${hypothesis.id}`;
  await page.goto(path); await expect(page.getByRole('heading', { name: '4. Exposição residual' })).toBeVisible();
  await open(page);
  const result = await send(page, 'Explique esta comparação.'); expect(result.status).toBe(200);
  expect(result.request.routeContext).not.toHaveProperty('comparisonExecutionId');
  const doc = result.request.communication!;
  expect(doc.selection.comparisonExecutionId).toBe(base.id);
  expect(doc.selection.diagnosticExecutionId).toBe(hypothesis.id);
  expect(doc.executiveMetrics).toEqual([]); expect(doc.comparison?.metrics.length).toBeGreaterThan(0);
  expect(result.response.contextFingerprint).toBe(doc.contextFingerprint);
  const metric = [...doc.executiveMetrics, ...doc.comparison!.metrics].find((item) => item.code === result.response.citations[0]!.id)!;
  expect(result.response.answer).toContain(metric.value!);
  for (const ref of metric.evidenceRefs) expect(doc.evidenceIndex[ref]).toBeDefined();
  await expect(messages(page)).toContainText(result.response.answer);
  await page.reload(); await open(page);
  const citation = panel(page).getByRole('navigation', { name: 'Fontes da resposta' }).getByRole('link');
  await expect(citation).toHaveAttribute('href', path);
  await citation.click();
  // Navigation reloads the comparison and then publishes its chat document.
  // The citation becomes a link again only when that document is available.
  await expect(page.getByLabel('Execução base')).toHaveValue(base.id);
  await expect(page.getByLabel('Execução da hipótese')).toHaveValue(hypothesis.id);
  await expect(page.getByRole('heading', { name: '4. Exposição residual' })).toBeVisible();
  await expect(citation).toHaveAttribute('href', path);
  await send(page, 'Explique novamente esta comparação.');
  const currentCitation = panel(page).getByRole('navigation', { name: 'Fontes da resposta' }).last().getByRole('link');
  await page.getByLabel('Execução da hipótese').selectOption(study.diagnostics[1]!.id);
  await currentCitation.click();
  await expect(page.getByLabel('Execução base')).toHaveValue(base.id);
  await expect(page.getByLabel('Execução da hipótese')).toHaveValue(hypothesis.id);
  await expect(page.getByRole('heading', { name: '4. Exposição residual' })).toBeVisible();
});

test('reload de PENDING recupera FAILED e retry sem duplicação', async ({ page }) => {
  await page.goto('/importar'); await open(page); await mode(page, 'hold');
  await panel(page).getByLabel('Sua pergunta').fill('Pergunta interrompida C6');
  const request = page.waitForRequest('**/api/v1/chat');
  await panel(page).getByRole('button', { name: 'Enviar', exact: true }).click(); await request;
  expect((await conversations(page))[0]!.messages.at(-1)?.status).toBe('PENDING');
  await page.reload(); await open(page);
  await expect(panel(page).getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  await mode(page, 'ok'); await panel(page).getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(messages(page)).toContainText('A importação revisa uma planilha local.');
  expect((await conversations(page))[0]!.messages).toHaveLength(2);
});
