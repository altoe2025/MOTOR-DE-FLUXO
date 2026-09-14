import type {
  ExecutionRecord, PreparationRecord, PublicFailure, StudyDocument, UTC, UUID,
} from './model';

export type StudySummary = {
  id: UUID;
  name: string;
  revision: number;
  updated_at: UTC;
  deleted_at: UTC | null;
  availability: 'READY' | 'CORRUPT' | 'INCOMPATIBLE';
};
export type RepoCode = 'STORAGE_UNAVAILABLE' | 'STORAGE_BLOCKED' | 'QUOTA_EXCEEDED' |
  'REVISION_CONFLICT' | 'DOCUMENT_CORRUPT' | 'SCHEMA_UNSUPPORTED' | 'MIGRATION_FAILED' |
  'OWNER_MISMATCH' | 'LOCAL_LIMIT_EXCEEDED' | 'NOT_FOUND' | 'ATTEMPT_CONFLICT' |
  'INVALID_DOCUMENT' | 'STORAGE_CLOSED';
export type RepoError = Error & { code: RepoCode };
export type WriteOptions = { expected_revision: number | null; operation_id: UUID };

export interface StudyRepository {
  list(includeTrash: boolean): Promise<StudySummary[]>;
  get(id: UUID): Promise<StudyDocument | null>;
  save(study: StudyDocument, options: WriteOptions): Promise<StudyDocument>;
  getPreparation(id: UUID): Promise<PreparationRecord | null>;
  savePreparation(id: UUID, attemptId: UUID, preparation: PreparationRecord): Promise<StudyDocument>;
  getExecution(id: UUID): Promise<ExecutionRecord | null>;
  appendExecution(id: UUID, attemptId: UUID, record: ExecutionRecord): Promise<StudyDocument>;
  finishAttempt(id: UUID, attemptId: UUID, failure: PublicFailure): Promise<StudyDocument>;
  trash(id: UUID, options: WriteOptions): Promise<StudyDocument>;
  restore(id: UUID, options: WriteOptions): Promise<StudyDocument>;
  purge(id: UUID, options: WriteOptions): Promise<void>;
  removeExecution(id: UUID, executionId: UUID, options: WriteOptions): Promise<StudyDocument>;
  importLegacy(sourceKey: string, raw: string): Promise<StudyDocument>;
  close(): void;
}

export function repositoryError(code: RepoCode, message: string): RepoError {
  return Object.assign(new Error(message), { code });
}
