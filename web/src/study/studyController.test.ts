import { describe, expect, it, vi } from 'vitest';

import type { CompanyRecord, ObservedCase } from '../cases/domain';
import type { OperationalProfileVersion } from '../profiles/domain';
import type {
  ApplicationRepository,
  AppendProfileVersionMutation,
  CASMutation,
  ConfirmObservedCaseMutation,
} from '../storage/applicationRepository';
import { calculateOperationalProfile } from '../profiles/calculateOperationalProfile';
import { createImportReview } from '../importer/eligibility';
import { OperationConflictError, RevisionConflictError } from '../storage/errors';
import { attachOperationalProfileEvidence, createStudy, renameStudy } from './domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeObservedCase, makeScenarioDraft } from './fixtures';
import type { StudyDocument } from './model';
import {
  StudyController,
  StudyControllerClosedError,
  StudyControllerSessionError,
  type StudyBroadcastMessage,
  type StudyChannel,
  type StudyChannelFactory,
  type StudyControllerScheduler,
} from './studyController';

const OWNER_B = '00000000-0000-4000-8000-000000000002';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function makeStudy(ownerSub = FIXTURE_OWNER, id = 'study-1'): Promise<StudyDocument> {
  return createStudy({
    id,
    ownerSub,
    name: `Estudo ${ownerSub.slice(-1)}`,
    baseScenario: makeScenarioDraft(),
    now: FIXTURE_NOW,
  });
}

class RepositoryDouble implements ApplicationRepository {
  closed = false;
  readonly saveCalls: CASMutation<StudyDocument>[] = [];
  readonly appendProfileCalls: AppendProfileVersionMutation[] = [];
  getStudyImplementation: (id: string) => Promise<StudyDocument | null>;
  saveStudyImplementation: (input: CASMutation<StudyDocument>) => Promise<StudyDocument>;

  constructor(
    readonly ownerSub: string,
    initial: StudyDocument | null = null,
    readonly profiles: OperationalProfileVersion[] = [],
  ) {
    this.getStudyImplementation = async () => initial;
    this.saveStudyImplementation = async (input) => input.document;
  }

  async listCompanies(): Promise<CompanyRecord[]> { return []; }
  async listObservedCases(): Promise<ObservedCase[]> { return []; }
  async getObservedCase(): Promise<ObservedCase | null> { return null; }
  async confirmObservedCase(input: ConfirmObservedCaseMutation): Promise<ObservedCase> {
    return input.observedCase;
  }
  async listOperationalProfileVersions(companyId?: string): Promise<OperationalProfileVersion[]> {
    return this.profiles.filter((profile) => companyId === undefined || profile.companyId === companyId);
  }
  async getOperationalProfileVersion(): Promise<OperationalProfileVersion | null> { return null; }
  async appendOperationalProfileVersion(input: AppendProfileVersionMutation): Promise<OperationalProfileVersion> {
    this.appendProfileCalls.push(input);
    if (this.profiles.some((profile) => profile.companyId === input.document.companyId && profile.version === input.document.version)) {
      throw new OperationConflictError('Versão da empresa já foi alocada.');
    }
    this.profiles.push(structuredClone(input.document));
    return input.document;
  }
  async listStudies(): Promise<StudyDocument[]> { return []; }
  async getStudy(id: string): Promise<StudyDocument | null> {
    return this.getStudyImplementation(id);
  }
  async saveStudy(input: CASMutation<StudyDocument>): Promise<StudyDocument> {
    this.saveCalls.push(input);
    return this.saveStudyImplementation(input);
  }
  async restoreStudy(): Promise<StudyDocument> { throw new Error('não usado'); }
  async purgeStudy(): Promise<void> {}
  close(): void { this.closed = true; }
}

class ManualScheduler implements StudyControllerScheduler {
  readonly pending = new Set<() => void>();
  setTimeout(callback: () => void): object {
    this.pending.add(callback);
    return callback;
  }
  clearTimeout(handle: unknown): void {
    this.pending.delete(handle as () => void);
  }
  runAll(): void {
    const callbacks = [...this.pending];
    this.pending.clear();
    callbacks.forEach((callback) => callback());
  }
}

