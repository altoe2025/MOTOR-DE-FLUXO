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
