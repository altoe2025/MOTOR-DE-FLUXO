// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ObservedComparison } from '../cases/observedComparison';
import { StudyResultPage } from '../pages/StudyResultPage';
import type { ExecutionRecord, StudyDocument } from '../study/model';
import { ObservedComparisonTable } from './ObservedComparisonTable';

const comparison: ObservedComparison = {
  observedSchemaVersion: '1.0.0',
  rows: [
    {
      code: 'GROSS_OUT_BRL', label: 'Volume bruto OUT', canonicalPath: '/out', unit: 'BRL',
      definitionVersion: '1.0.0', status: 'EQUAL', observedValue: '100', motorValue: '100',
      difference: '0', percentageDifference: '0',
    },
    {
      code: 'GROSS_IN_BRL', label: 'Volume bruto IN', canonicalPath: '/in', unit: 'BRL',
      definitionVersion: '1.0.0', status: 'DIFFERENT', observedValue: '30', motorValue: '40',
      difference: '10', percentageDifference: '0.33333333333333333333',
    },
    {
      code: 'MATCHED_BRL', label: 'Volume casado', canonicalPath: '/matched', unit: 'BRL',
      definitionVersion: '1.0.0', status: 'NOT_REPORTED', observedValue: null, motorValue: '60',
      difference: null, percentageDifference: null,
    },
    {
      code: 'TOTAL_COST_BRL', label: 'Custo total', canonicalPath: '/cost', unit: 'BRL',
      definitionVersion: '1.0.0', status: 'INCOMPATIBLE', reason: 'DEFINITION_MISMATCH',
      observedValue: '12', motorValue: '12', difference: null, percentageDifference: null,
      explanation: 'Definição observada 2.0.0; o contrato canônico exige 1.0.0.',
    },
  ],
};

describe('ObservedComparisonTable', () => {
  it('mostra estados textuais, valores tabulares e ausência sem depender somente de cor', () => {
    render(<ObservedComparisonTable comparison={comparison} />);

    expect(screen.getByRole('row', { name: /Volume bruto OUT.*Igual/i })).toHaveTextContent(/R\$\s+100,00/);
    expect(screen.getByRole('row', { name: /Volume bruto IN.*Diferente/i })).toHaveTextContent(/\+R\$\s+10,00/);
    expect(screen.getByRole('row', { name: /Volume bruto IN.*Diferente/i })).toHaveTextContent('33,33%');
    expect(screen.getByRole('row', { name: /Volume casado.*Não informado/i })).toHaveTextContent('não informado');
    expect(screen.getByRole('row', { name: /Custo total.*Incompatível/i })).toHaveTextContent(
      'Definição observada 2.0.0; o contrato canônico exige 1.0.0.',
    );
  });

  it('explica quando não existe resultado observado', () => {
    render(<ObservedComparisonTable comparison={null} />);

    expect(screen.getByText('Resultado observado não informado.')).toBeVisible();
  });
});

describe('StudyResultPage', () => {
  it('separa resultado do motor, conciliação, identidade, origem e histórico', () => {
    const execution = {
      id: 'execution-1', scenarioId: 'scenario-1', scenarioRevision: 1,
      status: 'SUCCEEDED', envelope: {
        kind: 'PREVIA', api_version: '1.0.0', execution_fingerprint: 'fingerprint-1',
        result: {
          agregado: {
            ids_ordens_medidas: [],
            economia_periodo_brl: '10', volume_bruto_periodo_brl: '140',
            volume_casado_periodo_brl: '60', volume_remetido_periodo_brl: '80',
            taxa_netabilidade_periodo: '0.42857142857142857143',
            taxa_autonetting_periodo: '0', taxa_netting_multilateral_periodo: '0.42857142857142857143',
            baseline_periodo: { total: '22', iof: '10', spread: '4', fixo: '3', carry: '3', espera: '2' },
            netado_periodo: { total: '12', iof: '6', spread: '2', fixo: '2', carry: '1', espera: '1' },
            mecanismos: [
              { destino: 'INTRA_CLIENTE', volume_brl: '0', custo_netado_brl: '0', economia_brl: '0' },
              { destino: 'INTER_CLIENTE', volume_brl: '60', custo_netado_brl: '2', economia_brl: '10' },
              { destino: 'REMETIDO', volume_brl: '80', custo_netado_brl: '10', economia_brl: '0' },
            ],
            execucao_completa: { ciclos: [] },
          },
          manifesto: { versao_motor: 'motor-2', custo_calibrado: false },
        },
      },
      observedComparison: comparison,
      engineVersion: 'motor-2', contractVersion: '1.0.0', inputFingerprint: 'a'.repeat(64),
      requestSnapshot: { request_id: 'request-1' },
      createdAt: '2026-09-19T12:00:00Z', finishedAt: '2026-09-19T12:01:00Z',
    } as unknown as ExecutionRecord;
    const study = {
      name: 'Estudo observado', executions: [execution],
      scenarios: [{
        id: 'scenario-1', revision: 1,
        sourceSnapshot: { source: { kind: 'OBSERVED_CASE', caseId: 'case-1', caseRevision: 4 } },
      }],
    } as unknown as StudyDocument;

    render(<StudyResultPage study={study} execution={execution} onSelectExecution={() => undefined} />);

    expect(screen.getByRole('heading', { name: 'Resultado do estudo' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Resultado do motor' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Observado × Motor' })).toBeVisible();
    expect(screen.getAllByText('Caso observado · revisão 4')).toHaveLength(2);
    expect(screen.getAllByText('motor-2 · contrato 1.0.0')).toHaveLength(2);
    expect(screen.getByRole('list', { name: 'Histórico de execuções' })).toBeVisible();
  });
});
