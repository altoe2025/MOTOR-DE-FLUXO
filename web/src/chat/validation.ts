import { validateSchema } from '../generated/validators/chat.js';
import type { ChatConversation } from './domain';

type Validation = { ok: true; value: ChatConversation }
  | { ok: false; code: 'INVALID_DOCUMENT' | 'OWNER_MISMATCH' };

export function validateChatConversation(value: unknown, ownerSub: string): Validation {
  if (!validateSchema(value)) return { ok: false, code: 'INVALID_DOCUMENT' };
  if (value.ownerSub !== ownerSub) return { ok: false, code: 'OWNER_MISMATCH' };
  if (new Set(value.messages.map((item) => item.id)).size !== value.messages.length
    || Date.parse(value.updatedAt) < Date.parse(value.createdAt)) {
    return { ok: false, code: 'INVALID_DOCUMENT' };
  }
  return { ok: true, value };
}
