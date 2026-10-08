import assert from 'node:assert/strict';
import { test } from 'node:test';

const gate = await import('./render-smoke-gate.mjs');

const validConfig = {
  MOT_STAGE6_RENDER_APPROVED: '1',
  MOT_STAGE6_RENDER_BASE_URL: 'https://motor-piloto.onrender.com/',
  MOT_STAGE6_RENDER_EMAIL: 'piloto@example.test',
  MOT_STAGE6_RENDER_PASSWORD: 'synthetic-test-secret',
};

test('configuração explícita aceita somente origem Render HTTPS sem path ou porta', () => {
  assert.deepEqual(gate.requireRenderSmokeConfig(validConfig), {
    baseUrl: 'https://motor-piloto.onrender.com',
    email: 'piloto@example.test',
    password: 'synthetic-test-secret',
  });
  for (const baseUrl of [
    'http://motor-piloto.onrender.com', 'https://motor-piloto.onrender.com/login',
    'https://motor-piloto.onrender.com:8443', 'https://motor-piloto.onrender.com?token=x',
    'https://motor-piloto.onrender.com#fragment', 'https://example.com',
    'https://user:pass@motor-piloto.onrender.com',
  ]) assert.throws(() => gate.requireRenderSmokeConfig({ ...validConfig, MOT_STAGE6_RENDER_BASE_URL: baseUrl }));
});

test('configuração solicitada nunca aceita autorização ou credenciais vazias', () => {
  for (const patch of [
    { MOT_STAGE6_RENDER_APPROVED: '0' }, { MOT_STAGE6_RENDER_EMAIL: '' },
    { MOT_STAGE6_RENDER_EMAIL: '  ' }, { MOT_STAGE6_RENDER_PASSWORD: '' },
    { MOT_STAGE6_RENDER_PASSWORD: '  ' }, { MOT_STAGE6_RENDER_BASE_URL: '' },
  ]) assert.throws(() => gate.requireRenderSmokeConfig({ ...validConfig, ...patch }));
});

const request = {
  messageId: 'message-1',
  communication: {
    contextFingerprint: 'a'.repeat(64),
    executiveMetrics: [{ code: 'SAVINGS_BRL' }],
    composition: { metrics: [] }, mechanism: { metrics: [] }, economics: { metrics: [] },
    robustness: { metrics: [] }, comparison: null, replaySnapshot: null,
    limitations: [{ code: 'SYNTHETIC' }],
    evidenceIndex: { 'evidence-1': { id: 'evidence-1' } },
  },
};
const response = {
  apiVersion: '1.0.0', messageId: 'message-1', classification: 'IN_SCOPE',
  answer: 'A economia é sintética.', citations: [{ kind: 'EVIDENCE', id: 'evidence-1' }],
  contextFingerprint: 'a'.repeat(64), limitationCodes: [],
};
const assistant = {
  role: 'ASSISTANT', status: 'SUCCEEDED', text: 'A economia é sintética.',
  citationCount: 1,
};

test('resposta concluída valida HTTP, documento enviado, citação e mensagem terminal exibida', () => {
  assert.doesNotThrow(() => gate.assertCompletedChatExchange({ status: 200, request, response, assistant }));
  assert.throws(() => gate.assertCompletedChatExchange({ status: 503, request, response, assistant }));
  assert.throws(() => gate.assertCompletedChatExchange({ status: null, request, response: null, assistant: null }));
  assert.throws(() => gate.assertCompletedChatExchange({ status: 200, request, response: null, assistant }));
  assert.throws(() => gate.assertCompletedChatExchange({ status: 200, request, response, assistant: { ...assistant, status: 'FAILED' } }));
  assert.throws(() => gate.assertCompletedChatExchange({ status: 200, request, response: { ...response, contextFingerprint: 'b'.repeat(64) }, assistant }));
  assert.throws(() => gate.assertCompletedChatExchange({ status: 200, request, response: { ...response, classification: 'OUT_OF_SCOPE' }, assistant }));
  assert.throws(() => gate.assertCompletedChatExchange({ status: 200, request, response: { ...response, citations: [{ kind: 'EVIDENCE', id: 'forged' }] }, assistant }));
  assert.throws(() => gate.assertCompletedChatExchange({ status: 200, request, response, assistant: { ...assistant, text: 'Outra resposta' } }));
});

test('citação HELP precisa pertencer ao catálogo conhecido', () => {
  const helpResponse = { ...response, citations: [{ kind: 'HELP', id: 'ajuda-conhecida' }] };
  assert.doesNotThrow(() => gate.assertCompletedChatExchange({ status: 200, request, response: helpResponse,
    assistant, knownHelpIds: ['ajuda-conhecida'] }));
  assert.throws(() => gate.assertCompletedChatExchange({ status: 200, request, response: helpResponse,
    assistant, knownHelpIds: [] }));
});
