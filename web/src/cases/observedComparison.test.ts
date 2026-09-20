import { describe, expect, it } from 'vitest';

import type { ObservedOutcome } from './domain';
import { compareObservedToMotor } from './observedComparison';
import type { PreviewEnvelope } from '../study/model';

function envelope(overrides: Record<string, string> = {}): PreviewEnvelope {
  const values = {
    grossOut: '100', grossIn: '40', matched: '60', remittedOut: '70', remittedIn: '10', cost: '12',
    ...overrides,
  };
  return {
    input_snapshot: {
      cenario: {
        ordens: [
          { id: 'out', direcao: 'OUT', valor_brl: values.grossOut },
          { id: 'in', direcao: 'IN', valor_brl: values.grossIn },
        ],
      },
    },
    result: {
      agregado: {
        ids_ordens_medidas: ['out', 'in'],
        volume_casado_periodo_brl: values.matched,
        netado_periodo: { total: values.cost },
        execucao_completa: {
          ciclos: [{
            alocacoes: [
              { ordem_id: 'out', tipo: 'REMETIDO', valor_brl: values.remittedOut },
              { ordem_id: 'in', tipo: 'REMETIDO', valor_brl: values.remittedIn },
            ],
          }],
        },
      },
    },
  } as unknown as PreviewEnvelope;
}

function outcome(metrics: ObservedOutcome['metrics']): ObservedOutcome {
  return { schemaVersion: '1.0.0', metrics };
}

function metric(
  code: ObservedOutcome['metrics'][number]['code'],
  value: string,
  unit: string = 'BRL',
  definitionVersion = '1.0.0',
): ObservedOutcome['metrics'][number] {
  return {
    code, value, unit, definitionVersion,
    provenance: { kind: 'OBSERVED', source: 'arquivo', version: '1', recordedAt: '2026-09-19T12:00:00Z' },
  } as ObservedOutcome['metrics'][number];
}

describe('compareObservedToMotor', () => {
  it('classifica igualdade decimal exata sem tolerância oculta', () => {
    const comparison = compareObservedToMotor(
      outcome([metric('GROSS_OUT_BRL', '100.00')]), envelope(),
    );

    expect(comparison.rows[0]).toMatchObject({
      code: 'GROSS_OUT_BRL', status: 'MATCHED', observedValue: '100.00', motorValue: '100',
      difference: '0', percentageDifference: '0',
    });
  });

  it('calcula diferença e percentual com Decimal, sem converter finanças para Number', () => {
    const comparison = compareObservedToMotor(
      outcome([metric('GROSS_OUT_BRL', '9007199254740993.01')]),
      envelope({ grossOut: '9007199254740994.02' }),
    );

    expect(comparison.rows[0]).toMatchObject({
      status: 'DIFFERENT', difference: '1.01',
      percentageDifference: '1.121325254871407980090835263528907817882e-16',
    });
  });

  it('mantém percentual nulo quando o observado é zero', () => {
    const comparison = compareObservedToMotor(
      outcome([metric('GROSS_OUT_BRL', '0')]), envelope({ grossOut: '1' }),
    );

    expect(comparison.rows[0]).toMatchObject({
      status: 'DIFFERENT', difference: '1', percentageDifference: null,
    });
  });

  it('distingue métrica ausente de valor zero e ordena pelo registro', () => {
    const comparison = compareObservedToMotor(
      outcome([metric('TOTAL_COST_BRL', '12'), metric('GROSS_IN_BRL', '40')]), envelope(),
    );

    expect(comparison.rows.map((row) => [row.code, row.status])).toEqual([
      ['GROSS_OUT_BRL', 'NOT_OBSERVED'],
      ['GROSS_IN_BRL', 'MATCHED'],
      ['MATCHED_BRL', 'NOT_OBSERVED'],
      ['REMITTED_OUT_BRL', 'NOT_OBSERVED'],
      ['REMITTED_IN_BRL', 'NOT_OBSERVED'],
      ['TOTAL_COST_BRL', 'MATCHED'],
    ]);
    expect(comparison.rows[0]).toMatchObject({ observedValue: null, motorValue: '100' });
  });

  it('explica unidade incompatível sem calcular diferença', () => {
    const comparison = compareObservedToMotor(
      outcome([metric('GROSS_OUT_BRL', '100', 'USD')]), envelope(),
    );

    expect(comparison.rows[0]).toMatchObject({
      status: 'INCOMPATIBLE', reason: 'UNIT_MISMATCH', difference: null,
      explanation: 'Unidade observada USD; o contrato canônico exige BRL.',
    });
  });

  it('explica definição incompatível sem aproximar versões', () => {
    const comparison = compareObservedToMotor(
      outcome([metric('GROSS_OUT_BRL', '100', 'BRL', '2.0.0')]), envelope(),
    );

    expect(comparison.rows[0]).toMatchObject({
      status: 'INCOMPATIBLE', reason: 'DEFINITION_MISMATCH', difference: null,
      explanation: 'Definição observada 2.0.0; o contrato canônico exige 1.0.0.',
    });
  });

  it('marca código sem registro como incompatível em vez de aproximá-lo', () => {
    const unknown = metric('GROSS_OUT_BRL', '100') as unknown as { code: string };
    unknown.code = 'UNKNOWN_BRL';
    const comparison = compareObservedToMotor(
      outcome([unknown as ObservedOutcome['metrics'][number]]), envelope(),
    );

    expect(comparison.rows.at(-1)).toMatchObject({
      code: 'UNKNOWN_BRL', status: 'INCOMPATIBLE', reason: 'UNMAPPED_CODE',
      explanation: 'Código observado UNKNOWN_BRL não possui mapeamento canônico.',
    });
  });
});
