import type { ApplicationRepository } from '../storage/applicationRepository';
import { RevisionConflictError } from '../storage/errors';
import type { CompanyRecord, ObservedCase } from '../cases/domain';
import type { OperationalProfileVersion } from '../profiles/domain';
import { attachOperationalProfileEvidence } from './domain';
import type { StudyDocument, StudyDocumentV3 } from './model';

export type StudyControllerStatus =
  | 'IDLE'
  | 'DIRTY'
  | 'SAVING'
  | 'SAVED'
  | 'CONFLICT'
  | 'STORAGE_FAILURE'
  | 'CLOSED';

export type StudyControllerSnapshot = Readonly<{
  status: StudyControllerStatus;
  ownerSub: string | null;
  sessionEpoch: number;
  document: StudyDocument | null;
  error: unknown | null;
}>;

export type StudyBroadcastMessage = Readonly<{
  studyId: string;
  revision: number;
  operationId: string;
}>;

type MessageListener = (event: MessageEvent<StudyBroadcastMessage>) => void;

export interface StudyChannel {
  postMessage(message: StudyBroadcastMessage): void;
  addEventListener(type: 'message', listener: MessageListener): void;
  removeEventListener(type: 'message', listener: MessageListener): void;
  close(): void;
}

export type StudyChannelFactory = (name: string) => StudyChannel;

export interface StudyControllerScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export type StudyControllerOptions = Readonly<{
  repositoryFactory(ownerSub: string): ApplicationRepository;
  channelFactory?: StudyChannelFactory;
  scheduler?: StudyControllerScheduler;
  cancelPending?: () => Promise<void> | void;
  operationId?: () => string;
  now?: () => string;
  autosaveDelayMs?: number;
  channelScope?: string;
}>;

type PendingSave = Readonly<{
  expectedRevision: number;
  document: StudyDocument;
}>;

type SessionWork = Readonly<{
  ownerSub: string;
  epoch: number;
  signal: AbortSignal;
}>;

export class StudyControllerClosedError extends Error {
  constructor() {
    super('Controlador de estudos fechado.');
    this.name = 'StudyControllerClosedError';
  }
}

export class StudyControllerSessionError extends Error {
  constructor() {
    super('Uma sessão autenticada é necessária.');
    this.name = 'StudyControllerSessionError';
  }
}

