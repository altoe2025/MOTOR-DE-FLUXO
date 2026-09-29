import type { ImportErrorCode } from './domain';
import { IMPORT_LIMIT_ROWS, IMPORT_MAX_FILE_MIB } from './layout';

export class ImportValidationError extends Error {
  readonly code: ImportErrorCode;

  constructor(code: ImportErrorCode, message: string = code) {
    super(`${code}: ${message}`);
    this.name = 'ImportValidationError';
    this.code = code;
  }
}

/** Texto de erro para a pessoa, sem o código técnico que abre a mensagem. */
export function humanMessage(message: string): string {
  return message.replace(/^[A-Z][A-Z_]+: /, '');
}

export type SerializedImportFileError = Readonly<{ code: ImportErrorCode; message: string }>;

export class ImportFileError extends Error {
  readonly code: ImportErrorCode;
  /** Texto para a pessoa: o que está errado e como corrigir, sem o código. */
  readonly detail: string;
  constructor(code: ImportErrorCode, detail: string = code) { super(`${code}: ${detail}`); this.name = 'ImportFileError'; this.code = code; this.detail = detail; }
}

export const ROW_LIMIT_MESSAGE = `A planilha passa do limite de até ${IMPORT_LIMIT_ROWS.toLocaleString('pt-BR')} operações por arquivo. Divida em arquivos de até ${IMPORT_LIMIT_ROWS.toLocaleString('pt-BR')} linhas (sem contar o cabeçalho) e apague linhas vazias no fim.`;
export const FILE_TOO_LARGE_MESSAGE = `O arquivo passa de ${IMPORT_MAX_FILE_MIB} MiB. Apague abas, imagens e formatação extras, ou cole só os dados no modelo.`;

export function invalidXlsx(what: string): string {
  return `O arquivo não é um .xlsx válido (${what}). Abra no Excel e salve de novo como Pasta de Trabalho do Excel (.xlsx), ou use o modelo.`;
}