class ChannelHub {
  readonly messages: StudyBroadcastMessage[] = [];
  readonly channels = new Map<string, Set<FakeChannel>>();

  readonly factory: StudyChannelFactory = (name) => {
    const channel = new FakeChannel(name, this);
    const group = this.channels.get(name) ?? new Set<FakeChannel>();
    group.add(channel);
    this.channels.set(name, group);
    return channel;
  };

  send(sender: FakeChannel, message: StudyBroadcastMessage): void {
    this.messages.push(structuredClone(message));
    for (const channel of this.channels.get(sender.name) ?? []) {
      if (channel !== sender && !channel.closed) channel.deliver(message);
    }
  }
}

class FakeChannel implements StudyChannel {
  closed = false;
  readonly listeners = new Set<(event: MessageEvent<StudyBroadcastMessage>) => void>();

  constructor(readonly name: string, private readonly hub: ChannelHub) {}
  postMessage(message: StudyBroadcastMessage): void { this.hub.send(this, message); }
  addEventListener(_type: 'message', listener: (event: MessageEvent<StudyBroadcastMessage>) => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'message', listener: (event: MessageEvent<StudyBroadcastMessage>) => void): void {
    this.listeners.delete(listener);
  }
  close(): void {
    this.closed = true;
    this.hub.channels.get(this.name)?.delete(this);
  }
  deliver(message: StudyBroadcastMessage): void {
    const event = { data: structuredClone(message) } as MessageEvent<StudyBroadcastMessage>;
    this.listeners.forEach((listener) => listener(event));
  }
}

function controller(input: {
  repositories: RepositoryDouble[];
  scheduler?: ManualScheduler;
  hub?: ChannelHub;
  cancelPending?: () => Promise<void> | void;
}) {
  let operation = 0;
  return new StudyController({
    repositoryFactory: (ownerSub) => {
      const repository = input.repositories.find((candidate) =>
        candidate.ownerSub === ownerSub && !candidate.closed);
      if (repository === undefined) throw new Error(`repo ausente: ${ownerSub}`);
      return repository;
    },
    operationId: () => `operation-${++operation}`,
    now: () => FIXTURE_NOW,
    autosaveDelayMs: 10,
    channelScope: 'test-project',
    ...(input.hub === undefined ? {} : { channelFactory: input.hub.factory }),
    ...(input.scheduler === undefined ? {} : { scheduler: input.scheduler }),
    ...(input.cancelPending === undefined ? {} : { cancelPending: input.cancelPending }),
  });
}

