import { describe, expect, it } from 'vitest';

import { DraftRecovery, type DraftStorage } from './draftRecovery';

class MemoryStorage implements DraftStorage {
  readonly values = new Map<string, string>();
  failWrites = false;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException('quota', 'QuotaExceededError');
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('DraftRecovery', () => {
  it('persiste somente o rascunho mínimo na chave da conta', () => {
    const storage = new MemoryStorage();
    const recovery = new DraftRecovery(storage, () => '2026-09-13T01:00:00.000Z');

    const saved = recovery.save('user-a', { studyId: 'study-1', name: 'Carteira Amanda' });

    expect(saved.persistence).toBe('persistent');
    expect(JSON.parse(storage.values.get('motor-fluxo:draft:v1:user-a') ?? '')).toEqual({
      version: 1,
      owner_sub: 'user-a',
      study_id: 'study-1',
      name: 'Carteira Amanda',
      updated_at: '2026-09-13T01:00:00.000Z',
    });
    expect(storage.values.get('motor-fluxo:draft:v1:user-a')).not.toMatch(/token|password|senha/i);
  });

  it('isola rascunhos por owner_sub', () => {
    const storage = new MemoryStorage();
    const recovery = new DraftRecovery(storage);
    recovery.save('user-a', { studyId: 'study-a', name: 'Conta A' });

    expect(recovery.load('user-b')).toEqual({ status: 'empty', draft: null });
    expect(recovery.load('user-a').draft?.name).toBe('Conta A');
  });

  it('não apaga JSON corrompido e informa falha de recuperação', () => {
    const storage = new MemoryStorage();
    const key = 'motor-fluxo:draft:v1:user-a';
    storage.values.set(key, '{quebrado');
    const recovery = new DraftRecovery(storage);

    expect(recovery.load('user-a')).toEqual({ status: 'corrupt', draft: null });
    expect(storage.values.get(key)).toBe('{quebrado');
  });

  it('mantém rascunho em memória quando o storage recusa escrita', () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    const recovery = new DraftRecovery(storage, () => '2026-09-13T01:00:00.000Z');

    expect(recovery.save('user-a', { studyId: 'study-1', name: 'Não perder' }).persistence)
      .toBe('memory');
    expect(recovery.load('user-a')).toMatchObject({
      status: 'memory',
      draft: { owner_sub: 'user-a', name: 'Não perder' },
    });
  });

  it('recusa documento válido pertencente a outra conta', () => {
    const storage = new MemoryStorage();
    storage.values.set('motor-fluxo:draft:v1:user-b', JSON.stringify({
      version: 1,
      owner_sub: 'user-a',
      study_id: 'study-1',
      name: 'Conta A',
      updated_at: '2026-09-13T01:00:00.000Z',
    }));

    expect(new DraftRecovery(storage).load('user-b')).toEqual({ status: 'corrupt', draft: null });
  });

  it('recusa campos extras para nunca transportar credenciais no rascunho', () => {
    const storage = new MemoryStorage();
    storage.values.set('motor-fluxo:draft:v1:user-a', JSON.stringify({
      version: 1, owner_sub: 'user-a', study_id: 'study-1', name: 'A',
      updated_at: '2026-09-13T01:00:00.000Z', token: 'não aceitar',
    }));
    expect(new DraftRecovery(storage).load('user-a').status).toBe('corrupt');
  });
});
