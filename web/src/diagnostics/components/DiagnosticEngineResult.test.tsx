// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../../api/client';
import { DiagnosticEngineResult } from './DiagnosticEngineResult';

const agregado = {
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
};

const envelopeWith = (result: unknown) => ({
  selected_execution: { kind: 'PREVIA', result },
} as unknown as DiagnosticEnvelope);

describe('resultado do motor no diagnóstico', () => {
  it('mostra resultado do motor e decomposição de custos da execução selecionada', () => {
    render(<DiagnosticEngineResult envelope={envelopeWith({ agregado })} />);
    expect(screen.getByRole('heading', { name: 'Resultado do motor' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Decomposição de custos' })).toBeVisible();
  });

  it('não renderiza nada quando a execução selecionada não traz resultado canônico', () => {
    const { container } = render(<DiagnosticEngineResult envelope={envelopeWith({})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('abre com a distribuição da economia e diz qual execução é detalhada', () => {
    const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'];
    const summary = { state: 'AVAILABLE', value: { minimum: '1', p10: '1', p25: '1', p50: '10', p75: '30', p90: '30', maximum: '30', amplitude: '29' } };
    const envelope = {
      statistics: { kind: 'DISTRIBUTION', count: 10, selected_repetition_id: ids[1], percentile_method: 'EMPIRICAL_NEAREST_RANK' },
      repetitions: ids.map((repetition_id, index) => ({ repetition_id, savings_brl: ['1', '10', '30'][index] })),
      axes: { economic_robustness: { savings_brl: summary } },
      selected_execution: { kind: 'PREVIA', statistics: { repetition_id: ids[1] }, result: { agregado } },
    } as unknown as DiagnosticEnvelope;
    render(<DiagnosticEngineResult envelope={envelope} />);
    const region = screen.getByRole('region', { name: 'Economia nas carteiras simuladas' });
    expect(region).toHaveTextContent('P10R$ 1,00');
    expect(region).toHaveTextContent('P50R$ 10,00');
    expect(region).toHaveTextContent('P90R$ 30,00');
    expect(region).toHaveTextContent('AmplitudeR$ 29,00');
    expect(region).toHaveTextContent('10 repetições');
    expect(region).toHaveTextContent('Execução selecionada para detalhamento/Replay: repetição 2 de 10');
    expect(region).toHaveTextContent('não é probabilidade de desempenho futuro');
  });

  it('entrada fixa mostra execução única, sem intervalo', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const envelope = {
      statistics: { kind: 'SINGLE_EXECUTION', count: 1, selected_repetition_id: id, percentile_method: null },
      repetitions: [{ repetition_id: id, savings_brl: '10' }],
      axes: { economic_robustness: { savings_brl: { state: 'INSUFFICIENT_COVERAGE', reason: 'FIXED_INPUT_HAS_NO_SAMPLING_DISTRIBUTION' } } },
      selected_execution: { kind: 'PREVIA', statistics: { repetition_id: id }, result: { agregado } },
    } as unknown as DiagnosticEnvelope;
    render(<DiagnosticEngineResult envelope={envelope} />);
    const region = screen.getByRole('region', { name: 'Economia desta carteira' });
    expect(region).toHaveTextContent('Execução única (entrada fixa)');
    expect(region).not.toHaveTextContent('P10');
  });
});
