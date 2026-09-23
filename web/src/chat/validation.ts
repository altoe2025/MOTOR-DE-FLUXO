import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ChatConversation } from './domain';
import schema from './chat.schema.json';

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile<ChatConversation>(schema);
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
