import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import type { ImportStudy, ISODate } from './domain';
import {
  databaseName,
  IndexedDbImportRepository,
} from './indexedDbRepository';
import { RevisionConflictError } from './repository';

const PROJECT = 'project-cas';
const OWNER = 'owner-cas';
const NAME = databaseName(PROJECT, OWNER);

function study(): ImportStudy {
  return {
    schemaVersion: '1.0.0',
    id: 'study-1',
    revision: 3,
    name: 'Concorrência',
    createdAtUtc: '2026-09-18T10:00:00.000Z',
    updatedAtUtc: '2026-09-18T10:00:00.000Z',
    batches: [{
      schemaVersion: '1.0.0',
      id: 'batch-1',
      studyId: 'study-1',
      revision: 1,
      batchSequence: 1,
      importedAtUtc: '2026-09-18T10:00:00.000Z',
      file: {
        fileName: 'operacoes.xlsx', fileSize: 1,
        fileLastModified: 0, sha256: 'sha',
      },
      rows: [{
        versionId: 'version-1', canonicalClientId: 'client-1', rowNumber: 2,
        raw: {
          operacao_id: 'OP-1', cliente_nome: 'Cliente',
          classificacao_perfil: null, direcao: 'OUT',
          data_conhecida: '18/09/2026', data_limite: '20/09/2026',
          valor_brl: '100', finalidade_codigo: 'SERVICO',
        },
        normalized: {
          operationId: 'OP-1', clientName: 'Cliente',
          profileClassification: null, direction: 'OUT',
          knownDate: '2026-09-18' as ISODate,
          deadlineDate: '2026-09-20' as ISODate,
          valueBrl: '100', purposeCode: 'SERVICO',
        },
        errors: [],
      }],
    }],
    events: [],
  };
}

function repository(
  broadcastChannelFactory: null | ((name: string) => {
    postMessage(message: unknown): void;
    close(): void;
  }) = null,
): IndexedDbImportRepository {
  return new IndexedDbImportRepository({
    indexedDB,
    projectRef: PROJECT,
    ownerSub: OWNER,
    broadcastChannelFactory,
  });
}

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(NAME);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('database blocked'));
    request.onsuccess = () => resolve();
  });
});

describe('CAS e atomicidade', () => {
  it('o primeiro writer confirma e o segundo não escreve nenhuma store', async () => {
    const first = repository();
    const second = repository();
    await first.createStudy(study());

    const committed = await first.mutateStudy({
      studyId: 'study-1', expectedRevision: 3, operationId: 'command-1',
      mutation: {
        kind: 'EXCLUDE_OPERATION', operationId: 'OP-1',
        eventId: 'event-1', at: '2026-09-18T11:00:00.000Z',
      },
    });
    expect(committed.revision).toBe(4);

    await expect(second.mutateStudy({
      studyId: 'study-1', expectedRevision: 3, operationId: 'command-2',
      mutation: {
        kind: 'RESTORE_OPERATION', operationId: 'OP-1',
        eventId: 'event-2', at: '2026-09-18T11:01:00.000Z',
      },
    })).rejects.toBeInstanceOf(RevisionConflictError);

    const loaded = await first.loadStudy('study-1');
    expect(loaded?.revision).toBe(4);
    expect(loaded?.events.map((event) => event.id)).toEqual(['event-1']);
    first.close();
    second.close();
  });

  it('repetir operationId devolve o commit sem duplicar evento', async () => {
    const target = repository();
    await target.createStudy(study());
    const input = {
      studyId: 'study-1', expectedRevision: 3, operationId: 'command-1',
      mutation: {
        kind: 'EXCLUDE_OPERATION' as const, operationId: 'OP-1',
        eventId: 'event-1', at: '2026-09-18T11:00:00.000Z',
      },
    };

    const first = await target.mutateStudy(input);
    const repeated = await target.mutateStudy(input);

    expect(repeated).toEqual(first);
    expect(repeated.revision).toBe(4);
    expect(repeated.events.filter((event) => event.id === 'event-1')).toHaveLength(1);
    target.close();
  });

  it('aceita operationId igual a nome do protótipo sem perder idempotência', async () => {
    const target = repository();
    await target.createStudy(study());
    const input = {
      studyId: 'study-1', expectedRevision: 3, operationId: '__proto__',
      mutation: {
        kind: 'EXCLUDE_OPERATION' as const, operationId: 'OP-1',
        eventId: 'event-prototype', at: '2026-09-18T11:00:00.000Z',
      },
    };

    const first = await target.mutateStudy(input);
    const repeated = await target.mutateStudy(input);

    expect(repeated).toEqual(first);
    expect(repeated.events).toHaveLength(1);
    target.close();
  });
});

describe('aviso entre abas', () => {
  it('publica somente os três campos permitidos depois do commit', async () => {
    const messages: unknown[] = [];
    const target = repository(() => ({
      postMessage(message) { messages.push(message); },
      close() {},
    }));
    await target.createStudy(study());
    await target.mutateStudy({
      studyId: 'study-1', expectedRevision: 3, operationId: 'command-1',
      mutation: {
        kind: 'EXCLUDE_OPERATION', operationId: 'OP-1',
        eventId: 'event-1', at: '2026-09-18T11:00:00.000Z',
      },
    });

    expect(messages).toEqual([{
      studyId: 'study-1', revision: 4, operationId: 'command-1',
    }]);
    target.close();
  });

  it('CAS continua ativo sem BroadcastChannel', async () => {
    const first = repository(null);
    const second = repository(null);
    await first.createStudy(study());
    await first.mutateStudy({
      studyId: 'study-1', expectedRevision: 3, operationId: 'command-1',
      mutation: {
        kind: 'EXCLUDE_OPERATION', operationId: 'OP-1',
        eventId: 'event-1', at: '2026-09-18T11:00:00.000Z',
      },
    });
    await expect(second.mutateStudy({
      studyId: 'study-1', expectedRevision: 3, operationId: 'command-2',
      mutation: {
        kind: 'RESTORE_OPERATION', operationId: 'OP-1',
        eventId: 'event-2', at: '2026-09-18T11:01:00.000Z',
      },
    })).rejects.toBeInstanceOf(RevisionConflictError);
    first.close();
    second.close();
  });
});
