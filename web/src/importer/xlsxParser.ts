import readXlsxFile from 'read-excel-file/universal';

import type { RawOperationCells } from './domain';
import {
  ImportFileError,
  type SerializedImportFileError,
  preflightXlsx,
} from './xlsxPreflight';

const HEADERS: Array<keyof RawOperationCells> = [
  'operacao_id',
  'cliente_nome',
  'classificacao_perfil',
  'direcao',
  'data_conhecida',
  'data_limite',
  'valor_brl',
  'finalidade_codigo',
];
const MAX_ROWS = 1000;

export type ParsedWorkbookMetadata = {
  fileName: string;
  fileSize: number;
  fileLastModified: number;
  sha256: string;
};

export type ParsedWorkbook = {
  sheetName: 'operacoes';
  metadata: ParsedWorkbookMetadata;
  rows: RawOperationCells[];
};

export type WorkerRequest = {
  kind: 'PARSE';
  requestId: string;
  buffer: ArrayBuffer;
  fileName: string;
  fileSize: number;
  fileLastModified: number;
};

export type WorkerResponse =
  | {
      kind: 'SUCCESS';
      requestId: string;
      workbook: ParsedWorkbook;
    }
  | {
      kind: 'FAILURE';
      requestId: string;
      error: SerializedImportFileError;
    };

function formatUtcDate(value: Date): string {
  const year = String(value.getUTCFullYear()).padStart(4, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function serializeCell(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (value instanceof Date) {
    return formatUtcDate(value);
  }
  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return String(value);
  }
  throw new ImportFileError(
    'INVALID_XLSX',
    'tipo de célula não suportado',
  );
}

function serializeRow(row: unknown[]): RawOperationCells {
  return Object.fromEntries(
    HEADERS.map((header, index) => [
      header,
      serializeCell(row[index]),
    ]),
  ) as RawOperationCells;
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    buffer,
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function parseWorkbook(
  buffer: ArrayBuffer,
  metadata: {
    fileName: string;
    fileSize: number;
    fileLastModified: number;
  },
): Promise<ParsedWorkbook> {
  await preflightXlsx(buffer);
  const sheets = await readXlsxFile<string>(buffer, {
    parseNumber: (value) => value,
  });
  const sheet = sheets.find(
    (candidate) => candidate.sheet === 'operacoes',
  );
  if (sheet === undefined) {
    throw new ImportFileError(
      'SHEET_NAME_INVALID',
      'aba operacoes não encontrada',
    );
  }
  const dataRows = sheet.data.slice(1);
  if (dataRows.length > MAX_ROWS) {
    throw new ImportFileError(
      'ROW_LIMIT_EXCEEDED',
      'o arquivo excede 1.000 operações',
    );
  }
  return {
    sheetName: 'operacoes',
    metadata: {
      ...metadata,
      sha256: await sha256(buffer),
    },
    rows: dataRows.map((row) => serializeRow(row)),
  };
}
