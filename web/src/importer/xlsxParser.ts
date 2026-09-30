import readXlsxFile from 'read-excel-file/universal';

import type { RawOperationCells } from './domain';
import { IMPORT_HEADERS, IMPORT_LIMIT_ROWS, IMPORT_SHEET_NAME } from './layout';
import { ImportFileError, invalidXlsx, preflightXlsx, ROW_LIMIT_MESSAGE, type SerializedImportFileError } from './xlsxPreflight';

const HEADERS: readonly (keyof RawOperationCells)[] = IMPORT_HEADERS;

export type ParsedImport = Readonly<{
  layout: 'xlsx-operacoes/1.0.0';
  sha256: string;
  byteSize: number;
  rows: readonly RawOperationCells[];
}>;

export type WorkerRequest = Readonly<{ kind: 'PARSE'; requestId: string; buffer: ArrayBuffer }>;
export type WorkerResponse = Readonly<{ kind: 'SUCCESS'; requestId: string; parsed: ParsedImport } | { kind: 'FAILURE'; requestId: string; error: SerializedImportFileError }>;

function formatUtcDate(value: Date): string {
  return `${String(value.getUTCFullYear()).padStart(4, '0')}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}
function serializeCell(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return formatUtcDate(value);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  throw new ImportFileError('INVALID_XLSX', invalidXlsx('há uma célula com tipo de dado não suportado'));
}
function serializeRow(row: unknown[], hasPurposeHeader: boolean): RawOperationCells {
  return Object.fromEntries(HEADERS.map((header, index) => [
    header, header === 'finalidade_codigo' && !hasPurposeHeader ? null : serializeCell(row[index]),
  ])) as RawOperationCells;
}
async function sha256(buffer: ArrayBuffer): Promise<string> { const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }

export async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<ParsedImport> {
  await preflightXlsx(buffer);
  const sheets = await readXlsxFile<string>(buffer, { parseNumber: (value) => value, trim: false });
  const sheet = sheets.find((candidate) => candidate.sheet === IMPORT_SHEET_NAME);
  if (sheet === undefined) throw new ImportFileError('SHEET_NAME_INVALID', `A aba '${IMPORT_SHEET_NAME}' não foi encontrada. Renomeie a aba ou use o modelo.`);
  const hasPurposeHeader = sheet.data[0]?.[7] === 'finalidade_codigo';
  const rows = sheet.data.slice(1);
  if (rows.length > IMPORT_LIMIT_ROWS) throw new ImportFileError('ROW_LIMIT_EXCEEDED', ROW_LIMIT_MESSAGE);
  return { layout: 'xlsx-operacoes/1.0.0', sha256: await sha256(buffer), byteSize: buffer.byteLength, rows: rows.map((row) => serializeRow(row, hasPurposeHeader)) };
}
