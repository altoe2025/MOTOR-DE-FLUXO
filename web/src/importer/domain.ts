export type ISODate = string & { readonly __isoDate: unique symbol };

export type UUID = string;
export type Revision = number;
export type ImportSchemaVersion = '1.0.0';

export type ImportErrorCode =
  | 'REQUIRED'
  | 'INVALID_FORMAT'
  | 'VALUE_OUT_OF_RANGE'
  | 'DATE_ORDER_INVALID'
  | 'DIRECTION_INVALID'
  | 'DUPLICATE_ID_IN_BATCH'
  | 'CONFLICTING_ID_ACROSS_BATCHES'
  | 'PURPOSE_MISSING'
  | 'PURPOSE_UNKNOWN'
  | 'PURPOSE_DIRECTION_INVALID'
  | 'RECUT_TOO_LONG'
  | 'DEADLINE_OUT_OF_RANGE'
  | 'EXECUTION_LIMIT_EXCEEDED'
  | 'UNRESOLVED_CONFLICT';

export type NormalizedOperation = {
  operationId: string;
  clientName: string;
  profileClassification: string | null;
  direction: 'OUT' | 'IN';
  knownDate: ISODate;
  deadlineDate: ISODate;
  valueBrl: string;
  purposeCode: string | null;
};

export type RawOperationCells = Record<
  | 'operacao_id'
  | 'cliente_nome'
  | 'classificacao_perfil'
  | 'direcao'
  | 'data_conhecida'
  | 'data_limite'
  | 'valor_brl'
  | 'finalidade_codigo',
  string | null
>;

export type ImportFileMetadata = {
  fileName: string;
  fileSize: number;
  fileLastModified: number;
  sha256: string;
};

export type ImportRowError = {
  code: ImportErrorCode;
  field: keyof RawOperationCells | null;
  message: string;
};

export type ImportedRow = {
  rowNumber: number;
  raw: RawOperationCells;
  normalized: NormalizedOperation | null;
  errors: ImportRowError[];
};

export type ImportBatch = {
  schemaVersion: ImportSchemaVersion;
  id: UUID;
  studyId: UUID;
  revision: Revision;
  importedAtUtc: string;
  file: ImportFileMetadata;
  rows: ImportedRow[];
};

export type ImportEvent =
  | {
      kind: 'BATCH_IMPORTED';
      id: UUID;
      occurredAtUtc: string;
      batchId: UUID;
    }
  | {
      kind: 'CONFLICT_RESOLVED';
      id: UUID;
      occurredAtUtc: string;
      operationId: string;
      selectedBatchId: UUID;
    };

export type ImportStudy = {
  schemaVersion: ImportSchemaVersion;
  id: UUID;
  revision: Revision;
  name: string;
  createdAtUtc: string;
  updatedAtUtc: string;
  batches: ImportBatch[];
  events: ImportEvent[];
};
