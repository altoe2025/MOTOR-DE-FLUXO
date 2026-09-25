import readXlsxFile from 'read-excel-file/universal';

import type { RawOperationCells } from './domain';
import { ImportFileError, preflightXlsx, type SerializedImportFileError } from './xlsxPreflight';

const REQUIRED_HEADERS = ['operacao_id', 'cliente_nome', 'classificacao_perfil', 'direcao', 'data_conhecida', 'data_limite', 'valor_brl'] as const;
const OPTIONAL_HEADERS = ['finalidade_codigo'] as const;
const HEADERS: readonly (keyof RawOperationCells)[] = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS];
const MAX_ROWS = 1000;

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
  throw new ImportFileError('INVALID_XLSX', 'tipo de célula não suportado');
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
  const sheet = sheets.find((candidate) => candidate.sheet === 'operacoes');
  if (sheet === undefined) throw new ImportFileError('SHEET_NAME_INVALID', 'aba operacoes não encontrada');
  const hasPurposeHeader = sheet.data[0]?.[7] === 'finalidade_codigo';
  const rows = sheet.data.slice(1);
  if (rows.length > MAX_ROWS) throw new ImportFileError('ROW_LIMIT_EXCEEDED', 'o arquivo excede 1.000 operações');
  return { layout: 'xlsx-operacoes/1.0.0', sha256: await sha256(buffer), byteSize: buffer.byteLength, rows: rows.map((row) => serializeRow(row, hasPurposeHeader)) };
}
