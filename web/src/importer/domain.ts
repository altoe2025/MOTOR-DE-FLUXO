export type ISODate = string & { readonly __isoDate: unique symbol };

export type ImportErrorCode =
  | 'REQUIRED'
  | 'INVALID_FORMAT'
  | 'VALUE_OUT_OF_RANGE'
  | 'DATE_ORDER_INVALID'
  | 'DIRECTION_INVALID'
  | 'DUPLICATE_ID_IN_BATCH'
  | 'PURPOSE_MISSING'
  | 'FILE_TOO_LARGE'
  | 'FILE_NOT_XLSX'
  | 'WORKBOOK_INVALID'
  | 'SHEET_COUNT_INVALID'
  | 'SHEET_NAME_INVALID'
  | 'HEADER_INVALID'
  | 'FORMULA_NOT_ALLOWED'
  | 'MERGED_CELLS_NOT_ALLOWED'
  | 'MACRO_NOT_ALLOWED'
  | 'EXTERNAL_LINK_NOT_ALLOWED'
  | 'ENCRYPTED_FILE_NOT_ALLOWED'
  | 'ROW_LIMIT_EXCEEDED'
  | 'ZIP_ENTRY_LIMIT_EXCEEDED'
  | 'UNCOMPRESSED_SIZE_LIMIT_EXCEEDED'
  | 'INVALID_XLSX'
  | 'WORKER_FAILURE';

export type RawOperationCells = Record<
  'operacao_id' | 'cliente_nome' | 'classificacao_perfil' | 'direcao'
    | 'data_conhecida' | 'data_limite' | 'valor_brl' | 'finalidade_codigo',
  string | null
>;

export type NormalizedOperation = Readonly<{
  operationId: string;
  clientName: string;
  profileClassification: string | null;
  direction: 'OUT' | 'IN';
  knownDate: ISODate;
  deadlineDate: ISODate;
  valueBrl: string;
  purposeCode: string | null;
}>;

export type ImportRowError = Readonly<{
  code: ImportErrorCode;
  field: keyof RawOperationCells | null;
  rowNumber: number;
  value: string | null;
  message: string;
}>;

export type ImportedRow = Readonly<{
  rowNumber: number;
  raw: RawOperationCells;
  normalized: NormalizedOperation | null;
  errors: readonly ImportRowError[];
}>;

export type ImportValidationReport = Readonly<{
  rows: readonly ImportedRow[];
  summary: Readonly<{ total: number; valid: number; invalid: number }>;
}>;

export type CanonicalClient = Readonly<{
  id: string;
  displayName: string;
  createdAt: string;
}>;

export type ClientAlias = Readonly<{
  normalizedName: string;
  canonicalClientId: string;
  displayVariant: string;
  confirmedByUser: boolean;
  createdAt: string;
  revokedAt: string | null;
}>;

export type ClientAliasEvent = Readonly<{
  kind: 'CLIENT_ALIAS_ASSOCIATED';
  id: string;
  occurredAt: string;
  normalizedName: string;
  canonicalClientId: string;
}>;

export type ClientIdentityState = Readonly<{
  revision: number;
  clients: readonly CanonicalClient[];
  aliases: readonly ClientAlias[];
  events: readonly ClientAliasEvent[];
}>;

export type ImportedVersionRow = Readonly<{
  versionId: string;
  canonicalClientId: string;
  rowNumber: number;
  raw: RawOperationCells;
  normalized: NormalizedOperation | null;
  errors: readonly ImportRowError[];
}>;

export type ImportBatch = Readonly<{
  id: string;
  batchSequence: number;
  importedAt: string;
  sha256: string;
  byteSize: number;
  rows: readonly ImportedVersionRow[];
}>;

export type ImportEvent =
  | Readonly<{
    kind: 'BATCH_IMPORTED' | 'BATCH_REVERTED';
    id: string;
    eventSequence: number;
    occurredAt: string;
    batchId: string;
  }>
  | Readonly<{
    kind: 'CONFLICT_RESOLVED';
    id: string;
    eventSequence: number;
    occurredAt: string;
    operationId: string;
    selectedVersionId: string;
  }>
  | Readonly<{
    kind: 'OPERATION_EXCLUDED' | 'OPERATION_RESTORED';
    id: string;
    eventSequence: number;
    occurredAt: string;
    operationId: string;
  }>
  | Readonly<{
    kind: 'OPERATION_CORRECTED';
    id: string;
    eventSequence: number;
    occurredAt: string;
    versionId: string;
    operationId: string;
    field: EditableImportField;
    rawValue: string;
  }>;

export type ImportPortfolio = Readonly<{
  revision: number;
  batches: readonly ImportBatch[];
  events: readonly ImportEvent[];
}>;

export type PortfolioVersion = Readonly<{
  versionId: string;
  batchId: string;
  batchSequence: number;
  rowNumber: number;
  canonicalClientId: string;
  operation: NormalizedOperation;
}>;

export type PortfolioOperation = PortfolioVersion & Readonly<{
  operationId: string;
  originVersionIds: readonly string[];
}>;

export type PortfolioConflict = Readonly<{
  operationId: string;
  versionIds: readonly string[];
}>;

export type PortfolioProjection = Readonly<{
  versions: readonly PortfolioVersion[];
  rows: readonly ImportedVersionRow[];
  currentOperations: readonly PortfolioOperation[];
  conflicts: readonly PortfolioConflict[];
}>;

export type EditableImportField =
  | 'direction'
  | 'knownDate'
  | 'deadlineDate'
  | 'valueBrl'
  | 'purposeCode';
