import type { ChatConversation, ChatMessage } from './domain';

export const NOW = '2026-09-23T12:00:00Z';
export function message(changes: Partial<ChatMessage> = {}): ChatMessage {
  return { id: 'question', role: 'USER', text: 'Como funciona?', status: 'SUCCEEDED',
    classification: null, citations: [], contextFingerprint: null, createdAt: NOW, ...changes };
}
export function conversation(changes: Partial<ChatConversation> = {}): ChatConversation {
  return { schemaVersion: '1.0.0', id: 'conversation-1', ownerSub: 'owner-a', studyId: null,
    title: 'Produto', messages: [message()], revision: 1, createdAt: NOW, updatedAt: NOW, ...changes };
}
