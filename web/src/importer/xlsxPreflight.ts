import { strFromU8, Unzip, UnzipInflate } from 'fflate';
import { Parser } from 'saxen';

import type { ImportErrorCode } from './domain';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ENTRIES = 128;
const MAX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;
const OLE_SIGNATURE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const REQUIRED_HEADERS = ['operacao_id', 'cliente_nome', 'classificacao_perfil', 'direcao', 'data_conhecida', 'data_limite', 'valor_brl'] as const;
const OPTIONAL_HEADERS = ['finalidade_codigo'] as const;
const MAX_WORKSHEET_ROW = 1001;

export type SerializedImportFileError = Readonly<{ code: ImportErrorCode; message: string }>;

export class ImportFileError extends Error {
  readonly code: ImportErrorCode;
  constructor(code: ImportErrorCode, message: string = code) { super(`${code}: ${message}`); this.name = 'ImportFileError'; this.code = code; }
}

function fail(code: ImportErrorCode, message: string): never { throw new ImportFileError(code, message); }
function hasPrefix(bytes: Uint8Array, prefix: Uint8Array): boolean { return bytes.length >= prefix.length && prefix.every((value, index) => bytes[index] === value); }
function retain(name: string): boolean { return name === '[Content_Types].xml' || name === 'xl/workbook.xml' || name === 'xl/_rels/workbook.xml.rels' || name === 'xl/sharedStrings.xml' || name.startsWith('xl/worksheets/') || name.startsWith('xl/externalLinks/') || name.endsWith('.rels'); }

async function extractArchive(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    const entries = new Map<string, Uint8Array>(); let entryCount = 0; let totalBytes = 0; let pending = 0; let finished = false; let settled = false;
    const names = new Set<string>();
    const rejectOnce = (error: unknown) => { if (!settled) { settled = true; reject(error); } };
    const complete = () => { if (!settled && finished && pending === 0) { settled = true; resolve(entries); } };
    const unzip = new Unzip((file) => {
      if (settled) { file.terminate(); return; }
      if (file.name.startsWith('/') || file.name.includes('\\') || file.name.split('/').includes('..') || file.name.includes('\0') || names.has(file.name)) {
        file.terminate(); rejectOnce(new ImportFileError('INVALID_XLSX', 'nome de entrada ZIP inválido ou repetido')); return;
      }
      names.add(file.name);
      if (/vbaProject\.bin|^xl\/embeddings\//i.test(file.name)) { file.terminate(); rejectOnce(new ImportFileError('MACRO_NOT_ALLOWED', 'macros e objetos OLE não são permitidos')); return; }
      entryCount += 1;
      if (entryCount > MAX_ENTRIES) { file.terminate(); rejectOnce(new ImportFileError('ZIP_ENTRY_LIMIT_EXCEEDED', 'o XLSX excede 128 entradas ZIP')); return; }
      if (file.originalSize !== undefined && totalBytes + file.originalSize > MAX_UNCOMPRESSED_BYTES) { file.terminate(); rejectOnce(new ImportFileError('UNCOMPRESSED_SIZE_LIMIT_EXCEEDED', 'o XLSX excede 25 MiB descompactados')); return; }
      pending += 1; const chunks: Uint8Array[] = []; let entryBytes = 0;
      file.ondata = (error, chunk, final) => {
        if (error) { pending -= 1; rejectOnce(new ImportFileError('INVALID_XLSX', 'não foi possível descompactar o XLSX')); return; }
        entryBytes += chunk.length; totalBytes += chunk.length;
        if (totalBytes > MAX_UNCOMPRESSED_BYTES) { file.terminate(); pending -= 1; rejectOnce(new ImportFileError('UNCOMPRESSED_SIZE_LIMIT_EXCEEDED', 'o XLSX excede 25 MiB descompactados')); return; }
        if (retain(file.name)) chunks.push(chunk);
        if (!final) return;
        if (retain(file.name)) { const content = new Uint8Array(entryBytes); let offset = 0; for (const part of chunks) { content.set(part, offset); offset += part.length; } entries.set(file.name, content); }
        pending -= 1; complete();
      };
      file.start();
    });
    unzip.register(UnzipInflate);
    try { unzip.push(new Uint8Array(buffer), true); finished = true; complete(); } catch { rejectOnce(new ImportFileError('INVALID_XLSX', 'estrutura ZIP inválida')); }
  });
}