const defaultScheduler: StudyControllerScheduler = {
  setTimeout(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs);
  },
  clearTimeout(handle) {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

function nativeChannelFactory(name: string): StudyChannel {
  return new BroadcastChannel(name);
}

function defaultOperationId(): string {
  return crypto.randomUUID();
}

function isBroadcastMessage(value: unknown): value is StudyBroadcastMessage {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 3
    && typeof record.studyId === 'string'
    && record.studyId.length > 0
    && Number.isSafeInteger(record.revision)
    && (record.revision as number) > 0
    && typeof record.operationId === 'string'
    && record.operationId.length > 0;
}

export class StudyController {
  readonly #repositoryFactory: StudyControllerOptions['repositoryFactory'];
  readonly #channelFactory: StudyChannelFactory | null;
  readonly #scheduler: StudyControllerScheduler;
  readonly #cancelPending: () => Promise<void> | void;
  readonly #operationId: () => string;
  readonly #now: () => string;
  readonly #autosaveDelayMs: number;
  readonly #channelScope: string;
  readonly #listeners = new Set<() => void>();
  readonly #abortControllers = new Set<AbortController>();
  readonly #pending: PendingSave[] = [];

  #snapshot: StudyControllerSnapshot = {
    status: 'IDLE',
    ownerSub: null,
    sessionEpoch: 0,
    document: null,
    error: null,
  };
  #repository: ApplicationRepository | null = null;
  #channel: StudyChannel | null = null;
  #autosaveHandle: unknown = null;
  #drainPromise: Promise<StudyDocument | null> | null = null;
  #persistedRevision = 0;
  #selectionEpoch = 0;
  #conflictVersion = 0;
  #closed = false;

  readonly #onChannelMessage: MessageListener = (event) => {
    if (!isBroadcastMessage(event.data)) return;
    void this.#acceptBroadcast(event.data);
  };

  constructor(options: StudyControllerOptions) {
    if (!Number.isFinite(options.autosaveDelayMs ?? 250) || (options.autosaveDelayMs ?? 250) < 0) {
      throw new Error('Intervalo de autosave inválido.');
    }
    this.#repositoryFactory = options.repositoryFactory;
    this.#channelFactory = options.channelFactory
      ?? (typeof BroadcastChannel === 'undefined' ? null : nativeChannelFactory);
    this.#scheduler = options.scheduler ?? defaultScheduler;
    this.#cancelPending = options.cancelPending ?? (() => undefined);
    this.#operationId = options.operationId ?? defaultOperationId;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#autosaveDelayMs = options.autosaveDelayMs ?? 250;
    this.#channelScope = options.channelScope ?? 'default';
  }

  get snapshot(): StudyControllerSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#assertOpen();
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async switchSession(ownerSub: string | null): Promise<number> {
    this.#assertOpen();
    if (ownerSub !== null && ownerSub.length === 0) throw new StudyControllerSessionError();

    const epoch = this.#snapshot.sessionEpoch + 1;
    this.#cancelAutosave();
    this.#pending.splice(0);
    this.#drainPromise = null;
    this.#selectionEpoch += 1;
    this.#abortAll();
    this.#closeSessionResources();
    this.#persistedRevision = 0;
    this.#publish({
      status: 'IDLE',
      ownerSub,
      sessionEpoch: epoch,
      document: null,
      error: null,
    });

    await this.#cancelPending();
    if (this.#closed || this.#snapshot.sessionEpoch !== epoch) return this.#snapshot.sessionEpoch;
    if (ownerSub === null) return epoch;

    const repository = this.#repositoryFactory(ownerSub);
    let channel: StudyChannel | null = null;
    try {
      channel = this.#channelFactory?.(
        `motor-fluxo:study:v2:${encodeURIComponent(this.#channelScope)}:${encodeURIComponent(ownerSub)}`,
      ) ?? null;
    } catch {
      // O canal é apenas uma otimização; CAS continua sendo a autoridade.
    }
    if (this.#closed || this.#snapshot.sessionEpoch !== epoch) {
      repository.close();
      channel?.close();
      return this.#snapshot.sessionEpoch;
    }
    this.#repository = repository;
    this.#channel = channel;
    channel?.addEventListener('message', this.#onChannelMessage);
    return epoch;
  }

  async loadStudy(id: string): Promise<StudyDocument | null> {
    this.#assertOpen();
    const { repository, epoch } = this.#session();
    this.#pending.splice(0);
    this.#cancelAutosave();
    this.#drainPromise = null;
    const selectionEpoch = ++this.#selectionEpoch;
    let document: StudyDocument | null;
    try {
      document = await repository.getStudy(id);
    } catch (error) {
      if (!this.#isCurrent(repository, epoch, selectionEpoch)) return null;
      throw error;
    }
    if (!this.#isCurrent(repository, epoch, selectionEpoch)) return null;
    this.#persistedRevision = document?.revision ?? 0;
    this.#publish({
      ...this.#snapshot,
      status: document === null ? 'IDLE' : 'SAVED',
      document,
      error: null,
    });
    return document;
  }

  startNewStudy(): void {
    this.#assertOpen();
    this.#session();
    this.#pending.splice(0);
    this.#cancelAutosave();
    this.#drainPromise = null;
    this.#selectionEpoch += 1;
    this.#persistedRevision = 0;
    this.#publish({ ...this.#snapshot, status: 'IDLE', document: null, error: null });
  }

  /** Read-only queries deliberately stay behind the session-bound controller. */
  async listStudies(includeDeleted = false): Promise<StudyDocument[]> {
    this.#assertOpen();
    const { repository, epoch } = this.#session();
    const studies = await repository.listStudies({ includeDeleted });
    return this.#isCurrent(repository, epoch) ? studies : [];
  }

  async listObservedCases(companyId?: string): Promise<ObservedCase[]> {
    this.#assertOpen();
    const { repository, epoch } = this.#session();
    const cases = await repository.listObservedCases(companyId);
    return this.#isCurrent(repository, epoch) ? cases : [];
  }

  async listCompanies(): Promise<CompanyRecord[]> {
    this.#assertOpen();
    const { repository, epoch } = this.#session();
    const companies = await repository.listCompanies();
    return this.#isCurrent(repository, epoch) ? companies : [];
  }

  async listOperationalProfileVersions(companyId?: string): Promise<OperationalProfileVersion[]> {
    this.#assertOpen();
    const { repository, epoch } = this.#session();
    const profiles = await repository.listOperationalProfileVersions(companyId);
    return this.#isCurrent(repository, epoch) ? profiles : [];
  }

  async appendOperationalProfileVersion(
    document: OperationalProfileVersion,
  ): Promise<OperationalProfileVersion> {
    this.#assertOpen();
    const { repository, epoch } = this.#session();
    if (document.ownerSub !== this.#snapshot.ownerSub) {
      throw new Error('Owner do Perfil Operacional diverge da sessão.');
    }
    const stored = await repository.appendOperationalProfileVersion({
      operationId: this.#operationId(),
      document,
    });
    if (!this.#isCurrent(repository, epoch)) throw new StudyControllerSessionError();
    return stored;
  }

  async attachProfileToCurrentStudy(
    profile: OperationalProfileVersion,
  ): Promise<StudyDocumentV3> {
    this.#assertOpen();
    const { repository, epoch } = this.#session();
    const current = this.#snapshot.document;
    if (current === null || this.#snapshot.status !== 'SAVED') {
      throw new Error('Carregue um estudo salvo antes de anexar evidências.');
    }
    const selectionEpoch = this.#selectionEpoch;
    const attached = await attachOperationalProfileEvidence(current, profile, this.#now());
    if (!this.#isCurrent(repository, epoch, selectionEpoch)) {
      throw new StudyControllerSessionError();
    }
    if (attached === current) return current;
    const operationId = this.#operationId();
    this.#publish({ ...this.#snapshot, status: 'SAVING', error: null });
    try {
      const saved = await repository.saveStudy({
        document: attached,
        expectedRevision: current.revision,
        operationId,
      });
      if (!this.#isCurrent(repository, epoch, selectionEpoch)) {
        throw new StudyControllerSessionError();
      }
      this.#persistedRevision = saved.revision;
      this.#channel?.postMessage({ studyId: saved.id, revision: saved.revision, operationId });
      this.#publish({ ...this.#snapshot, status: 'SAVED', document: saved, error: null });
      return saved;
    } catch (error) {
      if (this.#isCurrent(repository, epoch, selectionEpoch)) {
        this.#publish({
          ...this.#snapshot,
          status: error instanceof RevisionConflictError ? 'CONFLICT' : 'STORAGE_FAILURE',
          error,
        });
      }
      throw error;
    }
  }

  async getObservedCase(id: string): Promise<ObservedCase | null> {
    this.#assertOpen();
    const { repository, epoch } = this.#session();
    const observedCase = await repository.getObservedCase(id);
    if (!this.#isCurrent(repository, epoch)) throw new StudyControllerSessionError();
    return observedCase;
  }

  async restoreStudy(id: string, expectedRevision: number): Promise<StudyDocument> {
    this.#assertOpen();
    const { repository, epoch } = this.#session();
    const restored = await repository.restoreStudy(id, expectedRevision, this.#operationId());
    if (!this.#isCurrent(repository, epoch)) throw new StudyControllerSessionError();
    return restored;
  }

  async purgeStudy(id: string): Promise<void> {
    this.#assertOpen();
    const { repository, epoch } = this.#session();
    await repository.purgeStudy(id);
    if (!this.#isCurrent(repository, epoch)) throw new StudyControllerSessionError();
  }

  edit(document: StudyDocument): void {
    this.#assertOpen();
    this.#session();
    const current = this.#snapshot.document;
    const invalidNewStudy = current === null
      && (this.#persistedRevision !== 0 || this.#pending.length > 0 || document.revision !== 1);
    if (document.ownerSub !== this.#snapshot.ownerSub
      || invalidNewStudy
      || (current !== null && document.id !== current.id)) {
      throw new Error('Edição não pertence ao estudo e à sessão correntes.');
    }
    const previousRevision = this.#pending.at(-1)?.document.revision ?? this.#persistedRevision;
    if (document.revision !== previousRevision + 1) {
      throw new Error('A edição deve suceder a última revisão enfileirada.');
    }
    this.#pending.push({ expectedRevision: previousRevision, document });
    this.#publish({ ...this.#snapshot, status: 'DIRTY', document, error: null });
    this.#scheduleAutosave();
  }

  async flush(): Promise<StudyDocument | null> {
    this.#assertOpen();
    this.#session();
    this.#cancelAutosave();
    return this.#startDrain();
  }

  async saveDetachedStudy(
    document: StudyDocument,
    expectedRevision: number,
  ): Promise<StudyDocument | null> {
    this.#assertOpen();
    const { repository, epoch } = this.#session();
    const operationId = this.#operationId();
    try {
      const saved = await repository.saveStudy({ document, expectedRevision, operationId });
      if (!this.#isCurrent(repository, epoch)) return null;
      this.#channel?.postMessage({ studyId: saved.id, revision: saved.revision, operationId });
      const current = this.#snapshot.document;
      if (current?.id === saved.id && this.#snapshot.status === 'SAVED') {
        this.#persistedRevision = saved.revision;
        this.#publish({ ...this.#snapshot, document: saved, error: null });
      }
      return saved;
    } catch (error) {
      if (this.#isCurrent(repository, epoch)) {
        this.#publish({ ...this.#snapshot, status: 'STORAGE_FAILURE', error });
      }
      throw error;
    }
  }

  async runForCurrentSession<T>(work: (session: SessionWork) => Promise<T>): Promise<T | null> {
    this.#assertOpen();
    const { epoch } = this.#session();
    const ownerSub = this.#snapshot.ownerSub!;
    const abortController = new AbortController();
    this.#abortControllers.add(abortController);
    try {
      const result = await work({ ownerSub, epoch, signal: abortController.signal });
      return !abortController.signal.aborted && this.#snapshot.sessionEpoch === epoch
        ? result
        : null;
    } catch (error) {
      if (abortController.signal.aborted || this.#snapshot.sessionEpoch !== epoch) return null;
      throw error;
    } finally {
      this.#abortControllers.delete(abortController);
    }
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#cancelAutosave();
    this.#pending.splice(0);
    this.#drainPromise = null;
    this.#selectionEpoch += 1;
    this.#abortAll();
    this.#closeSessionResources();
    void Promise.resolve(this.#cancelPending()).catch(() => undefined);
    this.#publish({
      status: 'CLOSED',
      ownerSub: null,
      sessionEpoch: this.#snapshot.sessionEpoch + 1,
      document: null,
      error: null,
    });
    this.#listeners.clear();
  }

  #session(): { repository: ApplicationRepository; epoch: number } {
    if (this.#repository === null || this.#snapshot.ownerSub === null) {
      throw new StudyControllerSessionError();
    }
    return { repository: this.#repository, epoch: this.#snapshot.sessionEpoch };
  }

  #assertOpen(): void {
    if (this.#closed) throw new StudyControllerClosedError();
  }

  #publish(snapshot: StudyControllerSnapshot): void {
    this.#snapshot = snapshot;
    this.#listeners.forEach((listener) => listener());
  }

  #scheduleAutosave(): void {
    if (this.#autosaveHandle !== null) return;
    this.#autosaveHandle = this.#scheduler.setTimeout(() => {
      this.#autosaveHandle = null;
      void this.#startDrain().catch(() => undefined);
    }, this.#autosaveDelayMs);
  }

  #cancelAutosave(): void {
    if (this.#autosaveHandle === null) return;
    this.#scheduler.clearTimeout(this.#autosaveHandle);
    this.#autosaveHandle = null;
  }

  #startDrain(): Promise<StudyDocument | null> {
    if (this.#drainPromise !== null) return this.#drainPromise;
    const promise = this.#drain();
    this.#drainPromise = promise;
    void promise.then(
      () => { if (this.#drainPromise === promise) this.#drainPromise = null; },
      () => { if (this.#drainPromise === promise) this.#drainPromise = null; },
    );
    return promise;
  }

  async #drain(): Promise<StudyDocument | null> {
    const { repository, epoch } = this.#session();
    const selectionEpoch = this.#selectionEpoch;
    while (this.#pending.length > 0) {
      const pending = this.#pending[0]!;
      const operationId = this.#operationId();
      const conflictVersion = this.#conflictVersion;
      this.#publish({ ...this.#snapshot, status: 'SAVING', error: null });
      try {
        const saved = await repository.saveStudy({ ...pending, operationId });
        if (!this.#isCurrent(repository, epoch, selectionEpoch)) return null;
        const conflictDuringCommit = this.#conflictVersion !== conflictVersion
          || this.#snapshot.status === 'CONFLICT';
        this.#pending.shift();
        this.#persistedRevision = saved.revision;
        this.#channel?.postMessage({ studyId: saved.id, revision: saved.revision, operationId });
        const current = this.#snapshot.document;
        this.#publish({
          ...this.#snapshot,
          status: conflictDuringCommit
            ? 'CONFLICT'
            : this.#pending.length === 0 ? 'SAVED' : 'DIRTY',
          document: current?.revision === saved.revision ? saved : current,
          error: null,
        });
        if (conflictDuringCommit) return this.#snapshot.document;
      } catch (error) {
        if (!this.#isCurrent(repository, epoch, selectionEpoch)) return null;
        this.#publish({
          ...this.#snapshot,
          status: error instanceof RevisionConflictError ? 'CONFLICT' : 'STORAGE_FAILURE',
          error,
        });
        throw error;
      }
    }
    return this.#snapshot.document;
  }

  async #acceptBroadcast(message: StudyBroadcastMessage): Promise<void> {
    if (this.#closed) return;
    const current = this.#snapshot.document;
    if (current === null || current.id !== message.studyId || message.revision <= this.#persistedRevision) {
      return;
    }
    if (this.#snapshot.status !== 'SAVED') {
      this.#conflictVersion += 1;
      this.#publish({ ...this.#snapshot, status: 'CONFLICT', error: null });
      return;
    }

    const { repository, epoch } = this.#session();
    const expectedDocument = current;
    try {
      const stored = await repository.getStudy(message.studyId);
      if (!this.#isCurrent(repository, epoch) || stored === null || stored.revision < message.revision) return;
      if (this.#snapshot.status !== 'SAVED' || this.#snapshot.document !== expectedDocument) {
        if (this.#snapshot.document?.id === message.studyId) {
          this.#conflictVersion += 1;
          this.#publish({ ...this.#snapshot, status: 'CONFLICT', error: null });
        }
        return;
      }
      this.#persistedRevision = stored.revision;
      this.#publish({ ...this.#snapshot, document: stored, error: null });
    } catch (error) {
      if (!this.#isCurrent(repository, epoch)) return;
      this.#publish({ ...this.#snapshot, status: 'STORAGE_FAILURE', error });
    }
  }

  #isCurrent(repository: ApplicationRepository, epoch: number, selectionEpoch?: number): boolean {
    return !this.#closed
      && this.#repository === repository
      && this.#snapshot.sessionEpoch === epoch
      && (selectionEpoch === undefined || this.#selectionEpoch === selectionEpoch);
  }

  #abortAll(): void {
    this.#abortControllers.forEach((controller) => controller.abort());
    this.#abortControllers.clear();
  }

  #closeSessionResources(): void {
    if (this.#channel !== null) {
      this.#channel.removeEventListener('message', this.#onChannelMessage);
      this.#channel.close();
      this.#channel = null;
    }
    this.#repository?.close();
    this.#repository = null;
  }
}
