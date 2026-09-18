import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { preflightXlsx } from './xlsxPreflight';

async function fixture(name: string): Promise<ArrayBuffer> {
  const bytes = await readFile(
    new URL(`./__fixtures__/${name}`, import.meta.url),
  );
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

describe('preflightXlsx', () => {
  it('aceita exatamente uma planilha visível chamada operacoes', async () => {
    await expect(
      preflightXlsx(await fixture('valid-minimal.xlsx')),
    ).resolves.toEqual({
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
    [
      'zip-too-large-uncompressed.xlsx',
      'UNCOMPRESSED_SIZE_LIMIT_EXCEEDED',
    ],
  ])('rejeita %s com o código %s', async (name, code) => {
    await expect(
      preflightXlsx(await fixture(name)),
    ).rejects.toMatchObject({ code });
  });

  it('rejeita OLE criptografado antes de tentar abrir o ZIP', async () => {
    const signature = new Uint8Array([
      0xd0, 0xcf, 0x11, 0xe0,
      0xa1, 0xb1, 0x1a, 0xe1,
    ]);

    await expect(
      preflightXlsx(signature.buffer),
    ).rejects.toMatchObject({
      code: 'ENCRYPTED_FILE_NOT_ALLOWED',
    });
  });

  it('rejeita o arquivo antes da leitura quando passa de 5 MiB', async () => {
    await expect(
      preflightXlsx(new ArrayBuffer(5 * 1024 * 1024 + 1)),
    ).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
    });
  });

  it('não retorna células quando a estrutura é inválida', async () => {
    const error = await preflightXlsx(
      await fixture('formula.xlsx'),
    ).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'FORMULA_NOT_ALLOWED' });
    expect(error).not.toHaveProperty('rows');
    expect(error).not.toHaveProperty('cells');
  });
});