describe('StudyController', () => {
  it('publica revisão importada somente na sessão e empresa proprietárias', async () => {
    const repository = new RepositoryDouble(FIXTURE_OWNER);
    const subject = controller({ repositories: [repository, new RepositoryDouble(OWNER_B)] });
    await subject.switchSession(FIXTURE_OWNER);
    const company: CompanyRecord = { id: 'company-1', ownerSub: FIXTURE_OWNER, displayName: 'Empresa', aliases: [], createdAt: FIXTURE_NOW, updatedAt: FIXTURE_NOW, revision: 1 };
    const review = createImportReview({
      parsed: { layout: 'xlsx-operacoes/1.0.0', sha256: 'a'.repeat(64), byteSize: 100, rows: [{ operacao_id: 'OP-1', cliente_nome: 'Cliente', classificacao_perfil: null, direcao: 'OUT', data_conhecida: '2026-09-22', data_limite: '2026-09-23', valor_brl: '100', finalidade_codigo: null }] },
      company, ownerSub: FIXTURE_OWNER, now: FIXTURE_NOW, positionIdentified: true,
    });
    await expect(subject.confirmImportedCase(review, 'stable-id')).resolves.toMatchObject({ status: 'CONFIRMED', companyId: 'company-1' });
    await subject.switchSession(OWNER_B);
    await expect(subject.confirmImportedCase(review, 'stable-id')).rejects.toBeInstanceOf(StudyControllerSessionError);
  });
  async function profile(ownerSub = FIXTURE_OWNER, version = 1, id = `profile-${version}`): Promise<OperationalProfileVersion> {
    const observed = makeObservedCase();
    return calculateOperationalProfile({
      id, ownerSub, companyId: observed.companyId, version,
      createdAt: FIXTURE_NOW, cases: [{ ...observed, ownerSub }],
    });
  }

  it('gera operationId ao confirmar perfil e preserva versões no reload', async () => {
    const repository = new RepositoryDouble(FIXTURE_OWNER);
    const subject = controller({ repositories: [repository] });
    await subject.switchSession(FIXTURE_OWNER);
    const document = await profile();

    await expect(subject.appendOperationalProfileVersion(document)).resolves.toEqual(document);
    expect(repository.appendProfileCalls[0]).toEqual({ operationId: 'operation-1', document });
    expect(await subject.listOperationalProfileVersions(document.companyId)).toEqual([document]);
  });

  it('propaga conflito quando duas abas confirmam a mesma próxima versão', async () => {
    const repository = new RepositoryDouble(FIXTURE_OWNER);
    const first = controller({ repositories: [repository] });
    const second = controller({ repositories: [repository] });
    await first.switchSession(FIXTURE_OWNER);
    await second.switchSession(FIXTURE_OWNER);
    const document = await profile();

    await first.appendOperationalProfileVersion(document);
    await expect(second.appendOperationalProfileVersion(await profile(FIXTURE_OWNER, 1, 'profile-rival')))
      .rejects.toBeInstanceOf(OperationConflictError);
  });

  it('anexa cópia integral do perfil ao estudo atual usando CAS', async () => {
    const study = await makeStudy();
    const repository = new RepositoryDouble(FIXTURE_OWNER, study);
    const subject = controller({ repositories: [repository] });
    await subject.switchSession(FIXTURE_OWNER);
    await subject.loadStudy(study.id);
    const document = await profile();

    const attached = await subject.attachProfileToCurrentStudy(document);

    expect(attached.revision).toBe(2);
    expect(attached.evidenceSnapshots[0]).toMatchObject({ kind: 'OPERATIONAL_PROFILE', profile: document });
    expect(attached.scenarios[0]?.sourceSnapshot).toEqual(study.scenarios[0]?.sourceSnapshot);
    expect(repository.saveCalls[0]).toMatchObject({ expectedRevision: 1, operationId: 'operation-1' });
    expect(subject.snapshot).toMatchObject({ status: 'SAVED', document: attached });
  });

  it('não retorna anexação idempotente da sessão A depois da troca para B', async () => {
    const document = await profile();
    const attached = await attachOperationalProfileEvidence(await makeStudy(), document, FIXTURE_NOW);
    const repositoryA = new RepositoryDouble(FIXTURE_OWNER, attached);
    const repositoryB = new RepositoryDouble(OWNER_B);
    const subject = controller({ repositories: [repositoryA, repositoryB] });
    await subject.switchSession(FIXTURE_OWNER);
    await subject.loadStudy(attached.id);

    const staleAttach = subject.attachProfileToCurrentStudy(document);
    await subject.switchSession(OWNER_B);

    await expect(staleAttach).rejects.toBeInstanceOf(StudyControllerSessionError);
    expect(subject.snapshot.ownerSub).toBe(OWNER_B);
  });

  it('rejeita perfil de outra conta e preserva isolamento no reload A → B → A', async () => {
    const study = await makeStudy();
    const persistedProfiles: OperationalProfileVersion[] = [];
    const repositoryA = new RepositoryDouble(FIXTURE_OWNER, study, persistedProfiles);
    const repositoryB = new RepositoryDouble(OWNER_B);
    const reopenedA = new RepositoryDouble(FIXTURE_OWNER, study, persistedProfiles);
    const subject = controller({ repositories: [repositoryA, repositoryB, reopenedA] });
    await subject.switchSession(FIXTURE_OWNER);
    await subject.loadStudy(study.id);
    await expect(subject.attachProfileToCurrentStudy(await profile(OWNER_B))).rejects.toThrow(/Owner/);
    const document = await profile();
    await subject.appendOperationalProfileVersion(document);

    await subject.switchSession(OWNER_B);
    expect(await subject.listOperationalProfileVersions()).toEqual([]);
    await expect(subject.attachProfileToCurrentStudy(await profile(FIXTURE_OWNER))).rejects.toThrow();

    await subject.switchSession(FIXTURE_OWNER);
    expect(await subject.listOperationalProfileVersions()).toEqual([document]);
  });

  it('salva um estudo novo a partir de IDLE com CAS de criação', async () => {
    const created = await makeStudy();
    const repository = new RepositoryDouble(FIXTURE_OWNER);
    const subject = controller({ repositories: [repository] });
    await subject.switchSession(FIXTURE_OWNER);

    subject.edit(created);
    await expect(subject.flush()).resolves.toEqual(created);

    expect(repository.saveCalls).toHaveLength(1);
    expect(repository.saveCalls[0]).toMatchObject({ expectedRevision: 0, document: created });
    expect(subject.snapshot).toMatchObject({ status: 'SAVED', document: created });
  });

  it('percorre IDLE, DIRTY, SAVING e SAVED, e rejeita uso após close', async () => {
    const original = await makeStudy();
    const edited = await renameStudy(original, 'Nome editado', '2026-09-19T12:01:00Z');
    const repository = new RepositoryDouble(FIXTURE_OWNER, original);
    const commit = deferred<StudyDocument>();
    repository.saveStudyImplementation = () => commit.promise;
    const scheduler = new ManualScheduler();
    const subject = controller({ repositories: [repository], scheduler });

    await subject.switchSession(FIXTURE_OWNER);
    await subject.loadStudy(original.id);
    expect(subject.snapshot.status).toBe('SAVED');

    subject.edit(edited);
    expect(subject.snapshot.status).toBe('DIRTY');
    scheduler.runAll();
    await Promise.resolve();
    expect(subject.snapshot.status).toBe('SAVING');

    commit.resolve(edited);
    await subject.flush();
    expect(subject.snapshot).toMatchObject({ status: 'SAVED', document: edited });

    subject.close();
    expect(subject.snapshot.status).toBe('CLOSED');
    expect(() => subject.edit(edited)).toThrow(StudyControllerClosedError);
    await expect(subject.flush()).rejects.toBeInstanceOf(StudyControllerClosedError);
    await expect(subject.loadStudy(original.id)).rejects.toBeInstanceOf(StudyControllerClosedError);
    await expect(subject.switchSession(OWNER_B)).rejects.toBeInstanceOf(StudyControllerClosedError);
  });

  it('serializa autosaves e flush aguarda o commit da última edição', async () => {
    const revision1 = await makeStudy();
    const revision2 = await renameStudy(revision1, 'Revisão 2', '2026-09-19T12:01:00Z');
    const revision3 = await renameStudy(revision2, 'Revisão 3', '2026-09-19T12:02:00Z');
    const first = deferred<StudyDocument>();
    const second = deferred<StudyDocument>();
    const repository = new RepositoryDouble(FIXTURE_OWNER, revision1);
    repository.saveStudyImplementation = (input) => input.document.revision === 2
      ? first.promise
      : second.promise;
    const subject = controller({ repositories: [repository] });
    await subject.switchSession(FIXTURE_OWNER);
    await subject.loadStudy(revision1.id);

    subject.edit(revision2);
    subject.edit(revision3);
    const flushed = subject.flush();
    await Promise.resolve();
    expect(repository.saveCalls.map((call) => call.document.revision)).toEqual([2]);

    first.resolve(revision2);
    await Promise.resolve();
    await Promise.resolve();
    expect(repository.saveCalls.map((call) => call.document.revision)).toEqual([2, 3]);
    let settled = false;
    void flushed.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    second.resolve(revision3);
    await expect(flushed).resolves.toEqual(revision3);
    expect(repository.saveCalls.map((call) => call.expectedRevision)).toEqual([1, 2]);
  });

  it('preserva a edição em memória quando o storage falha', async () => {
    const original = await makeStudy();
    const edited = await renameStudy(original, 'Ainda em memória', '2026-09-19T12:01:00Z');
    const repository = new RepositoryDouble(FIXTURE_OWNER, original);
    const failure = new Error('quota');
    repository.saveStudyImplementation = async () => { throw failure; };
    const subject = controller({ repositories: [repository] });
    await subject.switchSession(FIXTURE_OWNER);
    await subject.loadStudy(original.id);

    subject.edit(edited);
    await expect(subject.flush()).rejects.toBe(failure);
    expect(subject.snapshot).toMatchObject({
      status: 'STORAGE_FAILURE',
      document: edited,
      error: failure,
    });
  });

  it('trata falha CAS como CONFLICT e mantém a edição local', async () => {
    const original = await makeStudy();
    const edited = await renameStudy(original, 'Conflito local', '2026-09-19T12:01:00Z');
    const repository = new RepositoryDouble(FIXTURE_OWNER, original);
    repository.saveStudyImplementation = async () => { throw new RevisionConflictError(1, 2); };
    const subject = controller({ repositories: [repository] });
    await subject.switchSession(FIXTURE_OWNER);
    await subject.loadStudy(original.id);

    subject.edit(edited);
    await expect(subject.flush()).rejects.toBeInstanceOf(RevisionConflictError);
    expect(subject.snapshot).toMatchObject({ status: 'CONFLICT', document: edited });
  });

  it('publica somente identificadores e revisão e faz aba limpa reler a autoridade CAS', async () => {
    const revision1 = await makeStudy();
    const revision2 = await renameStudy(revision1, 'Remoto', '2026-09-19T12:01:00Z');
    const hub = new ChannelHub();
    const repositoryA = new RepositoryDouble(FIXTURE_OWNER, revision1);
    const repositoryB = new RepositoryDouble(FIXTURE_OWNER, revision1);
    let persisted = revision1;
    repositoryA.saveStudyImplementation = async (input) => {
      persisted = input.document;
      return persisted;
    };
    repositoryB.getStudyImplementation = async () => persisted;
    const first = controller({ repositories: [repositoryA], hub });
    const second = controller({ repositories: [repositoryB], hub });
    await first.switchSession(FIXTURE_OWNER);
    await second.switchSession(FIXTURE_OWNER);
    await first.loadStudy(revision1.id);
    await second.loadStudy(revision1.id);

    first.edit(revision2);
    await first.flush();
    await vi.waitFor(() => expect(second.snapshot.document?.revision).toBe(2));

    expect(hub.messages).toEqual([{
      studyId: revision1.id,
      revision: 2,
      operationId: 'operation-1',
    }]);
    expect(Object.keys(hub.messages[0]!).sort()).toEqual(['operationId', 'revision', 'studyId']);
    expect(second.snapshot).toMatchObject({ status: 'SAVED', document: revision2 });
  });

  it('faz aba suja entrar em CONFLICT ao receber revisão remota', async () => {
    const revision1 = await makeStudy();
    const local = await renameStudy(revision1, 'Local', '2026-09-19T12:01:00Z');
    const remote = await renameStudy(revision1, 'Remoto', '2026-09-19T12:02:00Z');
    const hub = new ChannelHub();
    const repositoryA = new RepositoryDouble(FIXTURE_OWNER, revision1);
    const repositoryB = new RepositoryDouble(FIXTURE_OWNER, revision1);
    repositoryA.saveStudyImplementation = async (input) => input.document;
    const first = controller({ repositories: [repositoryA], hub });
    const second = controller({ repositories: [repositoryB], hub });
    await first.switchSession(FIXTURE_OWNER);
    await second.switchSession(FIXTURE_OWNER);
    await first.loadStudy(revision1.id);
    await second.loadStudy(revision1.id);

    second.edit(local);
    first.edit(remote);
    await first.flush();

    expect(second.snapshot).toMatchObject({ status: 'CONFLICT', document: local });
    expect(repositoryB.saveCalls).toHaveLength(0);
  });

  it('preserva CONFLICT quando revisão remota maior chega durante save local', async () => {
    const original = await makeStudy();
    const local = await renameStudy(original, 'Commit local', '2026-09-19T12:01:00Z');
    const commit = deferred<StudyDocument>();
    const hub = new ChannelHub();
    const repository = new RepositoryDouble(FIXTURE_OWNER, original);
    repository.saveStudyImplementation = () => commit.promise;
    const subject = controller({ repositories: [repository], hub });
    await subject.switchSession(FIXTURE_OWNER);
    await subject.loadStudy(original.id);

    subject.edit(local);
    const flushed = subject.flush();
    await vi.waitFor(() => expect(subject.snapshot.status).toBe('SAVING'));
    const channelName = [...hub.channels.keys()][0]!;
    const remote = hub.factory(channelName);
    remote.postMessage({
      studyId: original.id,
      revision: 3,
      operationId: 'remote-operation-3',
    });
    expect(subject.snapshot.status).toBe('CONFLICT');

    commit.resolve(local);
    await expect(flushed).resolves.toEqual(local);
    expect(subject.snapshot).toMatchObject({ status: 'CONFLICT', document: local });
  });

  it('isola A → B → A, fecha recursos e ignora retorno tardio da sessão antiga', async () => {
    const studyA = await makeStudy(FIXTURE_OWNER, 'study-a');
    const studyB = await makeStudy(OWNER_B, 'study-b');
    const lateA = deferred<StudyDocument | null>();
    const firstA = new RepositoryDouble(FIXTURE_OWNER, studyA);
    firstA.getStudyImplementation = () => lateA.promise;
    const repositoryB = new RepositoryDouble(OWNER_B, studyB);
    const reopenedA = new RepositoryDouble(FIXTURE_OWNER, studyA);
    const repositories = [firstA, repositoryB, reopenedA];
    const created: RepositoryDouble[] = [];
    const hub = new ChannelHub();
    let cancels = 0;
    let operation = 0;
    const subject = new StudyController({
      repositoryFactory: (ownerSub) => {
        const repository = repositories.find((candidate) =>
          candidate.ownerSub === ownerSub && !created.includes(candidate));
        if (repository === undefined) throw new Error('repo ausente');
        created.push(repository);
        return repository;
      },
      channelFactory: hub.factory,
      cancelPending: async () => { cancels += 1; },
      operationId: () => `operation-${++operation}`,
      channelScope: 'test-project',
    });

    await subject.switchSession(FIXTURE_OWNER);
    const staleLoad = subject.loadStudy(studyA.id);
    await subject.switchSession(OWNER_B);
    expect(firstA.closed).toBe(true);
    expect(subject.snapshot).toMatchObject({ ownerSub: OWNER_B, sessionEpoch: 2, document: null });

    lateA.resolve(studyA);
    await expect(staleLoad).resolves.toBeNull();
    expect(subject.snapshot.document).toBeNull();
    await expect(subject.loadStudy(studyB.id)).resolves.toEqual(studyB);

    await subject.switchSession(FIXTURE_OWNER);
    expect(repositoryB.closed).toBe(true);
    expect(subject.snapshot).toMatchObject({ ownerSub: FIXTURE_OWNER, sessionEpoch: 3, document: null });
    await expect(subject.loadStudy(studyA.id)).resolves.toEqual(studyA);
    expect(created).toEqual([firstA, repositoryB, reopenedA]);
    expect(cancels).toBe(3);
    expect([...hub.channels.values()].flatMap((channels) => [...channels])).toHaveLength(1);
  });

  it('não deixa autosave pendente de A bloquear uma escrita de B', async () => {
    const studyA = await makeStudy(FIXTURE_OWNER, 'study-a');
    const editedA = await renameStudy(studyA, 'A pendente', '2026-09-19T12:01:00Z');
    const studyB = await makeStudy(OWNER_B, 'study-b');
    const editedB = await renameStudy(studyB, 'B salvo', '2026-09-19T12:02:00Z');
    const lateSaveA = deferred<StudyDocument>();
    const repositoryA = new RepositoryDouble(FIXTURE_OWNER, studyA);
    repositoryA.saveStudyImplementation = () => lateSaveA.promise;
    const repositoryB = new RepositoryDouble(OWNER_B, studyB);
    const subject = controller({ repositories: [repositoryA, repositoryB] });

    await subject.switchSession(FIXTURE_OWNER);
    await subject.loadStudy(studyA.id);
    subject.edit(editedA);
    const staleFlush = subject.flush();
    await Promise.resolve();

    await subject.switchSession(OWNER_B);
    await subject.loadStudy(studyB.id);
    subject.edit(editedB);
    await expect(subject.flush()).resolves.toEqual(editedB);

    lateSaveA.resolve(editedA);
    await expect(staleFlush).resolves.toBeNull();
    expect(subject.snapshot).toMatchObject({
      ownerSub: OWNER_B,
      status: 'SAVED',
      document: editedB,
    });
  });

  it('ignora um carregamento antigo quando outro estudo já foi selecionado', async () => {
    const firstStudy = await makeStudy(FIXTURE_OWNER, 'study-1');
    const secondStudy = await makeStudy(FIXTURE_OWNER, 'study-2');
    const lateFirst = deferred<StudyDocument | null>();
    const repository = new RepositoryDouble(FIXTURE_OWNER);
    repository.getStudyImplementation = (id) => id === firstStudy.id
      ? lateFirst.promise
      : Promise.resolve(secondStudy);
    const subject = controller({ repositories: [repository] });
    await subject.switchSession(FIXTURE_OWNER);

    const staleLoad = subject.loadStudy(firstStudy.id);
    await expect(subject.loadStudy(secondStudy.id)).resolves.toEqual(secondStudy);
    lateFirst.resolve(firstStudy);

    await expect(staleLoad).resolves.toBeNull();
    expect(subject.snapshot.document).toEqual(secondStudy);
  });

  it('não deixa o autosave do estudo anterior bloquear o estudo recém-selecionado', async () => {
    const firstStudy = await makeStudy(FIXTURE_OWNER, 'study-1');
    const editedFirst = await renameStudy(firstStudy, 'Primeiro pendente', '2026-09-19T12:01:00Z');
    const secondStudy = await makeStudy(FIXTURE_OWNER, 'study-2');
    const editedSecond = await renameStudy(secondStudy, 'Segundo salvo', '2026-09-19T12:02:00Z');
    const lateFirst = deferred<StudyDocument>();
    const repository = new RepositoryDouble(FIXTURE_OWNER);
    repository.getStudyImplementation = async (id) => id === firstStudy.id ? firstStudy : secondStudy;
    repository.saveStudyImplementation = (input) => input.document.id === firstStudy.id
      ? lateFirst.promise
      : Promise.resolve(input.document);
    const subject = controller({ repositories: [repository] });
    await subject.switchSession(FIXTURE_OWNER);
    await subject.loadStudy(firstStudy.id);
    subject.edit(editedFirst);
    const staleFlush = subject.flush();
    await Promise.resolve();

    await subject.loadStudy(secondStudy.id);
    subject.edit(editedSecond);
    await expect(subject.flush()).resolves.toEqual(editedSecond);

    lateFirst.resolve(editedFirst);
    await expect(staleFlush).resolves.toBeNull();
    expect(subject.snapshot.document).toEqual(editedSecond);
  });
});
