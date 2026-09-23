import { readFile } from 'node:fs/promises';

import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { preflightXlsx } from './xlsxPreflight';

async function fixture(name: string): Promise<ArrayBuffer> {
  const bytes = await readFile(new URL(`./__fixtures__/${name}`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function sparseWorkbook(withoutRowReference: boolean = false): ArrayBuffer {
  const headers = ['operacao_id', 'cliente_nome', 'classificacao_perfil', 'direcao', 'data_conhecida', 'data_limite', 'valor_brl', 'finalidade_codigo'];
  const headerCells = headers.map((header, index) => `<c r="${String.fromCharCode(65 + index)}1" t="inlineStr"><is><t>${header}</t></is></c>`).join('');
  const sparseRowReference = withoutRowReference ? '' : ' r="1000000"';
  const sheet = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${headerCells}</row><row${sparseRowReference}><c r="A1000000" t="inlineStr"><is><t>OP-SPARSE</t></is></c></row></sheetData></worksheet>`;
  const archive = zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    'xl/workbook.xml': strToU8('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="operacoes" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  });
  return archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
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

  it('rejects an extreme sparse row reference before the cell reader allocates it', async () => {
    await expect(preflightXlsx(sparseWorkbook())).rejects.toMatchObject({ code: 'ROW_LIMIT_EXCEEDED' });
  });

  it('rejects a sparse cell reference when its row omits the r attribute', async () => {
    await expect(preflightXlsx(sparseWorkbook(true))).rejects.toMatchObject({ code: 'ROW_LIMIT_EXCEEDED' });
  });
});
