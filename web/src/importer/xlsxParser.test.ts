import { readFile } from 'node:fs/promises';

import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { validateImportedRows } from './validation';
import { parseXlsxBuffer } from './xlsxParser';

async function fixture(name: string): Promise<ArrayBuffer> {
  const bytes = await readFile(new URL(`./__fixtures__/${name}`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function inlineCell(reference: string, value: string): string {
  return `<c r="${reference}" t="inlineStr"><is><t>${value}</t></is></c>`;
}

function workbookWithRow(row: readonly string[]): ArrayBuffer {
  const headers = ['operacao_id', 'cliente_nome', 'classificacao_perfil', 'direcao', 'data_conhecida', 'data_limite', 'valor_brl', 'finalidade_codigo'];
  const cells = (values: readonly string[], rowNumber: number) => values
    .map((value, index) => inlineCell(`${String.fromCharCode(65 + index)}${rowNumber}`, value))
    .join('');
  const sheet = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${cells(headers, 1)}</row><row r="2">${cells(row, 2)}</row></sheetData></worksheet>`;
  const archive = zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    'xl/workbook.xml': strToU8('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="operacoes" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  });
  return archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
}

describe('parseXlsxBuffer', () => {
  it('returns only serializable canonical rows and batch metadata', async () => {
    const parsed = await parseXlsxBuffer(await fixture('valid-minimal.xlsx'));

    expect(parsed).toMatchObject({
      layout: 'xlsx-operacoes/1.0.0',
      byteSize: expect.any(Number),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      rows: [{
        operacao_id: 'OP-0001',
        cliente_nome: 'Cliente Exemplo',
        classificacao_perfil: null,
        direcao: 'OUT',
        data_conhecida: '2026-10-17',
        data_limite: '19/10/2026',
        valor_brl: '1500000.00',
        finalidade_codigo: 'SERVICO',
      }],
    });
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
    expect(parsed).not.toHaveProperty('file');
    expect(parsed).not.toHaveProperty('buffer');
    expect(parsed).not.toHaveProperty('xml');
  });

  it('accepts exactly one thousand operations', async () => {
    await expect(parseXlsxBuffer(await fixture('valid-1000-rows.xlsx')))
      .resolves.toMatchObject({ rows: expect.any(Array) });
    expect((await parseXlsxBuffer(await fixture('valid-1000-rows.xlsx'))).rows).toHaveLength(1000);
  });

  it('rejects row 1001 without publishing a partial import', async () => {
    const result = await parseXlsxBuffer(await fixture('row-limit-1001.xlsx')).catch((error: unknown) => error);
    expect(result).toMatchObject({ code: 'ROW_LIMIT_EXCEEDED' });
    expect(result).not.toHaveProperty('rows');
  });

  it('preserves padded exact-text cells so row validation can reject them', async () => {
    const parsed = await parseXlsxBuffer(workbookWithRow([
      ' OP-0001 ', 'Cliente Exemplo', '', 'OUT', '17/10/2026', '19/10/2026', '1500000.00', ' SERVICO ',
    ]));

    expect(parsed.rows[0]).toMatchObject({
      operacao_id: ' OP-0001 ',
      finalidade_codigo: ' SERVICO ',
    });
    const report = validateImportedRows(parsed.rows);
    expect(report.rows[0]?.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INVALID_FORMAT', field: 'operacao_id' }),
      expect.objectContaining({ code: 'INVALID_FORMAT', field: 'finalidade_codigo' }),
    ]));
  });
});
