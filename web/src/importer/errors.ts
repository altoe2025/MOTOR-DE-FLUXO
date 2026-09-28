import type { ImportErrorCode } from './domain';

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
