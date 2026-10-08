import { describe, expect, it } from 'vitest';

import { validateImportedRows } from './validation';

const validRow = {
  operacao_id: 'OP-0001', cliente_nome: 'Cliente Exemplo', classificacao_perfil: 'Conservador',
  direcao: 'OUT', data_conhecida: '17/10/2026', data_limite: '19/10/2026',
  valor_brl: '1500000,00', finalidade_codigo: 'SERVICO',
};

describe('validateImportedRows', () => {
  it('keeps a valid row normalized without a purpose error', () => {
    const report = validateImportedRows([{ ...validRow, finalidade_codigo: null }]);
    expect(report.summary).toEqual({ total: 1, valid: 1, invalid: 0 });
    expect(report.rows[0]).toMatchObject({ rowNumber: 2, normalized: { purposeCode: null }, errors: [] });
  });

  it('retains all reachable field failures for review instead of throwing away the row', () => {
    const report = validateImportedRows([{ ...validRow, operacao_id: null, cliente_nome: null, direcao: 'UNKNOWN', data_conhecida: 'bad', data_limite: 'also bad', valor_brl: '-1' }]);
    expect(report.summary).toEqual({ total: 1, valid: 0, invalid: 1 });
    expect(report.rows[0]).toMatchObject({ normalized: null });
    expect(report.rows[0]?.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'REQUIRED', field: 'operacao_id' }),
      expect.objectContaining({ code: 'DIRECTION_INVALID', field: 'direcao' }),
      expect.objectContaining({ code: 'VALUE_OUT_OF_RANGE', field: 'valor_brl' }),
    ]));
  });

  it('marks every duplicated ID in the batch invalid', () => {
    const report = validateImportedRows([validRow, { ...validRow, cliente_nome: 'Outro Cliente' }]);
    expect(report.summary).toEqual({ total: 2, valid: 0, invalid: 2 });
    expect(report.rows.every((row) => row.errors.some((error) => error.code === 'DUPLICATE_ID_IN_BATCH'))).toBe(true);
  });

  it('records an oversized profile alongside other row errors without aborting later rows', () => {
    const report = validateImportedRows([
      { ...validRow, classificacao_perfil: 'p'.repeat(121), direcao: 'UNKNOWN', valor_brl: '0' },
      { ...validRow, operacao_id: 'OP-0002' },
    ]);

    expect(report.summary).toEqual({ total: 2, valid: 1, invalid: 1 });
    expect(report.rows[0]?.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'VALUE_OUT_OF_RANGE', field: 'classificacao_perfil' }),
      expect.objectContaining({ code: 'DIRECTION_INVALID', field: 'direcao' }),
      expect.objectContaining({ code: 'VALUE_OUT_OF_RANGE', field: 'valor_brl' }),
    ]));
    expect(report.rows[1]?.normalized).toMatchObject({ operationId: 'OP-0002' });
  });
});
