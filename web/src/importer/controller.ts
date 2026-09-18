import type { PreviaRequest, PreviewEnvelope } from '../api/client';
import type { ExecutionAssessment, ImportCatalog, ImportStudy, ImportStudyParameters, ISODate } from './domain';
import { buildImportedPreviewRequest } from './previewAdapter';

export type ImportControllerState =
  | { status: 'IDLE' }
  | { status: 'PARSING'; fileName: string }
  | { status: 'REVIEW'; studyId: string }
  | { status: 'SAVING'; studyId: string }
  | { status: 'EXECUTING'; studyId: string; attemptId: string }
  | { status: 'FAILURE'; phase: 'PARSE' | 'SAVE' | 'EXECUTE'; message: string };

export type ControllerExecutionRecord = {
  attemptId: string;
  ownerSub: string;
  studyId: string;
  studyRevision: number;
  catalogVersion: string;
  request: PreviaRequest;
  envelope: PreviewEnvelope;
  current: boolean;
  createdAtUtc: string;
};

export type ImportControllerPorts = {
  executeRequest(request: PreviaRequest): Promise<PreviewEnvelope>;
  persistPending(study: ImportStudy): Promise<ImportStudy>;
  reserveAttempt(input: { studyId: string; expectedRevision: number; attemptId: string }): Promise<void>;
  saveExecution(record: ControllerExecutionRecord): Promise<void>;
  currentOwnerSub(): string | null;
  currentStudyRevision(studyId: string): Promise<number | null>;
};

export type ExecuteImportedPreviewInput = {
  ownerSub: string;
  study: ImportStudy;
  assessment: ExecutionAssessment;
  catalog: ImportCatalog;
  parameters: ImportStudyParameters;
  recut: { start: ISODate; end: ISODate };
  attemptId: string;
  requestId: string;
  scenarioId: string;
  nowUtc: string;
};

function immutableClone<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (item !== null && typeof item === 'object' && !Object.isFrozen(item)) {
      Object.freeze(item);
      for (const child of Object.values(item)) freeze(child);
    }
  };
  freeze(clone);
  return clone;
}

export class ImportController {
  #state: ImportControllerState = { status: 'IDLE' };
  #active: Promise<PreviewEnvelope | null> | null = null;
  #pendingSave: ControllerExecutionRecord | null = null;

  constructor(private readonly ports: ImportControllerPorts) {}

  get state(): ImportControllerState { return this.#state; }
  get canRetrySave(): boolean { return this.#pendingSave !== null; }

  execute(input: ExecuteImportedPreviewInput): Promise<PreviewEnvelope | null> {
    if (this.#active !== null) return this.#active;
    const task = this.#execute(input).finally(() => { this.#active = null; });
    this.#active = task;
    return task;
  }

  async #execute(input: ExecuteImportedPreviewInput): Promise<PreviewEnvelope | null> {
    try {
      if (this.ports.currentOwnerSub() !== input.ownerSub) {
        throw new Error('CONTEXTO_DIVERGENTE: conta ativa mudou');
      }
      this.#state = { status: 'SAVING', studyId: input.study.id };
      const study = await this.ports.persistPending(input.study);
      await this.ports.reserveAttempt({
        studyId: study.id, expectedRevision: study.revision, attemptId: input.attemptId,
      });
      const request = buildImportedPreviewRequest({ ...input, study });
      this.#state = { status: 'EXECUTING', studyId: study.id, attemptId: input.attemptId };
      const envelope = await this.ports.executeRequest(request);
      if (this.ports.currentOwnerSub() !== input.ownerSub) {
        this.#state = { status: 'IDLE' };
        return null;
      }
      const currentRevision = await this.ports.currentStudyRevision(study.id);
      if (
        envelope.request_id !== request.request_id
        || envelope.study_id !== request.study_id
        || envelope.scenario_id !== request.scenario_id
        || envelope.scenario_revision !== request.scenario_revision
      ) {
        throw new Error('CONTEXTO_DIVERGENTE: resposta não pertence à tentativa');
      }
      const immutableRequest = immutableClone(request);
      const immutableEnvelope = immutableClone(envelope);
      const record: ControllerExecutionRecord = {
        attemptId: input.attemptId,
        ownerSub: input.ownerSub,
        studyId: study.id,
        studyRevision: study.revision,
        catalogVersion: input.catalog.catalog_version,
        request: immutableRequest,
        envelope: immutableEnvelope,
        current: currentRevision === study.revision,
        createdAtUtc: input.nowUtc,
      };
      try {
        await this.ports.saveExecution(record);
        this.#pendingSave = null;
        this.#state = { status: 'REVIEW', studyId: study.id };
      } catch (error) {
        this.#pendingSave = record;
        this.#state = { status: 'FAILURE', phase: 'SAVE', message: String(error) };
      }
      return immutableEnvelope;
    } catch (error) {
      if (this.#state.status !== 'FAILURE') {
        const phase = this.#state.status === 'SAVING' ? 'SAVE' : 'EXECUTE';
        this.#state = { status: 'FAILURE', phase, message: String(error) };
      }
      return null;
    }
  }

  async retrySave(): Promise<void> {
    const record = this.#pendingSave;
    if (record === null) return;
    try {
      await this.ports.saveExecution(record);
      this.#pendingSave = null;
      this.#state = { status: 'REVIEW', studyId: record.studyId };
    } catch (error) {
      this.#state = { status: 'FAILURE', phase: 'SAVE', message: String(error) };
    }
  }
}
