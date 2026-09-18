import { describe, expect, it } from 'vitest';

import type { RawOperationCells } from './domain';
import { validateImportedRows } from './validation';
import type { ParsedWorkbook } from './xlsxParser';

const NOW_UTC = '2026-09-18T12:00:00.000Z';

const VALID_ROW: RawOperationCells = {
  operacao_id: 'OP-0001',
  cliente_nome: 'Cliente Exemplo',
  classificacao_perfil: 'Conservador',
  direcao: 'OUT',
  data_conhecida: '17/10/2026',
  data_limite: '19/10/2026',
  valor_brl: '1500000,00',
  finalidade_codigo: 'SERVICO',
};

function workbook(rows: RawOperationCells[]): ParsedWorkbook {
  return {
    sheetName: 'operacoes',
    metadata: {
      fileName: 'operacoes.xlsx',
      fileSize: 1234,
      fileLastModified: 1_800_000_000_000,
      sha256: 'a'.repeat(64),
    },
    rows,
  };
}

function idFactory(): () => string {
  let sequence = 0;
  return () => {
    sequence += 1;
    return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
  };
}

function rowWith(changes: Partial<RawOperationCells>): RawOperationCells {
  return { ...VALID_ROW, ...changes };
}

describe('validateImportedRows', () => {
  it('normaliza uma linha válida e cria um resumo sem erros', () => {
    const report = validateImportedRows(workbook([VALID_ROW]), NOW_UTC, idFactory());

    expect(report.summary).toEqual({ total: 1, valid: 1, invalid: 0 });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      rowNumber: 2,
      raw: VALID_ROW,
      errors: [],
      normalized: {
        operationId: 'OP-0001',
        clientName: 'Cliente Exemplo',
        profileClassification: 'Conservador',
        direction: 'OUT',
        knownDate: '2026-10-17',
        deadlineDate: '2026-10-19',
        valueBrl: '1500000',
        purposeCode: 'SERVICO',
      },
    });
  });

  it.each([
    ['ID vazio', { operacao_id: null }, 'REQUIRED', 'operacao_id', null],
    ['ID com espaços externos', { operacao_id: ' OP-0001 ' }, 'INVALID_FORMAT', 'operacao_id', ' OP-0001 '],
    ['cliente vazio', { cliente_nome: null }, 'REQUIRED', 'cliente_nome', null],
    ['cliente só com espaços', { cliente_nome: '   ' }, 'REQUIRED', 'cliente_nome', '   '],
    ['direção vazia', { direcao: null }, 'DIRECTION_INVALID', 'direcao', null],
    ['direção inválida', { direcao: 'VENDA' }, 'DIRECTION_INVALID', 'direcao', 'VENDA'],
    ['data conhecida vazia', { data_conhecida: null }, 'REQUIRED', 'data_conhecida', null],
    ['data conhecida inválida', { data_conhecida: '2026/10/17' }, 'INVALID_FORMAT', 'data_conhecida', '2026/10/17'],
    ['data limite vazia', { data_limite: null }, 'REQUIRED', 'data_limite', null],
    ['data limite inválida', { data_limite: '31/02/2026' }, 'INVALID_FORMAT', 'data_limite', '31/02/2026'],
    ['valor vazio', { valor_brl: null }, 'REQUIRED', 'valor_brl', null],
    ['valor com formato inválido', { valor_brl: '1.500.000,00' }, 'INVALID_FORMAT', 'valor_brl', '1.500.000,00'],
    ['valor igual a zero', { valor_brl: '0' }, 'VALUE_OUT_OF_RANGE', 'valor_brl', '0'],
    ['valor acima do limite', { valor_brl: '1000000000000,01' }, 'VALUE_OUT_OF_RANGE', 'valor_brl', '1000000000000,01'],
    ['datas invertidas', { data_conhecida: '19/10/2026', data_limite: '17/10/2026' }, 'DATE_ORDER_INVALID', 'data_limite', '17/10/2026'],
    ['finalidade com espaços externos', { finalidade_codigo: ' SERVICO ' }, 'INVALID_FORMAT', 'finalidade_codigo', ' SERVICO '],
  ] as const)(
    'registra %s na linha sem lançar erro global',
    (_name, changes, code, field, value) => {
      const raw = rowWith(changes);
      const report = validateImportedRows(workbook([raw]), NOW_UTC, idFactory());

      expect(report.summary).toEqual({ total: 1, valid: 0, invalid: 1 });
      expect(report.rows[0]?.normalized).toBeNull();
      expect(report.rows[0]?.raw).toEqual(raw);
      expect(report.rows[0]?.errors).toContainEqual(expect.objectContaining({
        code,
        field,
        rowNumber: 2,
        value,
      }));
    },
  );

  it('acumula todos os erros alcançáveis da mesma linha', () => {
    const report = validateImportedRows(workbook([rowWith({
      operacao_id: null,
      cliente_nome: null,
      direcao: 'DESCONHECIDA',
      data_conhecida: 'data inválida',
      data_limite: 'outra data inválida',
      valor_brl: '-1',
    })]), NOW_UTC, idFactory());

    expect(report.rows[0]?.normalized).toBeNull();
    expect(report.rows[0]?.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'REQUIRED', field: 'operacao_id', rowNumber: 2, value: null }),
      expect.objectContaining({ code: 'REQUIRED', field: 'cliente_nome', rowNumber: 2, value: null }),
      expect.objectContaining({ code: 'DIRECTION_INVALID', field: 'direcao', rowNumber: 2, value: 'DESCONHECIDA' }),
      expect.objectContaining({ code: 'INVALID_FORMAT', field: 'data_conhecida', rowNumber: 2, value: 'data inválida' }),
      expect.objectContaining({ code: 'INVALID_FORMAT', field: 'data_limite', rowNumber: 2, value: 'outra data inválida' }),
      expect.objectContaining({ code: 'VALUE_OUT_OF_RANGE', field: 'valor_brl', rowNumber: 2, value: '-1' }),
    ]));
  });

  it('registra finalidade ausente sem impedir a operação normalizada', () => {
    const report = validateImportedRows(
      workbook([rowWith({ finalidade_codigo: null })]),
      NOW_UTC,
      idFactory(),
    );

    expect(report.summary).toEqual({ total: 1, valid: 1, invalid: 0 });
    expect(report.rows[0]?.normalized).toMatchObject({ purposeCode: null });
    expect(report.rows[0]?.errors).toContainEqual(expect.objectContaining({
      code: 'PURPOSE_MISSING',
      field: 'finalidade_codigo',
      rowNumber: 2,
      value: null,
    }));
  });

  it('marca todas as ocorrências de um ID repetido no lote', () => {
    const report = validateImportedRows(workbook([
      VALID_ROW,
      rowWith({ cliente_nome: 'Outro Cliente', direcao: 'INVÁLIDA' }),
    ]), NOW_UTC, idFactory());

    expect(report.summary).toEqual({ total: 2, valid: 0, invalid: 2 });
    for (const [index, row] of report.rows.entries()) {
      expect(row.normalized).toBeNull();
      expect(row.errors).toContainEqual(expect.objectContaining({
        code: 'DUPLICATE_ID_IN_BATCH',
        field: 'operacao_id',
        rowNumber: index + 2,
        value: 'OP-0001',
      }));
    }
    expect(report.rows[1]?.errors).toContainEqual(expect.objectContaining({
      code: 'DIRECTION_INVALID',
      field: 'direcao',
      rowNumber: 3,
    }));
  });

  it('mantém seis linhas executáveis quando quatro de dez são inválidas', () => {
    const rows = Array.from({ length: 10 }, (_, index) => rowWith({
      operacao_id: `OP-${String(index + 1).padStart(4, '0')}`,
      cliente_nome: `Cliente ${index + 1}`,
    }));
    rows[1] = rowWith({ operacao_id: 'OP-0002', valor_brl: '0' });
    rows[3] = rowWith({ operacao_id: 'OP-0004', direcao: 'X' });
    rows[6] = rowWith({ operacao_id: 'OP-0007', data_limite: '16/10/2026' });
    rows[8] = rowWith({ operacao_id: 'OP-0009', cliente_nome: null });

    const report = validateImportedRows(workbook(rows), NOW_UTC, idFactory());

    expect(report.rows).toHaveLength(10);
    expect(report.rows.filter((row) => row.normalized !== null)).toHaveLength(6);
    expect(report.rows.filter((row) => row.normalized === null)).toHaveLength(4);
    expect(report.summary).toEqual({ total: 10, valid: 6, invalid: 4 });
  });
});
