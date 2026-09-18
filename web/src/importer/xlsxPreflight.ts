import {
  strFromU8,
  Unzip,
  UnzipInflate,
} from 'fflate';
import { Parser } from 'saxen';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ENTRIES = 128;
const MAX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;
const OLE_SIGNATURE = new Uint8Array([
  0xd0, 0xcf, 0x11, 0xe0,
  0xa1, 0xb1, 0x1a, 0xe1,
]);
const EXPECTED_HEADERS = [
  'operacao_id',
  'cliente_nome',
  'classificacao_perfil',
  'direcao',
  'data_conhecida',
  'data_limite',
  'valor_brl',
  'finalidade_codigo',
];

export type ImportFileErrorCode =
  | 'FILE_TOO_LARGE'
  | 'INVALID_XLSX'
  | 'ZIP_ENTRY_LIMIT_EXCEEDED'
  | 'UNCOMPRESSED_SIZE_LIMIT_EXCEEDED'
  | 'ENCRYPTED_FILE_NOT_ALLOWED'
  | 'MACRO_NOT_ALLOWED'
  | 'EXTERNAL_LINK_NOT_ALLOWED'
  | 'FORMULA_NOT_ALLOWED'
  | 'MERGED_CELLS_NOT_ALLOWED'
  | 'SHEET_COUNT_INVALID'
  | 'SHEET_NAME_INVALID'
  | 'HEADER_INVALID'
  | 'ROW_LIMIT_EXCEEDED'
  | 'WORKER_FAILURE';

export type SerializedImportFileError = {
  code: ImportFileErrorCode;
  message: string;
};

export class ImportFileError extends Error {
  readonly code: ImportFileErrorCode;

  constructor(code: ImportFileErrorCode, message: string = code) {
    super(`${code}: ${message}`);
    this.name = 'ImportFileError';
    this.code = code;
  }
}

type ArchiveEntries = Map<string, Uint8Array>;

function fail(
  code: ImportFileErrorCode,
  message: string,
): never {
  throw new ImportFileError(code, message);
}

function hasPrefix(
  bytes: Uint8Array,
  prefix: Uint8Array,
): boolean {
  return (
    bytes.length >= prefix.length
    && prefix.every((value, index) => bytes[index] === value)
  );
}

function shouldRetainEntry(name: string): boolean {
  return (
    name === '[Content_Types].xml'
    || name === 'xl/workbook.xml'
    || name === 'xl/_rels/workbook.xml.rels'
    || name === 'xl/sharedStrings.xml'
    || name.startsWith('xl/worksheets/')
    || name.startsWith('xl/externalLinks/')
    || name.endsWith('.rels')
  );
}

function extractArchive(buffer: ArrayBuffer): Promise<ArchiveEntries> {
  return new Promise((resolve, reject) => {
    const entries: ArchiveEntries = new Map();
    let entryCount = 0;
    let totalBytes = 0;
    let pending = 0;
    let inputFinished = false;
    let settled = false;
    const seenNames = new Set<string>();

    const rejectOnce = (error: unknown) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    const completeIfReady = () => {
      if (!settled && inputFinished && pending === 0) {
        settled = true;
        resolve(entries);
      }
    };

    const unzip = new Unzip((file) => {
      if (settled) {
        file.terminate();
        return;
      }
      if (
        file.name.startsWith('/')
        || file.name.includes('\\')
        || file.name.split('/').includes('..')
        || file.name.includes('\0')
        || seenNames.has(file.name)
      ) {
        file.terminate();
        rejectOnce(new ImportFileError(
          'INVALID_XLSX',
          'nome de entrada ZIP inválido ou repetido',
        ));
        return;
      }
      seenNames.add(file.name);
      if (/vbaProject\.bin|^xl\/embeddings\//i.test(file.name)) {
        file.terminate();
        rejectOnce(new ImportFileError(
          'MACRO_NOT_ALLOWED',
          'macros e objetos OLE não são permitidos',
        ));
        return;
      }
      entryCount += 1;
      if (entryCount > MAX_ENTRIES) {
        file.terminate();
        rejectOnce(new ImportFileError(
          'ZIP_ENTRY_LIMIT_EXCEEDED',
          'o XLSX excede 128 entradas ZIP',
        ));
        return;
      }
      if (
        file.originalSize !== undefined
        && totalBytes + file.originalSize > MAX_UNCOMPRESSED_BYTES
      ) {
        file.terminate();
        rejectOnce(new ImportFileError(
          'UNCOMPRESSED_SIZE_LIMIT_EXCEEDED',
          'o XLSX excede 25 MiB descompactados',
        ));
        return;
      }

      pending += 1;
      const chunks: Uint8Array[] = [];
      let entryBytes = 0;
      file.ondata = (error, chunk, final) => {
        if (error) {
          pending -= 1;
          rejectOnce(new ImportFileError(
            'INVALID_XLSX',
            'não foi possível descompactar o XLSX',
          ));
          return;
        }
        entryBytes += chunk.length;
        totalBytes += chunk.length;
        if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
          file.terminate();
          pending -= 1;
          rejectOnce(new ImportFileError(
            'UNCOMPRESSED_SIZE_LIMIT_EXCEEDED',
            'o XLSX excede 25 MiB descompactados',
          ));
          return;
        }
        if (shouldRetainEntry(file.name)) {
          chunks.push(chunk);
        }
        if (!final) {
          return;
        }
        if (shouldRetainEntry(file.name)) {
          const content = new Uint8Array(entryBytes);
          let offset = 0;
          for (const part of chunks) {
            content.set(part, offset);
            offset += part.length;
          }
          entries.set(file.name, content);
        }
        pending -= 1;
        completeIfReady();
      };
      file.start();
    });
    unzip.register(UnzipInflate);

    try {
      unzip.push(new Uint8Array(buffer), true);
      inputFinished = true;
      completeIfReady();
    } catch {
      rejectOnce(new ImportFileError(
        'INVALID_XLSX',
        'estrutura ZIP inválida',
      ));
    }
  });
}

