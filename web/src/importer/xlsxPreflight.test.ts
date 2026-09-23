import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { preflightXlsx } from './xlsxPreflight';

async function fixture(name: string): Promise<ArrayBuffer> {
  const bytes = await readFile(new URL(`./__fixtures__/${name}`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe('preflightXlsx', () => {
  it('accepts exactly one visible worksheet named operacoes', async () => {
    await expect(preflightXlsx(await fixture('valid-minimal.xlsx'))).resolves.toEqual({
      sheetName: 'operacoes',
      sheetPath: 'xl/worksheets/sheet1.xml',
    });
  });

  it.each([
    ['formula.xlsx', 'FORMULA_NOT_ALLOWED'],
    ['merged-cell.xlsx', 'MERGED_CELLS_NOT_ALLOWED'],
    ['extra-sheet.xlsx', 'SHEET_COUNT_INVALID'],
    ['hidden-only-sheet.xlsx', 'SHEET_NAME_INVALID'],
    ['wrong-sheet-name.xlsx', 'SHEET_NAME_INVALID'],
    ['wrong-headers.xlsx', 'HEADER_INVALID'],
    ['macro-marker.xlsx', 'MACRO_NOT_ALLOWED'],
    ['external-link.xlsx', 'EXTERNAL_LINK_NOT_ALLOWED'],
    ['worksheet-external-link.xlsx', 'EXTERNAL_LINK_NOT_ALLOWED'],
    ['encrypted-marker.xlsx', 'ENCRYPTED_FILE_NOT_ALLOWED'],
    ['zip-too-many-entries.xlsx', 'ZIP_ENTRY_LIMIT_EXCEEDED'],
    ['zip-too-large-uncompressed.xlsx', 'UNCOMPRESSED_SIZE_LIMIT_EXCEEDED'],
  ])('rejects %s with %s before any cells can be read', async (name, code) => {
    await expect(preflightXlsx(await fixture(name))).rejects.toMatchObject({ code });
  });

  it('rejects an OLE encrypted marker before opening it as ZIP', async () => {
    await expect(preflightXlsx(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).buffer))
      .rejects.toMatchObject({ code: 'ENCRYPTED_FILE_NOT_ALLOWED' });
  });

  it('rejects compacted files greater than five MiB', async () => {
    await expect(preflightXlsx(new ArrayBuffer(5 * 1024 * 1024 + 1)))
      .rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });
});
