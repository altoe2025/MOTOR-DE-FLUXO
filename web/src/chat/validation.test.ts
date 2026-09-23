import { describe, expect, it } from 'vitest';
import { validateChatConversation } from './validation';
import { conversation, message } from './fixtures';

describe('chat local contract', () => {
  it('accepts bounded user and assistant messages with stable citation IDs', () => {
    expect(validateChatConversation(conversation({ messages: [message({ text: 'q'.repeat(4000) }),
      message({ id: 'answer', role: 'ASSISTANT', text: 'a'.repeat(12000), classification: 'IN_SCOPE',
        citations: [{ kind: 'HELP', id: 'ui.portfolio' }] })] }), 'owner-a').ok).toBe(true);
  });

  it.each([
    ['owner mismatch', { ownerSub: 'owner-b' }],
    ['101 messages', { messages: Array.from({ length: 101 }, (_, i) => message({ id: `${i}` })) }],
    ['long question', { messages: [message({ text: 'q'.repeat(4001) })] }],
    ['long answer', { messages: [message({ role: 'ASSISTANT', text: 'a'.repeat(12001) })] }],
    ['citation without ID', { messages: [message({ citations: [{ kind: 'HELP' }] } as never)] }],
    ['duplicate message', { messages: [message(), message()] }],
    ['invalid timestamp', { createdAt: 'yesterday' }],
    ['invalid fingerprint', { messages: [message({ contextFingerprint: 'bad' })] }],
    ['future version', { schemaVersion: '2.0.0' }],
    ['unknown property', { secret: 'not in contract' }],
    ['unsafe revision', { revision: Number.MAX_SAFE_INTEGER + 1 }],
  ])('rejects %s', (_name, changes) => {
    expect(validateChatConversation({ ...conversation(), ...changes }, 'owner-a').ok).toBe(false);
  });

  it('accepts exactly 100 messages and the three persisted states', () => {
    expect(validateChatConversation(conversation({ messages: Array.from({ length: 100 }, (_, i) =>
      message({ id: `${i}`, role: 'ASSISTANT', text: '', status: i % 2 ? 'PENDING' : 'FAILED' })) }),
    'owner-a').ok).toBe(true);
  });
});