function xmlEntry(entries: ArchiveEntries, name: string): string {
  const bytes = entries.get(name);
  if (bytes === undefined) {
    return fail('INVALID_XLSX', `entrada obrigatória ausente: ${name}`);
  }
  return strFromU8(bytes);
}

function localName(name: string): string {
  return name.split(':').at(-1) ?? name;
}

function parseXml(
  xml: string,
  handlers: {
    open?: (
      name: string,
      attributes: Record<string, string>,
    ) => void;
    close?: (name: string) => void;
    text?: (value: string) => void;
  },
): void {
  const parser = new Parser();
  let parsingError: Error | null = null;
  parser.on('openTag', (name, getAttributes) => {
    handlers.open?.(localName(name), getAttributes());
  });
  parser.on('closeTag', (name) => {
    handlers.close?.(localName(name));
  });
  parser.on('text', (value, decodeEntities) => {
    handlers.text?.(decodeEntities(value));
  });
  parser.on('error', (error) => {
    parsingError = error;
  });
  parser.parse(xml);
  if (parsingError !== null) {
    fail('INVALID_XLSX', 'XML inválido no pacote XLSX');
  }
}

function rejectForbiddenContentTypes(xml: string): void {
  parseXml(xml, {
    open(name, attributes) {
      if (name !== 'Override' && name !== 'Default') {
        return;
      }
      const contentType = attributes.ContentType ?? '';
      const partName = attributes.PartName ?? '';
      if (/vbaProject|macroEnabled|oleObject/i.test(contentType + partName)) {
        fail('MACRO_NOT_ALLOWED', 'macros e objetos OLE não são permitidos');
      }
      if (/externalLink/i.test(contentType + partName)) {
        fail('EXTERNAL_LINK_NOT_ALLOWED', 'links externos não são permitidos');
      }
    },
  });
}

function rejectExternalRelationships(xml: string): void {
  parseXml(xml, {
    open(name, attributes) {
      if (name !== 'Relationship') {
        return;
      }
      if (
        attributes.TargetMode === 'External'
        || /externalLink/i.test(attributes.Type ?? '')
      ) {
        fail('EXTERNAL_LINK_NOT_ALLOWED', 'links externos não são permitidos');
      }
    },
  });
}

type SheetDefinition = {
  name: string;
  state: string | undefined;
  relationshipId: string;
};

function readSingleVisibleSheet(xml: string): SheetDefinition {
  const sheets: SheetDefinition[] = [];
  parseXml(xml, {
    open(name, attributes) {
      if (name === 'externalReference') {
        fail('EXTERNAL_LINK_NOT_ALLOWED', 'links externos não são permitidos');
      }
      if (name === 'sheet') {
        sheets.push({
          name: attributes.name ?? '',
          state: attributes.state,
          relationshipId: attributes['r:id'] ?? '',
        });
      }
    },
  });
  if (sheets.length !== 1) {
    return fail(
      'SHEET_COUNT_INVALID',
      'o arquivo deve conter exatamente uma aba',
    );
  }
  const sheet = sheets[0];
  if (
    sheet === undefined
    || sheet.name !== 'operacoes'
    || (sheet.state !== undefined && sheet.state !== 'visible')
  ) {
    return fail(
      'SHEET_NAME_INVALID',
      'a única aba visível deve se chamar operacoes',
    );
  }
  return sheet;
}

