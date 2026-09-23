import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { parseXlsxBuffer } from './xlsxParser';

async function fixture(name: string): Promise<ArrayBuffer> {
  const bytes = await readFile(new URL(`./__fixtures__/${name}`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
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
});
