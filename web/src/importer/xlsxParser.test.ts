import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { parseWorkbook } from './xlsxParser';

async function fixture(name: string): Promise<ArrayBuffer> {
  const bytes = await readFile(
    new URL(`./__fixtures__/${name}`, import.meta.url),
  );
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function parseFixture(name: string) {
  const buffer = await fixture(name);
  return parseWorkbook(buffer, {
    fileName: name,
    fileSize: buffer.byteLength,
  });
}

describe('parseWorkbook', () => {
  it('retorna as oito células na forma bruta esperada', async () => {
    const workbook = await parseFixture('valid-minimal.xlsx');

    expect(workbook.sheetName).toBe('operacoes');
    expect(workbook.rows).toEqual([
      {
        operacao_id: 'OP-0001',
        cliente_nome: 'Cliente Exemplo',
        classificacao_perfil: null,
        direcao: 'OUT',
        data_conhecida: '2026-10-17',
        data_limite: '19/10/2026',
        valor_brl: '1500000.00',
        finalidade_codigo: 'SERVICO',
      },
    ]);
  });

  it('preserva o decimal numérico como texto sem passar por float', async () => {
    const workbook = await parseFixture('valid-minimal.xlsx');
    expect(workbook.rows[0]?.valor_brl).toBe('1500000.00');
  });

  it('retorna datas Excel em ISO civil serializável', async () => {
    const workbook = await parseFixture('valid-minimal.xlsx');
    expect(workbook.rows[0]?.data_conhecida).toBe('2026-10-17');
  });

  it('preserva datas originalmente textuais', async () => {
    const workbook = await parseFixture('valid-minimal.xlsx');
    expect(workbook.rows[0]?.data_limite).toBe('19/10/2026');
  });

  it('calcula SHA-256 no navegador', async () => {
    const workbook = await parseFixture('valid-minimal.xlsx');

    expect(workbook.metadata.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(workbook.metadata.fileName).toBe('valid-minimal.xlsx');
  });

  it('aceita exatamente mil linhas', async () => {
    const workbook = await parseFixture('valid-1000-rows.xlsx');
    expect(workbook.rows).toHaveLength(1000);
  });

  it('rejeita a linha 1001 sem retornar lote parcial', async () => {
    const error = await parseFixture('row-limit-1001.xlsx')
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'ROW_LIMIT_EXCEEDED' });
    expect(error).not.toHaveProperty('rows');
  });

  it.each([
    ['formula.xlsx', 'FORMULA_NOT_ALLOWED'],
    ['merged-cell.xlsx', 'MERGED_CELLS_NOT_ALLOWED'],
    ['macro-marker.xlsx', 'MACRO_NOT_ALLOWED'],
    ['external-link.xlsx', 'EXTERNAL_LINK_NOT_ALLOWED'],
  ])('não lê células de %s', async (name, code) => {
    const error = await parseFixture(name)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code });
    expect(error).not.toHaveProperty('rows');
  });
});
