import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IndexedDbApplicationRepository } from '../storage/indexedDbApplicationRepository';
import { recoverInterruptedConversation } from './repository';
import { conversation, message, NOW } from './fixtures';

const repositories: IndexedDbApplicationRepository[] = [];
const names = new Set<string>();
function repository(projectRef = 'chat-test', ownerSub = 'owner-a',
  migrationSourceLoader?: () => Promise<object>) {
  names.add(`motor-fluxo:app:v2:${encodeURIComponent(projectRef)}:${encodeURIComponent(ownerSub)}`);
  const result = new IndexedDbApplicationRepository({ projectRef, ownerSub,
    ...(migrationSourceLoader ? { migrationSourceLoader } : {}) });
  repositories.push(result);
  return result;
}
afterEach(async () => {
  vi.restoreAllMocks();
  repositories.splice(0).forEach((item) => item.close());
  await Promise.all([...names].map((name) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database still open'));
  })));
  names.clear();
});

describe('persisted chat', () => {
  it('isolates account, project and study including the general conversation bucket', async () => {
    const a = repository();
    await a.saveChatConversation({ document: conversation(), expectedRevision: 0, operationId: 'create' });
    await a.saveChatConversation({ document: conversation({ id: 'study-chat', studyId: 'study-a' }),
      expectedRevision: 0, operationId: 'study' });
    expect((await a.listChatConversations(null)).map((item) => item.id)).toEqual(['conversation-1']);
    expect((await a.listChatConversations('study-a')).map((item) => item.id)).toEqual(['study-chat']);
    expect(await a.listChatConversations('study-b')).toEqual([]);
    for (const other of [repository('chat-test', 'owner-b'), repository('another-project')]) {
      expect(await other.getChatConversation('conversation-1')).toBeNull();
      expect(await other.listChatConversations(null)).toEqual([]);
    }
    await expect(a.saveChatConversation({ document: conversation({ ownerSub: 'owner-b' }),
      expectedRevision: 0, operationId: 'foreign' })).rejects.toMatchObject({ code: 'OWNER_MISMATCH' });
  });

  it('serializes two writers, rejects stale revision and permits rebased append without lost messages', async () => {
    const a = repository(); const b = repository();
    const original = conversation();
    await a.saveChatConversation({ document: original, expectedRevision: 0, operationId: 'create' });
    const outcomes = await Promise.allSettled([a, b].map((repo, i) => repo.saveChatConversation({
      document: { ...original, revision: 2, messages: [...original.messages, message({ id: `q-${i}` })] },
      expectedRevision: 1, operationId: `append-${i}`,
    })));
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'REVISION_CONFLICT' },
    });
    const current = (await b.getChatConversation(original.id))!;
    const loser = outcomes.findIndex((result) => result.status === 'rejected');
    await b.saveChatConversation({ document: { ...current, revision: 3,
      messages: [...current.messages, message({ id: `q-${loser}` })] }, expectedRevision: 2,
    operationId: `append-${loser}` });
    expect((await a.getChatConversation(original.id))?.messages.map((item) => item.id).sort())
      .toEqual(['q-0', 'q-1', 'question']);
  });

  it('idempotent stale save returns the live document and never overwrites a newer revision', async () => {
    const repo = repository();
    const input = { document: conversation(), expectedRevision: 0, operationId: 'create' };
    await repo.saveChatConversation(input);
    const newer = conversation({ revision: 2, title: 'Atualizada' });
    await repo.saveChatConversation({ document: newer, expectedRevision: 1, operationId: 'update' });
    expect(await repo.saveChatConversation(input)).toEqual(newer);
    expect(await repo.getChatConversation(newer.id)).toEqual(newer);
    await expect(repo.saveChatConversation({ ...input, document: conversation({ title: 'Different' }) }))
      .rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
  });

  it('deletes idempotently, scrubs message history and prevents stale saves resurrecting the conversation', async () => {
    const repo = repository();
    const input = { document: conversation(), expectedRevision: 0, operationId: 'create' };
    await repo.saveChatConversation(input);
    await expect(repo.deleteChatConversation(input.document.id, 0, 'delete')).rejects
      .toMatchObject({ code: 'REVISION_CONFLICT' });
    await repo.deleteChatConversation(input.document.id, 1, 'delete');
    await repo.deleteChatConversation(input.document.id, 1, 'delete');
    expect(await repo.getChatConversation(input.document.id)).toBeNull();
    await expect(repo.saveChatConversation(input)).rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
    await expect(repo.saveChatConversation({ ...input, operationId: 'resurrect' }))
      .rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
    const db = await openDatabase();
    const operations = await requestResult(db.transaction('chat_operations').objectStore('chat_operations').getAll());
    expect(JSON.stringify(operations)).not.toContain('Como funciona?');
    db.close();
  });

  it.each([null, 'study-a'])('enforces 20 conversations transactionally in bucket %s without eviction', async (studyId) => {
    const a = repository(); const b = repository();
    for (let i = 0; i < 19; i++) await a.saveChatConversation({ expectedRevision: 0,
      operationId: `create-${i}`, document: conversation({ id: `${i}`, studyId }) });
    const outcomes = await Promise.allSettled([a, b].map((repo, i) => repo.saveChatConversation({
      expectedRevision: 0, operationId: `last-${i}`, document: conversation({ id: `last-${i}`, studyId }),
    })));
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'INVALID_DOCUMENT' } });
    expect(await a.listChatConversations(studyId)).toHaveLength(20);
    await a.deleteChatConversation('0', 1, 'free-slot');
    await a.saveChatConversation({ expectedRevision: 0, operationId: 'replacement',
      document: conversation({ id: 'replacement', studyId }) });
    expect(await a.listChatConversations(studyId)).toHaveLength(20);
  });

  it('snapshots mutable inputs before asynchronous opening and rejects changing study scope', async () => {
    let release: ((value: object) => void) | undefined;
    const repo = repository('chat-test', 'owner-a', () => new Promise((resolve) => { release = resolve; }));
    const input = { document: { ...conversation(), title: 'Original' }, expectedRevision: 0, operationId: 'create' };
    const pending = repo.saveChatConversation(input);
    input.document.title = 'Tampered'; input.operationId = 'tampered';
    await new Promise<void>((resolve) => { const wait = () => release ? resolve() : setTimeout(wait, 0); wait(); });
    release!({});
    expect((await pending).title).toBe('Original');
    await expect(repo.saveChatConversation({ document: conversation({ revision: 2, studyId: 'other' }),
      expectedRevision: 1, operationId: 'move' })).rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
  });

  it('closing while database opens prevents writes and every subsequent chat read', async () => {
    let release: ((value: object) => void) | undefined;
    const repo = repository('chat-test', 'owner-a', () => new Promise((resolve) => { release = resolve; }));
    const pending = repo.saveChatConversation({ document: conversation(), expectedRevision: 0, operationId: 'create' });
    const rejected = expect(pending).rejects.toMatchObject({ code: 'STORAGE_CLOSED' });
    await new Promise<void>((resolve) => { const wait = () => release ? resolve() : setTimeout(wait, 0); wait(); });
    repo.close(); release!({}); await rejected;
    await expect(repo.listChatConversations(null)).rejects.toMatchObject({ code: 'STORAGE_CLOSED' });
    expect(await repository().getChatConversation('conversation-1')).toBeNull();
  });

  it('rejects corrupted stored documents and mismatching denormalized scope', async () => {
    const repo = repository();
    await repo.saveChatConversation({ document: conversation(), expectedRevision: 0, operationId: 'create' });
    const db = await openDatabase();
    const row = await requestResult(db.transaction('chat_conversations').objectStore('chat_conversations').get('conversation-1'));
    await requestResult(db.transaction('chat_conversations', 'readwrite').objectStore('chat_conversations')
      .put({ ...row, document: { ...row.document, ownerSub: 'owner-b' } }));
    await expect(repo.getChatConversation('conversation-1')).rejects.toMatchObject({ code: 'DOCUMENT_CORRUPT' });
    await expect(repo.listChatConversations(null)).rejects.toMatchObject({ code: 'DOCUMENT_CORRUPT' });
    db.close();
  });

  it('recovers PENDING by CAS, preserving fingerprints and requiring manual retry', async () => {
    const repo = repository();
    const pending = conversation({ messages: [message(), message({ id: 'pending', role: 'ASSISTANT',
      text: '', status: 'PENDING', contextFingerprint: 'a'.repeat(64) })] });
    await repo.saveChatConversation({ document: pending, expectedRevision: 0, operationId: 'create' });
    repo.close();
    const reopened = repository();
    const original = (await reopened.getChatConversation(pending.id))!;
    const recovered = await recoverInterruptedConversation(reopened, original, 'recover', NOW);
    expect(recovered).toMatchObject({ revision: 2, messages: [
      { id: 'question', status: 'SUCCEEDED' },
      { id: 'pending', status: 'FAILED', contextFingerprint: 'a'.repeat(64) },
    ] });
    expect(await recoverInterruptedConversation(reopened, original, 'recover', NOW)).toEqual(recovered);
    expect(await recoverInterruptedConversation(reopened, recovered, 'noop', NOW)).toEqual(recovered);
  });

  it('recovery cannot overwrite a response completed by another instance', async () => {
    const repo = repository(); const other = repository();
    const pending = conversation({ messages: [message({ role: 'ASSISTANT', status: 'PENDING', text: '' })] });
    await repo.saveChatConversation({ document: pending, expectedRevision: 0, operationId: 'create' });
    const complete = { ...pending, revision: 2, messages: [message({ role: 'ASSISTANT', text: 'Resposta', classification: 'IN_SCOPE' })] };
    await other.saveChatConversation({ document: complete, expectedRevision: 1, operationId: 'complete' });
    await expect(recoverInterruptedConversation(repo, pending, 'recover', NOW)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(await repo.getChatConversation(pending.id)).toEqual(complete);
  });

  it('closing an active write transaction rolls back the document and its operation atomically', async () => {
    const repo = repository();
    await repo.listChatConversations(null);
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      const result = key === undefined ? original.call(this, value) : original.call(this, value, key);
      if (this.name === 'chat_conversations') queueMicrotask(() => repo.close());
      return result;
    });
    await expect(repo.saveChatConversation({ document: conversation(), expectedRevision: 0, operationId: 'write' }))
      .rejects.toMatchObject({ code: 'STORAGE_CLOSED' });
    vi.restoreAllMocks();
    const reopened = repository();
    expect(await reopened.getChatConversation('conversation-1')).toBeNull();
    expect(await reopened.saveChatConversation({ document: conversation(), expectedRevision: 0, operationId: 'write' }))
      .toEqual(conversation());
  });

  it('delete versus append commits one revision and never loses an acknowledged append', async () => {
    const a = repository(); const b = repository();
    await a.saveChatConversation({ document: conversation(), expectedRevision: 0, operationId: 'create' });
    const outcomes = await Promise.allSettled([
      a.deleteChatConversation('conversation-1', 1, 'delete'),
      b.saveChatConversation({ document: conversation({ revision: 2, messages: [message(), message({ id: 'new' })] }),
        expectedRevision: 1, operationId: 'append' }),
    ]);
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const current = await a.getChatConversation('conversation-1');
    if (outcomes[1]?.status === 'fulfilled') expect(current?.messages.map((item) => item.id)).toEqual(['question', 'new']);
    else expect(current).toBeNull();
  });

  it('rejects invalid content before persistence and leaves prior revision intact', async () => {
    const repo = repository();
    await repo.saveChatConversation({ document: conversation(), expectedRevision: 0, operationId: 'create' });
    for (const messages of [[message({ text: 'x'.repeat(4001) })],
      Array.from({ length: 101 }, (_, i) => message({ id: `${i}` })),
      [message({ citations: [{ kind: 'HELP', id: '' }] })]]) {
      await expect(repo.saveChatConversation({ document: conversation({ revision: 2, messages }),
        expectedRevision: 1, operationId: 'invalid' })).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' });
    }
    expect(await repo.getChatConversation('conversation-1')).toEqual(conversation());
  });
});

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function openDatabase() {
  return requestResult(indexedDB.open('motor-fluxo:app:v2:chat-test:owner-a'));
}
