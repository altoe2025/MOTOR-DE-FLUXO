export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type DraftDocument = {
  version: 1;
  owner_sub: string;
  study_id: string;
  name: string;
  updated_at: string;
};

export type DraftLoadResult = {
  status: 'empty' | 'persistent' | 'memory' | 'corrupt' | 'unavailable';
  draft: DraftDocument | null;
};

export type DraftSaveResult = {
  persistence: 'persistent' | 'memory';
  draft: DraftDocument;
};

function keyFor(ownerSub: string): string {
  if (ownerSub.length === 0 || ownerSub.trim() !== ownerSub) throw new Error('owner_sub inválido');
  return `motor-fluxo:draft:v1:${ownerSub}`;
}

function isDraft(value: unknown, ownerSub: string): value is DraftDocument {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const allowedKeys = ['name', 'owner_sub', 'study_id', 'updated_at', 'version'];
  return Object.keys(candidate).sort().every((key, index) => key === allowedKeys[index])
    && Object.keys(candidate).length === allowedKeys.length
    && candidate.version === 1
    && candidate.owner_sub === ownerSub
    && typeof candidate.study_id === 'string'
    && candidate.study_id.length > 0
    && typeof candidate.name === 'string'
    && candidate.name.length <= 120
    && typeof candidate.updated_at === 'string'
    && !Number.isNaN(Date.parse(candidate.updated_at));
}

export class DraftRecovery {
  readonly #memory = new Map<string, DraftDocument>();

  constructor(
    private readonly storage: DraftStorage | null,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  load(ownerSub: string): DraftLoadResult {
    const key = keyFor(ownerSub);
    const memoryDraft = this.#memory.get(key);
    if (memoryDraft !== undefined) return { status: 'memory', draft: structuredClone(memoryDraft) };
    if (this.storage === null) return { status: 'unavailable', draft: null };
    let raw: string | null;
    try {
      raw = this.storage.getItem(key);
    } catch {
      return { status: 'unavailable', draft: null };
    }
    if (raw === null) return { status: 'empty', draft: null };
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isDraft(parsed, ownerSub)) return { status: 'corrupt', draft: null };
      return { status: 'persistent', draft: structuredClone(parsed) };
    } catch {
      return { status: 'corrupt', draft: null };
    }
  }

  save(ownerSub: string, input: { studyId: string; name: string }): DraftSaveResult {
    const key = keyFor(ownerSub);
    if (input.studyId.length === 0 || input.name.length > 120) throw new Error('rascunho inválido');
    const draft: DraftDocument = {
      version: 1,
      owner_sub: ownerSub,
      study_id: input.studyId,
      name: input.name,
      updated_at: this.now(),
    };
    try {
      if (this.storage === null) throw new Error('storage indisponível');
      this.storage.setItem(key, JSON.stringify(draft));
      this.#memory.delete(key);
      return { persistence: 'persistent', draft: structuredClone(draft) };
    } catch {
      this.#memory.set(key, structuredClone(draft));
      return { persistence: 'memory', draft: structuredClone(draft) };
    }
  }

  clear(ownerSub: string): void {
    const key = keyFor(ownerSub);
    this.#memory.delete(key);
    try {
      this.storage?.removeItem(key);
    } catch {
      // A sessão pode encerrar mesmo quando o navegador bloqueia o storage.
    }
  }
}

let browserRecovery: DraftRecovery | null = null;

export function getBrowserDraftRecovery(): DraftRecovery {
  if (browserRecovery === null) {
    let storage: DraftStorage | null = null;
    try { storage = window.localStorage; } catch { storage = null; }
    browserRecovery = new DraftRecovery(storage);
  }
  return browserRecovery;
}
