import type {
  ConflictResolution,
  ImportBatch,
  ImportStudy,
} from './domain';

export type ImportStudyHeader = Pick<
  ImportStudy,
  'id' | 'name' | 'revision' | 'createdAtUtc' | 'updatedAtUtc'
>;

export type OperationCommand = {
  operationId: string;
  eventId: string;
  at: string;
};

export type StudyMutation =
  | { kind: 'INCORPORATE_BATCH'; batch: ImportBatch }
  | { kind: 'RESOLVE_VERSION_CONFLICT'; resolution: ConflictResolution }
  | { kind: 'REVERT_BATCH'; batchId: string }
  | {
      kind: 'EDIT_OPERATION';
      operationId: string;
      field: 'direction' | 'knownDate' | 'deadlineDate' | 'valueBrl' | 'purposeCode';
      rawValue: string;
      eventId: string;
      at: string;
    }
  | ({ kind: 'EXCLUDE_OPERATION' } & OperationCommand)
  | ({ kind: 'RESTORE_OPERATION' } & OperationCommand);

export type ImportExecutionRecord = {
  id: string;
  studyId: string;
  ownerSub: string;
  studyRevision: number;
  createdAtUtc: string;
  operationIds: string[];
  request: unknown;
  response: unknown;
};

export type ImportChangeNotice = {
  studyId: string;
  revision: number;
  operationId: string;
};

export class RevisionConflictError extends Error {
  constructor(message = 'REVISION_CONFLICT: revisão do estudo foi alterada') {
    super(message);
    this.name = 'RevisionConflictError';
  }
}

export interface ImportRepository {
  listStudies(): Promise<ImportStudyHeader[]>;
  loadStudy(studyId: string): Promise<ImportStudy | null>;
  createStudy(study: ImportStudy): Promise<void>;
  mutateStudy(input: {
    studyId: string;
    expectedRevision: number;
    operationId: string;
    mutation: StudyMutation;
  }): Promise<ImportStudy>;
  saveExecution(
    record: ImportExecutionRecord,
    expectedRevision: number,
  ): Promise<void>;
  deleteStudy(studyId: string): Promise<void>;
  deleteAllLocalData(): Promise<void>;
  close(): void;
}
