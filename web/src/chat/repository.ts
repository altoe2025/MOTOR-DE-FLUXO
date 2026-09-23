import type { ChatConversation } from './domain';
import type { ApplicationRepository } from '../storage/applicationRepository';
import type { CASMutation } from '../storage/applicationRepository';
import { DocumentCorruptError, InvalidDocumentError, NotFoundError, OperationConflictError,
  OwnerMismatchError, RevisionConflictError, StorageClosedError } from '../storage/errors';
import { rejectBinary } from '../storage/rejectBinary';
import { canonical } from '../study/fingerprints';
import { validateChatConversation } from './validation';

type ConversationRow = {
  conversation_id: string; owner_sub: string; study_key: string; updated_at: string;
  document: ChatConversation;
};
type OperationRow = {
  operation_id: string; owner_sub: string; conversation_id: string;
  action: 'SAVE' | 'DELETE' | 'PURGED'; intent: string;
};

// Null is not a valid IndexedDB key; the tagged encoding cannot collide with any study ID.
function studyKey(studyId: string | null): string { return JSON.stringify(studyId); }
function validId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function validateMutation(revision: number, operationId: string): void {
  if (!Number.isSafeInteger(revision) || revision < 0 || !validId(operationId)) {
    throw new InvalidDocumentError('Metadados da mutação de chat inválidos.');
  }
}
function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function intentDigest(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** ApplicationRepository's session-scoped chat persistence. No network or implicit recovery. */
export class IndexedDbChatRepository {
  readonly #database: () => Promise<IDBDatabase>;
  readonly #ownerSub: string;
  readonly #transactions = new Set<IDBTransaction>();
  #closed = false;

  constructor(database: () => Promise<IDBDatabase>, ownerSub: string) {
    this.#database = database; this.#ownerSub = ownerSub;
  }

  #assertOpen(): void { if (this.#closed) throw new StorageClosedError(); }

  #readRow(value: unknown): ChatConversation {
    if (typeof value !== 'object' || value === null) throw new DocumentCorruptError();
    const row = value as Partial<ConversationRow>;
    const result = validateChatConversation(row.document, this.#ownerSub);
    if (!result.ok || row.owner_sub !== this.#ownerSub
      || row.conversation_id !== result.value.id || row.study_key !== studyKey(result.value.studyId)
      || row.updated_at !== result.value.updatedAt) throw new DocumentCorruptError();
    return structuredClone(result.value);
  }

  async #transaction<T>(mode: IDBTransactionMode, work: (tx: IDBTransaction) => Promise<T>): Promise<T> {
    this.#assertOpen();
    const db = await this.#database();
    this.#assertOpen();
    const tx = db.transaction(['chat_conversations', 'chat_operations'], mode);
    this.#transactions.add(tx);
    let result: T;
    let failure: unknown;
    const completion = new Promise<T>((resolve, reject) => {
      tx.oncomplete = () => {
        this.#transactions.delete(tx);
        if (this.#closed) reject(new StorageClosedError()); else resolve(result);
      };
      tx.onabort = () => {
        this.#transactions.delete(tx);
        reject(this.#closed ? new StorageClosedError() : failure ?? tx.error ?? new DocumentCorruptError());
      };
      tx.onerror = () => undefined;
    });
    try { result = await work(tx); } catch (error) {
      failure = error;
      try { tx.abort(); } catch { /* A failed request or close may already have aborted it. */ }
    }
    return completion;
  }

  async listChatConversations(studyId: string | null): Promise<ChatConversation[]> {
    if (studyId !== null && !validId(studyId)) throw new InvalidDocumentError();
    return this.#transaction('readonly', async (tx) => {
      const rows = await requestResult<unknown[]>(tx.objectStore('chat_conversations')
        .index('by_owner_study').getAll([this.#ownerSub, studyKey(studyId)]));
      return rows.map((row) => this.#readRow(row)).sort((a, b) =>
        Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
    });
  }

  async getChatConversation(id: string): Promise<ChatConversation | null> {
    if (!validId(id)) throw new InvalidDocumentError();
    return this.#transaction('readonly', async (tx) => {
      const row = await requestResult<unknown>(tx.objectStore('chat_conversations').get(id));
      return row === undefined ? null : this.#readRow(row);
    });
  }

  async saveChatConversation(candidate: CASMutation<ChatConversation>): Promise<ChatConversation> {
    this.#assertOpen();
    rejectBinary(candidate);
    const input = structuredClone(candidate);
    validateMutation(input.expectedRevision, input.operationId);
    const validation = validateChatConversation(input.document, this.#ownerSub);
    if (!validation.ok) {
      if (validation.code === 'OWNER_MISMATCH') throw new OwnerMismatchError();
      throw new InvalidDocumentError();
    }
    if (input.document.revision !== input.expectedRevision + 1) throw new InvalidDocumentError();
    const intent = await intentDigest(input);
    return this.#transaction('readwrite', async (tx) => {
      const conversations = tx.objectStore('chat_conversations');
      const operations = tx.objectStore('chat_operations');
      const previous = await requestResult<OperationRow | undefined>(operations.get(input.operationId));
      const raw = await requestResult<unknown>(conversations.get(input.document.id));
      const current = raw === undefined ? null : this.#readRow(raw);
      if (previous !== undefined) {
        if (previous.owner_sub !== this.#ownerSub || previous.action !== 'SAVE'
          || previous.conversation_id !== input.document.id || previous.intent !== intent
          || current === null) throw new OperationConflictError();
        // Return current state, never an obsolete operation snapshot that could hide newer messages.
        return current;
      }
      if ((current?.revision ?? 0) !== input.expectedRevision) {
        throw new RevisionConflictError(input.expectedRevision, current?.revision ?? 0);
      }
      if (current === null) {
        const history = await requestResult<OperationRow[]>(operations.index('by_owner_conversation')
          .getAll([this.#ownerSub, input.document.id]));
        if (history.length > 0) throw new OperationConflictError('Conversa excluída não pode ser recriada.');
        const count = await requestResult(conversations.index('by_owner_study')
          .count([this.#ownerSub, studyKey(input.document.studyId)]));
        if (count >= 20) throw new InvalidDocumentError('Limite de 20 conversas atingido. Apague uma conversa para continuar.');
      } else if (current.studyId !== input.document.studyId || current.createdAt !== input.document.createdAt) {
        throw new OperationConflictError('A identidade e o Estudo da conversa são imutáveis.');
      }
      conversations.put({ conversation_id: input.document.id, owner_sub: this.#ownerSub,
        study_key: studyKey(input.document.studyId), updated_at: input.document.updatedAt,
        document: input.document } satisfies ConversationRow);
      operations.add({ operation_id: input.operationId, owner_sub: this.#ownerSub,
        conversation_id: input.document.id, action: 'SAVE', intent } satisfies OperationRow);
      return structuredClone(input.document);
    });
  }

  async deleteChatConversation(id: string, expectedRevision: number, operationId: string): Promise<void> {
    this.#assertOpen();
    if (!validId(id)) throw new InvalidDocumentError();
    validateMutation(expectedRevision, operationId);
    const intent = await intentDigest({ id, expectedRevision, operationId });
    return this.#transaction('readwrite', async (tx) => {
      const conversations = tx.objectStore('chat_conversations');
      const operations = tx.objectStore('chat_operations');
      const previous = await requestResult<OperationRow | undefined>(operations.get(operationId));
      if (previous !== undefined) {
        if (previous.owner_sub !== this.#ownerSub || previous.conversation_id !== id
          || previous.action !== 'DELETE' || previous.intent !== intent) throw new OperationConflictError();
        return;
      }
      const raw = await requestResult<unknown>(conversations.get(id));
      if (raw === undefined) throw new NotFoundError();
      const current = this.#readRow(raw);
      if (current.revision !== expectedRevision) throw new RevisionConflictError(expectedRevision, current.revision);
      const history = await requestResult<OperationRow[]>(operations.index('by_owner_conversation')
        .getAll([this.#ownerSub, id]));
      for (const operation of history) operations.put({ ...operation, action: 'PURGED' });
      conversations.delete(id);
      operations.add({ operation_id: operationId, owner_sub: this.#ownerSub,
        conversation_id: id, action: 'DELETE', intent } satisfies OperationRow);
    });
  }

  close(): void {
    this.#closed = true;
    for (const tx of this.#transactions) {
      try { tx.abort(); } catch { /* Transaction may have just completed. */ }
    }
  }
}

/** Explicit reopening recovery only: reads must not fail a live request in another tab.
 * FAILED is retryable by a user action; this helper never creates/sends a request.
 */
export async function recoverInterruptedConversation(
  repository: Pick<ApplicationRepository, 'saveChatConversation'>,
  snapshot: ChatConversation,
  operationId: string,
  now: string,
): Promise<ChatConversation> {
  const document = structuredClone(snapshot);
  if (!document.messages.some((message) => message.status === 'PENDING')) return document;
  return repository.saveChatConversation({ expectedRevision: document.revision, operationId,
    document: { ...document, revision: document.revision + 1, updatedAt: now,
      messages: document.messages.map((message) => message.status === 'PENDING'
        ? { ...message, status: 'FAILED' } : message) } });
}
