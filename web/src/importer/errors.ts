import type { ImportErrorCode } from './domain';

export class ImportValidationError extends Error {
  readonly code: ImportErrorCode;

  constructor(code: ImportErrorCode, message: string = code) {
    super(`${code}: ${message}`);
    this.name = 'ImportValidationError';
    this.code = code;
  }
}