function xml(entries: Map<string, Uint8Array>, name: string): string { const bytes = entries.get(name); return bytes === undefined ? fail('INVALID_XLSX', `entrada obrigatória ausente: ${name}`) : strFromU8(bytes); }
function local(name: string): string { return name.split(':').at(-1) ?? name; }
function parseXml(xmlText: string, handlers: { open?: (name: string, attributes: Record<string, string>) => void; close?: (name: string) => void; text?: (value: string) => void }): void {
  const parser = new Parser(); let failure: Error | null = null;
  parser.on('openTag', (name, attributes) => handlers.open?.(local(name), attributes()));
  parser.on('closeTag', (name) => handlers.close?.(local(name)));
  parser.on('text', (value, decode) => handlers.text?.(decode(value)));
  parser.on('error', (error) => { failure = error; }); parser.parse(xmlText);
  if (failure !== null) fail('INVALID_XLSX', 'XML inválido no pacote XLSX');
}
function rejectContentTypes(xmlText: string): void { parseXml(xmlText, { open(name, attributes) { if (name !== 'Override' && name !== 'Default') return; const content = (attributes.ContentType ?? '') + (attributes.PartName ?? ''); if (/vbaProject|macroEnabled|oleObject/i.test(content)) fail('MACRO_NOT_ALLOWED', 'macros e objetos OLE não são permitidos'); if (/externalLink/i.test(content)) fail('EXTERNAL_LINK_NOT_ALLOWED', 'links externos não são permitidos'); } }); }
function rejectRelationships(xmlText: string): void { parseXml(xmlText, { open(name, attributes) { if (name === 'Relationship' && (attributes.TargetMode === 'External' || /externalLink/i.test(attributes.Type ?? ''))) fail('EXTERNAL_LINK_NOT_ALLOWED', 'links externos não são permitidos'); } }); }
type Sheet = { name: string; state: string | undefined; relationshipId: string };
function singleSheet(xmlText: string): Sheet { const sheets: Sheet[] = []; parseXml(xmlText, { open(name, attributes) { if (name === 'externalReference') fail('EXTERNAL_LINK_NOT_ALLOWED', 'links externos não são permitidos'); if (name === 'sheet') sheets.push({ name: attributes.name ?? '', state: attributes.state, relationshipId: attributes['r:id'] ?? '' }); } }); if (sheets.length !== 1) return fail('SHEET_COUNT_INVALID', 'o arquivo deve conter exatamente uma aba'); const sheet = sheets[0]; if (sheet === undefined || sheet.name !== 'operacoes' || (sheet.state !== undefined && sheet.state !== 'visible')) return fail('SHEET_NAME_INVALID', 'a única aba visível deve se chamar operacoes'); return sheet; }
function resolveSheet(xmlText: string, relationshipId: string): string { let target: string | undefined; parseXml(xmlText, { open(name, attributes) { if (name !== 'Relationship') return; if (/externalLink/i.test(attributes.Type ?? '') || attributes.TargetMode === 'External') fail('EXTERNAL_LINK_NOT_ALLOWED', 'links externos não são permitidos'); if (attributes.Id === relationshipId) target = attributes.Target; } }); if (target === undefined || target.includes('..')) return fail('INVALID_XLSX', 'relação da aba inválida'); const clean = target.replace(/^\//, ''); return clean.startsWith('xl/') ? clean : `xl/${clean}`; }
function sharedStrings(xmlText: string | undefined): string[] { if (xmlText === undefined) return []; const values: string[] = []; let item = false; let text = false; let current = ''; parseXml(xmlText, { open(name) { if (name === 'si') { item = true; current = ''; } else if (item && name === 't') text = true; }, close(name) { if (name === 't') text = false; else if (name === 'si') { values.push(current); item = false; } }, text(value) { if (text) current += value; } }); return values; }
function column(reference: string): number { const match = /^([A-Z]+)[0-9]+$/.exec(reference); if (match?.[1] === undefined) return -1; return [...match[1]].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1; }
function rowFromCellReference(reference: string): number { const match = /^[A-Z]+([1-9]\d*)$/.exec(reference); return match?.[1] === undefined ? 0 : Number(match[1]); }
function inspectWorksheet(xmlText: string, strings: string[]): void { const headers: Array<string | undefined> = []; let row = 0; let ref = ''; let type = ''; let readingValue = false; let inline = false; let value = ''; parseXml(xmlText, { open(name, attributes) { if (name === 'f') fail('FORMULA_NOT_ALLOWED', 'fórmulas não são permitidas'); if (name === 'mergeCell') fail('MERGED_CELLS_NOT_ALLOWED', 'células mescladas não são permitidas'); if (name === 'row') row = Number(attributes.r ?? 0); else if (name === 'c') { ref = attributes.r ?? ''; if (Math.max(row, rowFromCellReference(ref)) > MAX_WORKSHEET_ROW) fail('ROW_LIMIT_EXCEEDED', 'o XLSX excede 1.000 operações'); type = attributes.t ?? ''; value = ''; } else if (name === 'v') readingValue = true; else if (name === 't' && type === 'inlineStr') inline = true; }, close(name) { if (name === 'v') readingValue = false; else if (name === 't') inline = false; else if (name === 'c' && row === 1) { const index = column(ref); if (index >= 0) headers[index] = type === 's' ? strings[Number(value)] : value; } }, text(text) { if (readingValue || inline) value += text; } }); const expected = headers.length === REQUIRED_HEADERS.length ? REQUIRED_HEADERS : [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS]; if (headers.length !== expected.length || headers.some((header, index) => header !== expected[index])) fail('HEADER_INVALID', 'headers fora da ordem canônica'); }

export async function preflightXlsx(buffer: ArrayBuffer): Promise<Readonly<{ sheetName: 'operacoes'; sheetPath: string }>> {
  if (buffer.byteLength > MAX_FILE_BYTES) return fail('FILE_TOO_LARGE', 'o XLSX excede 5 MiB');
  const bytes = new Uint8Array(buffer);
  if (hasPrefix(bytes, OLE_SIGNATURE)) return fail('ENCRYPTED_FILE_NOT_ALLOWED', 'arquivos OLE ou criptografados não são permitidos');
  const entries = await extractArchive(buffer);
  if ([...entries.keys()].some((name) => name.startsWith('xl/externalLinks/'))) return fail('EXTERNAL_LINK_NOT_ALLOWED', 'links externos não são permitidos');
  rejectContentTypes(xml(entries, '[Content_Types].xml'));
  for (const [name, content] of entries) if (name.endsWith('.rels')) rejectRelationships(strFromU8(content));
  const sheet = singleSheet(xml(entries, 'xl/workbook.xml'));
  const sheetPath = resolveSheet(xml(entries, 'xl/_rels/workbook.xml.rels'), sheet.relationshipId);
  const strings = entries.get('xl/sharedStrings.xml');
  inspectWorksheet(xml(entries, sheetPath), sharedStrings(strings === undefined ? undefined : strFromU8(strings)));
  return { sheetName: 'operacoes', sheetPath };
}
