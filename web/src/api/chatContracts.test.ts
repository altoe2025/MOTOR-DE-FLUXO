import { describe, expect, it } from 'vitest';
import { validateChatRequestV1, validateChatResponseV1 } from './validators';
import type { components } from './generated';

const request: components['schemas']['ChatRequestV1'] = {
  apiVersion: '1.0.0', conversationId: 'conversation-1', messageId: 'message-1',
  message: 'O que significa economia?',
  routeContext: {
    routeId: 'studies', helpId: null, studyId: null, scenarioId: null,
    diagnosticExecutionId: null, replayDay: null,
  },
  communication: null, history: [],
};

describe('generated chat contracts', () => {
  it('accepts general context and the 4000-character boundary', () => {
    expect(validateChatRequestV1(request)).toBe(true);
    expect(validateChatRequestV1({ ...request, message: 'a'.repeat(4000) })).toBe(true);
    expect(validateChatRequestV1({ ...request, message: 'a'.repeat(4001) })).toBe(false);
  });

  it('reserves two slots in the conversation and rejects system history', () => {
    const item = { role: 'USER', text: 'Pergunta', contextFingerprint: null };
    expect(validateChatRequestV1({ ...request, history: Array(98).fill(item) })).toBe(true);
    expect(validateChatRequestV1({ ...request, history: Array(99).fill(item) })).toBe(false);
    expect(validateChatRequestV1({ ...request, history: [{ ...item, role: 'SYSTEM' }] })).toBe(false);
  });

  it('validates citation identity and the public response length', () => {
    const response: components['schemas']['ChatResponseV1'] = {
      apiVersion: '1.0.0', messageId: 'message-1', classification: 'IN_SCOPE',
      answer: 'a'.repeat(12000), citations: [{ kind: 'HELP', id: 'economia' }],
      contextFingerprint: null, limitationCodes: [],
    };
    expect(validateChatResponseV1(response)).toBe(true);
    expect(validateChatResponseV1({ ...response, answer: 'a'.repeat(12001) })).toBe(false);
    expect(validateChatResponseV1({ ...response, citations: [{ kind: 'HELP', id: '' }] })).toBe(false);
    expect(validateChatResponseV1({ ...response, apiKey: 'private' })).toBe(false);
  });
});
