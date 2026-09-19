import type { components } from '../api/generated';

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

export type EditableField =
  | 'direction'
  | 'knownDate'
  | 'deadlineDate'
  | 'valueBrl'
  | 'purposeCode';

export type ImportIssueCode = ImportErrorCode
  | 'RECUT_INVERTED'
  | 'CATALOG_NOT_CONFIGURED'
  | 'ZERO_EXECUTABLE_OPERATIONS';

export type ImportIssue = {
  code: ImportIssueCode;
  message: string;
  operationId: string | null;
  field: EditableField | null;
};

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
  rowNumber: number;
  value: string | null;
  message: string;
};

export type ImportedRow = {
  rowNumber: number;
  raw: RawOperationCells;
  normalized: NormalizedOperation | null;
  errors: ImportRowError[];
};

export type ImportedVersionRow = ImportedRow & {
  versionId: UUID;
  canonicalClientId: UUID;
};

export type ImportValidationSummary = {
  total: number;
  valid: number;
  invalid: number;
};

export type ImportBatchDraft = {
  id: UUID;
  importedAtUtc: string;
  file: ImportFileMetadata;
  rows: ImportedRow[];
  summary: ImportValidationSummary;
};

export type ImportBatch = {
  schemaVersion: ImportSchemaVersion;
  id: UUID;
  studyId: UUID;
  revision: Revision;
  batchSequence: number;
  importedAtUtc: string;
  file: ImportFileMetadata;
  rows: ImportedVersionRow[];
};

export type ImportEvent =
  | {
      kind: 'BATCH_IMPORTED';
      id: UUID;
      eventSequence: number;
      occurredAtUtc: string;
      batchId: UUID;
    }
  | {
      kind: 'BATCH_REVERTED';
      id: UUID;
      eventSequence: number;
      occurredAtUtc: string;
      batchId: UUID;
    }
  | {
      kind: 'CONFLICT_RESOLVED';
      id: UUID;
      eventSequence: number;
      occurredAtUtc: string;
      operationId: string;
      selectedVersionId: UUID;
    }
  | {
      kind: 'OPERATION_EDITED';
      id: UUID;
      eventSequence: number;
      occurredAtUtc: string;
      operationId: string;
      field: EditableField;
      rawValue: string;
      normalizedValue: string | null;
      error: ImportIssue | null;
    }
  | {
      kind: 'OPERATION_EXCLUDED' | 'OPERATION_RESTORED';
      id: UUID;
      eventSequence: number;
      occurredAtUtc: string;
      operationId: string;
    };

export type ConflictResolution = {
  operationId: string;
  selectedVersionId: UUID;
};

export type PortfolioVersion = {
  versionId: UUID;
  batchId: UUID;
  batchSequence: number;
  rowNumber: number;
  canonicalClientId: UUID;
  operation: NormalizedOperation;
};

export type PortfolioOperation = PortfolioVersion & {
  operationId: string;
  originVersionIds: UUID[];
};

export type OperationEditAudit = {
  eventId: UUID;
  at: string;
  field: EditableField;
  originalValue: string | null;
  previousValue: string | null;
  nextValue: string | null;
  rawValue: string;
  error: ImportIssue | null;
};

export type ProjectedOperation = PortfolioOperation & {
  audit: { edits: OperationEditAudit[] };
  excluded: boolean;
  executable: boolean;
  issues: ImportIssue[];
};

export type PortfolioConflict = {
  operationId: string;
  versionIds: UUID[];
};

export type PortfolioProjection = {
  versions: PortfolioVersion[];
  versionsByOperationId: Record<string, PortfolioVersion[]>;
  currentOperations: PortfolioOperation[];
  operations: ProjectedOperation[];
  excludedOperationIds: string[];
  conflicts: PortfolioConflict[];
  counts: {
    versions: number;
    currentOperations: number;
    conflicts: number;
    invalidRows: number;
  };
};

export type ImportCatalog = components['schemas']['CatalogoImportacao'];
export type ImportCosts = components['schemas']['CustoEntrada'];
export type ParameterOrigin = components['schemas']['OrigemValor'];
export type ParameterField = 'windowDays' | keyof ImportCosts;

export type ImportStudyParameters = {
  windowDays: number;
  costs: ImportCosts;
  fieldOrigins: Record<ParameterField, ParameterOrigin>;
  catalogVersion: string | null;
};

export type ExecutableOperation = ProjectedOperation;

export type ExecutionAssessment = {
  selected: ExecutableOperation[];
  blockers: ImportIssue[];
  issues: ImportIssue[];
  omitted: {
    outsideRecut: number;
    invalid: number;
    excluded: number;
    superseded: number;
  };
  requiresPartialConfirmation: boolean;
  periodDays: number;
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

export type CanonicalClient = {
  id: UUID;
  displayName: string;
  createdAt: string;
};

export type ClientAlias = {
  normalizedName: string;
  canonicalClientId: UUID;
  displayVariant: string;
  confirmedByUser: boolean;
  createdAt: string;
  revokedAt: string | null;
};

export type ClientAliasEvent =
  | {
      kind: 'CLIENT_ALIAS_MERGED';
      id: UUID;
      occurredAtUtc: string;
      normalizedName: string;
      displayVariant: string;
      canonicalClientId: UUID;
    }
  | {
      kind: 'CLIENT_ALIAS_UNMERGED';
      id: UUID;
      occurredAtUtc: string;
      normalizedName: string;
      displayVariant: string;
      previousCanonicalClientId: UUID;
      newCanonicalClientId: UUID;
    };

export type ClientIdentityState = {
  revision: Revision;
  clients: CanonicalClient[];
  aliases: ClientAlias[];
  events: ClientAliasEvent[];
  resultsStale: boolean;
};
