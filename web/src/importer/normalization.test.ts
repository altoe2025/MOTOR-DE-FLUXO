import { describe, expect, it } from 'vitest';

import { normalizeOperation } from './normalization';

const validRow = {
  operacao_id: 'OP-001', cliente_nome: 'Cliente Exemplo', classificacao_perfil: null,
  direcao: 'OUT', data_conhecida: '17/10/2026', data_limite: '19/10/2026',
  valor_brl: '1500000,00', finalidade_codigo: null,
};

describe('normalizeOperation', () => {
  it('normalizes a row without HTTP or persistence contracts', () => {
    expect(normalizeOperation({ ...validRow, cliente_nome: '  Cliente   Exemplo  ', direcao: ' out ', finalidade_codigo: 'SERVICO' }))
      .toEqual({ operationId: 'OP-001', clientName: 'Cliente Exemplo', profileClassification: null, direction: 'OUT', knownDate: '2026-10-17', deadlineDate: '2026-10-19', valueBrl: '1500000', purposeCode: 'SERVICO' });
  });

  it.each([' OP-001', 'OP-001 '])('rejects externally padded operation ID %s', (operacao_id) => {
    expect(() => normalizeOperation({ ...validRow, operacao_id })).toThrow('INVALID_FORMAT');
  });

  it.each(['entrada', 'saida', 'OUTBOUND', ''])('rejects invalid direction %s', (direcao) => {
    expect(() => normalizeOperation({ ...validRow, direcao })).toThrow('DIRECTION_INVALID');
  });

  it('keeps missing purpose as null for a later warning', () => {
    expect(normalizeOperation(validRow).purposeCode).toBeNull();
  });
});
