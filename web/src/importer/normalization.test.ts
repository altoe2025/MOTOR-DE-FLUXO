import { describe, expect, it } from 'vitest';

import type {
  ISODate,
  NormalizedOperation,
  RawOperationCells,
} from './domain';
import { normalizeOperation } from './normalization';

function rawOperation(
  overrides: Partial<RawOperationCells> = {},
): RawOperationCells {
  return {
    operacao_id: 'OP-001',
    cliente_nome: 'Cliente Exemplo',
    classificacao_perfil: null,
    direcao: 'OUT',
    data_conhecida: '17/10/2026',
    data_limite: '19/10/2026',
    valor_brl: '1500000,00',
    finalidade_codigo: null,
    ...overrides,
  };
}

describe('normalizeOperation', () => {
  it('normaliza uma operação sem depender de contratos HTTP', () => {
    const operation = normalizeOperation(
      rawOperation({
        cliente_nome: '  Cliente   Exemplo  ',
        classificacao_perfil: '  Perfil A  ',
        direcao: ' out ',
        finalidade_codigo: 'SERVICO',
      }),
    );

    const expected = {
      operationId: 'OP-001',
      clientName: 'Cliente Exemplo',
      profileClassification: 'Perfil A',
      direction: 'OUT',
      knownDate: '2026-10-17' as ISODate,
      deadlineDate: '2026-10-19' as ISODate,
      valueBrl: '1500000',
      purposeCode: 'SERVICO',
    } satisfies NormalizedOperation;

    expect(operation).toEqual(expected);
  });

  it('mantém o identificador da operação exatamente como recebido', () => {
    expect(
      normalizeOperation(
        rawOperation({ operacao_id: 'Op-001_A' }),
      ).operationId,
    ).toBe('Op-001_A');
  });

  it.each([' OP-001', 'OP-001 '])(
    'rejeita espaço externo no identificador %j',
    (operationId) => {
      expect(() =>
        normalizeOperation(
          rawOperation({ operacao_id: operationId }),
        ),
      ).toThrow('INVALID_FORMAT');
    },
  );

  it.each([
    [' out ', 'OUT'],
    [' in ', 'IN'],
    ['Out', 'OUT'],
  ] as const)(
    'normaliza a direção %j para %s',
    (direction, expected) => {
      expect(
        normalizeOperation(
          rawOperation({ direcao: direction }),
        ).direction,
      ).toBe(expected);
    },
  );

  it.each(['entrada', 'saida', 'OUTBOUND', ''])(
    'rejeita a direção %j',
    (direction) => {
      expect(() =>
        normalizeOperation(
          rawOperation({ direcao: direction }),
        ),
      ).toThrow('DIRECTION_INVALID');
    },
  );

  it.each([null, ''])(
    'converte finalidade vazia %j em null',
    (purposeCode) => {
      expect(
        normalizeOperation(
          rawOperation({ finalidade_codigo: purposeCode }),
        ).purposeCode,
      ).toBeNull();
    },
  );

  it('preserva a finalidade preenchida', () => {
    expect(
      normalizeOperation(
        rawOperation({ finalidade_codigo: 'Servico-Especial' }),
      ).purposeCode,
    ).toBe('Servico-Especial');
  });

  it.each([' SERVICO', 'SERVICO '])(
    'rejeita espaço externo na finalidade %j',
    (purposeCode) => {
      expect(() =>
        normalizeOperation(
          rawOperation({ finalidade_codigo: purposeCode }),
        ),
      ).toThrow('INVALID_FORMAT');
    },
  );

  it.each([null, '', '   '])(
    'converte perfil vazio %j em null',
    (profile) => {
      expect(
        normalizeOperation(
          rawOperation({ classificacao_perfil: profile }),
        ).profileClassification,
      ).toBeNull();
    },
  );

  it('remove espaços externos do perfil', () => {
    expect(
      normalizeOperation(
        rawOperation({
          classificacao_perfil: '  Perfil Private  ',
        }),
      ).profileClassification,
    ).toBe('Perfil Private');
  });

  it('remove espaços externos e colapsa espaços internos do nome', () => {
    expect(
      normalizeOperation(
        rawOperation({
          cliente_nome: '  Cliente    com   Sobrenome  ',
        }),
      ).clientName,
    ).toBe('Cliente com Sobrenome');
  });

  it('usa os parsers canônicos para datas e valor', () => {
    const operation = normalizeOperation(
      rawOperation({
        data_conhecida: '29/02/2028',
        data_limite: '01/03/2028',
        valor_brl: '10,250000',
      }),
    );

    expect(operation.knownDate).toBe('2028-02-29');
    expect(operation.deadlineDate).toBe('2028-03-01');
    expect(operation.valueBrl).toBe('10.25');
  });
});