function resolveSheetPath(
  xml: string,
  relationshipId: string,
): string {
  let target: string | undefined;
  parseXml(xml, {
    open(name, attributes) {
      if (name !== 'Relationship') {
        return;
      }
      const type = attributes.Type ?? '';
      if (
        /externalLink/i.test(type)
        || attributes.TargetMode === 'External'
      ) {
        fail('EXTERNAL_LINK_NOT_ALLOWED', 'links externos não são permitidos');
      }
      if (attributes.Id === relationshipId) {
        target = attributes.Target;
      }
    },
  });
  if (target === undefined || target.includes('..')) {
    return fail('INVALID_XLSX', 'relação da aba inválida');
  }
  const normalized = target.replace(/^\//, '');
  return normalized.startsWith('xl/')
    ? normalized
    : `xl/${normalized}`;
}

function readSharedStrings(xml: string | undefined): string[] {
  if (xml === undefined) {
    return [];
  }
  const values: string[] = [];
  let insideItem = false;
  let insideText = false;
  let current = '';
  parseXml(xml, {
    open(name) {
      if (name === 'si') {
        insideItem = true;
        current = '';
      } else if (insideItem && name === 't') {
        insideText = true;
      }
    },
    close(name) {
      if (name === 't') {
        insideText = false;
      } else if (name === 'si') {
        values.push(current);
        insideItem = false;
      }
    },
    text(value) {
      if (insideText) {
        current += value;
      }
    },
  });
  return values;
}

function columnIndex(reference: string): number {
  const match = /^([A-Z]+)[0-9]+$/.exec(reference);
  if (match === null || match[1] === undefined) {
    return -1;
  }
  return [...match[1]].reduce(
    (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
    0,
  ) - 1;
}

function inspectWorksheet(
  xml: string,
  sharedStrings: string[],
): void {
  const headers: Array<string | undefined> = [];
  let rowNumber = 0;
  let cellReference = '';
  let cellType = '';
  let captureValue = false;
  let captureInlineText = false;
  let value = '';

  const finishHeaderCell = () => {
    if (rowNumber !== 1) {
      return;
    }
    const index = columnIndex(cellReference);
    if (index < 0) {
      return;
    }
    headers[index] = cellType === 's'
      ? sharedStrings[Number(value)]
      : value;
  };

  parseXml(xml, {
    open(name, attributes) {
      if (name === 'f') {
        fail('FORMULA_NOT_ALLOWED', 'fórmulas não são permitidas');
      }
      if (name === 'mergeCell') {
        fail('MERGED_CELLS_NOT_ALLOWED', 'células mescladas não são permitidas');
      }
      if (name === 'row') {
        rowNumber = Number(attributes.r ?? 0);
      } else if (name === 'c') {
        cellReference = attributes.r ?? '';
        cellType = attributes.t ?? '';
        value = '';
      } else if (name === 'v') {
        captureValue = true;
      } else if (name === 't' && cellType === 'inlineStr') {
        captureInlineText = true;
      }
    },
    close(name) {
      if (name === 'v') {
        captureValue = false;
      } else if (name === 't') {
        captureInlineText = false;
      } else if (name === 'c') {
        finishHeaderCell();
      }
    },
    text(text) {
      if (captureValue || captureInlineText) {
        value += text;
      }
    },
  });

  if (
    headers.length !== EXPECTED_HEADERS.length
    || headers.some(
      (header, index) => header !== EXPECTED_HEADERS[index],
    )
  ) {
    fail('HEADER_INVALID', 'headers fora da ordem canônica');
  }
}

export async function preflightXlsx(
  buffer: ArrayBuffer,
): Promise<{
  sheetName: 'operacoes';
  sheetPath: string;
}> {
  if (buffer.byteLength > MAX_FILE_BYTES) {
    return fail('FILE_TOO_LARGE', 'o XLSX excede 5 MiB');
  }
  const bytes = new Uint8Array(buffer);
  if (hasPrefix(bytes, OLE_SIGNATURE)) {
    return fail(
      'ENCRYPTED_FILE_NOT_ALLOWED',
      'arquivos OLE ou criptografados não são permitidos',
    );
  }

  const entries = await extractArchive(buffer);
  if (
    [...entries.keys()].some(
      (name) => name.startsWith('xl/externalLinks/'),
    )
  ) {
    return fail(
      'EXTERNAL_LINK_NOT_ALLOWED',
      'links externos não são permitidos',
    );
  }

  rejectForbiddenContentTypes(
    xmlEntry(entries, '[Content_Types].xml'),
  );
  for (const [name, content] of entries) {
    if (name.endsWith('.rels')) {
      rejectExternalRelationships(strFromU8(content));
    }
  }
  const sheet = readSingleVisibleSheet(
    xmlEntry(entries, 'xl/workbook.xml'),
  );
  const sheetPath = resolveSheetPath(
    xmlEntry(entries, 'xl/_rels/workbook.xml.rels'),
    sheet.relationshipId,
  );
  const sharedStringsBytes = entries.get('xl/sharedStrings.xml');
  const sharedStrings = readSharedStrings(
    sharedStringsBytes === undefined
      ? undefined
      : strFromU8(sharedStringsBytes),
  );
  inspectWorksheet(
    xmlEntry(entries, sheetPath),
    sharedStrings,
  );
  return {
    sheetName: 'operacoes',
    sheetPath,
  };
}
