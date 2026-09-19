export type ApplicationRepositoryErrorCode =
  | 'BINARY_DATA_NOT_ALLOWED'
  | 'DOCUMENT_CORRUPT'
  | 'INVALID_DOCUMENT'
  | 'NOT_FOUND'
  | 'OPERATION_CONFLICT'
  | 'OWNER_MISMATCH'
  | 'REVISION_CONFLICT'
  | 'SCHEMA_UNSUPPORTED'
  | 'STORAGE_CLOSED';

export class ApplicationRepositoryError extends Error {
  constructor(
    readonly code: ApplicationRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BinaryDataNotAllowedError extends ApplicationRepositoryError {
  constructor() {
    super('BINARY_DATA_NOT_ALLOWED', 'File e Blob não podem ser persistidos.');
  }
}

export class DocumentCorruptError extends ApplicationRepositoryError {
  constructor(message = 'Documento persistido está corrompido.') {
    super('DOCUMENT_CORRUPT', message);
  }
}

export class InvalidDocumentError extends ApplicationRepositoryError {
  constructor(message = 'Documento inválido.') {
    super('INVALID_DOCUMENT', message);
  }
}

export class NotFoundError extends ApplicationRepositoryError {
  constructor(message = 'Registro não encontrado.') {
    super('NOT_FOUND', message);
  }
}

export class OperationConflictError extends ApplicationRepositoryError {
  constructor(message = 'Operation ID já pertence a outra mutação.') {
    super('OPERATION_CONFLICT', message);
  }
}

export class OwnerMismatchError extends ApplicationRepositoryError {
  constructor() {
    super('OWNER_MISMATCH', 'Registro pertence a outro owner.');
  }
}

export class RevisionConflictError extends ApplicationRepositoryError {
  constructor(
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(
      'REVISION_CONFLICT',
      `Revisão esperada ${expectedRevision}, revisão atual ${actualRevision}.`,
    );
  }
}

export class SchemaUnsupportedError extends ApplicationRepositoryError {
  constructor(message = 'Versão de schema não suportada.') {
    super('SCHEMA_UNSUPPORTED', message);
  }
}

export class StorageClosedError extends ApplicationRepositoryError {
  constructor() {
    super('STORAGE_CLOSED', 'Repositório fechado.');
  }
}
