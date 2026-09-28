import { describe, expect, it } from 'vitest';

import { IMPORT_COLUMNS, IMPORT_LIMIT_ROWS, IMPORT_SHEET_NAME } from './layout';
import { validateImportedRows } from './validation';
import { parseXlsxBuffer } from './xlsxParser';
import { preflightXlsx } from './xlsxPreflight';
import { buildImportTemplate } from './xlsxTemplate';

function buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe('modelo de importação', () => {
  it('passa no próprio preflight', async () => {
    await expect(preflightXlsx(buffer(buildImportTemplate()))).resolves.toMatchObject({ sheetName: IMPORT_SHEET_NAME });
  });

  it('é lido pelo parser com as colunas da definição única e linhas de exemplo válidas', async () => {
    const parsed = await parseXlsxBuffer(buffer(buildImportTemplate()));
    expect(parsed.rows.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(parsed.rows[0]!)).toEqual(IMPORT_COLUMNS.map((column) => column.name));
    const report = validateImportedRows(parsed.rows);
    expect(report.summary.invalid).toBe(0);
    expect(new Set(parsed.rows.map((row) => row.direcao))).toEqual(new Set(['OUT', 'IN']));
  });

  it('declara as oito colunas na ordem canônica e o limite de linhas', () => {
    expect(IMPORT_COLUMNS.map((column) => column.name)).toEqual([
      'operacao_id', 'cliente_nome', 'classificacao_perfil', 'direcao', 'data_conhecida', 'data_limite', 'valor_brl', 'finalidade_codigo',
    ]);
    expect(IMPORT_COLUMNS.filter((column) => !column.required).map((column) => column.name)).toEqual(['finalidade_codigo']);
    expect(IMPORT_LIMIT_ROWS).toBe(1000);
  });
});
